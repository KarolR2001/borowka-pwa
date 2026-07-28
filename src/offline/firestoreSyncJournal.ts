import type { SyncDocumentKind, SyncDocumentMetadataInput } from "./pendingWriteMetadata";

const DATABASE_NAME = "borowka-pwa-sync-journal";
const DATABASE_VERSION = 1;
const STORE_NAME = "pendingDocuments";

export type SyncJournalAccount = {
  deviceId: string;
  userUid: string;
};

export type SyncJournalRecord = SyncJournalAccount & {
  id: string;
  key: string;
  kind: SyncDocumentKind;
  localSnapshot: unknown;
  businessKey: string | null;
  sessionId: string | null;
  workerName: string | null;
  businessDate: string | null;
  businessStatus: string | null;
  lastLocalWriteIso: string;
  rejectedReason: string | null;
  writeId: string;
};

export type PutSyncJournalRecordInput = SyncJournalAccount & {
  id: string;
  kind: SyncDocumentKind;
  localSnapshot: unknown;
  businessKey?: string | null;
  sessionId?: string | null;
  workerName?: string | null;
  businessDate?: string | null;
  businessStatus?: string | null;
  lastLocalWriteIso?: string;
  writeId?: string;
};

export type FirestoreSyncJournal = {
  clear: (account: SyncJournalAccount) => Promise<void>;
  list: (account: SyncJournalAccount) => Promise<SyncJournalRecord[]>;
  markRejected: (
    account: SyncJournalAccount,
    kind: SyncDocumentKind,
    id: string,
    writeId: string,
    reason: string
  ) => Promise<void>;
  put: (input: PutSyncJournalRecordInput) => Promise<SyncJournalRecord>;
  removeIfCurrent: (
    account: SyncJournalAccount,
    kind: SyncDocumentKind,
    id: string,
    writeId: string
  ) => Promise<void>;
};

export function createSyncJournalRecord(
  input: PutSyncJournalRecordInput
): SyncJournalRecord {
  const account = normalizeAccount(input);
  const id = normalizeRequiredText(input.id, "Dziennik synchronizacji wymaga ID.");
  const kind = input.kind;
  const lastLocalWriteIso = normalizeIso(
    input.lastLocalWriteIso ?? new Date().toISOString()
  );
  const writeId = normalizeRequiredText(
    input.writeId ?? createRandomUuid(),
    "Dziennik synchronizacji wymaga identyfikatora zapisu."
  );

  return {
    ...account,
    id,
    key: createJournalKey(account, kind, id),
    kind,
    localSnapshot: input.localSnapshot,
    businessKey: normalizeOptionalText(input.businessKey),
    sessionId: normalizeOptionalText(input.sessionId),
    workerName: normalizeOptionalText(input.workerName),
    businessDate: normalizeOptionalText(input.businessDate),
    businessStatus: normalizeOptionalText(input.businessStatus),
    lastLocalWriteIso,
    rejectedReason: null,
    writeId
  };
}

export function toSyncDocumentMetadata(
  record: SyncJournalRecord
): SyncDocumentMetadataInput {
  return {
    id: record.id,
    kind: record.kind,
    localSnapshot: record.localSnapshot,
    businessKey: record.businessKey,
    sessionId: record.sessionId,
    workerName: record.workerName,
    businessDate: record.businessDate,
    businessStatus: record.businessStatus,
    pendingSync: record.rejectedReason === null,
    savedLocally: true,
    rejectedReason: record.rejectedReason,
    currentDeviceId: record.deviceId,
    lastLocalWriteIso: record.lastLocalWriteIso
  };
}

export function createMemoryFirestoreSyncJournal(
  initialRecords: readonly SyncJournalRecord[] = []
): FirestoreSyncJournal {
  const records = new Map(initialRecords.map((record) => [record.key, record]));

  return {
    clear: (account) => {
      for (const [key, record] of records) {
        if (matchesAccount(record, account)) {
          records.delete(key);
        }
      }

      return Promise.resolve();
    },
    list: (account) =>
      Promise.resolve(
        Array.from(records.values()).filter((record) => matchesAccount(record, account))
      ),
    markRejected: (account, kind, id, writeId, reason) => {
      const key = createJournalKey(account, kind, id);
      const record = records.get(key);

      if (record?.writeId === writeId) {
        records.set(key, {
          ...record,
          rejectedReason: normalizeRequiredText(reason, "Odrzucony zapis wymaga powodu.")
        });
      }

      return Promise.resolve();
    },
    put: (input) => {
      const record = createSyncJournalRecord(input);
      records.set(record.key, record);
      return Promise.resolve(record);
    },
    removeIfCurrent: (account, kind, id, writeId) => {
      const key = createJournalKey(account, kind, id);

      if (records.get(key)?.writeId === writeId) {
        records.delete(key);
      }

      return Promise.resolve();
    }
  };
}

class IndexedDbFirestoreSyncJournal implements FirestoreSyncJournal {
  constructor(
    private readonly indexedDb: IDBFactory | undefined = globalThis.indexedDB
  ) {}

  async clear(account: SyncJournalAccount): Promise<void> {
    const records = await this.list(account);
    const database = await this.openDatabase();

    await performStoreOperation(database, "readwrite", (store) => {
      for (const record of records) {
        store.delete(record.key);
      }
    });
  }

  async list(accountInput: SyncJournalAccount): Promise<SyncJournalRecord[]> {
    const account = normalizeAccount(accountInput);
    const database = await this.openDatabase();
    const records = await performStoreRequest<SyncJournalRecord[]>(
      database,
      "readonly",
      (store) => store.getAll() as IDBRequest<SyncJournalRecord[]>
    );

    return records
      .filter((record) => matchesAccount(record, account))
      .sort(compareJournalRecords);
  }

  async markRejected(
    account: SyncJournalAccount,
    kind: SyncDocumentKind,
    id: string,
    writeId: string,
    reason: string
  ): Promise<void> {
    const current = await this.read(account, kind, id);

    if (current?.writeId !== writeId) {
      return;
    }

    await this.write({
      ...current,
      rejectedReason: normalizeRequiredText(reason, "Odrzucony zapis wymaga powodu.")
    });
  }

  async put(input: PutSyncJournalRecordInput): Promise<SyncJournalRecord> {
    const record = createSyncJournalRecord(input);

    await this.write(record);

    return record;
  }

  async removeIfCurrent(
    account: SyncJournalAccount,
    kind: SyncDocumentKind,
    id: string,
    writeId: string
  ): Promise<void> {
    const current = await this.read(account, kind, id);

    if (current?.writeId !== writeId) {
      return;
    }

    const database = await this.openDatabase();

    await performStoreRequest(database, "readwrite", (store) =>
      store.delete(current.key)
    );
  }

  private async read(
    account: SyncJournalAccount,
    kind: SyncDocumentKind,
    id: string
  ): Promise<SyncJournalRecord | null> {
    const database = await this.openDatabase();

    return performStoreRequest<SyncJournalRecord | undefined>(
      database,
      "readonly",
      (store) =>
        store.get(createJournalKey(account, kind, id)) as IDBRequest<
          SyncJournalRecord | undefined
        >
    ).then((record) => record ?? null);
  }

  private async write(record: SyncJournalRecord): Promise<void> {
    const database = await this.openDatabase();

    await performStoreRequest(database, "readwrite", (store) => store.put(record));
  }

  private openDatabase(): Promise<IDBDatabase> {
    if (!this.indexedDb) {
      return Promise.reject(
        new Error("IndexedDB dziennika synchronizacji jest niedostepne.")
      );
    }

    const request = this.indexedDb.open(DATABASE_NAME, DATABASE_VERSION);

    request.onupgradeneeded = () => {
      const database = request.result;

      if (!database.objectStoreNames.contains(STORE_NAME)) {
        database.createObjectStore(STORE_NAME, { keyPath: "key" });
      }
    };

    return requestToPromise(request);
  }
}

export const defaultFirestoreSyncJournal: FirestoreSyncJournal =
  new IndexedDbFirestoreSyncJournal();

function createJournalKey(
  accountInput: SyncJournalAccount,
  kind: SyncDocumentKind,
  idInput: string
): string {
  const account = normalizeAccount(accountInput);
  const id = normalizeRequiredText(idInput, "Dziennik synchronizacji wymaga ID.");

  return `${account.userUid}:${account.deviceId}:${kind}:${id}`;
}

function normalizeAccount(account: SyncJournalAccount): SyncJournalAccount {
  return {
    deviceId: normalizeRequiredText(
      account.deviceId,
      "Dziennik synchronizacji wymaga urzadzenia."
    ),
    userUid: normalizeRequiredText(
      account.userUid,
      "Dziennik synchronizacji wymaga konta."
    )
  };
}

function matchesAccount(
  record: SyncJournalRecord,
  accountInput: SyncJournalAccount
): boolean {
  const account = normalizeAccount(accountInput);

  return record.deviceId === account.deviceId && record.userUid === account.userUid;
}

function compareJournalRecords(
  left: SyncJournalRecord,
  right: SyncJournalRecord
): number {
  return (
    left.lastLocalWriteIso.localeCompare(right.lastLocalWriteIso) ||
    left.kind.localeCompare(right.kind) ||
    left.id.localeCompare(right.id)
  );
}

async function performStoreOperation(
  database: IDBDatabase,
  mode: IDBTransactionMode,
  operation: (store: IDBObjectStore) => void
): Promise<void> {
  const transaction = database.transaction(STORE_NAME, mode);
  operation(transaction.objectStore(STORE_NAME));

  await transactionToPromise(transaction);
  database.close();
}

async function performStoreRequest<T>(
  database: IDBDatabase,
  mode: IDBTransactionMode,
  createRequest: (store: IDBObjectStore) => IDBRequest<T>
): Promise<T> {
  const transaction = database.transaction(STORE_NAME, mode);
  const request = createRequest(transaction.objectStore(STORE_NAME));

  try {
    const result = await requestToPromise(request);
    await transactionToPromise(transaction);
    return result;
  } finally {
    database.close();
  }
}

function requestToPromise<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => {
      resolve(request.result);
    };
    request.onerror = () => {
      reject(request.error ?? new Error("Operacja dziennika nie powiodla sie."));
    };
  });
}

function transactionToPromise(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => {
      resolve();
    };
    transaction.onerror = () => {
      reject(transaction.error ?? new Error("Transakcja dziennika nie powiodla sie."));
    };
    transaction.onabort = () => {
      reject(transaction.error ?? new Error("Transakcja dziennika zostala przerwana."));
    };
  });
}

function normalizeRequiredText(value: string, message: string): string {
  const normalized = value.trim();

  if (!normalized) {
    throw new Error(message);
  }

  return normalized;
}

function normalizeOptionalText(value: string | null | undefined): string | null {
  const normalized = value?.trim() ?? "";

  return normalized || null;
}

function normalizeIso(value: string): string {
  const normalized = normalizeRequiredText(
    value,
    "Dziennik synchronizacji wymaga czasu ISO."
  );

  if (Number.isNaN(Date.parse(normalized))) {
    throw new Error("Dziennik synchronizacji wymaga poprawnego czasu ISO.");
  }

  return normalized;
}

function createRandomUuid(): string {
  if (typeof globalThis.crypto.randomUUID !== "function") {
    throw new Error("Brak generatora UUID dziennika synchronizacji.");
  }

  return globalThis.crypto.randomUUID();
}
