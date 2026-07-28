import { getFirebaseServices } from "../config/firebaseServices";
import {
  createDefaultDeviceName,
  createDeviceRecordDraft
} from "../devices/deviceRegistry";
import { writeFirestorePersistencePreference } from "./firestorePersistencePreference";

type FirebaseEnv = Record<string, string | boolean | undefined>;

export const TRUSTED_OFFLINE_STORAGE_DISCLOSURE = [
  "Dane moga pozostac na tym urzadzeniu po zamknieciu aplikacji.",
  "Wlacz zgode tylko na prywatnym albo zaufanym urzadzeniu.",
  "Wyczyszczenie danych przegladarki moze usunac niezsynchronizowane rekordy.",
  "Tryb prywatny przegladarki nie nadaje sie do pracy terenowej.",
  "Przed wylogowaniem zsynchronizuj oczekujace dane.",
  "Wyloguj i wyczysc urzadzenie wymaga braku oczekujacych zapisow oraz dodatkowego potwierdzenia."
] as const;

export type TrustedOfflineConsentUpdateInput = {
  uid: string;
  offlineConsent: boolean;
  deviceId: string;
  deviceName?: string | null;
  platform?: string | null;
};

export async function updateTrustedOfflineConsent(
  env: FirebaseEnv,
  input: TrustedOfflineConsentUpdateInput
): Promise<void> {
  const { firestore } = await getFirebaseServices(env);
  const { doc, getDoc, serverTimestamp, writeBatch } = await import("firebase/firestore");
  const uid = normalizeRequiredText(
    input.uid,
    "Identyfikator uzytkownika jest wymagany."
  );
  const deviceId = normalizeRequiredText(
    input.deviceId,
    "Identyfikator urzadzenia jest wymagany."
  );
  const deviceName = normalizeOptionalText(input.deviceName) ?? createDefaultDeviceName();
  const platform = normalizeOptionalText(input.platform);
  const userRef = doc(firestore, "users", uid);
  const deviceRef = doc(firestore, "devices", deviceId);
  const deviceSnapshot = await getDoc(deviceRef);
  const timestamp = serverTimestamp();
  const batch = writeBatch(firestore);

  batch.update(userRef, {
    offlineConsent: input.offlineConsent
  });

  if (deviceSnapshot.exists()) {
    batch.update(deviceRef, {
      deviceName,
      platform,
      trustedOfflineStorage: input.offlineConsent,
      lastSeenAt: timestamp
    });
  } else {
    batch.set(
      deviceRef,
      createDeviceRecordDraft({
        deviceId,
        userUid: uid,
        deviceName,
        platform,
        trustedOfflineStorage: input.offlineConsent,
        firstSeenAt: timestamp,
        lastSeenAt: timestamp
      })
    );
  }

  await batch.commit();
  writeFirestorePersistencePreference(input.offlineConsent);
}

function normalizeRequiredText(value: string, message: string): string {
  const trimmed = value.trim();

  if (!trimmed) {
    throw new Error(message);
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
