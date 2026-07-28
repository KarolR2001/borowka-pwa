import {
  createBrowserOfflineStorageHealthApi,
  evaluateOfflineStorageHealth,
  OFFLINE_STORAGE_MIN_FREE_BYTES
} from "./offlineStorageHealth";

describe("offline storage health", () => {
  it("reports ready only for persistent storage with complete configuration", () => {
    expect(
      evaluateOfflineStorageHealth({
        configurationReady: true,
        indexedDbAvailable: true,
        markerStatus: "PRESENT",
        persistenceStatus: "GRANTED",
        quotaBytes: 1024 * 1024 * 1024,
        snapshotPresent: true,
        usageBytes: 100 * 1024 * 1024
      })
    ).toMatchObject({
      status: "READY",
      label: "Pamiec offline gotowa",
      issues: [],
      persistenceStatus: "GRANTED",
      quota: {
        availableBytes: 924 * 1024 * 1024
      }
    });
  });

  it("classifies unavailable persistence, private mode and local write failures", () => {
    const privateModeError = new DOMException("IndexedDB blocked", "InvalidStateError");
    const health = evaluateOfflineStorageHealth({
      configurationReady: false,
      indexedDbAvailable: false,
      markerStatus: "UNAVAILABLE",
      operationError: privateModeError,
      persistenceStatus: "UNSUPPORTED",
      snapshotPresent: false
    });

    expect(health.status).toBe("NOT_READY");
    expect(health.issues.map((issue) => issue.code)).toEqual([
      "PERSISTENT_STORAGE_UNAVAILABLE",
      "PRIVATE_MODE_SUSPECTED",
      "LOCAL_WRITE_FAILED",
      "CONFIGURATION_INCOMPLETE"
    ]);
  });

  it("detects low space from quota and quota exceeded writes without duplicates", () => {
    const health = evaluateOfflineStorageHealth({
      configurationReady: true,
      indexedDbAvailable: true,
      markerStatus: "PRESENT",
      operationError: new DOMException("No space", "QuotaExceededError"),
      persistenceStatus: "GRANTED",
      quotaBytes: 100 * 1024 * 1024,
      snapshotPresent: true,
      usageBytes: 100 * 1024 * 1024 - OFFLINE_STORAGE_MIN_FREE_BYTES + 1
    });

    expect(health.issues.map((issue) => issue.code)).toEqual([
      "LOCAL_WRITE_FAILED",
      "LOW_SPACE"
    ]);
    expect(health.quota?.availableBytes).toBeLessThan(OFFLINE_STORAGE_MIN_FREE_BYTES);
  });

  it("detects a system-cleared snapshot using the preparation marker", () => {
    const health = evaluateOfflineStorageHealth({
      configurationReady: false,
      indexedDbAvailable: true,
      markerStatus: "PRESENT",
      persistenceStatus: "GRANTED",
      snapshotPresent: false
    });

    expect(health.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "STORAGE_CLEARED"
        }),
        expect.objectContaining({
          code: "CONFIGURATION_INCOMPLETE"
        })
      ])
    );
  });

  it("requests persistence and maintains the per-account preparation marker", async () => {
    let persisted = false;
    const markerStorage = createMemoryStorage();
    const api = createBrowserOfflineStorageHealthApi({
      indexedDb: {} as IDBFactory,
      markerStorage,
      storageManager: {
        estimate: () =>
          Promise.resolve({
            quota: 1024 * 1024 * 1024,
            usage: 100 * 1024 * 1024
          }),
        persist: () => {
          persisted = true;
          return Promise.resolve(true);
        },
        persisted: () => Promise.resolve(persisted)
      }
    });

    await expect(api.requestPersistentStorage()).resolves.toBe(true);
    await api.markConfigurationPrepared({
      deviceId: "device-1",
      preparedAtIso: "2026-07-28T06:00:00.000Z",
      userUid: "operator-1"
    });
    await expect(
      api.inspect({
        configurationReady: true,
        deviceId: "device-1",
        snapshotPresent: true,
        userUid: "operator-1"
      })
    ).resolves.toMatchObject({
      status: "READY"
    });
    const missingSnapshotHealth = await api.inspect({
      configurationReady: false,
      deviceId: "device-1",
      snapshotPresent: false,
      userUid: "operator-1"
    });

    expect(missingSnapshotHealth.issues.map((issue) => issue.code)).toContain(
      "STORAGE_CLEARED"
    );

    await api.markConfigurationCleared({
      deviceId: "device-1",
      userUid: "operator-1"
    });
    const clearedHealth = await api.inspect({
      configurationReady: false,
      deviceId: "device-1",
      snapshotPresent: false,
      userUid: "operator-1"
    });

    expect(clearedHealth.issues).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "STORAGE_CLEARED"
        })
      ])
    );
  });
});

function createMemoryStorage(): Storage {
  const values = new Map<string, string>();

  return {
    get length() {
      return values.size;
    },
    clear: () => {
      values.clear();
    },
    getItem: (key) => values.get(key) ?? null,
    key: (index) => Array.from(values.keys())[index] ?? null,
    removeItem: (key) => {
      values.delete(key);
    },
    setItem: (key, value) => {
      values.set(key, value);
    }
  };
}
