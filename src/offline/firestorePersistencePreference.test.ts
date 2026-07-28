import {
  FIRESTORE_PERSISTENCE_PREFERENCE_KEY,
  readFirestoreCacheMode,
  writeFirestorePersistencePreference
} from "./firestorePersistencePreference";

describe("Firestore persistence preference", () => {
  it("uses memory until the trusted-device preference is enabled", () => {
    const storage = new Map<string, string>();
    const browserStorage = {
      getItem: (key: string) => storage.get(key) ?? null,
      removeItem: (key: string) => {
        storage.delete(key);
      },
      setItem: (key: string, value: string) => {
        storage.set(key, value);
      }
    };

    expect(readFirestoreCacheMode(browserStorage)).toBe("MEMORY");

    writeFirestorePersistencePreference(true, browserStorage);

    expect(storage.get(FIRESTORE_PERSISTENCE_PREFERENCE_KEY)).toBe("enabled");
    expect(readFirestoreCacheMode(browserStorage)).toBe("PERSISTENT");

    writeFirestorePersistencePreference(false, browserStorage);

    expect(readFirestoreCacheMode(browserStorage)).toBe("MEMORY");
  });

  it("falls back to memory when browser storage is unavailable", () => {
    expect(readFirestoreCacheMode(null)).toBe("MEMORY");
    expect(() => {
      writeFirestorePersistencePreference(true, null);
    }).not.toThrow();
  });
});
