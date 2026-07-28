import { AUDIT_EVENTS_COLLECTION, createAuditEventId } from "../audit/auditEvents";
import { getFirebaseServices } from "../config/firebaseServices";
import type { UserProfile } from "../domain/identity";
import {
  prepareReopenHarvestSession,
  type PreparedReopenHarvestSession
} from "./reopenHarvestSession";
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

export type ReopenHarvestSessionOnlineInput = {
  actorProfile: UserProfile;
  sessionId: string;
  reason: string;
  hasActivePayment: boolean;
  isOnline: boolean;
  deviceId: string;
};

export type ReopenHarvestSessionOnlineResult = {
  session: HarvestSessionDocument;
  selectedSessionId: string;
  message: string;
  confirmationSummary: PreparedReopenHarvestSession["confirmationSummary"];
};

export type PrepareRuntimeReopenHarvestSessionInput = {
  actorProfile: UserProfile;
  session: HarvestSessionDocument;
  entries: HarvestEntryDocument[];
  reason: string;
  hasActivePayment: boolean;
  isOnline: boolean;
  reopenedAtDevice: unknown;
  reopenedAtServer: unknown;
  auditId: string;
  deviceId: string;
};

export async function reopenHarvestSessionOnline(
  env: FirebaseEnv,
  input: ReopenHarvestSessionOnlineInput
): Promise<ReopenHarvestSessionOnlineResult> {
  assertReopenHarvestSessionActor(input.actorProfile);

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
  } = await import("firebase/firestore");
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
  const reopenedAtDevice = Timestamp.now();
  const reopenedAtServer = serverTimestamp();
  const prepared = prepareRuntimeReopenHarvestSession({
    actorProfile: input.actorProfile,
    session: decodedSession.session,
    entries,
    reason: input.reason,
    hasActivePayment: input.hasActivePayment,
    isOnline: input.isOnline,
    reopenedAtDevice,
    reopenedAtServer,
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
    selectedSessionId: prepared.session.id,
    message: `Ponownie otwarto sesje dla ${prepared.session.workerNameSnapshot}.`,
    confirmationSummary: prepared.confirmationSummary
  };
}

export function prepareRuntimeReopenHarvestSession(
  input: PrepareRuntimeReopenHarvestSessionInput
): PreparedReopenHarvestSession {
  assertReopenHarvestSessionActor(input.actorProfile);

  return prepareReopenHarvestSession({
    actorProfile: input.actorProfile,
    session: input.session,
    isOnline: input.isOnline,
    hasActivePayment: input.hasActivePayment,
    pendingWriteCount: input.entries.filter((entry) => entry.pendingSync).length,
    reason: input.reason,
    reopenedAtDevice: input.reopenedAtDevice,
    reopenedAtServer: input.reopenedAtServer,
    auditId: input.auditId,
    deviceId: input.deviceId
  });
}

function assertReopenHarvestSessionActor(actorProfile: UserProfile): void {
  if (
    !actorProfile.active ||
    actorProfile.registrationStatus !== "APPROVED" ||
    actorProfile.role !== "ADMIN"
  ) {
    throw new Error("Ponowne otwarcie sesji wymaga aktywnego administratora.");
  }
}
