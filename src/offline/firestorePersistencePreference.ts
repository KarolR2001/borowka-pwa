export const FIRESTORE_PERSISTENCE_PREFERENCE_KEY =
  "borowka:trusted-firestore-persistence:v1";

export type FirestoreCacheMode = "MEMORY" | "PERSISTENT";

export function readFirestoreCacheMode(
  storage: Pick<Storage, "getItem"> | null = readBrowserStorage()
): FirestoreCacheMode {
  if (!storage) {
    return "MEMORY";
  }

  try {
    return storage.getItem(FIRESTORE_PERSISTENCE_PREFERENCE_KEY) === "enabled"
      ? "PERSISTENT"
      : "MEMORY";
  } catch {
    return "MEMORY";
  }
}

export function writeFirestorePersistencePreference(
  enabled: boolean,
  storage: Pick<Storage, "removeItem" | "setItem"> | null = readBrowserStorage()
): void {
  if (!storage) {
    return;
  }

  if (enabled) {
    storage.setItem(FIRESTORE_PERSISTENCE_PREFERENCE_KEY, "enabled");
    return;
  }

  storage.removeItem(FIRESTORE_PERSISTENCE_PREFERENCE_KEY);
}

function readBrowserStorage(): Storage | null {
  try {
    return globalThis.localStorage;
  } catch {
    return null;
  }
}
