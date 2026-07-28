import { getFirebaseServices } from "../config/firebaseServices";

type FirebaseEnv = Record<string, string | boolean | undefined>;
type NavigatorLike = {
  userAgent?: string;
  userAgentData?: {
    platform?: string;
  };
};

export const DEVICES_COLLECTION = "devices";

export type DeviceRecord = {
  id: string;
  userUid: string;
  deviceName: string;
  platform: string | null;
  trustedOfflineStorage: boolean;
  firstSeenAt: unknown;
  lastSeenAt: unknown;
  lastSuccessfulSyncAt: unknown;
  active: boolean;
};

export type RegisterCurrentDeviceInput = {
  deviceId: string;
  userUid: string;
  deviceName?: string | null;
  platform?: string | null;
  trustedOfflineStorage: boolean;
};

export type CreateDeviceRecordDraftInput = RegisterCurrentDeviceInput & {
  firstSeenAt: unknown;
  lastSeenAt: unknown;
  lastSuccessfulSyncAt?: unknown;
};

export async function registerCurrentDevice(
  env: FirebaseEnv,
  input: RegisterCurrentDeviceInput
): Promise<void> {
  const { firestore } = await getFirebaseServices(env);
  const { doc, getDoc, serverTimestamp, setDoc, updateDoc } =
    await import("firebase/firestore");
  const deviceRef = doc(
    firestore,
    DEVICES_COLLECTION,
    normalizeRequiredText(input.deviceId)
  );
  const snapshot = await getDoc(deviceRef);
  const lastSeenAt = serverTimestamp();

  if (!snapshot.exists()) {
    await setDoc(
      deviceRef,
      createDeviceRecordDraft({
        ...input,
        firstSeenAt: lastSeenAt,
        lastSeenAt
      })
    );
    return;
  }

  await updateDoc(deviceRef, {
    deviceName: normalizeOptionalText(input.deviceName) ?? createDefaultDeviceName(),
    platform: normalizeOptionalText(input.platform),
    trustedOfflineStorage: input.trustedOfflineStorage,
    lastSeenAt
  });
}

export function createDeviceRecordDraft(
  input: CreateDeviceRecordDraftInput
): DeviceRecord {
  return {
    id: normalizeRequiredText(input.deviceId),
    userUid: normalizeRequiredText(input.userUid),
    deviceName: normalizeOptionalText(input.deviceName) ?? createDefaultDeviceName(),
    platform: normalizeOptionalText(input.platform),
    trustedOfflineStorage: input.trustedOfflineStorage,
    firstSeenAt: input.firstSeenAt,
    lastSeenAt: input.lastSeenAt,
    lastSuccessfulSyncAt: input.lastSuccessfulSyncAt ?? null,
    active: true
  };
}

export function createDefaultDeviceName(
  navigatorLike: NavigatorLike = navigator
): string {
  const platform = normalizeOptionalText(navigatorLike.userAgentData?.platform);

  if (platform) {
    return `Urzadzenie ${platform}`;
  }

  const userAgent = normalizeOptionalText(navigatorLike.userAgent);

  if (userAgent) {
    return `Urzadzenie ${userAgent.slice(0, 32)}`;
  }

  return "Urzadzenie PWA";
}

export function readDevicePlatform(
  navigatorLike: NavigatorLike = navigator
): string | null {
  return (
    normalizeOptionalText(navigatorLike.userAgentData?.platform) ??
    normalizeOptionalText(navigatorLike.userAgent)
  );
}

function normalizeRequiredText(value: string): string {
  const trimmed = value.trim();

  if (!trimmed) {
    throw new Error("Identyfikator urzadzenia jest wymagany.");
  }

  return trimmed;
}

function normalizeOptionalText(value: string | null | undefined): string | null {
  if (value === null || value === undefined) {
    return null;
  }

  const trimmed = value.trim();

  return trimmed.length > 0 ? trimmed : null;
}
