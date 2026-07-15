const DEVICE_ID_KEY = "borowka.deviceId";

export function getOrCreateDeviceId(storage: Storage = globalThis.localStorage): string {
  const existingDeviceId = readDeviceId(storage);

  if (existingDeviceId) {
    return existingDeviceId;
  }

  const deviceId = createDeviceId();

  try {
    storage.setItem(DEVICE_ID_KEY, deviceId);
  } catch {
    return "storage-unavailable";
  }

  return deviceId;
}

function readDeviceId(storage: Storage): string | undefined {
  try {
    const value = storage.getItem(DEVICE_ID_KEY) ?? undefined;
    return value && value.trim().length > 0 ? value : undefined;
  } catch {
    return undefined;
  }
}

function createDeviceId(): string {
  if (typeof globalThis.crypto.randomUUID === "function") {
    return globalThis.crypto.randomUUID();
  }

  const randomPart = Math.random().toString(36).slice(2, 12);
  return `device-${Date.now().toString(36)}-${randomPart}`;
}
