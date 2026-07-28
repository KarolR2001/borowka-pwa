import { AUDIT_EVENTS_COLLECTION, createAuditEventId } from "../audit/auditEvents";
import { getFirebaseServices } from "../config/firebaseServices";
import {
  createHarvestOperationAuditEventDraft,
  harvestEntryAuditSummary
} from "../harvest/harvestAudit";
import {
  decodeHarvestEntry,
  decodeHarvestSession,
  type HarvestEntryDocument
} from "../harvest/harvestSessionDashboard";
import {
  HARVEST_ENTRIES_COLLECTION,
  HARVEST_SESSIONS_COLLECTION
} from "../harvest/harvestSessionState";
import type {
  AddHarvestEntryOnlineInput,
  AddHarvestEntryOnlineResult
} from "../harvest/harvestEntryRuntime";
import type {
  CloseHarvestSessionOnlineInput,
  CloseHarvestSessionOnlineResult
} from "../harvest/closeHarvestSessionRuntime";
import type {
  OpenHarvestSessionOnlineInput,
  OpenHarvestSessionOnlineResult
} from "../harvest/openHarvestSessionRuntime";
import {
  createHarvestSessionId,
  type HarvestSessionDocument
} from "../harvest/openHarvestSession";
import {
  readConfigurationCache,
  type ConfigurationCacheStorage
} from "./configurationCache";
import {
  defaultFirestoreSyncJournal,
  type FirestoreSyncJournal
} from "./firestoreSyncJournal";
import { prepareOfflineHarvestEntry } from "./offlineHarvestEntry";
import { prepareOfflineHarvestSession } from "./offlineHarvestSession";
import { prepareOfflineHarvestSessionClose } from "./offlineHarvestSessionClose";
import { queueOfflineFirestoreBatch } from "./offlineFirestoreQueue";

type FirebaseEnv = Record<string, string | boolean | undefined>;

export type OfflineHarvestRuntimeDependencies = {
  configurationStorage?: ConfigurationCacheStorage;
  journal?: FirestoreSyncJournal;
};

export async function openHarvestSessionOffline(
  env: FirebaseEnv,
  input: OpenHarvestSessionOnlineInput,
  dependencies: OfflineHarvestRuntimeDependencies = {}
): Promise<OpenHarvestSessionOnlineResult> {
  const { firestore } = await getFirebaseServices(env);
  const { doc, getDocFromCache, serverTimestamp, writeBatch } =
    await import("firebase/firestore");
  const createdAtDevice = new Date();
  const configuration = await readConfigurationCache({
    actorProfile: input.actorProfile,
    deviceId: input.createdDeviceId,
    persistentDataCacheReady: input.persistentDataCacheReady ?? false,
    serviceWorkerReady: input.serviceWorkerReady ?? false,
    storage: dependencies.configurationStorage
  });
  const prepared = prepareOfflineHarvestSession({
    actorProfile: input.actorProfile,
    configurationReadiness: configuration.readiness,
    configurationSnapshot: configuration.snapshot,
    workerId: input.workerId,
    businessDate: input.businessDate,
    id: createHarvestSessionId(),
    note: input.note,
    secondSessionReason: input.secondSessionReason,
    createdDeviceId: input.createdDeviceId,
    createdAtDevice
  });

  if (prepared.status === "CONTINUE_EXISTING") {
    return {
      status: "CONTINUE_EXISTING",
      selectedSessionId: prepared.selectedSessionId,
      existingOpenSessions: prepared.existingOpenSessions,
      canCreateSecondSession: prepared.canCreateSecondSession,
      message: prepared.message
    };
  }

  if (prepared.auditAction !== "HARVEST_SESSION_CREATED") {
    throw new Error("Otwarcie sesji offline ma nieprawidlowa akcje audytu.");
  }

  const createdAtServer = serverTimestamp();
  const sessionRef = doc(firestore, HARVEST_SESSIONS_COLLECTION, prepared.session.id);
  const auditId = createAuditEventId();
  const auditRef = doc(firestore, AUDIT_EVENTS_COLLECTION, auditId);
  const localAudit = createHarvestOperationAuditEventDraft({
    id: auditId,
    actorProfile: input.actorProfile,
    action: prepared.auditAction,
    entityId: prepared.session.id,
    businessDate: prepared.session.businessDate,
    beforeSummary: prepared.beforeSummary,
    afterSummary: prepared.afterSummary,
    reason: prepared.reason,
    createdAtDevice,
    createdAtServer: null,
    deviceId: prepared.deviceId
  });
  const batch = writeBatch(firestore);

  batch.set(sessionRef, {
    ...prepared.session,
    createdAtServer
  });
  batch.set(auditRef, {
    ...localAudit,
    createdAtServer
  });

  await queueOfflineFirestoreBatch({
    batch,
    journal: dependencies.journal ?? defaultFirestoreSyncJournal,
    records: [
      createSessionJournalInput(
        {
          actorProfile: input.actorProfile,
          deviceId: input.createdDeviceId
        },
        prepared.session
      ),
      {
        deviceId: input.createdDeviceId,
        userUid: input.actorProfile.uid,
        id: localAudit.id,
        kind: "AUDIT_EVENT",
        localSnapshot: localAudit,
        sessionId: prepared.session.id,
        workerName: prepared.session.workerNameSnapshot,
        businessDate: prepared.session.businessDate,
        businessStatus: prepared.session.status
      }
    ],
    verifyLocalWrite: async () => (await getDocFromCache(sessionRef)).exists()
  });

  return {
    status: "CREATED_OFFLINE",
    session: prepared.session,
    selectedSessionId: prepared.session.id,
    message: prepared.message,
    duplicateMode: prepared.duplicateMode,
    calculationDescription: prepared.calculationDescription
  };
}

export async function addHarvestEntryOffline(
  env: FirebaseEnv,
  input: AddHarvestEntryOnlineInput,
  dependencies: OfflineHarvestRuntimeDependencies = {}
): Promise<AddHarvestEntryOnlineResult> {
  const { firestore } = await getFirebaseServices(env);
  const {
    collection,
    doc,
    getDocFromCache,
    getDocsFromCache,
    orderBy,
    query,
    serverTimestamp,
    where,
    writeBatch
  } = await import("firebase/firestore");
  const sessionRef = doc(firestore, HARVEST_SESSIONS_COLLECTION, input.sessionId);
  const sessionSnapshot = await getDocFromCache(sessionRef);

  if (!sessionSnapshot.exists()) {
    throw new Error("Nie znaleziono lokalnej sesji zbioru.");
  }

  const decodedSession = decodeHarvestSession(
    sessionSnapshot.id,
    sessionSnapshot.data({ serverTimestamps: "estimate" })
  );

  if (decodedSession.status !== "FOUND") {
    throw new Error(decodedSession.reason);
  }

  const entriesSnapshot = await getDocsFromCache(
    query(
      collection(firestore, HARVEST_ENTRIES_COLLECTION),
      where("sessionId", "==", decodedSession.session.id),
      orderBy("sequenceNumber", "asc")
    )
  );
  const entries = entriesSnapshot.docs.map(decodeCachedHarvestEntry);
  const createdAtDevice = new Date();
  const prepared = prepareOfflineHarvestEntry({
    actorProfile: input.actorProfile,
    session: decodedSession.session,
    entries,
    quantityMilli: input.quantityMilli,
    weightG: input.weightG,
    createdDeviceId: input.createdDeviceId,
    createdAtDevice
  });

  if (prepared.status !== "CREATED_OFFLINE") {
    throw new Error("Nowy wpis offline nie moze byc ponowieniem istniejacego UUID.");
  }

  const createdAtServer = serverTimestamp();
  const serverEntry: HarvestEntryDocument = {
    ...prepared.entry,
    pendingSync: false,
    createdAtServer
  };
  const entryRef = doc(firestore, HARVEST_ENTRIES_COLLECTION, serverEntry.id);
  const auditId = createAuditEventId();
  const auditRef = doc(firestore, AUDIT_EVENTS_COLLECTION, auditId);
  const localAudit = createHarvestOperationAuditEventDraft({
    id: auditId,
    actorProfile: input.actorProfile,
    action: "HARVEST_ENTRY_CREATED",
    entityId: prepared.entry.id,
    businessDate: prepared.entry.businessDate,
    beforeSummary: null,
    afterSummary: harvestEntryAuditSummary(serverEntry),
    reason: null,
    createdAtDevice,
    createdAtServer: null,
    deviceId: prepared.entry.createdDeviceId
  });
  const batch = writeBatch(firestore);

  batch.set(entryRef, serverEntry);
  batch.set(auditRef, {
    ...localAudit,
    createdAtServer
  });

  await queueOfflineFirestoreBatch({
    batch,
    journal: dependencies.journal ?? defaultFirestoreSyncJournal,
    records: [
      {
        deviceId: input.createdDeviceId,
        userUid: input.actorProfile.uid,
        id: prepared.entry.id,
        kind: "HARVEST_ENTRY",
        localSnapshot: prepared.entry,
        sessionId: prepared.entry.sessionId,
        workerName: decodedSession.session.workerNameSnapshot,
        businessDate: prepared.entry.businessDate,
        businessStatus: prepared.entry.status
      },
      {
        deviceId: input.createdDeviceId,
        userUid: input.actorProfile.uid,
        id: localAudit.id,
        kind: "AUDIT_EVENT",
        localSnapshot: localAudit,
        sessionId: prepared.entry.sessionId,
        workerName: decodedSession.session.workerNameSnapshot,
        businessDate: prepared.entry.businessDate,
        businessStatus: prepared.entry.status
      }
    ],
    verifyLocalWrite: async () => (await getDocFromCache(entryRef)).exists()
  });

  return {
    entry: prepared.entry,
    selectedSessionId: prepared.selectedSessionId,
    message: prepared.message,
    nextSessionTotals: prepared.nextSessionTotals
  };
}

export async function closeHarvestSessionOffline(
  env: FirebaseEnv,
  input: CloseHarvestSessionOnlineInput,
  dependencies: OfflineHarvestRuntimeDependencies = {}
): Promise<CloseHarvestSessionOnlineResult> {
  const { firestore } = await getFirebaseServices(env);
  const {
    collection,
    doc,
    getDocFromCache,
    getDocsFromCache,
    orderBy,
    query,
    serverTimestamp,
    where,
    writeBatch
  } = await import("firebase/firestore");
  const sessionRef = doc(firestore, HARVEST_SESSIONS_COLLECTION, input.sessionId);
  const sessionSnapshot = await getDocFromCache(sessionRef);

  if (!sessionSnapshot.exists()) {
    throw new Error("Nie znaleziono lokalnej sesji zbioru.");
  }

  const decodedSession = decodeHarvestSession(
    sessionSnapshot.id,
    sessionSnapshot.data({ serverTimestamps: "estimate" })
  );

  if (decodedSession.status !== "FOUND") {
    throw new Error(decodedSession.reason);
  }

  const entriesSnapshot = await getDocsFromCache(
    query(
      collection(firestore, HARVEST_ENTRIES_COLLECTION),
      where("sessionId", "==", decodedSession.session.id),
      orderBy("sequenceNumber", "asc")
    )
  );
  const entries = entriesSnapshot.docs.map(decodeCachedHarvestEntry);
  const closedAtDevice = new Date();
  const prepared = prepareOfflineHarvestSessionClose({
    actorProfile: input.actorProfile,
    session: decodedSession.session,
    entries,
    confirmationAccepted: input.confirmationAccepted,
    closedAtDevice,
    deviceId: input.deviceId
  });
  const serverTimestampValue = serverTimestamp();
  const serverUpdate = {
    ...prepared.sessionUpdate,
    closedAtServer: serverTimestampValue,
    updatedAtServer: serverTimestampValue
  };
  const auditId = createAuditEventId();
  const auditRef = doc(firestore, AUDIT_EVENTS_COLLECTION, auditId);
  const localAudit = createHarvestOperationAuditEventDraft({
    id: auditId,
    actorProfile: input.actorProfile,
    action: prepared.auditAction,
    entityId: prepared.session.id,
    businessDate: prepared.session.businessDate,
    beforeSummary: prepared.beforeSummary,
    afterSummary: prepared.afterSummary,
    reason: null,
    createdAtDevice: closedAtDevice,
    createdAtServer: null,
    deviceId: input.deviceId
  });
  const batch = writeBatch(firestore);

  batch.update(sessionRef, serverUpdate);
  batch.set(auditRef, {
    ...localAudit,
    createdAtServer: serverTimestampValue
  });

  await queueOfflineFirestoreBatch({
    batch,
    journal: dependencies.journal ?? defaultFirestoreSyncJournal,
    records: [
      createSessionJournalInput(
        {
          actorProfile: input.actorProfile,
          deviceId: input.deviceId
        },
        prepared.session
      ),
      {
        deviceId: input.deviceId,
        userUid: input.actorProfile.uid,
        id: localAudit.id,
        kind: "AUDIT_EVENT",
        localSnapshot: localAudit,
        sessionId: prepared.session.id,
        workerName: prepared.session.workerNameSnapshot,
        businessDate: prepared.session.businessDate,
        businessStatus: prepared.session.status
      }
    ],
    verifyLocalWrite: async () => {
      const localSnapshot = await getDocFromCache(sessionRef);

      return localSnapshot.exists() && localSnapshot.data().status === "CLOSED";
    }
  });

  return {
    session: prepared.session,
    selectedSessionId: null,
    message: prepared.message,
    confirmationSummary: prepared.confirmationSummary
  };
}

function decodeCachedHarvestEntry(documentSnapshot: {
  id: string;
  data: (options?: { serverTimestamps: "estimate" }) => Record<string, unknown>;
  metadata: { hasPendingWrites: boolean };
}): HarvestEntryDocument {
  const data = documentSnapshot.data({ serverTimestamps: "estimate" });
  const decoded = decodeHarvestEntry(documentSnapshot.id, {
    ...data,
    pendingSync: documentSnapshot.metadata.hasPendingWrites || data.pendingSync === true
  });

  if (decoded.status !== "FOUND") {
    throw new Error(decoded.reason);
  }

  return decoded.entry;
}

function createSessionJournalInput(
  input: {
    actorProfile: OpenHarvestSessionOnlineInput["actorProfile"];
    deviceId: string;
  },
  session: HarvestSessionDocument
) {
  return {
    deviceId: input.deviceId,
    userUid: input.actorProfile.uid,
    id: session.id,
    kind: "HARVEST_SESSION" as const,
    localSnapshot: session,
    sessionId: session.id,
    workerName: session.workerNameSnapshot,
    businessDate: session.businessDate,
    businessStatus: session.status
  };
}
