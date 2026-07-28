import type { WriteBatch } from "firebase/firestore";

import {
  defaultFirestoreSyncJournal,
  type FirestoreSyncJournal,
  type PutSyncJournalRecordInput,
  type SyncJournalRecord
} from "./firestoreSyncJournal";

export async function queueOfflineFirestoreBatch({
  batch,
  journal = defaultFirestoreSyncJournal,
  records,
  verifyLocalWrite
}: {
  batch: WriteBatch;
  journal?: FirestoreSyncJournal;
  records: readonly PutSyncJournalRecordInput[];
  verifyLocalWrite: () => Promise<boolean>;
}): Promise<SyncJournalRecord[]> {
  const writtenRecords: SyncJournalRecord[] = [];

  try {
    for (const record of records) {
      writtenRecords.push(await journal.put(record));
    }
  } catch {
    throw new Error(
      "Nie udalo sie zapisac dziennika odzyskiwania. Operacja offline zostala przerwana."
    );
  }

  const commitPromise = batch.commit();

  void commitPromise
    .then(async () => {
      await Promise.all(
        writtenRecords.map((record) =>
          journal.removeIfCurrent(record, record.kind, record.id, record.writeId)
        )
      );
    })
    .catch(async (error: unknown) => {
      const reason = getOfflineCommitErrorMessage(error);

      await Promise.all(
        writtenRecords.map((record) =>
          journal.markRejected(record, record.kind, record.id, record.writeId, reason)
        )
      );
    });

  if (!(await waitForLocalWrite(verifyLocalWrite))) {
    const reason =
      "Firestore nie potwierdzil lokalnego przyjecia operacji. Dane pozostaja w dzienniku odzyskiwania.";

    await Promise.all(
      writtenRecords.map((record) =>
        journal.markRejected(record, record.kind, record.id, record.writeId, reason)
      )
    );
    throw new Error(reason);
  }

  return writtenRecords;
}

async function waitForLocalWrite(
  verifyLocalWrite: () => Promise<boolean>,
  attempts = 20
): Promise<boolean> {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      if (await verifyLocalWrite()) {
        return true;
      }
    } catch {
      // The cache can briefly lag behind the local mutation queue.
    }

    await delay(25);
  }

  return false;
}

function getOfflineCommitErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) {
    return `Synchronizacja zostala odrzucona: ${error.message.trim()}`;
  }

  return "Synchronizacja zostala odrzucona przez Firestore.";
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => {
    globalThis.setTimeout(resolve, milliseconds);
  });
}
