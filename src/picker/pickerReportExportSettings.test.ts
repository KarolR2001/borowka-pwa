import type { UserProfile } from "../domain/identity";
import {
  decodePickerReportExportSetting,
  readPickerReportExportSetting,
  updatePickerReportExportSetting
} from "./pickerReportExportSettings";

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

describe("picker report export settings", () => {
  it("decodes the existing domain setting", () => {
    expect(
      decodePickerReportExportSetting({
        id: "domain",
        pickerOwnReportExportEnabled: true,
        updatedAt: "2026-07-28T18:00:00.000Z"
      })
    ).toEqual({
      enabled: true,
      updatedAtIso: "2026-07-28T18:00:00.000Z"
    });
  });

  it("rejects invalid settings before exposing the feature", () => {
    expect(() =>
      decodePickerReportExportSetting({
        id: "domain",
        pickerOwnReportExportEnabled: "yes",
        updatedAt: "2026-07-28T18:00:00.000Z"
      })
    ).toThrow("flage");
  });

  it("rejects unauthorized roles before reading Firebase", async () => {
    await expect(
      readPickerReportExportSetting(
        {},
        {
          actorProfile: { ...pickerProfile, role: "OPERATOR", workerId: null },
          isOnline: true
        }
      )
    ).rejects.toThrow("administratora lub pickera");
    await expect(
      updatePickerReportExportSetting(
        {},
        {
          actorProfile: pickerProfile,
          enabled: true
        }
      )
    ).rejects.toThrow("administratora");
  });
});
