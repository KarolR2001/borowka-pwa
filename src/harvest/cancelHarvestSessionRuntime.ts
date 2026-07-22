import { AUDIT_EVENTS_COLLECTION, createAuditEventId } from "../audit/auditEvents";
import { getFirebaseServices } from "../config/firebaseServices";
import type { UserProfile } from "../domain/identity";
import {
  prepareCancelHarvestSession,
  type PreparedCancelHarvestSession
} from "./cancelHarvestSession";
import {
  decodeHarvestEntry,
  decodeHarvestSession,
  type HarvestEntryDocument
} from "./harvestSessionDashboard";
import {
  HARVEST_ENTRIES_COLLECTION,
  HARVEST_SESSIONS_COLLECTION
} from "./harvestSessionState";
import type { HarvestSessionDocument } from "./openHarvestSession";

type FirebaseEnv = Record<string, string | boolean | undefined>;

export type CancelHarvestSessionOnlineInput = {
  actorProfile: UserProfile;
  sessionId: string;
  reason: string;
  hasActivePayment: boolean;
  isOnline: boolean;
  deviceId: string;
};

export type CancelHarvestSessionOnlineResult = {
  session: HarvestSessionDocument;
  selectedSessionId: string | null;
  message: string;
  confirmationSummary: PreparedCancelHarvestSession["confirmationSummary"];
};

export type PrepareRuntimeCancelHarvestSessionInput = {
  actorProfile: UserProfile;
  session: HarvestSessionDocument;
  entries: HarvestEntryDocument[];
  reason: string;
  hasActivePayment: boolean;
  isOnline: boolean;
  cancelledAtDevice: unknown;
  cancelledAtServer: unknown;
  auditId: string;
  deviceId: string;
};

export async function cancelHarvestSessionOnline(
  env: FirebaseEnv,
  input: CancelHarvestSessionOnlineInput
): Promise<CancelHarvestSessionOnlineResult> {
  assertCancelHarvestSessionActor(input.actorProfile);

  const { firestore } = await getFirebaseServices(env);
  const {
    Timestamp,
    collection,
    doc,
    getDoc,
    getDocs,
    orderBy,
    query,
    serverTimestamp,
    where,
    writeBatch
  } = await import("firebase/firestore/lite");
  const sessionSnapshot = await getDoc(
    doc(firestore, HARVEST_SESSIONS_COLLECTION, input.sessionId)
  );

  if (!sessionSnapshot.exists()) {
    throw new Error("Nie znaleziono sesji zbioru.");
  }

  const decodedSession = decodeHarvestSession(sessionSnapshot.id, sessionSnapshot.data());

  if (decodedSession.status !== "FOUND") {
    throw new Error(decodedSession.reason);
  }

  const entriesSnapshot = await getDocs(
    query(
      collection(firestore, HARVEST_ENTRIES_COLLECTION),
      where("sessionId", "==", decodedSession.session.id),
      orderBy("sequenceNumber", "asc")
    )
  );
  const entries = entriesSnapshot.docs.map((entrySnapshot) => {
    const decodedEntry = decodeHarvestEntry(entrySnapshot.id, entrySnapshot.data());

    if (decodedEntry.status !== "FOUND") {
      throw new Error(decodedEntry.reason);
    }

    return decodedEntry.entry;
  });
  const cancelledAtDevice = Timestamp.now();
  const cancelledAtServer = serverTimestamp();
  const prepared = prepareRuntimeCancelHarvestSession({
    actorProfile: input.actorProfile,
    session: decodedSession.session,
    entries,
    reason: input.reason,
    hasActivePayment: input.hasActivePayment,
    isOnline: input.isOnline,
    cancelledAtDevice,
    cancelledAtServer,
    auditId: createAuditEventId(),
    deviceId: input.deviceId
  });
  const batch = writeBatch(firestore);

  batch.update(
    doc(firestore, HARVEST_SESSIONS_COLLECTION, prepared.session.id),
    prepared.sessionUpdate
  );
  batch.set(
    doc(firestore, AUDIT_EVENTS_COLLECTION, prepared.auditEvent.id),
    prepared.auditEvent
  );

  await batch.commit();

  return {
    session: prepared.session,
    selectedSessionId: null,
    message: `Anulowano sesje dla ${prepared.session.workerNameSnapshot}.`,
    confirmationSummary: prepared.confirmationSummary
  };
}

export function prepareRuntimeCancelHarvestSession(
  input: PrepareRuntimeCancelHarvestSessionInput
): PreparedCancelHarvestSession {
  assertCancelHarvestSessionActor(input.actorProfile);

  return prepareCancelHarvestSession({
    actorProfile: input.actorProfile,
    session: input.session,
    isOnline: input.isOnline,
    hasActivePayment: input.hasActivePayment,
    pendingWriteCount: input.entries.filter((entry) => entry.pendingSync).length,
    reason: input.reason,
    cancelledAtDevice: input.cancelledAtDevice,
    cancelledAtServer: input.cancelledAtServer,
    auditId: input.auditId,
    deviceId: input.deviceId
  });
}

function assertCancelHarvestSessionActor(actorProfile: UserProfile): void {
  if (
    !actorProfile.active ||
    actorProfile.registrationStatus !== "APPROVED" ||
    actorProfile.role !== "ADMIN"
  ) {
    throw new Error("Anulowanie sesji wymaga aktywnego administratora.");
  }
}
