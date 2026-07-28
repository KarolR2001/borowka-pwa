import type { UserProfile } from "../domain/identity";
import {
  enablePickerPersistentCache,
  evaluatePickerOfflinePolicy,
  preparePickerOfflineData,
  readPickerOfflineDataStatus
} from "./pickerOfflineData";
import { readFirestoreCacheMode } from "../offline/firestorePersistencePreference";

const pickerProfile: UserProfile = {
  active: true,
  displayName: "Anna",
  email: "anna@example.test",
  offlineConsent: true,
  registrationStatus: "APPROVED",
  role: "PICKER",
  uid: "picker-1",
  workerId: "worker-1"
};

describe("picker offline data policy", () => {
  afterEach(() => {
    localStorage.clear();
  });

  it("requires explicit consent and persistent Firestore cache", () => {
    expect(
      evaluatePickerOfflinePolicy({
        actorProfile: { ...pickerProfile, offlineConsent: false },
        cacheMode: "PERSISTENT"
      })
    ).toEqual({
      code: "CONSENT_REQUIRED",
      dataSource: "LOCAL_POLICY",
      lastSuccessfulSyncIso: null
    });
    expect(
      evaluatePickerOfflinePolicy({
        actorProfile: pickerProfile,
        cacheMode: "MEMORY"
      })
    ).toEqual({
      code: "PERSISTENT_CACHE_REQUIRED",
      dataSource: "LOCAL_POLICY",
      lastSuccessfulSyncIso: null
    });
    expect(
      evaluatePickerOfflinePolicy({
        actorProfile: pickerProfile,
        cacheMode: "PERSISTENT"
      })
    ).toBeNull();
  });

  it("rejects non-picker access before reading Firebase", async () => {
    await expect(
      readPickerOfflineDataStatus(
        {},
        {
          actorProfile: { ...pickerProfile, role: "ADMIN", workerId: null },
          cacheMode: "PERSISTENT",
          deviceId: "device-1",
          isOnline: true
        }
      )
    ).rejects.toThrow("aktywnego profilu pickera");
  });

  it("does not start offline preparation without connectivity", async () => {
    await expect(
      preparePickerOfflineData(
        {},
        {
          actorProfile: pickerProfile,
          cacheMode: "PERSISTENT",
          deviceId: "device-1",
          isOnline: false
        }
      )
    ).rejects.toThrow("wymaga polaczenia");
  });

  it("enables persistent cache only for a consenting picker", () => {
    enablePickerPersistentCache(pickerProfile);

    expect(readFirestoreCacheMode()).toBe("PERSISTENT");
    expect(() => {
      enablePickerPersistentCache({ ...pickerProfile, offlineConsent: false });
    }).toThrow("wymaga zgody");
  });
});
