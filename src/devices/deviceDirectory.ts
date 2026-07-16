import { getFirebaseServices } from "../config/firebaseServices";
import { DEVICES_COLLECTION, type DeviceRecord } from "./deviceRegistry";

type FirebaseEnv = Record<string, string | boolean | undefined>;

export type InvalidDeviceRecord = {
  id: string;
  reason: string;
};

export type DeviceDirectoryResult = {
  devices: DeviceRecord[];
  invalidDevices: InvalidDeviceRecord[];
};

type DeviceDecodeResult =
  | {
      status: "FOUND";
      device: DeviceRecord;
    }
  | {
      status: "INVALID";
      reason: string;
    };

export async function listDeviceDirectory(
  env: FirebaseEnv
): Promise<DeviceDirectoryResult> {
  const { firestore } = await getFirebaseServices(env);
  const { collection, getDocs } = await import("firebase/firestore/lite");
  const snapshot = await getDocs(collection(firestore, DEVICES_COLLECTION));
  const devices: DeviceRecord[] = [];
  const invalidDevices: InvalidDeviceRecord[] = [];

  for (const documentSnapshot of snapshot.docs) {
    const decoded = decodeDeviceRecord(documentSnapshot.id, documentSnapshot.data());

    if (decoded.status === "FOUND") {
      devices.push(decoded.device);
    } else {
      invalidDevices.push({
        id: documentSnapshot.id,
        reason: decoded.reason
      });
    }
  }

  return {
    devices: sortDevices(devices),
    invalidDevices
  };
}

export function decodeDeviceRecord(
  expectedId: string,
  data: unknown
): DeviceDecodeResult {
  if (!isRecord(data)) {
    return invalidDevice("Urzadzenie ma nieprawidlowy format.");
  }

  const id = readRequiredString(data, "id");
  const userUid = readRequiredString(data, "userUid");
  const deviceName = readRequiredString(data, "deviceName");
  const platform = data.platform;
  const trustedOfflineStorage = data.trustedOfflineStorage;
  const active = data.active;

  if (!id || id !== expectedId) {
    return invalidDevice("Urzadzenie ma niezgodny identyfikator.");
  }

  if (!userUid || !deviceName) {
    return invalidDevice("Urzadzenie nie ma wymaganych danych.");
  }

  if (platform !== null && platform !== undefined && typeof platform !== "string") {
    return invalidDevice("Urzadzenie ma nieprawidlowa platforme.");
  }

  if (typeof trustedOfflineStorage !== "boolean") {
    return invalidDevice("Urzadzenie ma nieprawidlowa zgode offline.");
  }

  if (typeof active !== "boolean") {
    return invalidDevice("Urzadzenie ma nieprawidlowy status aktywnosci.");
  }

  return {
    status: "FOUND",
    device: {
      id,
      userUid,
      deviceName,
      platform: platform ?? null,
      trustedOfflineStorage,
      firstSeenAt: data.firstSeenAt,
      lastSeenAt: data.lastSeenAt,
      lastSuccessfulSyncAt: data.lastSuccessfulSyncAt ?? null,
      active
    }
  };
}

export function sortDevices(devices: DeviceRecord[]): DeviceRecord[] {
  return [...devices].sort((left, right) => {
    if (left.active !== right.active) {
      return left.active ? -1 : 1;
    }

    return left.deviceName.localeCompare(right.deviceName, "pl");
  });
}

function invalidDevice(reason: string): DeviceDecodeResult {
  return {
    status: "INVALID",
    reason
  };
}

function readRequiredString(data: Record<string, unknown>, key: string): string | null {
  const value = data[key];

  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();

  return trimmed.length > 0 ? trimmed : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
