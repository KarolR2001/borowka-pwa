import type { UserRole } from "../domain/identity";
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

export const defaultSynchronizationApi: SynchronizationApi = {
  clearLocalData: () => Promise.resolve(),
  hasLocalData: () => Promise.resolve(false),
  listLocalDocuments: () => Promise.resolve([]),
  synchronize: (_env, request) =>
    Promise.resolve({
      finishedAtIso: request.requestedAtIso,
      message: "Brak lokalnych dokumentow wymagajacych synchronizacji.",
      requestedAtIso: request.requestedAtIso,
      status: "SKIPPED",
      trigger: request.trigger
    })
};

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
