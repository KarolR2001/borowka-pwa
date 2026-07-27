import type { UserProfile } from "../domain/identity";
import {
  classifyHarvestEntrySaveIntent,
  reserveHarvestEntryIdentity,
  type HarvestEntryIdentity
} from "../harvest/harvestEntryIdempotency";
import {
  nextHarvestEntrySequenceNumber,
  prepareHarvestEntryDocument,
  withCurrentSessionTotals
} from "../harvest/harvestEntryRuntime";
import type { HarvestEntryNextSessionTotals } from "../harvest/harvestEntryValidation";
import type { HarvestEntryDocument } from "../harvest/harvestSessionDashboard";
import type { HarvestSessionDocument } from "../harvest/openHarvestSession";

export type OfflineHarvestEntrySyncState = "LOCAL_PENDING_SYNC";

export type PrepareOfflineHarvestEntryInput = {
  actorProfile: UserProfile;
  session: HarvestSessionDocument;
  entries: HarvestEntryDocument[];
  quantityMilli: number;
  weightG: number | null;
  createdDeviceId: string;
  createdAtDevice: unknown;
  identity?: HarvestEntryIdentity | null;
  randomUuid?: () => string;
};

export type PreparedOfflineHarvestEntry = {
  status: "CREATED_OFFLINE";
  entry: HarvestEntryDocument;
  entries: HarvestEntryDocument[];
  sessionWithLocalTotals: HarvestSessionDocument;
  selectedSessionId: string;
  identity: HarvestEntryIdentity;
  syncState: OfflineHarvestEntrySyncState;
  nextSessionTotals: HarvestEntryNextSessionTotals;
  pendingEntryCount: number;
  pendingWriteCount: number;
  readyForNextEntry: true;
  message: string;
};

export type RetriedOfflineHarvestEntry = {
  status: "RETRY_EXISTING";
  entry: HarvestEntryDocument;
  entries: HarvestEntryDocument[];
  sessionWithLocalTotals: HarvestSessionDocument;
  selectedSessionId: string;
  identity: HarvestEntryIdentity;
  syncState: OfflineHarvestEntrySyncState | "ALREADY_SYNCED";
  pendingEntryCount: number;
  pendingWriteCount: number;
  readyForNextEntry: true;
  message: string;
};

export type PrepareOfflineHarvestEntryResult =
  PreparedOfflineHarvestEntry | RetriedOfflineHarvestEntry;

export function prepareOfflineHarvestEntry(
  input: PrepareOfflineHarvestEntryInput
): PrepareOfflineHarvestEntryResult {
  const createdDeviceId = normalizeRequiredText(
    input.createdDeviceId,
    "Wpis offline wymaga urzadzenia tworzacego."
  );

  assertKnownDeviceTime(input.createdAtDevice);

  const identity =
    input.identity ??
    reserveHarvestEntryIdentity({
      nextSequenceNumber: nextHarvestEntrySequenceNumber(input.entries),
      randomUuid: input.randomUuid
    });
  const saveIntent = classifyHarvestEntrySaveIntent({
    entryId: identity.id,
    knownEntryIds: input.entries.map((entry) => entry.id)
  });

  if (saveIntent.status === "RETRY_EXISTING_DOCUMENT") {
    const entry = findEntryById(input.entries, saveIntent.entryId);
    const sortedEntries = sortEntriesBySequence(input.entries);
    const sessionWithLocalTotals = withCurrentSessionTotals(input.session, sortedEntries);
    const pendingEntryCount = countPendingEntries(sortedEntries);
    const pendingWriteCount = countPendingHarvestWrites({
      session: input.session,
      entries: sortedEntries
    });

    return {
      status: "RETRY_EXISTING",
      entry,
      entries: sortedEntries,
      sessionWithLocalTotals,
      selectedSessionId: input.session.id,
      identity: {
        id: saveIntent.entryId,
        sequenceNumber: entry.sequenceNumber
      },
      syncState: entry.pendingSync ? "LOCAL_PENDING_SYNC" : "ALREADY_SYNCED",
      pendingEntryCount,
      pendingWriteCount,
      readyForNextEntry: true,
      message: `Wpis #${String(entry.sequenceNumber)} juz istnieje.`
    };
  }

  const prepared = prepareHarvestEntryDocument({
    actorProfile: input.actorProfile,
    session: input.session,
    entries: input.entries,
    quantityMilli: input.quantityMilli,
    weightG: input.weightG,
    isOnline: false,
    createdDeviceId,
    createdAtDevice: input.createdAtDevice,
    createdAtServer: null,
    identity
  });
  const entry: HarvestEntryDocument = {
    ...prepared.entry,
    pendingSync: true,
    createdAtServer: null
  };
  const entries = sortEntriesBySequence([...input.entries, entry]);
  const sessionWithLocalTotals = applyNextSessionTotals(
    input.session,
    prepared.validated.nextSessionTotals
  );
  const pendingEntryCount = countPendingEntries(entries);
  const pendingWriteCount = countPendingHarvestWrites({
    session: input.session,
    entries
  });

  return {
    status: "CREATED_OFFLINE",
    entry,
    entries,
    sessionWithLocalTotals,
    selectedSessionId: input.session.id,
    identity,
    syncState: "LOCAL_PENDING_SYNC",
    nextSessionTotals: prepared.validated.nextSessionTotals,
    pendingEntryCount,
    pendingWriteCount,
    readyForNextEntry: true,
    message: `Zapisano lokalnie wpis #${String(entry.sequenceNumber)}.`
  };
}

export function countPendingHarvestWrites({
  session,
  entries
}: {
  session: HarvestSessionDocument;
  entries: readonly HarvestEntryDocument[];
}): number {
  const pendingSessionWriteCount = session.createdAtServer === null ? 1 : 0;

  return pendingSessionWriteCount + countPendingEntries(entries);
}

function applyNextSessionTotals(
  session: HarvestSessionDocument,
  nextTotals: HarvestEntryNextSessionTotals
): HarvestSessionDocument {
  return {
    ...session,
    totalEntryCount: nextTotals.totalEntryCount,
    totalQuantityMilli: nextTotals.totalQuantityMilli,
    totalWeightG: nextTotals.totalWeightG
  };
}

function sortEntriesBySequence(
  entries: readonly HarvestEntryDocument[]
): HarvestEntryDocument[] {
  return [...entries].sort((left, right) => left.sequenceNumber - right.sequenceNumber);
}

function countPendingEntries(entries: readonly HarvestEntryDocument[]): number {
  return entries.filter((entry) => entry.pendingSync).length;
}

function findEntryById(
  entries: readonly HarvestEntryDocument[],
  entryId: string
): HarvestEntryDocument {
  const entry = entries.find((candidate) => candidate.id === entryId);

  if (!entry) {
    throw new Error("Nie znaleziono istniejacego wpisu offline.");
  }

  return entry;
}

function assertKnownDeviceTime(value: unknown): void {
  if (value === null || value === undefined) {
    throw new Error("Wpis offline wymaga czasu utworzenia na urzadzeniu.");
  }
}

function normalizeRequiredText(value: string, message: string): string {
  const trimmed = value.trim();

  if (!trimmed) {
    throw new Error(message);
  }

  return trimmed;
}
