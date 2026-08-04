// @vitest-environment node

import type { UserProfile } from "../domain/identity";
import {
  createEmergencyLocalExportFilename,
  createEmergencyLocalExportPayload
} from "../offline/emergencyLocalExport";
import { buildSyncCenterModel } from "../offline/syncCenter";
import {
  createFullCloudExportArchive,
  FULL_CLOUD_EXPORT_COLLECTIONS,
  loadFullCloudExport
} from "./fullCloudExport";

const adminProfile: UserProfile = {
  active: true,
  displayName: "Admin",
  email: "admin@example.test",
  offlineConsent: false,
  registrationStatus: "APPROVED",
  role: "ADMIN",
  uid: "admin-1",
  workerId: null
};

const operatorProfile: UserProfile = {
  ...adminProfile,
  displayName: "Operator",
  email: "operator@example.test",
  role: "OPERATOR",
  uid: "operator-1"
};

describe("export mechanism boundaries", () => {
  it("keeps local device recovery distinct from the full cloud archive", async () => {
    const exportedAtIso = "2026-08-04T22:00:00.000Z";
    const deviceExport = createEmergencyLocalExportPayload({
      device: { id: "device-1", name: "Telefon operatora", platform: "Android" },
      exportedAtIso,
      model: buildSyncCenterModel([]),
      user: operatorProfile
    });
    const cloudExport = await createFullCloudExportArchive({
      actorProfile: adminProfile,
      appEnvironment: "development",
      collections: FULL_CLOUD_EXPORT_COLLECTIONS.map((name) => ({
        documents: [],
        name
      })),
      exportedAtIso,
      firebaseProjectId: "borowka-dev"
    });

    expect(deviceExport.format.name).toBe("BOROWKA_EMERGENCY_LOCAL_EXPORT");
    expect(deviceExport.format.purpose).toBe("EMERGENCY_RECOVERY");
    expect(deviceExport.format.dataScope).toBe("CURRENT_DEVICE_LOCAL_PENDING_DATA");
    expect(deviceExport.format.source).toBe("LOCAL_DEVICE_STORAGE");
    expect(deviceExport.format.automaticProductionImportAllowed).toBe(false);
    expect(createEmergencyLocalExportFilename(exportedAtIso)).toMatch(/\.json$/);

    expect(cloudExport.manifest.format.name).toBe("BOROWKA_FULL_CLOUD_EXPORT");
    expect(cloudExport.manifest.format.purpose).toBe("PORTABLE_ARCHIVE");
    expect(cloudExport.manifest.format.dataScope).toBe("ALL_FIRESTORE_COLLECTIONS");
    expect(cloudExport.manifest.format.source).toBe("FIRESTORE_SERVER");
    expect(cloudExport.filename).toMatch(/\.zip$/);

    expect(deviceExport.format.name).not.toBe(cloudExport.manifest.format.name);
    expect(deviceExport.format.dataScope).not.toBe(cloudExport.manifest.format.dataScope);
  });

  it("requires an online administrator only for the cloud mechanism", async () => {
    expect(() =>
      createEmergencyLocalExportPayload({
        device: { id: "device-1", name: "Telefon operatora", platform: null },
        exportedAtIso: "2026-08-04T22:00:00.000Z",
        model: buildSyncCenterModel([]),
        user: operatorProfile
      })
    ).not.toThrow();

    await expect(
      loadFullCloudExport(
        { VITE_FIREBASE_PROJECT_ID: "borowka-dev" },
        { actorProfile: adminProfile, isOnline: false }
      )
    ).rejects.toThrow("polaczenia z serwerem");
    await expect(
      loadFullCloudExport(
        { VITE_FIREBASE_PROJECT_ID: "borowka-dev" },
        { actorProfile: operatorProfile, isOnline: true }
      )
    ).rejects.toThrow("administratora");
  });
});
