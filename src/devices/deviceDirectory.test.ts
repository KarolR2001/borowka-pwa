import type { DeviceRecord } from "./deviceRegistry";
import { decodeDeviceRecord, sortDevices } from "./deviceDirectory";

const device = ({
  id,
  ...overrides
}: Partial<DeviceRecord> & { id: string }): DeviceRecord => ({
  id,
  userUid: "user-1",
  deviceName: id,
  platform: "Linux",
  trustedOfflineStorage: false,
  firstSeenAt: "first",
  lastSeenAt: "last",
  lastSuccessfulSyncAt: null,
  active: true,
  ...overrides
});

describe("device directory", () => {
  it("decodes valid device records", () => {
    expect(
      decodeDeviceRecord(
        "device-1",
        device({
          id: "device-1",
          deviceName: "Telefon"
        })
      )
    ).toMatchObject({
      status: "FOUND",
      device: {
        id: "device-1",
        deviceName: "Telefon"
      }
    });
  });

  it("rejects malformed device records", () => {
    expect(
      decodeDeviceRecord("device-1", {
        ...device({ id: "device-2" })
      })
    ).toEqual({
      status: "INVALID",
      reason: "Urzadzenie ma niezgodny identyfikator."
    });

    expect(
      decodeDeviceRecord("device-1", {
        ...device({ id: "device-1" }),
        active: "yes"
      })
    ).toEqual({
      status: "INVALID",
      reason: "Urzadzenie ma nieprawidlowy status aktywnosci."
    });
  });

  it("sorts active devices before inactive devices by name", () => {
    expect(
      sortDevices([
        device({
          id: "inactive",
          deviceName: "A",
          active: false
        }),
        device({
          id: "active-b",
          deviceName: "B"
        }),
        device({
          id: "active-a",
          deviceName: "A"
        })
      ]).map((item) => item.id)
    ).toEqual(["active-a", "active-b", "inactive"]);
  });
});
