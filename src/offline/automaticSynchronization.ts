import type { UserRole } from "../domain/identity";
import { clearFirestoreLocalData, getFirebaseServices } from "../config/firebaseServices";
import {
  defaultFirestoreSyncJournal,
  toSyncDocumentMetadata,
  type FirestoreSyncJournal,
  type SyncJournalRecord
} from "./firestoreSyncJournal";
import { writeFirestorePersistencePreference } from "./firestorePersistencePreference";
import type { SyncDocumentMetadataInput } from "./pendingWriteMetadata";

type FirebaseEnv = Record<string, string | boolean | undefined>;

export const AUTOMATIC_SYNC_REOPEN_INSTRUCTION =
  "Synchronizacja nie uruchomi sie po calkowitym zamknieciu aplikacji. Otworz PWA po odzyskaniu internetu.";

export const SYNCHRONIZATION_TRIGGERS = [
  "APP_START",
  "ONLINE_RESTORED",
  "APP_ACTIVATED",
  "MANUAL_RETRY",
  "AUTH_LOCAL_DATA_READY"
] as const;

export type SynchronizationTrigger = (typeof SYNCHRONIZATION_TRIGGERS)[number];

export type SynchronizationBlockReason =
  "ACCOUNT_NOT_READY" | "APP_NOT_ACTIVE" | "IN_FLIGHT" | "NO_LOCAL_DATA" | "OFFLINE";

export type SynchronizationTriggerDecision =
  | {
      shouldRun: true;
      trigger: SynchronizationTrigger;
      message: string;
    }
  | {
      shouldRun: false;
      trigger: SynchronizationTrigger;
      reason: SynchronizationBlockReason;
      message: string;
      requiresOpenPwa: boolean;
    };

export type SynchronizationGateInput = {
  authReady: boolean;
  hasLocalDataForAccount: boolean;
  inFlight: boolean;
  isOnline: boolean;
  isVisible: boolean;
  trigger: SynchronizationTrigger;
};

export type SynchronizationAccountQuery = {
  deviceId: string;
  userUid: string;
};

export type SynchronizationRequest = SynchronizationAccountQuery & {
  pendingDocumentCount: number;
  requestedAtIso: string;
  trigger: SynchronizationTrigger;
  userRole: UserRole;
};

export type SynchronizationRunStatus = "SUCCESS" | "SKIPPED" | "FAILED";

export type SynchronizationRunResult = {
  finishedAtIso: string;
  message: string;
  requestedAtIso: string;
  status: SynchronizationRunStatus;
  trigger: SynchronizationTrigger;
};

export type SynchronizationApi = {
  clearLocalData: (env: FirebaseEnv, input: SynchronizationAccountQuery) => Promise<void>;
  hasLocalData: (
    env: FirebaseEnv,
    input: SynchronizationAccountQuery
  ) => Promise<boolean>;
  listLocalDocuments: (
    env: FirebaseEnv,
    input: SynchronizationAccountQuery
  ) => Promise<readonly SyncDocumentMetadataInput[]>;
  synchronize: (
    env: FirebaseEnv,
    request: SynchronizationRequest
  ) => Promise<SynchronizationRunResult>;
};

export function createFirestoreSynchronizationApi(
  journal: FirestoreSyncJournal = defaultFirestoreSyncJournal
): SynchronizationApi {
  return {
    clearLocalData: async (env, input) => {
      await clearFirestoreLocalData(env);
      await journal.clear(input);
      writeFirestorePersistencePreference(false);
    },
    hasLocalData: async (_env, input) => (await journal.list(input)).length > 0,
    listLocalDocuments: async (_env, input) =>
      (await journal.list(input)).map(toSyncDocumentMetadata),
    synchronize: (env, request) => synchronizeFirestoreJournal(env, request, journal)
  };
}

export const defaultSynchronizationApi: SynchronizationApi =
  createFirestoreSynchronizationApi();

async function synchronizeFirestoreJournal(
  env: FirebaseEnv,
  request: SynchronizationRequest,
  journal: FirestoreSyncJournal
): Promise<SynchronizationRunResult> {
  const account = {
    deviceId: request.deviceId,
    userUid: request.userUid
  };
  const before = await journal.list(account);

  if (before.length === 0) {
    return {
      finishedAtIso: new Date().toISOString(),
      message: "Brak lokalnych dokumentow wymagajacych synchronizacji.",
      requestedAtIso: request.requestedAtIso,
      status: "SKIPPED",
      trigger: request.trigger
    };
  }

  const { firestore } = await getFirebaseServices(env);
  const { enableNetwork, waitForPendingWrites } = await import("firebase/firestore");

  await enableNetwork(firestore);

  try {
    await withTimeout(
      waitForPendingWrites(firestore),
      30_000,
      "Firestore nie potwierdzil zapisow w wyznaczonym czasie."
    );
  } catch (error: unknown) {
    return {
      finishedAtIso: new Date().toISOString(),
      message: getSynchronizationFailureMessage(error),
      requestedAtIso: request.requestedAtIso,
      status: "FAILED",
      trigger: request.trigger
    };
  }

  await reconcileJournalWithServer(env, account, before, journal);
  const remaining = await journal.list(account);
  const rejectedCount = remaining.filter((record) => record.rejectedReason).length;

  return {
    finishedAtIso: new Date().toISOString(),
    message:
      remaining.length === 0
        ? `Zsynchronizowano ${String(before.length)} lokalnych dokumentow.`
        : `Pozostalo ${String(remaining.length)} lokalnych dokumentow, w tym ${String(rejectedCount)} odrzuconych.`,
    requestedAtIso: request.requestedAtIso,
    status: remaining.length === 0 ? "SUCCESS" : "FAILED",
    trigger: request.trigger
  };
}

async function reconcileJournalWithServer(
  env: FirebaseEnv,
  account: SynchronizationAccountQuery,
  records: readonly SyncJournalRecord[],
  journal: FirestoreSyncJournal
): Promise<void> {
  const businessRecords = records.filter(
    (record) => record.kind === "HARVEST_SESSION" || record.kind === "HARVEST_ENTRY"
  );
  let hasRejectedBusinessRecord = false;

  for (const record of businessRecords) {
    try {
      if (await isJournalRecordConfirmedOnServer(env, record)) {
        await journal.removeIfCurrent(account, record.kind, record.id, record.writeId);
      } else {
        hasRejectedBusinessRecord = true;
        await journal.markRejected(
          account,
          record.kind,
          record.id,
          record.writeId,
          "Serwer nie potwierdzil dokumentu po oproznieniu kolejki Firestore."
        );
      }
    } catch (error: unknown) {
      hasRejectedBusinessRecord = true;
      await journal.markRejected(
        account,
        record.kind,
        record.id,
        record.writeId,
        getSynchronizationFailureMessage(error)
      );
    }
  }

  for (const record of records.filter((candidate) => candidate.kind === "AUDIT_EVENT")) {
    if (hasRejectedBusinessRecord) {
      await journal.markRejected(
        account,
        record.kind,
        record.id,
        record.writeId,
        "Audyt pozostaje do przegladu, poniewaz dokument biznesowy nie zostal potwierdzony."
      );
    } else {
      await journal.removeIfCurrent(account, record.kind, record.id, record.writeId);
    }
  }
}

async function isJournalRecordConfirmedOnServer(
  env: FirebaseEnv,
  record: SyncJournalRecord
): Promise<boolean> {
  const { firestore } = await getFirebaseServices(env);
  const { doc, getDocFromServer } = await import("firebase/firestore");
  const collectionName =
    record.kind === "HARVEST_SESSION" ? "harvestSessions" : "harvestEntries";
  const snapshot = await getDocFromServer(doc(firestore, collectionName, record.id));

  if (!snapshot.exists()) {
    return false;
  }

  if (record.kind === "HARVEST_SESSION" && record.businessStatus) {
    return snapshot.data().status === record.businessStatus;
  }

  return true;
}

function withTimeout<T>(
  promise: Promise<T>,
  timeoutMilliseconds: number,
  message: string
): Promise<T> {
  return new Promise((resolve, reject) => {
    const timeoutId = globalThis.setTimeout(() => {
      reject(new Error(message));
    }, timeoutMilliseconds);

    promise.then(
      (value) => {
        globalThis.clearTimeout(timeoutId);
        resolve(value);
      },
      (error: unknown) => {
        globalThis.clearTimeout(timeoutId);
        reject(error instanceof Error ? error : new Error(message));
      }
    );
  });
}

function getSynchronizationFailureMessage(error: unknown): string {
  return error instanceof Error && error.message.trim()
    ? error.message.trim()
    : "Synchronizacja Firestore nie powiodla sie.";
}

export function evaluateSynchronizationTrigger(
  input: SynchronizationGateInput
): SynchronizationTriggerDecision {
  if (!input.authReady) {
    return blockSynchronization(input.trigger, "ACCOUNT_NOT_READY", false);
  }

  if (!input.isOnline) {
    return blockSynchronization(input.trigger, "OFFLINE", true);
  }

  if (!input.isVisible) {
    return blockSynchronization(input.trigger, "APP_NOT_ACTIVE", true);
  }

  if (input.inFlight) {
    return blockSynchronization(input.trigger, "IN_FLIGHT", false);
  }

  if (!input.hasLocalDataForAccount && input.trigger !== "MANUAL_RETRY") {
    return blockSynchronization(input.trigger, "NO_LOCAL_DATA", false);
  }

  return {
    shouldRun: true,
    trigger: input.trigger,
    message: createTriggerMessage(input.trigger)
  };
}

export function createSynchronizationRequest({
  deviceId,
  pendingDocumentCount,
  requestedAtIso,
  trigger,
  userRole,
  userUid
}: SynchronizationRequest): SynchronizationRequest {
  return {
    deviceId: normalizeRequiredText(deviceId, "Synchronizacja wymaga urzadzenia."),
    pendingDocumentCount: normalizePendingDocumentCount(pendingDocumentCount),
    requestedAtIso: normalizeIso(requestedAtIso),
    trigger,
    userRole,
    userUid: normalizeRequiredText(userUid, "Synchronizacja wymaga konta.")
  };
}

function blockSynchronization(
  trigger: SynchronizationTrigger,
  reason: SynchronizationBlockReason,
  requiresOpenPwa: boolean
): SynchronizationTriggerDecision {
  return {
    shouldRun: false,
    trigger,
    reason,
    requiresOpenPwa,
    message: createBlockMessage(reason)
  };
}

function createTriggerMessage(trigger: SynchronizationTrigger): string {
  switch (trigger) {
    case "APP_START":
      return "Synchronizacja uruchomiona po starcie aplikacji.";
    case "ONLINE_RESTORED":
      return "Synchronizacja uruchomiona po odzyskaniu polaczenia.";
    case "APP_ACTIVATED":
      return "Synchronizacja uruchomiona po aktywacji aplikacji.";
    case "MANUAL_RETRY":
      return "Synchronizacja uruchomiona recznie.";
    case "AUTH_LOCAL_DATA_READY":
      return "Synchronizacja uruchomiona po zalogowaniu do konta z lokalnymi danymi.";
  }
}

function createBlockMessage(reason: SynchronizationBlockReason): string {
  switch (reason) {
    case "ACCOUNT_NOT_READY":
      return "Synchronizacja wymaga aktywnego profilu.";
    case "APP_NOT_ACTIVE":
      return AUTOMATIC_SYNC_REOPEN_INSTRUCTION;
    case "IN_FLIGHT":
      return "Synchronizacja juz trwa.";
    case "NO_LOCAL_DATA":
      return "Brak lokalnych dokumentow wymagajacych synchronizacji.";
    case "OFFLINE":
      return "Synchronizacja ruszy po odzyskaniu polaczenia i otwarciu PWA.";
  }
}

function normalizeRequiredText(value: string, message: string): string {
  const trimmed = value.trim();

  if (!trimmed) {
    throw new Error(message);
  }

  return trimmed;
}

function normalizePendingDocumentCount(value: number): number {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error("Liczba dokumentow do synchronizacji musi byc nieujemna.");
  }

  return value;
}

function normalizeIso(value: string): string {
  const trimmed = normalizeRequiredText(value, "Synchronizacja wymaga czasu zlecenia.");

  if (Number.isNaN(Date.parse(trimmed))) {
    throw new Error("Czas zlecenia synchronizacji musi byc poprawnym ISO.");
  }

  return trimmed;
}
