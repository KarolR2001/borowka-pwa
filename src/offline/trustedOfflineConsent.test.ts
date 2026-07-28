import {
  TRUSTED_OFFLINE_STORAGE_DISCLOSURE,
  updateTrustedOfflineConsent
} from "./trustedOfflineConsent";
import {
  FIRESTORE_PERSISTENCE_PREFERENCE_KEY,
  readFirestoreCacheMode
} from "./firestorePersistencePreference";

const firestoreServiceMock = vi.hoisted(() => ({
  firestore: { name: "firestore-mock" },
  getFirebaseServices: vi.fn()
}));

const firestoreLiteMock = vi.hoisted(() => ({
  batch: {
    update: vi.fn(),
    set: vi.fn(),
    commit: vi.fn()
  },
  doc: vi.fn((_firestore: unknown, collectionPath: string, id: string) => ({
    collectionPath,
    id,
    path: `${collectionPath}/${id}`
  })),
  getDoc: vi.fn(),
  serverTimestamp: vi.fn(() => "server-consent-time"),
  writeBatch: vi.fn()
}));

vi.mock("../config/firebaseServices", () => ({
  getFirebaseServices: firestoreServiceMock.getFirebaseServices
}));

vi.mock("firebase/firestore", () => firestoreLiteMock);

beforeEach(() => {
  localStorage.clear();
  firestoreServiceMock.getFirebaseServices.mockResolvedValue({
    firestore: firestoreServiceMock.firestore
  });
  firestoreLiteMock.batch.update.mockClear();
  firestoreLiteMock.batch.set.mockClear();
  firestoreLiteMock.batch.commit.mockResolvedValue(undefined);
  firestoreLiteMock.doc.mockClear();
  firestoreLiteMock.getDoc.mockReset();
  firestoreLiteMock.serverTimestamp.mockClear();
  firestoreLiteMock.writeBatch.mockReturnValue(firestoreLiteMock.batch);
});

describe("trusted offline consent", () => {
  it("creates the current device and updates the user consent in one batch", async () => {
    firestoreLiteMock.getDoc.mockResolvedValue({
      exists: () => false
    });

    await updateTrustedOfflineConsent(
      {},
      {
        uid: " user-1 ",
        offlineConsent: true,
        deviceId: " device-1 ",
        deviceName: "Telefon Karola",
        platform: "Android"
      }
    );

    expect(firestoreLiteMock.batch.update).toHaveBeenCalledWith(
      expect.objectContaining({ path: "users/user-1" }),
      {
        offlineConsent: true
      }
    );
    expect(firestoreLiteMock.batch.set).toHaveBeenCalledWith(
      expect.objectContaining({ path: "devices/device-1" }),
      expect.objectContaining({
        id: "device-1",
        userUid: "user-1",
        deviceName: "Telefon Karola",
        platform: "Android",
        trustedOfflineStorage: true,
        firstSeenAt: "server-consent-time",
        lastSeenAt: "server-consent-time"
      })
    );
    expect(firestoreLiteMock.batch.commit).toHaveBeenCalledTimes(1);
    expect(localStorage.getItem(FIRESTORE_PERSISTENCE_PREFERENCE_KEY)).toBe("enabled");
  });

  it("updates an existing device when consent changes", async () => {
    firestoreLiteMock.getDoc.mockResolvedValue({
      exists: () => true
    });

    await updateTrustedOfflineConsent(
      {},
      {
        uid: "user-1",
        offlineConsent: false,
        deviceId: "device-1",
        deviceName: "Laptop",
        platform: null
      }
    );

    expect(firestoreLiteMock.batch.update).toHaveBeenCalledWith(
      expect.objectContaining({ path: "devices/device-1" }),
      {
        deviceName: "Laptop",
        platform: null,
        trustedOfflineStorage: false,
        lastSeenAt: "server-consent-time"
      }
    );
    expect(firestoreLiteMock.batch.set).not.toHaveBeenCalled();
    expect(readFirestoreCacheMode()).toBe("MEMORY");
  });

  it("contains the required disclosure points for trusted offline storage", () => {
    expect(TRUSTED_OFFLINE_STORAGE_DISCLOSURE).toEqual(
      expect.arrayContaining([
        expect.stringContaining("pozostac na tym urzadzeniu"),
        expect.stringContaining("prywatnym albo zaufanym"),
        expect.stringContaining("niezsynchronizowane rekordy"),
        expect.stringContaining("Tryb prywatny"),
        expect.stringContaining("Przed wylogowaniem"),
        expect.stringContaining("Wyloguj i wyczysc urzadzenie")
      ])
    );
  });
});
