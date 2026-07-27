import {
  summarizeSyncDocumentMetadata,
  type SyncDocumentMetadataInput,
  type SyncDocumentPresentation,
  type SyncMetadataSummary
} from "./pendingWriteMetadata";

export type SyncCenterSessionSummary = {
  sessionId: string;
  workerName: string;
  businessDate: string;
  businessStatus: string;
  localEntryCount: number;
  confirmedEntryCount: number;
  pendingDocumentCount: number;
  rejectedDocumentCount: number;
  remoteChangedDocumentCount: number;
  lastError: string | null;
  actionLabel: string;
  documents: SyncDocumentPresentation[];
};

export type SyncCenterModel = {
  metadataSummary: SyncMetadataSummary;
  pendingSessionCount: number;
  sessions: SyncCenterSessionSummary[];
};

export function buildSyncCenterModel(
  inputs: readonly SyncDocumentMetadataInput[]
): SyncCenterModel {
  const metadataSummary = summarizeSyncDocumentMetadata(inputs);
  const sessions = buildSyncCenterSessionSummaries(metadataSummary.documents);

  return {
    metadataSummary,
    pendingSessionCount: sessions.length,
    sessions
  };
}

export function buildSyncCenterSessionSummaries(
  documents: readonly SyncDocumentPresentation[]
): SyncCenterSessionSummary[] {
  const groupedDocuments = new Map<string, SyncDocumentPresentation[]>();

  for (const document of documents) {
    const sessionId = resolveSessionId(document);

    if (!sessionId) {
      continue;
    }

    const group = groupedDocuments.get(sessionId) ?? [];
    group.push(document);
    groupedDocuments.set(sessionId, group);
  }

  return Array.from(groupedDocuments.entries())
    .map(([sessionId, sessionDocuments]) =>
      createSyncCenterSessionSummary(sessionId, sessionDocuments)
    )
    .filter((session) => session.pendingDocumentCount > 0)
    .sort(compareSessionSummaries);
}

function createSyncCenterSessionSummary(
  sessionId: string,
  documents: readonly SyncDocumentPresentation[]
): SyncCenterSessionSummary {
  const sessionDocument =
    documents.find((document) => document.kind === "HARVEST_SESSION") ?? null;
  const firstDocument = sessionDocument ?? documents[0];
  const localEntryCount = documents.filter(
    (document) =>
      document.kind === "HARVEST_ENTRY" &&
      (document.status === "LOCAL_SAVED" || document.status === "PENDING_SYNC")
  ).length;
  const confirmedEntryCount = documents.filter(
    (document) => document.kind === "HARVEST_ENTRY" && document.status === "SYNCED"
  ).length;
  const rejectedDocumentCount = documents.filter(
    (document) => document.status === "REJECTED"
  ).length;
  const remoteChangedDocumentCount = documents.filter(
    (document) => document.status === "REMOTE_CHANGED"
  ).length;
  const pendingDocumentCount = documents.filter(
    (document) => document.status !== "SYNCED"
  ).length;

  return {
    sessionId,
    workerName: firstDocument.workerName ?? "Nieznana osoba",
    businessDate: firstDocument.businessDate ?? "brak daty",
    businessStatus: firstDocument.businessStatus ?? "brak statusu",
    localEntryCount,
    confirmedEntryCount,
    pendingDocumentCount,
    rejectedDocumentCount,
    remoteChangedDocumentCount,
    lastError: findLastError(documents),
    actionLabel: resolveSessionActionLabel({
      pendingDocumentCount,
      rejectedDocumentCount,
      remoteChangedDocumentCount
    }),
    documents: [...documents].sort(compareDocuments)
  };
}

function resolveSessionActionLabel({
  pendingDocumentCount,
  rejectedDocumentCount,
  remoteChangedDocumentCount
}: {
  pendingDocumentCount: number;
  rejectedDocumentCount: number;
  remoteChangedDocumentCount: number;
}): string {
  if (rejectedDocumentCount > 0 || remoteChangedDocumentCount > 0) {
    return "Przejrzyj konflikt";
  }

  if (pendingDocumentCount > 0) {
    return "Synchronizuj teraz";
  }

  return "Brak akcji";
}

function findLastError(documents: readonly SyncDocumentPresentation[]): string | null {
  const rejectedDocument = documents.find(
    (document) => document.status === "REJECTED" && document.rejectedReason
  );

  if (rejectedDocument?.rejectedReason) {
    return rejectedDocument.rejectedReason;
  }

  const remoteChangedDocument = documents.find(
    (document) => document.status === "REMOTE_CHANGED"
  );

  if (remoteChangedDocument) {
    return remoteChangedDocument.details[0] ?? null;
  }

  return null;
}

function resolveSessionId(document: SyncDocumentPresentation): string | null {
  if (document.sessionId) {
    return document.sessionId;
  }

  return document.kind === "HARVEST_SESSION" ? document.id : null;
}

function compareSessionSummaries(
  left: SyncCenterSessionSummary,
  right: SyncCenterSessionSummary
): number {
  return (
    right.businessDate.localeCompare(left.businessDate) ||
    left.workerName.localeCompare(right.workerName) ||
    left.sessionId.localeCompare(right.sessionId)
  );
}

function compareDocuments(
  left: SyncDocumentPresentation,
  right: SyncDocumentPresentation
): number {
  return left.kind.localeCompare(right.kind) || left.id.localeCompare(right.id);
}

export function createEmergencySyncExportPayload({
  createdAtIso,
  deviceId,
  model
}: {
  createdAtIso: string;
  deviceId: string;
  model: SyncCenterModel;
}) {
  return {
    createdAtIso,
    deviceId,
    summary: model.metadataSummary,
    sessions: model.sessions
  };
}

export type EmergencySyncExportPayload = ReturnType<
  typeof createEmergencySyncExportPayload
>;
