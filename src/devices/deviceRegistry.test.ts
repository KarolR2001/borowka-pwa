import {
  createDefaultDeviceName,
  createDeviceRecordDraft,
  readDevicePlatform
} from "./deviceRegistry";

const navigatorLike = {
  userAgentData: {
    platform: "Linux x86_64"
  },
  userAgent: "Mozilla/5.0 Test Browser"
};

describe("device registry", () => {
  it("creates a normalized device record draft", () => {
    expect(
      createDeviceRecordDraft({
        deviceId: " device-1 ",
        userUid: " user-1 ",
        deviceName: " Telefon Karola ",
        platform: " Android ",
        trustedOfflineStorage: true,
        firstSeenAt: "first",
        lastSeenAt: "last"
      })
    ).toEqual({
      id: "device-1",
      userUid: "user-1",
      deviceName: "Telefon Karola",
      platform: "Android",
      trustedOfflineStorage: true,
      firstSeenAt: "first",
      lastSeenAt: "last",
      lastSuccessfulSyncAt: null,
      active: true
    });
  });

  it("uses a default device name and platform from navigator data", () => {
    expect(createDefaultDeviceName(navigatorLike)).toBe("Urzadzenie Linux x86_64");
    expect(readDevicePlatform(navigatorLike)).toBe("Linux x86_64");
  });

  it("rejects empty device identifiers", () => {
    expect(() =>
      createDeviceRecordDraft({
        deviceId: " ",
        userUid: "user-1",
        trustedOfflineStorage: false,
        firstSeenAt: "first",
        lastSeenAt: "last"
      })
    ).toThrow("Identyfikator urzadzenia jest wymagany.");
  });
});
