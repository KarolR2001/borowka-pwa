export const SYNC_DOCUMENT_STATUSES = [
  "LOCAL_SAVED",
  "PENDING_SYNC",
  "SYNCED",
  "REJECTED",
  "REMOTE_CHANGED"
] as const;

export const SYNC_DOCUMENT_KINDS = [
  "HARVEST_SESSION",
  "HARVEST_ENTRY",
  "ISSUE_REPORT",
  "AUDIT_EVENT",
  "CONFIGURATION_SNAPSHOT"
] as const;

export type SyncDocumentStatus = (typeof SYNC_DOCUMENT_STATUSES)[number];
export type SyncDocumentKind = (typeof SYNC_DOCUMENT_KINDS)[number];
export type SyncDocumentTone = "ok" | "warn" | "error";

export type FirestoreSnapshotSyncMetadata = {
  hasPendingWrites: boolean;
  fromCache: boolean;
};

export type SyncDocumentMetadataInput = {
  id: string;
  kind: SyncDocumentKind;
  localSnapshot?: unknown;
  businessKey?: string | null;
  sessionId?: string | null;
  workerName?: string | null;
  businessDate?: string | null;
  businessStatus?: string | null;
  firestoreMetadata?: FirestoreSnapshotSyncMetadata | null;
  pendingSync?: boolean;
  savedLocally?: boolean;
  rejectedReason?: string | null;
  remoteChanged?: boolean;
  remoteDeviceId?: string | null;
  currentDeviceId?: string | null;
  lastLocalWriteIso?: string | null;
  lastSuccessfulSyncIso?: string | null;
};

export type SyncDocumentPresentation = {
  id: string;
  kind: SyncDocumentKind;
  localSnapshot: unknown;
  businessKey: string | null;
  sessionId: string | null;
  workerName: string | null;
  businessDate: string | null;
  businessStatus: string | null;
  status: SyncDocumentStatus;
  label: string;
  tone: SyncDocumentTone;
  details: string[];
  firestoreMetadata: FirestoreSnapshotSyncMetadata | null;
  pendingSync: boolean;
  savedLocally: boolean;
  rejectedReason: string | null;
  remoteDeviceId: string | null;
  currentDeviceId: string | null;
  lastLocalWriteIso: string | null;
  lastSuccessfulSyncIso: string | null;
};

export type SyncMetadataSummary = {
  totalDocumentCount: number;
  localSavedCount: number;
  pendingSyncCount: number;
  syncedCount: number;
  rejectedCount: number;
  remoteChangedCount: number;
  actionableErrorCount: number;
  lastSuccessfulSyncIso: string | null;
  documents: SyncDocumentPresentation[];
};

export function evaluateSyncDocumentMetadata(
  input: SyncDocumentMetadataInput
): SyncDocumentPresentation {
  const id = normalizeRequiredText(input.id, "Dokument synchronizacji wymaga ID.");
  const kind = input.kind;
  const localSnapshot = input.localSnapshot ?? null;
  const firestoreMetadata = input.firestoreMetadata ?? null;
  const rejectedReason = normalizeOptionalText(input.rejectedReason);
  const savedLocally = input.savedLocally === true;
  const pendingSync =
    input.pendingSync === true || firestoreMetadata?.hasPendingWrites === true;
  const remoteChanged = input.remoteChanged === true;
  const businessKey = normalizeOptionalText(input.businessKey);
  const sessionId = normalizeOptionalText(input.sessionId);
  const workerName = normalizeOptionalText(input.workerName);
  const businessDate = normalizeOptionalText(input.businessDate);
  const businessStatus = normalizeOptionalText(input.businessStatus);
  const remoteDeviceId = normalizeOptionalText(input.remoteDeviceId);
  const currentDeviceId = normalizeOptionalText(input.currentDeviceId);
  const lastLocalWriteIso = normalizeOptionalIso(input.lastLocalWriteIso);
  const lastSuccessfulSyncIso = normalizeOptionalIso(input.lastSuccessfulSyncIso);

  if (rejectedReason) {
    return createPresentation({
      id,
      kind,
      localSnapshot,
      businessKey,
      sessionId,
      workerName,
      businessDate,
      businessStatus,
      status: "REJECTED",
      label: "Odrzucony",
      tone: "error",
      details: [
        rejectedReason,
        "Nie usuwaj lokalnych danych przed wyjasnieniem bledu synchronizacji."
      ],
      firestoreMetadata,
      pendingSync,
      savedLocally,
      rejectedReason,
      remoteDeviceId,
      currentDeviceId,
      lastLocalWriteIso,
      lastSuccessfulSyncIso
    });
  }

  if (remoteChanged) {
    return createPresentation({
      id,
      kind,
      localSnapshot,
      businessKey,
      sessionId,
      workerName,
      businessDate,
      businessStatus,
      status: "REMOTE_CHANGED",
      label: "Zmieniony na innym urzadzeniu",
      tone: "warn",
      details: [
        createRemoteChangedDetail(remoteDeviceId, currentDeviceId),
        "Przed dalsza praca wymagane jest ponowne odczytanie dokumentu."
      ],
      firestoreMetadata,
      pendingSync,
      savedLocally,
      rejectedReason,
      remoteDeviceId,
      currentDeviceId,
      lastLocalWriteIso,
      lastSuccessfulSyncIso
    });
  }

  if (pendingSync) {
    return createPresentation({
      id,
      kind,
      localSnapshot,
      businessKey,
      sessionId,
      workerName,
      businessDate,
      businessStatus,
      status: "PENDING_SYNC",
      label: "Oczekuje synchronizacji",
      tone: "warn",
      details: createPendingDetails(firestoreMetadata, lastLocalWriteIso),
      firestoreMetadata,
      pendingSync,
      savedLocally,
      rejectedReason,
      remoteDeviceId,
      currentDeviceId,
      lastLocalWriteIso,
      lastSuccessfulSyncIso
    });
  }

  if (savedLocally) {
    return createPresentation({
      id,
      kind,
      localSnapshot,
      businessKey,
      sessionId,
      workerName,
      businessDate,
      businessStatus,
      status: "LOCAL_SAVED",
      label: "Zapisany lokalnie",
      tone: "warn",
      details: [
        "Dokument zostal przyjety lokalnie, ale aplikacja nie ma jeszcze metadanych kolejki Firestore.",
        createLastLocalWriteDetail(lastLocalWriteIso)
      ],
      firestoreMetadata,
      pendingSync,
      savedLocally,
      rejectedReason,
      remoteDeviceId,
      currentDeviceId,
      lastLocalWriteIso,
      lastSuccessfulSyncIso
    });
  }

  return createPresentation({
    id,
    kind,
    localSnapshot,
    businessKey,
    sessionId,
    workerName,
    businessDate,
    businessStatus,
    status: "SYNCED",
    label: "Zsynchronizowany",
    tone: "ok",
    details: createSyncedDetails(firestoreMetadata, lastSuccessfulSyncIso),
    firestoreMetadata,
    pendingSync,
    savedLocally,
    rejectedReason,
    remoteDeviceId,
    currentDeviceId,
    lastLocalWriteIso,
    lastSuccessfulSyncIso
  });
}

export function summarizeSyncDocumentMetadata(
  inputs: readonly SyncDocumentMetadataInput[]
): SyncMetadataSummary {
  const documents = inputs.map(evaluateSyncDocumentMetadata).sort(compareDocuments);

  return {
    totalDocumentCount: documents.length,
    localSavedCount: countByStatus(documents, "LOCAL_SAVED"),
    pendingSyncCount: countByStatus(documents, "PENDING_SYNC"),
    syncedCount: countByStatus(documents, "SYNCED"),
    rejectedCount: countByStatus(documents, "REJECTED"),
    remoteChangedCount: countByStatus(documents, "REMOTE_CHANGED"),
    actionableErrorCount: documents.filter(
      (document) => document.status === "REJECTED" || document.status === "REMOTE_CHANGED"
    ).length,
    lastSuccessfulSyncIso: findLatestIso(
      documents.map((document) => document.lastSuccessfulSyncIso)
    ),
    documents
  };
}

function createPresentation(
  presentation: SyncDocumentPresentation
): SyncDocumentPresentation {
  return presentation;
}

function createPendingDetails(
  firestoreMetadata: FirestoreSnapshotSyncMetadata | null,
  lastLocalWriteIso: string | null
): string[] {
  const details = ["Dokument czeka na potwierdzenie serwera."];

  if (firestoreMetadata?.hasPendingWrites) {
    details.push("Firestore raportuje lokalny zapis oczekujacy.");
  }

  if (firestoreMetadata?.fromCache) {
    details.push("Odczyt pochodzi z lokalnego cache.");
  }

  details.push(createLastLocalWriteDetail(lastLocalWriteIso));

  return details;
}

function createSyncedDetails(
  firestoreMetadata: FirestoreSnapshotSyncMetadata | null,
  lastSuccessfulSyncIso: string | null
): string[] {
  const details = [
    lastSuccessfulSyncIso
      ? `Ostatnia udana synchronizacja: ${lastSuccessfulSyncIso}.`
      : "Brak zapisanego czasu ostatniej udanej synchronizacji."
  ];

  if (firestoreMetadata?.fromCache) {
    details.push("Pokazywana kopia pochodzi z cache, mimo braku lokalnych zapisow.");
  }

  return details;
}

function createLastLocalWriteDetail(lastLocalWriteIso: string | null): string {
  return lastLocalWriteIso
    ? `Ostatni zapis lokalny: ${lastLocalWriteIso}.`
    : "Brak zapisanego czasu ostatniego zapisu lokalnego.";
}

function createRemoteChangedDetail(
  remoteDeviceId: string | null,
  currentDeviceId: string | null
): string {
  if (remoteDeviceId && currentDeviceId && remoteDeviceId !== currentDeviceId) {
    return `Nowsza zmiana pochodzi z urzadzenia ${remoteDeviceId}.`;
  }

  return "Dokument zmienil sie poza biezacym lokalnym zapisem.";
}

function countByStatus(
  documents: readonly SyncDocumentPresentation[],
  status: SyncDocumentStatus
): number {
  return documents.filter((document) => document.status === status).length;
}

function findLatestIso(values: readonly (string | null)[]): string | null {
  const sortedValues = values.filter((value): value is string => value !== null).sort();

  return sortedValues.at(-1) ?? null;
}

function compareDocuments(
  left: SyncDocumentPresentation,
  right: SyncDocumentPresentation
): number {
  return (
    statusPriority(left.status) - statusPriority(right.status) ||
    left.kind.localeCompare(right.kind) ||
    left.id.localeCompare(right.id)
  );
}

function statusPriority(status: SyncDocumentStatus): number {
  switch (status) {
    case "REJECTED":
      return 0;
    case "REMOTE_CHANGED":
      return 1;
    case "PENDING_SYNC":
      return 2;
    case "LOCAL_SAVED":
      return 3;
    case "SYNCED":
      return 4;
  }
}

function normalizeRequiredText(value: string, message: string): string {
  const trimmed = value.trim();

  if (!trimmed) {
    throw new Error(message);
  }

  return trimmed;
}

function normalizeOptionalText(value: string | null | undefined): string | null {
  if (value === null || value === undefined) {
    return null;
  }

  const trimmed = value.trim();

  return trimmed.length > 0 ? trimmed : null;
}

function normalizeOptionalIso(value: string | null | undefined): string | null {
  const normalized = normalizeOptionalText(value);

  if (!normalized) {
    return null;
  }

  const parsed = Date.parse(normalized);

  if (Number.isNaN(parsed)) {
    throw new Error("Czas synchronizacji musi byc poprawnym ISO.");
  }

  return normalized;
}
