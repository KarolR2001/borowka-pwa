import {
  classifySynchronizationRetry,
  createSynchronizationDocumentKey,
  mergeSynchronizationSnapshotsById,
  normalizeSyncDocumentId,
  reserveOfflineSyncDocumentId,
  type SynchronizationSnapshotForDeduplication
} from "./synchronizationIdempotency";

describe("synchronization idempotency", () => {
  it("classifies network loss after local save as retry of the same document", () => {
    expect(
      classifySynchronizationRetry({
        documentId: " entry-1 ",
        kind: "HARVEST_ENTRY",
        knownSnapshots: [
          snapshot({
            id: "entry-1",
            kind: "HARVEST_ENTRY",
            pendingSync: true,
            source: "LOCAL_CACHE"
          })
        ]
      })
    ).toEqual({
      documentId: "entry-1",
      kind: "HARVEST_ENTRY",
      status: "RETRY_EXISTING_LOCAL_DOCUMENT"
    });
  });

  it("reuses an existing draft id after reopening a form and after a double submit", () => {
    const draftId = reserveOfflineSyncDocumentId({
      existingDraftId: " session-draft-1 ",
      randomUuid: () => "new-random-id"
    });

    expect(draftId).toBe("session-draft-1");
    expect(
      classifySynchronizationRetry({
        documentId: draftId,
        kind: "HARVEST_SESSION",
        knownSnapshots: [
          snapshot({
            id: draftId,
            kind: "HARVEST_SESSION",
            pendingSync: true,
            source: "LOCAL_CACHE"
          })
        ]
      })
    ).toMatchObject({
      documentId: "session-draft-1",
      status: "RETRY_EXISTING_LOCAL_DOCUMENT"
    });
  });

  it("keeps one pending document after restart and manual synchronization retry", () => {
    const mergedSnapshots = mergeSynchronizationSnapshotsById([
      snapshot({
        id: "entry-1",
        kind: "HARVEST_ENTRY",
        lastWriteIso: "2026-07-17T11:00:00.000Z",
        pendingSync: true,
        revision: 1,
        source: "LOCAL_CACHE"
      }),
      snapshot({
        id: "entry-1",
        kind: "HARVEST_ENTRY",
        lastWriteIso: "2026-07-17T11:05:00.000Z",
        pendingSync: true,
        revision: 2,
        source: "LOCAL_CACHE"
      })
    ]);

    expect(mergedSnapshots).toEqual([
      expect.objectContaining({
        id: "entry-1",
        kind: "HARVEST_ENTRY",
        lastWriteIso: "2026-07-17T11:05:00.000Z",
        revision: 2
      })
    ]);
    expect(
      classifySynchronizationRetry({
        documentId: "entry-1",
        kind: "HARVEST_ENTRY",
        knownSnapshots: mergedSnapshots
      }).status
    ).toBe("RETRY_EXISTING_LOCAL_DOCUMENT");
  });

  it("deduplicates local and server listener emissions by kind and id", () => {
    expect(
      mergeSynchronizationSnapshotsById([
        snapshot({
          id: "entry-1",
          kind: "HARVEST_ENTRY",
          pendingSync: true,
          source: "LOCAL_CACHE"
        }),
        snapshot({
          id: "entry-1",
          kind: "HARVEST_ENTRY",
          pendingSync: false,
          source: "SERVER_CONFIRMED"
        }),
        snapshot({
          id: "entry-1",
          kind: "HARVEST_SESSION",
          pendingSync: true,
          source: "LOCAL_CACHE"
        })
      ])
    ).toEqual([
      expect.objectContaining({
        id: "entry-1",
        kind: "HARVEST_ENTRY",
        pendingSync: false,
        source: "SERVER_CONFIRMED"
      }),
      expect.objectContaining({
        id: "entry-1",
        kind: "HARVEST_SESSION",
        pendingSync: true,
        source: "LOCAL_CACHE"
      })
    ]);
  });

  it("skips retry when the same UUID is already confirmed by the server", () => {
    expect(
      classifySynchronizationRetry({
        documentId: "entry-1",
        kind: "HARVEST_ENTRY",
        knownSnapshots: [
          snapshot({
            id: "entry-1",
            kind: "HARVEST_ENTRY",
            pendingSync: false,
            source: "SERVER_CONFIRMED"
          })
        ]
      })
    ).toEqual({
      documentId: "entry-1",
      kind: "HARVEST_ENTRY",
      status: "SKIP_ALREADY_CONFIRMED"
    });
  });

  it("normalizes document ids and keys explicitly", () => {
    expect(normalizeSyncDocumentId(" audit-1 ")).toBe("audit-1");
    expect(
      createSynchronizationDocumentKey({
        id: " audit-1 ",
        kind: "AUDIT_EVENT"
      })
    ).toBe("AUDIT_EVENT:audit-1");
    expect(() => normalizeSyncDocumentId("   ")).toThrow(
      "Dokument synchronizacji wymaga UUID."
    );
  });
});

function snapshot(
  overrides: Partial<SynchronizationSnapshotForDeduplication> & {
    id: string;
    kind: SynchronizationSnapshotForDeduplication["kind"];
  }
): SynchronizationSnapshotForDeduplication {
  const { id, kind, ...rest } = overrides;

  return {
    id,
    kind,
    lastWriteIso: null,
    pendingSync: false,
    revision: null,
    source: "SERVER_CONFIRMED",
    ...rest
  };
}
