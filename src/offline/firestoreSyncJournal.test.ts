import {
  createMemoryFirestoreSyncJournal,
  createSyncJournalRecord,
  toSyncDocumentMetadata
} from "./firestoreSyncJournal";

const account = {
  deviceId: "device-1",
  userUid: "operator-1"
};

describe("Firestore sync journal", () => {
  it("keeps only the newest write for the same business document", async () => {
    const journal = createMemoryFirestoreSyncJournal();
    const open = await journal.put({
      ...account,
      id: "session-1",
      kind: "HARVEST_SESSION",
      localSnapshot: { status: "OPEN" },
      businessStatus: "OPEN",
      writeId: "write-open"
    });
    const closed = await journal.put({
      ...account,
      id: "session-1",
      kind: "HARVEST_SESSION",
      localSnapshot: { status: "CLOSED" },
      businessStatus: "CLOSED",
      writeId: "write-close"
    });

    await journal.removeIfCurrent(account, open.kind, open.id, open.writeId);

    expect(await journal.list(account)).toEqual([closed]);
  });

  it("retains a rejected snapshot for emergency export", async () => {
    const record = createSyncJournalRecord({
      ...account,
      id: "entry-1",
      kind: "HARVEST_ENTRY",
      localSnapshot: { quantityMilli: 1000 },
      sessionId: "session-1",
      lastLocalWriteIso: "2026-07-28T08:00:00.000Z",
      writeId: "write-entry"
    });
    const journal = createMemoryFirestoreSyncJournal([record]);

    await journal.markRejected(
      account,
      record.kind,
      record.id,
      record.writeId,
      "Rules odrzucily dokument."
    );

    const [rejected] = await journal.list(account);

    expect(toSyncDocumentMetadata(rejected)).toMatchObject({
      id: "entry-1",
      pendingSync: false,
      savedLocally: true,
      rejectedReason: "Rules odrzucily dokument."
    });
  });

  it("isolates records by account and device", async () => {
    const journal = createMemoryFirestoreSyncJournal();

    await journal.put({
      ...account,
      id: "entry-1",
      kind: "HARVEST_ENTRY",
      localSnapshot: {},
      writeId: "write-1"
    });
    await journal.put({
      deviceId: "device-2",
      userUid: "operator-2",
      id: "entry-2",
      kind: "HARVEST_ENTRY",
      localSnapshot: {},
      writeId: "write-2"
    });

    await journal.clear(account);

    expect(await journal.list(account)).toEqual([]);
    expect(
      await journal.list({ deviceId: "device-2", userUid: "operator-2" })
    ).toHaveLength(1);
  });
});
