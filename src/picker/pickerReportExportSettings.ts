import { getFirebaseServices } from "../config/firebaseServices";
import {
  APP_SETTINGS_COLLECTION,
  CALCULATION_RULE_VERSION,
  DOMAIN_SCHEMA_VERSION,
  DOMAIN_SETTINGS_DOCUMENT_ID,
  SEASONS_COLLECTION
} from "../domain/domainConfiguration";
import type { UserProfile } from "../domain/identity";
import { paymentTimestampToIso } from "../payments/paymentWrite";

type FirebaseEnv = Record<string, string | boolean | undefined>;

export type PickerReportExportSetting = {
  dataSource: "SERVER" | "CACHE";
  enabled: boolean;
  updatedAtIso: string;
};

export type UpdatePickerReportExportSettingInput = {
  actorProfile: UserProfile;
  enabled: boolean;
};

export async function readPickerReportExportSetting(
  env: FirebaseEnv,
  input: { actorProfile: UserProfile; isOnline: boolean }
): Promise<PickerReportExportSetting> {
  assertAllowedReader(input.actorProfile);
  const { firestore } = await getFirebaseServices(env);
  const { doc, getDocFromCache, getDocFromServer } = await import("firebase/firestore");
  const snapshot = await (input.isOnline ? getDocFromServer : getDocFromCache)(
    doc(firestore, APP_SETTINGS_COLLECTION, DOMAIN_SETTINGS_DOCUMENT_ID)
  );

  if (!snapshot.exists()) {
    return {
      dataSource: "SERVER",
      enabled: false,
      updatedAtIso: new Date().toISOString()
    };
  }

  const data = snapshot.data({ serverTimestamps: "estimate" });
  const decoded = decodePickerReportExportSetting(
    isRecord(data) && data.pickerOwnReportExportEnabled === undefined
      ? { ...data, pickerOwnReportExportEnabled: false }
      : data
  );

  return {
    ...decoded,
    dataSource: snapshot.metadata.fromCache ? "CACHE" : "SERVER"
  };
}

export async function updatePickerReportExportSetting(
  env: FirebaseEnv,
  input: UpdatePickerReportExportSettingInput
): Promise<void> {
  assertAdmin(input.actorProfile);
  const { firestore } = await getFirebaseServices(env);
  const {
    collection,
    doc,
    getDocsFromServer,
    getDocFromServer,
    limit,
    query,
    serverTimestamp,
    setDoc,
    updateDoc,
    where
  } = await import("firebase/firestore");
  const reference = doc(firestore, APP_SETTINGS_COLLECTION, DOMAIN_SETTINGS_DOCUMENT_ID);
  const snapshot = await getDocFromServer(reference);

  if (!snapshot.exists()) {
    const defaultSeasonSnapshot = await getDocsFromServer(
      query(
        collection(firestore, SEASONS_COLLECTION),
        where("isDefault", "==", true),
        limit(1)
      )
    );
    const defaultSeasonId = defaultSeasonSnapshot.docs[0]?.id;

    if (!defaultSeasonId) {
      throw new Error("Ustaw aktywny sezon domyślny przed zapisaniem eksportu.");
    }

    const timestamp = serverTimestamp();
    await setDoc(reference, {
      id: DOMAIN_SETTINGS_DOCUMENT_ID,
      schemaVersion: DOMAIN_SCHEMA_VERSION,
      calculationRuleVersion: CALCULATION_RULE_VERSION,
      defaultSeasonId,
      pickerOwnReportExportEnabled: input.enabled,
      initializedAt: timestamp,
      initializedBy: input.actorProfile.uid,
      updatedAt: timestamp
    });
    return;
  }

  await updateDoc(reference, {
    pickerOwnReportExportEnabled: input.enabled,
    updatedAt: serverTimestamp()
  });
}

export function decodePickerReportExportSetting(
  data: unknown
): Omit<PickerReportExportSetting, "dataSource"> {
  if (!isRecord(data) || data.id !== DOMAIN_SETTINGS_DOCUMENT_ID) {
    throw new Error("Ustawienia eksportu maja nieprawidlowy identyfikator.");
  }

  if (typeof data.pickerOwnReportExportEnabled !== "boolean") {
    throw new Error("Ustawienia eksportu maja nieprawidlowa flage.");
  }

  const updatedAtIso = paymentTimestampToIso(data.updatedAt);

  if (!updatedAtIso) {
    throw new Error("Ustawienia eksportu maja nieprawidlowy czas aktualizacji.");
  }

  return {
    enabled: data.pickerOwnReportExportEnabled,
    updatedAtIso
  };
}

function assertAllowedReader(profile: UserProfile): void {
  if (
    !profile.active ||
    profile.registrationStatus !== "APPROVED" ||
    (profile.role !== "ADMIN" && profile.role !== "PICKER")
  ) {
    throw new Error("Ustawienia eksportu wymagaja aktywnego administratora lub pickera.");
  }
}

function assertAdmin(profile: UserProfile): void {
  if (
    !profile.active ||
    profile.registrationStatus !== "APPROVED" ||
    profile.role !== "ADMIN"
  ) {
    throw new Error("Zmiana ustawien eksportu wymaga aktywnego administratora.");
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
