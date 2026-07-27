import { getOrCreateDeviceId } from "../domain/device";
import { createDefaultDeviceName, readDevicePlatform } from "./deviceRegistry";

type NavigatorLike = Parameters<typeof createDefaultDeviceName>[0];

export type DeviceIdentity = {
  id: string;
  name: string;
  platform: string | null;
};

export function readCurrentDeviceIdentity({
  navigatorLike,
  storage
}: {
  navigatorLike?: NavigatorLike;
  storage?: Storage;
} = {}): DeviceIdentity {
  const resolvedNavigator = navigatorLike ?? navigator;

  return {
    id: getOrCreateDeviceId(storage),
    name: createDefaultDeviceName(resolvedNavigator),
    platform: readDevicePlatform(resolvedNavigator)
  };
}
