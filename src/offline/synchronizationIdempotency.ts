import type { SyncDocumentKind } from "./pendingWriteMetadata";

export const SYNCHRONIZATION_SNAPSHOT_SOURCES = [
  "LOCAL_CACHE",
  "SERVER_CONFIRMED"
] as const;

export type SynchronizationSnapshotSource =
  (typeof SYNCHRONIZATION_SNAPSHOT_SOURCES)[number];

export type SynchronizationSnapshotForDeduplication = {
  id: string;
  kind: SyncDocumentKind;
  lastWriteIso?: string | null;
  pendingSync: boolean;
  revision?: number | null;
  source: SynchronizationSnapshotSource;
};

export type SynchronizationRetryIntent =
  | {
      documentId: string;
      kind: SyncDocumentKind;
      status: "NEW_DOCUMENT";
    }
  | {
      documentId: string;
      kind: SyncDocumentKind;
      status: "RETRY_EXISTING_LOCAL_DOCUMENT";
    }
  | {
      documentId: string;
      kind: SyncDocumentKind;
      status: "SKIP_ALREADY_CONFIRMED";
    };

export function reserveOfflineSyncDocumentId({
  existingDraftId,
  randomUuid = defaultRandomUuid
}: {
  existingDraftId?: string | null;
  randomUuid?: () => string;
}): string {
  return normalizeSyncDocumentId(existingDraftId ?? randomUuid());
}

export function classifySynchronizationRetry({
  documentId,
  kind,
  knownSnapshots
}: {
  documentId: string;
  kind: SyncDocumentKind;
  knownSnapshots: readonly SynchronizationSnapshotForDeduplication[];
}): SynchronizationRetryIntent {
  const normalizedDocumentId = normalizeSyncDocumentId(documentId);
  const matchingSnapshot = mergeSynchronizationSnapshotsById(knownSnapshots).find(
    (snapshot) => snapshot.kind === kind && snapshot.id === normalizedDocumentId
  );

  if (!matchingSnapshot) {
    return {
      documentId: normalizedDocumentId,
      kind,
      status: "NEW_DOCUMENT"
    };
  }

  if (matchingSnapshot.pendingSync || matchingSnapshot.source === "LOCAL_CACHE") {
    return {
      documentId: normalizedDocumentId,
      kind,
      status: "RETRY_EXISTING_LOCAL_DOCUMENT"
    };
  }

  return {
    documentId: normalizedDocumentId,
    kind,
    status: "SKIP_ALREADY_CONFIRMED"
  };
}

export function mergeSynchronizationSnapshotsById<
  T extends SynchronizationSnapshotForDeduplication
>(snapshots: readonly T[]): T[] {
  const byKey = new Map<string, T>();

  for (const snapshot of snapshots) {
    const normalizedSnapshot = normalizeSynchronizationSnapshot(snapshot);
    const key = createSynchronizationDocumentKey(normalizedSnapshot);
    const existing = byKey.get(key);

    if (!existing) {
      byKey.set(key, normalizedSnapshot);
      continue;
    }

    byKey.set(key, choosePreferredSynchronizationSnapshot(existing, normalizedSnapshot));
  }

  return Array.from(byKey.values()).sort(compareSynchronizationSnapshots);
}

export function createSynchronizationDocumentKey({
  id,
  kind
}: Pick<SynchronizationSnapshotForDeduplication, "id" | "kind">): string {
  return `${kind}:${normalizeSyncDocumentId(id)}`;
}

export function normalizeSyncDocumentId(id: string): string {
  const normalized = id.trim();

  if (!normalized) {
    throw new Error("Dokument synchronizacji wymaga UUID.");
  }

  return normalized;
}

function normalizeSynchronizationSnapshot<
  T extends SynchronizationSnapshotForDeduplication
>(snapshot: T): T {
  normalizeSyncDocumentId(snapshot.id);

  if (snapshot.revision !== undefined && snapshot.revision !== null) {
    normalizeRevision(snapshot.revision);
  }

  if (snapshot.lastWriteIso !== undefined && snapshot.lastWriteIso !== null) {
    normalizeIso(snapshot.lastWriteIso);
  }

  return {
    ...snapshot,
    id: normalizeSyncDocumentId(snapshot.id),
    lastWriteIso: snapshot.lastWriteIso ?? null,
    revision: snapshot.revision ?? null
  };
}

function choosePreferredSynchronizationSnapshot<
  T extends SynchronizationSnapshotForDeduplication
>(existing: T, candidate: T): T {
  if (existing.pendingSync && !candidate.pendingSync) {
    return candidate;
  }

  if (existing.source === "LOCAL_CACHE" && candidate.source === "SERVER_CONFIRMED") {
    return candidate;
  }

  if (candidate.pendingSync && !existing.pendingSync) {
    return existing;
  }

  if (candidate.source === "LOCAL_CACHE" && existing.source === "SERVER_CONFIRMED") {
    return existing;
  }

  const revisionComparison = (candidate.revision ?? 0) - (existing.revision ?? 0);

  if (revisionComparison > 0) {
    return candidate;
  }

  if (revisionComparison < 0) {
    return existing;
  }

  return (candidate.lastWriteIso ?? "").localeCompare(existing.lastWriteIso ?? "") > 0
    ? candidate
    : existing;
}

function compareSynchronizationSnapshots(
  left: SynchronizationSnapshotForDeduplication,
  right: SynchronizationSnapshotForDeduplication
): number {
  return left.kind.localeCompare(right.kind) || left.id.localeCompare(right.id);
}

function normalizeRevision(revision: number): number {
  if (!Number.isSafeInteger(revision) || revision < 0) {
    throw new Error("Rewizja dokumentu synchronizacji musi byc nieujemna.");
  }

  return revision;
}

function normalizeIso(value: string): string {
  if (Number.isNaN(Date.parse(value))) {
    throw new Error("Czas dokumentu synchronizacji musi byc poprawnym ISO.");
  }

  return value;
}

function defaultRandomUuid(): string {
  const cryptoApi = globalThis.crypto as { randomUUID?: () => string } | undefined;

  if (typeof cryptoApi?.randomUUID !== "function") {
    throw new Error("Brak generatora UUID dokumentu synchronizacji.");
  }

  return cryptoApi.randomUUID();
}
