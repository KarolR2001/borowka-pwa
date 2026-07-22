import { AUDIT_EVENTS_COLLECTION, createAuditEventId } from "../audit/auditEvents";
import { getFirebaseServices } from "../config/firebaseServices";
import type { UserProfile } from "../domain/identity";
import {
  createHarvestOperationAuditEventDraft,
  harvestEntryAuditSummary
} from "./harvestAudit";
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

export type CancelHarvestEntryOnlineInput = {
  actorProfile: UserProfile;
  sessionId: string;
  entryId: string;
  reason: string;
  isOnline: boolean;
  deviceId: string;
};

export type CancelHarvestEntryOnlineResult = {
  entry: HarvestEntryDocument;
  selectedSessionId: string;
  message: string;
  confirmationSummary: CancelHarvestEntryConfirmationSummary;
};

export type CancelHarvestEntryConfirmationSummary = {
  entryId: string;
  sequenceNumber: number;
  workerName: string;
  businessDate: string;
  quantityMilli: number;
  weightG: number | null;
  amountPreviewGrosz: number | null;
  pendingWriteCount: number;
  reason: string;
};

export type PreparedCancelHarvestEntry = {
  entry: HarvestEntryDocument;
  entryUpdate: Pick<
    HarvestEntryDocument,
    "status" | "cancellationReason" | "cancelledBy" | "cancelledAtServer" | "revision"
  >;
  auditEvent: ReturnType<typeof createHarvestOperationAuditEventDraft>;
  confirmationSummary: CancelHarvestEntryConfirmationSummary;
};

export type PrepareRuntimeCancelHarvestEntryInput = {
  actorProfile: UserProfile;
  session: HarvestSessionDocument;
  entry: HarvestEntryDocument;
  entries: HarvestEntryDocument[];
  reason: string;
  isOnline: boolean;
  cancelledAtDevice: unknown;
  cancelledAtServer: unknown;
  auditId: string;
  deviceId: string;
};

export async function cancelHarvestEntryOnline(
  env: FirebaseEnv,
  input: CancelHarvestEntryOnlineInput
): Promise<CancelHarvestEntryOnlineResult> {
  assertCancelHarvestEntryActor(input.actorProfile);

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
  const entry = entries.find((candidate) => candidate.id === input.entryId);

  if (!entry) {
    throw new Error("Nie znaleziono wpisu zbioru.");
  }

  const cancelledAtDevice = Timestamp.now();
  const cancelledAtServer = serverTimestamp();
  const prepared = prepareRuntimeCancelHarvestEntry({
    actorProfile: input.actorProfile,
    session: decodedSession.session,
    entry,
    entries,
    reason: input.reason,
    isOnline: input.isOnline,
    cancelledAtDevice,
    cancelledAtServer,
    auditId: createAuditEventId(),
    deviceId: input.deviceId
  });
  const batch = writeBatch(firestore);

  batch.update(
    doc(firestore, HARVEST_ENTRIES_COLLECTION, prepared.entry.id),
    prepared.entryUpdate
  );
  batch.set(
    doc(firestore, AUDIT_EVENTS_COLLECTION, prepared.auditEvent.id),
    prepared.auditEvent
  );

  await batch.commit();

  return {
    entry: prepared.entry,
    selectedSessionId: prepared.entry.sessionId,
    message: `Anulowano wpis #${String(prepared.entry.sequenceNumber)}.`,
    confirmationSummary: prepared.confirmationSummary
  };
}

export function prepareRuntimeCancelHarvestEntry(
  input: PrepareRuntimeCancelHarvestEntryInput
): PreparedCancelHarvestEntry {
  assertCancelHarvestEntryActor(input.actorProfile);
  assertCancelHarvestEntryAllowed(input);

  const reason = normalizeCancelHarvestEntryReason(input.reason);
  const entry: HarvestEntryDocument = {
    ...input.entry,
    status: "CANCELLED",
    cancellationReason: reason,
    cancelledBy: input.actorProfile.uid,
    cancelledAtServer: input.cancelledAtServer,
    revision: input.entry.revision + 1
  };
  const auditEvent = createHarvestOperationAuditEventDraft({
    id: input.auditId,
    actorProfile: input.actorProfile,
    action: "HARVEST_ENTRY_CANCELLED",
    entityId: entry.id,
    businessDate: entry.businessDate,
    beforeSummary: harvestEntryAuditSummary(input.entry),
    afterSummary: harvestEntryAuditSummary(entry),
    reason,
    createdAtDevice: input.cancelledAtDevice,
    createdAtServer: input.cancelledAtServer,
    deviceId: input.deviceId
  });

  return {
    entry,
    entryUpdate: {
      status: entry.status,
      cancellationReason: entry.cancellationReason,
      cancelledBy: entry.cancelledBy,
      cancelledAtServer: entry.cancelledAtServer,
      revision: entry.revision
    },
    auditEvent,
    confirmationSummary: {
      entryId: input.entry.id,
      sequenceNumber: input.entry.sequenceNumber,
      workerName: input.session.workerNameSnapshot,
      businessDate: input.session.businessDate,
      quantityMilli: input.entry.quantityMilli,
      weightG: input.entry.weightG,
      amountPreviewGrosz: input.entry.amountPreviewGrosz,
      pendingWriteCount: countPendingWrites(input.entries),
      reason
    }
  };
}

function assertCancelHarvestEntryAllowed(
  input: PrepareRuntimeCancelHarvestEntryInput
): void {
  if (!input.isOnline) {
    throw new Error("Anulowanie wpisu wymaga polaczenia online.");
  }

  if (input.session.status !== "OPEN") {
    throw new Error("Wpis mozna anulowac tylko w otwartej sesji.");
  }

  if (input.session.paymentId !== null) {
    throw new Error("Aktywna wyplata blokuje anulowanie wpisu.");
  }

  if (
    input.entry.sessionId !== input.session.id ||
    input.entry.seasonId !== input.session.seasonId ||
    input.entry.workerId !== input.session.workerId ||
    input.entry.businessDate !== input.session.businessDate
  ) {
    throw new Error("Wpis nie nalezy do wybranej sesji.");
  }

  if (input.entry.status !== "ACTIVE") {
    throw new Error("Mozna anulowac tylko aktywny wpis.");
  }

  if (input.entry.pendingSync) {
    throw new Error("Nie mozna anulowac wpisu oczekujacego na synchronizacje.");
  }

  if (countPendingWrites(input.entries) > 0) {
    throw new Error("Nie mozna anulowac wpisu przy oczekujacych zapisach sesji.");
  }
}

function assertCancelHarvestEntryActor(actorProfile: UserProfile): void {
  if (
    !actorProfile.active ||
    actorProfile.registrationStatus !== "APPROVED" ||
    actorProfile.role !== "ADMIN"
  ) {
    throw new Error("Anulowanie wpisu wymaga aktywnego administratora.");
  }
}

function normalizeCancelHarvestEntryReason(reason: string): string {
  const normalized = reason.trim().replace(/\s+/g, " ");

  if (normalized.length < 3) {
    throw new Error("Anulowanie wpisu wymaga powodu.");
  }

  return normalized;
}

function countPendingWrites(entries: readonly HarvestEntryDocument[]): number {
  return entries.filter((entry) => entry.pendingSync).length;
}
