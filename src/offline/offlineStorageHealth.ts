export const OFFLINE_STORAGE_MIN_FREE_BYTES = 50 * 1024 * 1024;
export const OFFLINE_STORAGE_MAX_USAGE_RATIO = 0.9;

const OFFLINE_STORAGE_MARKER_PREFIX = "borowka-pwa:offline-prepared";

export const OFFLINE_STORAGE_ISSUE_CODES = [
  "PERSISTENT_STORAGE_UNAVAILABLE",
  "PRIVATE_MODE_SUSPECTED",
  "LOCAL_WRITE_FAILED",
  "LOW_SPACE",
  "STORAGE_CLEARED",
  "CONFIGURATION_INCOMPLETE"
] as const;

export type OfflineStorageIssueCode = (typeof OFFLINE_STORAGE_ISSUE_CODES)[number];
export type OfflineStoragePersistenceStatus =
  "GRANTED" | "NOT_GRANTED" | "UNSUPPORTED" | "ERROR";
export type OfflineStorageMarkerStatus = "PRESENT" | "MISSING" | "UNAVAILABLE";

export type OfflineStorageIssue = {
  code: OfflineStorageIssueCode;
  message: string;
};

export type OfflineStorageHealth = {
  status: "READY" | "NOT_READY";
  label: string;
  issues: OfflineStorageIssue[];
  persistenceStatus: OfflineStoragePersistenceStatus;
  quota: {
    availableBytes: number;
    quotaBytes: number;
    usageBytes: number;
    usageRatio: number;
  } | null;
};

export type OfflineStorageHealthEvaluationInput = {
  configurationReady: boolean;
  indexedDbAvailable: boolean;
  markerStatus: OfflineStorageMarkerStatus;
  operationError?: unknown;
  persistenceStatus: OfflineStoragePersistenceStatus;
  quotaBytes?: number | null;
  snapshotPresent: boolean;
  usageBytes?: number | null;
};

export type OfflineStorageHealthInspectionInput = {
  configurationReady: boolean;
  deviceId: string;
  operationError?: unknown;
  snapshotPresent: boolean;
  userUid: string;
};

export type OfflineStorageMarkerInput = {
  deviceId: string;
  preparedAtIso?: string;
  userUid: string;
};

export type OfflineStorageHealthApi = {
  inspect: (input: OfflineStorageHealthInspectionInput) => Promise<OfflineStorageHealth>;
  markConfigurationCleared: (input: OfflineStorageMarkerInput) => Promise<void>;
  markConfigurationPrepared: (input: OfflineStorageMarkerInput) => Promise<void>;
  requestPersistentStorage: () => Promise<boolean>;
};

type StorageManagerLike = {
  estimate?: () => Promise<{ quota?: number; usage?: number }>;
  persist?: () => Promise<boolean>;
  persisted?: () => Promise<boolean>;
};

type BrowserOfflineStorageDependencies = {
  indexedDb?: IDBFactory;
  markerStorage?: Storage;
  storageManager?: StorageManagerLike;
};

export function evaluateOfflineStorageHealth(
  input: OfflineStorageHealthEvaluationInput
): OfflineStorageHealth {
  const issues = new Map<OfflineStorageIssueCode, OfflineStorageIssue>();
  const quota = createQuota(input.usageBytes, input.quotaBytes);

  if (!input.indexedDbAvailable || input.persistenceStatus !== "GRANTED") {
    addIssue(
      issues,
      "PERSISTENT_STORAGE_UNAVAILABLE",
      "Trwala pamiec offline nie jest dostepna albo nie zostala wlaczona."
    );
  }

  if (
    !input.indexedDbAvailable ||
    input.markerStatus === "UNAVAILABLE" ||
    isPrivateStorageError(input.operationError)
  ) {
    addIssue(
      issues,
      "PRIVATE_MODE_SUSPECTED",
      "Tryb prywatny albo ustawienia przegladarki blokuja lokalna pamiec."
    );
  }

  if (input.operationError !== undefined) {
    addIssue(
      issues,
      "LOCAL_WRITE_FAILED",
      createLocalOperationErrorMessage(input.operationError)
    );
  }

  if (isQuotaError(input.operationError) || isLowSpace(quota)) {
    addIssue(
      issues,
      "LOW_SPACE",
      "Na urzadzeniu jest za malo miejsca na bezpieczna prace offline."
    );
  }

  if (input.markerStatus === "PRESENT" && !input.snapshotPresent) {
    addIssue(
      issues,
      "STORAGE_CLEARED",
      "Wczesniej przygotowany cache zniknal. Pamiec mogla zostac wyczyszczona przez system lub uzytkownika."
    );
  }

  if (!input.configurationReady) {
    addIssue(
      issues,
      "CONFIGURATION_INCOMPLETE",
      "Konfiguracja offline jest niekompletna."
    );
  }

  const issueList = Array.from(issues.values());
  const storageUnavailable = issueList.some(
    (issue) => issue.code !== "CONFIGURATION_INCOMPLETE"
  );

  return {
    status: issueList.length === 0 ? "READY" : "NOT_READY",
    label:
      issueList.length === 0
        ? "Pamiec offline gotowa"
        : storageUnavailable
          ? "Pamiec offline niedostepna"
          : "Konfiguracja offline niekompletna",
    issues: issueList,
    persistenceStatus: input.persistenceStatus,
    quota
  };
}

export function createBrowserOfflineStorageHealthApi(
  dependencies: BrowserOfflineStorageDependencies = {}
): OfflineStorageHealthApi {
  const resolveIndexedDb = (): IDBFactory | undefined =>
    dependencies.indexedDb ?? Reflect.get(globalThis, "indexedDB");
  const resolveMarkerStorage = (): Storage =>
    dependencies.markerStorage ?? Reflect.get(globalThis, "localStorage");
  const resolveStorageManager = (): StorageManagerLike | undefined => {
    const navigatorValue = Reflect.get(globalThis, "navigator") as Navigator | undefined;

    return dependencies.storageManager ?? navigatorValue?.storage;
  };

  return {
    inspect: async (input) => {
      const storageManager = resolveStorageManager();
      const [persistenceStatus, quota] = await Promise.all([
        inspectPersistence(storageManager),
        inspectQuota(storageManager)
      ]);

      return evaluateOfflineStorageHealth({
        configurationReady: input.configurationReady,
        indexedDbAvailable: resolveIndexedDb() !== undefined,
        markerStatus: readMarkerStatus(resolveMarkerStorage, input),
        operationError: input.operationError,
        persistenceStatus,
        quotaBytes: quota?.quota ?? null,
        snapshotPresent: input.snapshotPresent,
        usageBytes: quota?.usage ?? null
      });
    },
    markConfigurationCleared: (input) => {
      resolveMarkerStorage().removeItem(createOfflineStorageMarkerKey(input));
      return Promise.resolve();
    },
    markConfigurationPrepared: (input) => {
      resolveMarkerStorage().setItem(
        createOfflineStorageMarkerKey(input),
        normalizeIso(input.preparedAtIso ?? new Date().toISOString())
      );
      return Promise.resolve();
    },
    requestPersistentStorage: async () => {
      const storageManager = resolveStorageManager();

      if (!storageManager?.persisted || !storageManager.persist) {
        return false;
      }

      try {
        if (await storageManager.persisted()) {
          return true;
        }

        return await storageManager.persist();
      } catch {
        return false;
      }
    }
  };
}

export const defaultOfflineStorageHealthApi = createBrowserOfflineStorageHealthApi();

function createOfflineStorageMarkerKey({
  deviceId,
  userUid
}: OfflineStorageMarkerInput): string {
  return `${OFFLINE_STORAGE_MARKER_PREFIX}:${normalizeRequiredText(
    userUid
  )}:${normalizeRequiredText(deviceId)}`;
}

function readMarkerStatus(
  resolveMarkerStorage: () => Storage,
  input: OfflineStorageMarkerInput
): OfflineStorageMarkerStatus {
  try {
    return resolveMarkerStorage().getItem(createOfflineStorageMarkerKey(input))
      ? "PRESENT"
      : "MISSING";
  } catch {
    return "UNAVAILABLE";
  }
}

async function inspectPersistence(
  storageManager: StorageManagerLike | undefined
): Promise<OfflineStoragePersistenceStatus> {
  if (!storageManager?.persisted) {
    return "UNSUPPORTED";
  }

  try {
    return (await storageManager.persisted()) ? "GRANTED" : "NOT_GRANTED";
  } catch {
    return "ERROR";
  }
}

async function inspectQuota(
  storageManager: StorageManagerLike | undefined
): Promise<{ quota?: number; usage?: number } | null> {
  if (!storageManager?.estimate) {
    return null;
  }

  try {
    return await storageManager.estimate();
  } catch {
    return null;
  }
}

function createQuota(
  usageBytes: number | null | undefined,
  quotaBytes: number | null | undefined
): OfflineStorageHealth["quota"] {
  if (
    typeof usageBytes !== "number" ||
    typeof quotaBytes !== "number" ||
    !Number.isFinite(usageBytes) ||
    !Number.isFinite(quotaBytes) ||
    usageBytes < 0 ||
    quotaBytes <= 0
  ) {
    return null;
  }

  const boundedUsage = Math.min(usageBytes, quotaBytes);

  return {
    availableBytes: Math.max(0, quotaBytes - boundedUsage),
    quotaBytes,
    usageBytes: boundedUsage,
    usageRatio: boundedUsage / quotaBytes
  };
}

function isLowSpace(quota: OfflineStorageHealth["quota"]): boolean {
  return (
    quota !== null &&
    (quota.availableBytes < OFFLINE_STORAGE_MIN_FREE_BYTES ||
      quota.usageRatio >= OFFLINE_STORAGE_MAX_USAGE_RATIO)
  );
}

function addIssue(
  issues: Map<OfflineStorageIssueCode, OfflineStorageIssue>,
  code: OfflineStorageIssueCode,
  message: string
): void {
  issues.set(code, {
    code,
    message
  });
}

function createLocalOperationErrorMessage(error: unknown): string {
  if (isQuotaError(error)) {
    return "Zapis lokalny nie powiodl sie z powodu braku miejsca.";
  }

  return "Zapis lub odczyt lokalnego cache nie powiodl sie.";
}

function isQuotaError(error: unknown): boolean {
  return readErrorName(error) === "QuotaExceededError";
}

function isPrivateStorageError(error: unknown): boolean {
  const name = readErrorName(error);

  return (
    name === "InvalidStateError" ||
    name === "NotAllowedError" ||
    name === "SecurityError" ||
    name === "UnknownError"
  );
}

function readErrorName(error: unknown): string | null {
  if (
    typeof error === "object" &&
    error !== null &&
    "name" in error &&
    typeof error.name === "string"
  ) {
    return error.name;
  }

  return null;
}

function normalizeRequiredText(value: string): string {
  const trimmed = value.trim();

  if (!trimmed) {
    throw new Error("Stan pamieci offline wymaga konta i urzadzenia.");
  }

  return trimmed;
}

function normalizeIso(value: string): string {
  const trimmed = value.trim();

  if (!trimmed || Number.isNaN(Date.parse(trimmed))) {
    throw new Error("Znacznik cache offline wymaga poprawnego czasu ISO.");
  }

  return trimmed;
}
