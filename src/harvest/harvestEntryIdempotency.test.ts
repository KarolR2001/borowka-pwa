import {
  classifyHarvestEntrySaveIntent,
  createHarvestEntryId,
  mergeHarvestEntrySnapshotsById,
  normalizeHarvestEntryId,
  normalizeSequenceNumber,
  reserveHarvestEntryIdentity
} from "./harvestEntryIdempotency";

describe("harvest entry idempotency", () => {
  it("creates a stable UUID before save using an injectable generator", () => {
    expect(createHarvestEntryId(() => " entry-uuid ")).toBe("entry-uuid");
    expect(() => createHarvestEntryId(() => "   ")).toThrow(
      "Wpis wymaga identyfikatora UUID."
    );
  });

  it("reserves entry identity with UUID separate from sequence number", () => {
    expect(
      reserveHarvestEntryIdentity({
        nextSequenceNumber: 7,
        randomUuid: () => "entry-7"
      })
    ).toEqual({
      id: "entry-7",
      sequenceNumber: 7
    });
    expect(() =>
      reserveHarvestEntryIdentity({
        nextSequenceNumber: 0,
        randomUuid: () => "entry-0"
      })
    ).toThrow("Numer porzadkowy wpisu musi byc dodatnia liczba calkowita.");
  });

  it("classifies retries of the same document id without creating another intent", () => {
    expect(
      classifyHarvestEntrySaveIntent({
        entryId: "entry-2",
        knownEntryIds: ["entry-1"]
      })
    ).toEqual({
      status: "NEW_DOCUMENT",
      entryId: "entry-2"
    });
    expect(
      classifyHarvestEntrySaveIntent({
        entryId: " entry-1 ",
        knownEntryIds: ["entry-1", "entry-2"]
      })
    ).toEqual({
      status: "RETRY_EXISTING_DOCUMENT",
      entryId: "entry-1"
    });
  });

  it("deduplicates listener snapshots by id and prefers server-confirmed data", () => {
    const entries = mergeHarvestEntrySnapshotsById([
      {
        id: "entry-1",
        sequenceNumber: 1,
        pendingSync: true,
        source: "local"
      },
      {
        id: "entry-1",
        sequenceNumber: 1,
        pendingSync: false,
        source: "server"
      },
      {
        id: "entry-2",
        sequenceNumber: 2,
        pendingSync: true,
        source: "local"
      }
    ]);

    expect(entries).toEqual([
      {
        id: "entry-1",
        sequenceNumber: 1,
        pendingSync: false,
        source: "server"
      },
      {
        id: "entry-2",
        sequenceNumber: 2,
        pendingSync: true,
        source: "local"
      }
    ]);
  });

  it("validates id and sequence helpers explicitly", () => {
    expect(normalizeHarvestEntryId(" entry-1 ")).toBe("entry-1");
    expect(normalizeSequenceNumber(1)).toBe(1);
    expect(() => normalizeSequenceNumber(Number.MAX_SAFE_INTEGER + 1)).toThrow(
      "Numer porzadkowy wpisu musi byc dodatnia liczba calkowita."
    );
  });
});
