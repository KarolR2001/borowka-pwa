import { APP_META } from "../config/appMeta";
import { listSeasons, type SeasonDirectoryResult } from "../seasons/seasons";
import type {
  SeasonDocument,
  SettlementPlanDocument,
  WorkerRateVersionDocument
} from "../domain/domainConfiguration";
import type { UserProfile } from "../domain/identity";
import {
  listWorkerDirectory,
  type WorkerDirectoryListItem,
  type WorkerDirectoryResult,
  type WorkerDirectoryScope
} from "../workers/workerDirectory";

type FirebaseEnv = Record<string, string | boolean | undefined>;

export const CONFIGURATION_CACHE_VERSION = 1;
const DATABASE_NAME = "borowka-pwa-offline";
const DATABASE_VERSION = 1;
const CONFIGURATION_STORE = "configurationSnapshots";

export type ConfigurationCacheStorageKey = {
  userUid: string;
  deviceId: string;
};

export type ConfigurationCacheStorage = {
  read: (key: ConfigurationCacheStorageKey) => Promise<ConfigurationCacheSnapshot | null>;
  write: (snapshot: ConfigurationCacheSnapshot) => Promise<void>;
  clear: (key: ConfigurationCacheStorageKey) => Promise<void>;
};

export type ConfigurationCacheAccount = Pick<
  UserProfile,
  "uid" | "email" | "displayName" | "role" | "workerId" | "offlineConsent"
>;

export type CachedSeason = Pick<
  SeasonDocument,
  "id" | "name" | "startDate" | "endDate" | "status" | "isDefault"
>;

export type CachedSettlementPlan = Pick<
  SettlementPlanDocument,
  | "id"
  | "name"
  | "code"
  | "calculationBasis"
  | "unitLabelSingular"
  | "unitLabelPlural"
  | "unitSymbol"
  | "quantityPrecision"
  | "weightRequired"
  | "allowBatchQuantity"
  | "active"
>;

export type CachedWorker = Pick<
  WorkerDirectoryListItem,
  | "id"
  | "displayName"
  | "normalizedName"
  | "active"
  | "currentPlanId"
  | "currentRateVersionId"
>;

export type CachedWorkerRateVersion = Pick<
  WorkerRateVersionDocument,
  | "id"
  | "workerId"
  | "planId"
  | "rateGroszPerUnit"
  | "validFrom"
  | "validTo"
  | "active"
  | "supersedesRateId"
>;

export type ConfigurationCacheSnapshot = {
  id: string;
  version: number;
  preparedAtIso: string;
  appVersion: string;
  schemaVersion: string;
  calculationVersion: string;
  userUid: string;
  deviceId: string;
  viewerRole: WorkerDirectoryScope;
  account: ConfigurationCacheAccount;
  activeSeason: CachedSeason | null;
  workers: CachedWorker[];
  plans: CachedSettlementPlan[];
  rateVersions: CachedWorkerRateVersion[];
  invalidDocumentCount: number;
};

export type ConfigurationCacheReadinessStatus = "READY" | "NOT_READY";

export type ConfigurationCacheReadiness = {
  status: ConfigurationCacheReadinessStatus;
  missingRequirements: string[];
  counts: {
    workers: number;
    plans: number;
    rateVersions: number;
  };
};

export type PrepareConfigurationCacheInput = {
  actorProfile: UserProfile;
  viewerRole: WorkerDirectoryScope;
  deviceId: string;
  serviceWorkerReady: boolean;
  preparedAt?: Date;
  storage?: ConfigurationCacheStorage;
};

export type PrepareConfigurationCacheResult = {
  snapshot: ConfigurationCacheSnapshot;
  readiness: ConfigurationCacheReadiness;
};

export type ReadConfigurationCacheInput = {
  actorProfile: UserProfile;
  deviceId: string;
  serviceWorkerReady: boolean;
  storage?: ConfigurationCacheStorage;
};

export type ReadConfigurationCacheResult = {
  snapshot: ConfigurationCacheSnapshot | null;
  readiness: ConfigurationCacheReadiness;
};

export type ClearConfigurationCacheInput = {
  actorProfile: UserProfile;
  deviceId: string;
  storage?: ConfigurationCacheStorage;
};

export async function prepareConfigurationCache(
  env: FirebaseEnv,
  input: PrepareConfigurationCacheInput
): Promise<PrepareConfigurationCacheResult> {
  assertCacheRole(input.viewerRole);

  if (input.actorProfile.role !== input.viewerRole) {
    throw new Error("Rola profilu nie zgadza sie z zakresem cache.");
  }

  if (!input.actorProfile.offlineConsent) {
    throw new Error("Przygotowanie offline wymaga zgody na trwale dane offline.");
  }

  const [seasonDirectory, workerDirectory] = await Promise.all([
    listSeasons(env),
    listWorkerDirectory(env, {
      viewerRole: input.viewerRole
    })
  ]);
  const snapshot = buildConfigurationCacheSnapshot({
    account: input.actorProfile,
    deviceId: input.deviceId,
    preparedAt: input.preparedAt ?? new Date(),
    seasonDirectory,
    workerDirectory,
    viewerRole: input.viewerRole
  });
  const storage = input.storage ?? indexedDbStorage;

  await storage.write(snapshot);

  return {
    snapshot,
    readiness: evaluateConfigurationCacheReadiness({
      profile: input.actorProfile,
      serviceWorkerReady: input.serviceWorkerReady,
      snapshot
    })
  };
}

export async function readConfigurationCache(
  input: ReadConfigurationCacheInput
): Promise<ReadConfigurationCacheResult> {
  const storage = input.storage ?? indexedDbStorage;
  const snapshot = await storage.read({
    userUid: input.actorProfile.uid,
    deviceId: input.deviceId
  });

  return {
    snapshot,
    readiness: evaluateConfigurationCacheReadiness({
      profile: input.actorProfile,
      serviceWorkerReady: input.serviceWorkerReady,
      snapshot
    })
  };
}

export async function clearConfigurationCache(
  input: ClearConfigurationCacheInput
): Promise<void> {
  const storage = input.storage ?? indexedDbStorage;

  await storage.clear({
    userUid: input.actorProfile.uid,
    deviceId: input.deviceId
  });
}

export function buildConfigurationCacheSnapshot({
  account,
  deviceId,
  preparedAt,
  seasonDirectory,
  workerDirectory,
  viewerRole
}: {
  account: UserProfile;
  deviceId: string;
  preparedAt: Date;
  seasonDirectory: SeasonDirectoryResult;
  workerDirectory: WorkerDirectoryResult;
  viewerRole: WorkerDirectoryScope;
}): ConfigurationCacheSnapshot {
  assertCacheRole(viewerRole);

  const activeWorkers = workerDirectory.workers.filter((worker) => worker.active);
  const activeWorkerIds = new Set(activeWorkers.map((worker) => worker.id));
  const plansById = new Map(workerDirectory.plans.map((plan) => [plan.id, plan]));
  const rateVersionsById = new Map<string, WorkerRateVersionDocument>();

  for (const worker of activeWorkers) {
    for (const rateVersion of worker.rateVersions) {
      if (rateVersion.workerId === worker.id) {
        rateVersionsById.set(rateVersion.id, rateVersion);
      }
    }
  }

  return {
    id: createConfigurationCacheSnapshotId({
      userUid: account.uid,
      deviceId
    }),
    version: CONFIGURATION_CACHE_VERSION,
    preparedAtIso: preparedAt.toISOString(),
    appVersion: APP_META.version,
    schemaVersion: APP_META.schemaVersion,
    calculationVersion: APP_META.calculationVersion,
    userUid: account.uid,
    deviceId,
    viewerRole,
    account: cacheAccount(account),
    activeSeason: cacheSeason(selectActiveSeason(seasonDirectory.seasons)),
    workers: activeWorkers.map(cacheWorker).sort(compareById),
    plans: workerDirectory.plans
      .filter((plan) => plan.active)
      .map(cacheSettlementPlan)
      .sort(compareById),
    rateVersions: Array.from(rateVersionsById.values())
      .filter(
        (rateVersion) =>
          activeWorkerIds.has(rateVersion.workerId) && plansById.has(rateVersion.planId)
      )
      .map(cacheWorkerRateVersion)
      .sort(compareRateVersions),
    invalidDocumentCount:
      seasonDirectory.invalidSeasons.length +
      workerDirectory.invalidWorkers.length +
      workerDirectory.invalidPlans.length +
      workerDirectory.invalidRateVersions.length +
      workerDirectory.invalidProfiles.length +
      workerDirectory.invalidAuditEvents.length
  };
}

export function evaluateConfigurationCacheReadiness({
  profile,
  serviceWorkerReady,
  snapshot
}: {
  profile: UserProfile;
  serviceWorkerReady: boolean;
  snapshot: ConfigurationCacheSnapshot | null;
}): ConfigurationCacheReadiness {
  const missingRequirements: string[] = [];

  if (!profile.offlineConsent) {
    missingRequirements.push("Brak zgody na trwale dane offline.");
  }

  if (!serviceWorkerReady) {
    missingRequirements.push("Pliki PWA nie sa potwierdzone w cache service workera.");
  }

  if (!snapshot) {
    missingRequirements.push("Brak lokalnego snapshotu konfiguracji.");
    return {
      status: "NOT_READY",
      missingRequirements,
      counts: {
        workers: 0,
        plans: 0,
        rateVersions: 0
      }
    };
  }

  const planIds = new Set(snapshot.plans.map((plan) => plan.id));
  const rateVersionIds = new Set(
    snapshot.rateVersions.map((rateVersion) => rateVersion.id)
  );

  if (snapshot.version !== CONFIGURATION_CACHE_VERSION) {
    missingRequirements.push("Snapshot konfiguracji ma nieobslugiwana wersje.");
  }

  if (snapshot.userUid !== profile.uid) {
    missingRequirements.push("Snapshot nalezy do innego konta.");
  }

  if (snapshot.account.role !== profile.role) {
    missingRequirements.push("Rola konta rozni sie od roli zapisanej w cache.");
  }

  if (!snapshot.activeSeason) {
    missingRequirements.push("Brak aktywnego sezonu.");
  }

  if (snapshot.workers.length === 0) {
    missingRequirements.push("Brak aktywnych zbieraczy.");
  }

  if (snapshot.plans.length === 0) {
    missingRequirements.push("Brak aktywnych planow.");
  }

  if (snapshot.rateVersions.length === 0) {
    missingRequirements.push("Brak wersji stawek.");
  }

  for (const worker of snapshot.workers) {
    if (!planIds.has(worker.currentPlanId)) {
      missingRequirements.push(`Brak planu dla zbieracza ${worker.displayName}.`);
    }

    if (!rateVersionIds.has(worker.currentRateVersionId)) {
      missingRequirements.push(
        `Brak biezacej stawki dla zbieracza ${worker.displayName}.`
      );
    }
  }

  if (snapshot.invalidDocumentCount > 0) {
    missingRequirements.push("W pobranej konfiguracji sa bledne dokumenty.");
  }

  return {
    status: missingRequirements.length === 0 ? "READY" : "NOT_READY",
    missingRequirements,
    counts: {
      workers: snapshot.workers.length,
      plans: snapshot.plans.length,
      rateVersions: snapshot.rateVersions.length
    }
  };
}

export function createMemoryConfigurationCacheStorage(
  initialSnapshots: ConfigurationCacheSnapshot[] = []
): ConfigurationCacheStorage {
  const snapshots = new Map(
    initialSnapshots.map((snapshot) => [
      createConfigurationCacheSnapshotId(snapshot),
      snapshot
    ])
  );

  return {
    read: (key) =>
      Promise.resolve(snapshots.get(createConfigurationCacheSnapshotId(key)) ?? null),
    write: (snapshot) => {
      snapshots.set(createConfigurationCacheSnapshotId(snapshot), snapshot);
      return Promise.resolve();
    },
    clear: (key) => {
      snapshots.delete(createConfigurationCacheSnapshotId(key));
      return Promise.resolve();
    }
  };
}

export function createConfigurationCacheSnapshotId({
  userUid,
  deviceId
}: ConfigurationCacheStorageKey): string {
  return `${userUid}:${deviceId}`;
}

function selectActiveSeason(seasons: SeasonDocument[]): SeasonDocument | null {
  const openSeasons = seasons.filter((season) => season.status === "OPEN");
  const defaultOpenSeason = openSeasons.find((season) => season.isDefault);

  if (defaultOpenSeason) {
    return defaultOpenSeason;
  }

  if (openSeasons.length === 0) {
    return null;
  }

  return openSeasons.sort((left, right) =>
    right.startDate.localeCompare(left.startDate)
  )[0];
}

function cacheAccount(profile: UserProfile): ConfigurationCacheAccount {
  return {
    uid: profile.uid,
    email: profile.email,
    displayName: profile.displayName,
    role: profile.role,
    workerId: profile.workerId,
    offlineConsent: profile.offlineConsent
  };
}

function cacheSeason(season: SeasonDocument | null): CachedSeason | null {
  if (!season) {
    return null;
  }

  return {
    id: season.id,
    name: season.name,
    startDate: season.startDate,
    endDate: season.endDate,
    status: season.status,
    isDefault: season.isDefault
  };
}

function cacheSettlementPlan(plan: SettlementPlanDocument): CachedSettlementPlan {
  return {
    id: plan.id,
    name: plan.name,
    code: plan.code,
    calculationBasis: plan.calculationBasis,
    unitLabelSingular: plan.unitLabelSingular,
    unitLabelPlural: plan.unitLabelPlural,
    unitSymbol: plan.unitSymbol,
    quantityPrecision: plan.quantityPrecision,
    weightRequired: plan.weightRequired,
    allowBatchQuantity: plan.allowBatchQuantity,
    active: plan.active
  };
}

function cacheWorker(worker: WorkerDirectoryListItem): CachedWorker {
  return {
    id: worker.id,
    displayName: worker.displayName,
    normalizedName: worker.normalizedName,
    active: worker.active,
    currentPlanId: worker.currentPlanId,
    currentRateVersionId: worker.currentRateVersionId
  };
}

function cacheWorkerRateVersion(
  rateVersion: WorkerRateVersionDocument
): CachedWorkerRateVersion {
  return {
    id: rateVersion.id,
    workerId: rateVersion.workerId,
    planId: rateVersion.planId,
    rateGroszPerUnit: rateVersion.rateGroszPerUnit,
    validFrom: rateVersion.validFrom,
    validTo: rateVersion.validTo,
    active: rateVersion.active,
    supersedesRateId: rateVersion.supersedesRateId
  };
}

function assertCacheRole(role: string): asserts role is WorkerDirectoryScope {
  if (role !== "ADMIN" && role !== "OPERATOR") {
    throw new Error("Cache konfiguracji jest dostepny dla administratora i operatora.");
  }
}

function compareById(left: { id: string }, right: { id: string }): number {
  return left.id.localeCompare(right.id, "pl");
}

function compareRateVersions(
  left: CachedWorkerRateVersion,
  right: CachedWorkerRateVersion
): number {
  const workerDiff = left.workerId.localeCompare(right.workerId, "pl");

  if (workerDiff !== 0) {
    return workerDiff;
  }

  const validFromDiff = right.validFrom.localeCompare(left.validFrom);

  if (validFromDiff !== 0) {
    return validFromDiff;
  }

  return left.id.localeCompare(right.id, "pl");
}

class IndexedDbConfigurationCacheStorage implements ConfigurationCacheStorage {
  private readonly indexedDb: IDBFactory | undefined;

  constructor(indexedDb: IDBFactory | undefined = globalThis.indexedDB) {
    this.indexedDb = indexedDb;
  }

  async read(
    key: ConfigurationCacheStorageKey
  ): Promise<ConfigurationCacheSnapshot | null> {
    const database = await this.openDatabase();

    return performStoreOperation(database, "readonly", (store) => {
      const request = store.get(createConfigurationCacheSnapshotId(key)) as IDBRequest<
        ConfigurationCacheSnapshot | undefined
      >;

      return requestToPromise<ConfigurationCacheSnapshot | undefined>(request).then(
        (snapshot) => snapshot ?? null
      );
    });
  }

  async write(snapshot: ConfigurationCacheSnapshot): Promise<void> {
    const database = await this.openDatabase();

    await performStoreOperation(database, "readwrite", (store) =>
      requestToPromise(store.put(snapshot)).then(() => undefined)
    );
  }

  async clear(key: ConfigurationCacheStorageKey): Promise<void> {
    const database = await this.openDatabase();

    await performStoreOperation(database, "readwrite", (store) =>
      requestToPromise(store.delete(createConfigurationCacheSnapshotId(key))).then(
        () => undefined
      )
    );
  }

  private openDatabase(): Promise<IDBDatabase> {
    if (!this.indexedDb) {
      return Promise.reject(new Error("IndexedDB nie jest dostepne."));
    }

    const request = this.indexedDb.open(DATABASE_NAME, DATABASE_VERSION);

    request.onupgradeneeded = () => {
      const database = request.result;

      if (!database.objectStoreNames.contains(CONFIGURATION_STORE)) {
        database.createObjectStore(CONFIGURATION_STORE, {
          keyPath: "id"
        });
      }
    };

    return requestToPromise(request);
  }
}

const indexedDbStorage = new IndexedDbConfigurationCacheStorage();

function performStoreOperation<T>(
  database: IDBDatabase,
  mode: IDBTransactionMode,
  operation: (store: IDBObjectStore) => Promise<T>
): Promise<T> {
  const transaction = database.transaction(CONFIGURATION_STORE, mode);
  const store = transaction.objectStore(CONFIGURATION_STORE);

  return operation(store).finally(() => {
    database.close();
  });
}

function requestToPromise<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => {
      resolve(request.result);
    };
    request.onerror = () => {
      reject(request.error ?? new Error("Operacja IndexedDB nie powiodla sie."));
    };
  });
}
