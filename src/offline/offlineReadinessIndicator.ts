import type { AuthSessionState } from "../auth/authSession";
import type { OfflineLayerReadiness } from "./offlineReadiness";
import type { OfflineStorageHealth } from "./offlineStorageHealth";

export type OfflineReadinessIndicatorStatus =
  | "ONLINE_SYNCED"
  | "ONLINE_PENDING_WRITES"
  | "OFFLINE_READY"
  | "OFFLINE_MISSING_DATA"
  | "STORAGE_UNAVAILABLE"
  | "SYNC_ERROR"
  | "REAUTH_REQUIRED";

export type OfflineReadinessIndicatorTone = "ok" | "warn" | "error";

export type OfflineReadinessIndicatorInput = {
  isOnline: boolean;
  accountReconfirmationRequired: boolean;
  syncError: boolean;
  pendingWriteCount: number;
  lastFirestoreContactIso: string | null;
  layerReadiness: OfflineLayerReadiness | null;
  storageHealth?: OfflineStorageHealth | null;
};

export type OfflineReadinessIndicator = {
  status: OfflineReadinessIndicatorStatus;
  label: string;
  tone: OfflineReadinessIndicatorTone;
  details: string[];
  lastFirestoreContactIso: string | null;
};

export function evaluateOfflineReadinessIndicator(
  input: OfflineReadinessIndicatorInput
): OfflineReadinessIndicator {
  const details = createBaseDetails(input);

  if (input.accountReconfirmationRequired) {
    return createIndicator(input, {
      status: "REAUTH_REQUIRED",
      label: "Wymagane ponowne potwierdzenie konta",
      tone: "warn",
      details: [
        "Odnow sesje lub potwierdz status konta przed dalsza synchronizacja.",
        ...details
      ]
    });
  }

  if (input.storageHealth?.status === "NOT_READY") {
    return createIndicator(input, {
      status: "STORAGE_UNAVAILABLE",
      label: input.storageHealth.label,
      tone: "error",
      details: [...input.storageHealth.issues.map((issue) => issue.message), ...details]
    });
  }

  if (input.syncError || input.layerReadiness?.dataLayer.sources.REJECTED === true) {
    return createIndicator(input, {
      status: "SYNC_ERROR",
      label: "Blad synchronizacji",
      tone: "error",
      details: ["Co najmniej jeden zapis lub odczyt wymaga interwencji.", ...details]
    });
  }

  if (input.isOnline && input.pendingWriteCount > 0) {
    return createIndicator(input, {
      status: "ONLINE_PENDING_WRITES",
      label: "Online, sa oczekujace zapisy",
      tone: "warn",
      details: [
        `Oczekujace zapisy lokalne: ${String(input.pendingWriteCount)}.`,
        ...details
      ]
    });
  }

  if (input.isOnline && input.layerReadiness?.overallStatus === "READY") {
    return createIndicator(input, {
      status: "ONLINE_SYNCED",
      label: "Online, zsynchronizowano",
      tone: "ok",
      details: ["Dane wymagane do pracy offline sa gotowe.", ...details]
    });
  }

  if (!input.isOnline && input.layerReadiness?.overallStatus === "READY") {
    return createIndicator(input, {
      status: "OFFLINE_READY",
      label: "Offline, gotowe",
      tone: "ok",
      details: ["Aplikacja i dane moga obslugiwac prace bez internetu.", ...details]
    });
  }

  return createIndicator(input, {
    status: "OFFLINE_MISSING_DATA",
    label: "Offline, brak wymaganych danych",
    tone: "warn",
    details: ["Brakuje danych, plikow PWA albo potwierdzonego cache.", ...details]
  });
}

export function authStateRequiresOfflineReconfirmation(
  authState: AuthSessionState
): boolean {
  return (
    authState.status === "MISSING_PROFILE" ||
    authState.status === "BLOCKED" ||
    authState.status === "PENDING_APPROVAL" ||
    authState.status === "INVALID_PICKER_PROFILE" ||
    authState.status === "INVALID_PROFILE" ||
    authState.status === "PROFILE_UNAVAILABLE"
  );
}

function createBaseDetails(input: OfflineReadinessIndicatorInput): string[] {
  return [
    input.lastFirestoreContactIso
      ? `Ostatni kontakt z Firestore: ${input.lastFirestoreContactIso}.`
      : "Brak potwierdzonego kontaktu z Firestore.",
    input.isOnline
      ? "Przegladarka zglasza tryb online."
      : "Przegladarka zglasza tryb offline."
  ];
}

function createIndicator(
  input: OfflineReadinessIndicatorInput,
  indicator: Omit<OfflineReadinessIndicator, "lastFirestoreContactIso">
): OfflineReadinessIndicator {
  return {
    ...indicator,
    lastFirestoreContactIso: input.lastFirestoreContactIso
  };
}
