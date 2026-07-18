export type HarvestEntryIdentity = {
  id: string;
  sequenceNumber: number;
};

export type HarvestEntrySaveIntent =
  | {
      status: "NEW_DOCUMENT";
      entryId: string;
    }
  | {
      status: "RETRY_EXISTING_DOCUMENT";
      entryId: string;
    };

export type HarvestEntrySnapshotForMerge = {
  id: string;
  sequenceNumber: number;
  pendingSync: boolean;
};

export function createHarvestEntryId(
  randomUuid: () => string = defaultRandomUuid
): string {
  return normalizeHarvestEntryId(randomUuid());
}

export function reserveHarvestEntryIdentity({
  nextSequenceNumber,
  randomUuid = defaultRandomUuid
}: {
  nextSequenceNumber: number;
  randomUuid?: () => string;
}): HarvestEntryIdentity {
  return {
    id: createHarvestEntryId(randomUuid),
    sequenceNumber: normalizeSequenceNumber(nextSequenceNumber)
  };
}

export function classifyHarvestEntrySaveIntent({
  entryId,
  knownEntryIds
}: {
  entryId: string;
  knownEntryIds: readonly string[];
}): HarvestEntrySaveIntent {
  const normalizedEntryId = normalizeHarvestEntryId(entryId);
  const knownIds = new Set(knownEntryIds.map(normalizeHarvestEntryId));

  return {
    status: knownIds.has(normalizedEntryId) ? "RETRY_EXISTING_DOCUMENT" : "NEW_DOCUMENT",
    entryId: normalizedEntryId
  };
}

export function mergeHarvestEntrySnapshotsById<T extends HarvestEntrySnapshotForMerge>(
  entries: readonly T[]
): T[] {
  const byId = new Map<string, T>();

  for (const entry of entries) {
    const id = normalizeHarvestEntryId(entry.id);
    normalizeSequenceNumber(entry.sequenceNumber);
    const existing = byId.get(id);

    if (!existing) {
      byId.set(id, entry);
      continue;
    }

    byId.set(id, choosePreferredSnapshot(existing, entry));
  }

  return Array.from(byId.values());
}

export function normalizeHarvestEntryId(id: string): string {
  const normalized = id.trim();

  if (!normalized) {
    throw new Error("Wpis wymaga identyfikatora UUID.");
  }

  return normalized;
}

export function normalizeSequenceNumber(sequenceNumber: number): number {
  if (!Number.isSafeInteger(sequenceNumber) || sequenceNumber <= 0) {
    throw new Error("Numer porzadkowy wpisu musi byc dodatnia liczba calkowita.");
  }

  return sequenceNumber;
}

function choosePreferredSnapshot<T extends HarvestEntrySnapshotForMerge>(
  existing: T,
  candidate: T
): T {
  if (existing.pendingSync && !candidate.pendingSync) {
    return candidate;
  }

  return existing;
}

function defaultRandomUuid(): string {
  const cryptoApi = globalThis.crypto as { randomUUID?: () => string } | undefined;

  if (typeof cryptoApi?.randomUUID !== "function") {
    throw new Error("Brak generatora UUID wpisu.");
  }

  return cryptoApi.randomUUID();
}
