import { getFirebaseServices } from "../config/firebaseServices";
import { DEVICES_COLLECTION } from "../devices/deviceRegistry";
import {
  APP_SETTINGS_COLLECTION,
  DOMAIN_SETTINGS_DOCUMENT_ID,
  SEASONS_COLLECTION,
  WORKERS_COLLECTION
} from "../domain/domainConfiguration";
import type { UserProfile } from "../domain/identity";
import {
  HARVEST_ENTRIES_COLLECTION,
  HARVEST_SESSIONS_COLLECTION
} from "../harvest/harvestSessionState";
import { ISSUE_REPORTS_COLLECTION } from "../issues/issueReports";
import {
  writeFirestorePersistencePreference,
  type FirestoreCacheMode
} from "../offline/firestorePersistencePreference";
import { PAYMENTS_COLLECTION } from "../payments/pendingPayments";
import { paymentTimestampToIso } from "../payments/paymentWrite";

type FirebaseEnv = Record<string, string | boolean | undefined>;

export type PickerOfflineDataInput = {
  actorProfile: UserProfile;
  cacheMode: FirestoreCacheMode;
  deviceId: string;
  isOnline: boolean;
};

export type PickerOfflineDataStatusCode =
  | "READY"
  | "NOT_PREPARED"
  | "CONSENT_REQUIRED"
  | "PERSISTENT_CACHE_REQUIRED"
  | "UNTRUSTED_DEVICE";

export type PickerOfflineDataStatus = {
  code: PickerOfflineDataStatusCode;
  dataSource: "SERVER" | "CACHE" | "LOCAL_POLICY";
  lastSuccessfulSyncIso: string | null;
};

export type PickerOfflinePreparationResult = PickerOfflineDataStatus & {
  code: "READY";
  counts: {
    entries: number;
    issueReports: number;
    payments: number;
    seasons: number;
    sessions: number;
  };
};

type DeviceProjection = {
  active: boolean;
  lastSuccessfulSyncAt: unknown;
  trustedOfflineStorage: boolean;
  userUid: string;
};

export async function readPickerOfflineDataStatus(
  env: FirebaseEnv,
  input: PickerOfflineDataInput
): Promise<PickerOfflineDataStatus> {
  assertPicker(input.actorProfile);
  const policyStatus = evaluatePickerOfflinePolicy(input);

  if (policyStatus) {
    return policyStatus;
  }

  const deviceId = normalizeId(input.deviceId);
  const { firestore } = await getFirebaseServices(env);
  const { doc, getDoc, getDocFromCache } = await import("firebase/firestore");
  const readDocument = input.isOnline ? getDoc : getDocFromCache;

  try {
    const snapshot = await readDocument(doc(firestore, DEVICES_COLLECTION, deviceId));

    if (!snapshot.exists()) {
      return notPrepared(input.isOnline);
    }

    const device = decodeOwnDevice(
      input.actorProfile.uid,
      snapshot.data({ serverTimestamps: "estimate" })
    );

    if (!device.active || !device.trustedOfflineStorage) {
      return {
        code: "UNTRUSTED_DEVICE",
        dataSource: snapshot.metadata.fromCache ? "CACHE" : "SERVER",
        lastSuccessfulSyncIso: null
      };
    }

    const lastSuccessfulSyncIso = paymentTimestampToIso(device.lastSuccessfulSyncAt);

    return {
      code: lastSuccessfulSyncIso ? "READY" : "NOT_PREPARED",
      dataSource: snapshot.metadata.fromCache ? "CACHE" : "SERVER",
      lastSuccessfulSyncIso
    };
  } catch (error: unknown) {
    if (!input.isOnline && isCacheMiss(error)) {
      return notPrepared(false);
    }

    throw error;
  }
}

export async function preparePickerOfflineData(
  env: FirebaseEnv,
  input: PickerOfflineDataInput
): Promise<PickerOfflinePreparationResult> {
  const workerId = assertPicker(input.actorProfile);
  const policyStatus = evaluatePickerOfflinePolicy(input);

  if (policyStatus) {
    throw new Error(policyErrorMessage(policyStatus.code));
  }

  if (!input.isOnline) {
    throw new Error("Przygotowanie danych offline wymaga polaczenia.");
  }

  const deviceId = normalizeId(input.deviceId);
  const { firestore } = await getFirebaseServices(env);
  const {
    collection,
    doc,
    getDocFromServer,
    getDocsFromServer,
    orderBy,
    query,
    serverTimestamp,
    updateDoc,
    where
  } = await import("firebase/firestore");
  const deviceReference = doc(firestore, DEVICES_COLLECTION, deviceId);
  const deviceSnapshot = await getDocFromServer(deviceReference);

  if (!deviceSnapshot.exists()) {
    throw new Error("Najpierw zarejestruj to urzadzenie online.");
  }

  const device = decodeOwnDevice(
    input.actorProfile.uid,
    deviceSnapshot.data({ serverTimestamps: "estimate" })
  );

  if (!device.active || !device.trustedOfflineStorage) {
    throw new Error("To urzadzenie nie ma aktywnej zgody na dane offline.");
  }

  const [
    profileSnapshot,
    workerSnapshot,
    settingsSnapshot,
    seasonSnapshot,
    sessionSnapshot,
    entrySnapshot,
    paymentSnapshot,
    issueReportSnapshot
  ] = await Promise.all([
    getDocFromServer(doc(firestore, "users", input.actorProfile.uid)),
    getDocFromServer(doc(firestore, WORKERS_COLLECTION, workerId)),
    getDocFromServer(
      doc(firestore, APP_SETTINGS_COLLECTION, DOMAIN_SETTINGS_DOCUMENT_ID)
    ),
    getDocsFromServer(collection(firestore, SEASONS_COLLECTION)),
    getDocsFromServer(
      query(
        collection(firestore, HARVEST_SESSIONS_COLLECTION),
        where("workerId", "==", workerId),
        orderBy("businessDate", "desc"),
        orderBy("createdAtServer", "desc")
      )
    ),
    getDocsFromServer(
      query(
        collection(firestore, HARVEST_ENTRIES_COLLECTION),
        where("workerId", "==", workerId)
      )
    ),
    getDocsFromServer(
      query(
        collection(firestore, PAYMENTS_COLLECTION),
        where("workerId", "==", workerId),
        orderBy("paidBusinessDate", "desc")
      )
    ),
    getDocsFromServer(
      query(
        collection(firestore, ISSUE_REPORTS_COLLECTION),
        where("workerId", "==", workerId),
        orderBy("createdAt", "desc")
      )
    )
  ]);

  if (
    !profileSnapshot.exists() ||
    !workerSnapshot.exists() ||
    !settingsSnapshot.exists()
  ) {
    throw new Error("Nie mozna przygotowac niepelnych danych profilu pickera.");
  }

  await updateDoc(deviceReference, {
    lastSeenAt: serverTimestamp(),
    lastSuccessfulSyncAt: serverTimestamp()
  });

  const updatedDeviceSnapshot = await getDocFromServer(deviceReference);
  const updatedDevice = decodeOwnDevice(
    input.actorProfile.uid,
    updatedDeviceSnapshot.data({ serverTimestamps: "estimate" })
  );
  const lastSuccessfulSyncIso = paymentTimestampToIso(updatedDevice.lastSuccessfulSyncAt);

  if (!lastSuccessfulSyncIso) {
    throw new Error("Serwer nie potwierdzil czasu przygotowania danych offline.");
  }

  return {
    code: "READY",
    counts: {
      entries: entrySnapshot.size,
      issueReports: issueReportSnapshot.size,
      payments: paymentSnapshot.size,
      seasons: seasonSnapshot.size,
      sessions: sessionSnapshot.size
    },
    dataSource: "SERVER",
    lastSuccessfulSyncIso
  };
}

export function evaluatePickerOfflinePolicy(
  input: Pick<PickerOfflineDataInput, "actorProfile" | "cacheMode">
): PickerOfflineDataStatus | null {
  if (!input.actorProfile.offlineConsent) {
    return {
      code: "CONSENT_REQUIRED",
      dataSource: "LOCAL_POLICY",
      lastSuccessfulSyncIso: null
    };
  }

  if (input.cacheMode !== "PERSISTENT") {
    return {
      code: "PERSISTENT_CACHE_REQUIRED",
      dataSource: "LOCAL_POLICY",
      lastSuccessfulSyncIso: null
    };
  }

  return null;
}

export function enablePickerPersistentCache(profile: UserProfile): void {
  assertPicker(profile);

  if (!profile.offlineConsent) {
    throw new Error("Wlaczenie trwalego cache wymaga zgody na dane offline.");
  }

  writeFirestorePersistencePreference(true);
}

function decodeOwnDevice(expectedUid: string, data: unknown): DeviceProjection {
  if (
    !isRecord(data) ||
    data.userUid !== expectedUid ||
    typeof data.active !== "boolean" ||
    typeof data.trustedOfflineStorage !== "boolean"
  ) {
    throw new Error("Dokument urzadzenia nie nalezy do aktywnego konta.");
  }

  return {
    active: data.active,
    lastSuccessfulSyncAt: data.lastSuccessfulSyncAt,
    trustedOfflineStorage: data.trustedOfflineStorage,
    userUid: data.userUid
  };
}

function assertPicker(profile: UserProfile): string {
  if (
    profile.role !== "PICKER" ||
    !profile.active ||
    profile.registrationStatus !== "APPROVED" ||
    !profile.workerId
  ) {
    throw new Error("Dane offline wymagaja aktywnego profilu pickera.");
  }

  return profile.workerId;
}

function normalizeId(value: string): string {
  const normalized = value.trim();

  if (!normalized || normalized.length > 200 || normalized.includes("/")) {
    throw new Error("Nieprawidlowy identyfikator urzadzenia.");
  }

  return normalized;
}

function notPrepared(isOnline: boolean): PickerOfflineDataStatus {
  return {
    code: "NOT_PREPARED",
    dataSource: isOnline ? "SERVER" : "CACHE",
    lastSuccessfulSyncIso: null
  };
}

function policyErrorMessage(code: PickerOfflineDataStatusCode): string {
  switch (code) {
    case "CONSENT_REQUIRED":
      return "Najpierw wlacz zgode na dane offline na zaufanym urzadzeniu.";
    case "PERSISTENT_CACHE_REQUIRED":
      return "Uruchom ponownie PWA po wlaczeniu trwalego cache.";
    case "UNTRUSTED_DEVICE":
      return "To urzadzenie nie jest zaufane do przechowywania danych offline.";
    case "NOT_PREPARED":
      return "Dane offline nie zostaly przygotowane.";
    case "READY":
      return "Dane offline sa juz przygotowane.";
  }
}

function isCacheMiss(error: unknown): boolean {
  return (
    isRecord(error) &&
    typeof error.code === "string" &&
    (error.code === "unavailable" || error.code === "failed-precondition")
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
