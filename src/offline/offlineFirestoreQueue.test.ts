import type { WriteBatch } from "firebase/firestore";

import { createMemoryFirestoreSyncJournal } from "./firestoreSyncJournal";
import { queueOfflineFirestoreBatch } from "./offlineFirestoreQueue";

const account = {
  deviceId: "device-1",
  userUid: "operator-1"
};

describe("offline Firestore queue", () => {
  it("returns after local visibility without waiting for server acknowledgement", async () => {
    const journal = createMemoryFirestoreSyncJournal();
    let resolveCommit: (() => void) | undefined;
    const commit = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveCommit = resolve;
        })
    );

    const records = await queueOfflineFirestoreBatch({
      batch: { commit } as unknown as WriteBatch,
      journal,
      records: [
        {
          ...account,
          id: "session-1",
          kind: "HARVEST_SESSION",
          localSnapshot: { status: "OPEN" },
          writeId: "write-1"
        }
      ],
      verifyLocalWrite: () => Promise.resolve(true)
    });

    expect(records).toHaveLength(1);
    expect(await journal.list(account)).toHaveLength(1);

    resolveCommit?.();
    await vi.waitFor(async () => {
      expect(await journal.list(account)).toEqual([]);
    });
  });

  it("retains rejected data with the Firestore error", async () => {
    const journal = createMemoryFirestoreSyncJournal();
    const commit = vi.fn(() => Promise.reject(new Error("permission-denied")));

    await queueOfflineFirestoreBatch({
      batch: { commit } as unknown as WriteBatch,
      journal,
      records: [
        {
          ...account,
          id: "entry-1",
          kind: "HARVEST_ENTRY",
          localSnapshot: { quantityMilli: 1000 },
          writeId: "write-1"
        }
      ],
      verifyLocalWrite: () => Promise.resolve(true)
    });

    await vi.waitFor(async () => {
      expect((await journal.list(account))[0]?.rejectedReason).toContain(
        "permission-denied"
      );
    });
  });
});
