import type { FirebaseApp } from "firebase/app";
import type { Auth } from "firebase/auth";
import type { Firestore } from "firebase/firestore";

import {
  readFirestoreCacheMode,
  type FirestoreCacheMode
} from "../offline/firestorePersistencePreference";
import {
  getFirebaseClientConfig,
  getFirebaseClientConfigStatus
} from "./firebaseClientConfig";
import { getFirebaseRuntimeStatus, type FirebaseRuntimeMode } from "./firebaseRuntime";

type FirebaseEnv = Record<string, string | boolean | undefined>;

export type FirebaseServices = {
  app: FirebaseApp;
  auth: Auth;
  firestore: Firestore;
};

export type FirebaseServicesStatus = {
  cacheMode: FirestoreCacheMode;
  ready: boolean;
  initialized: boolean;
  mode: FirebaseRuntimeMode;
  message: string;
  warnings: string[];
};

const emulatorConnections = new Set<string>();
const firestoreInstances = new Map<string, Firestore>();

export function getFirebaseServicesStatus(env: FirebaseEnv): FirebaseServicesStatus {
  const clientStatus = getFirebaseClientConfigStatus(env);
  const runtimeStatus = getFirebaseRuntimeStatus(env);
  const cacheMode = readFirestoreCacheMode();

  if (!clientStatus.ready) {
    return {
      cacheMode,
      ready: false,
      initialized: false,
      mode: runtimeStatus.mode,
      message: clientStatus.message,
      warnings: runtimeStatus.warnings
    };
  }

  return {
    cacheMode,
    ready: runtimeStatus.warnings.length === 0,
    initialized: false,
    mode: runtimeStatus.mode,
    message:
      runtimeStatus.warnings.length === 0
        ? "Uslugi Firebase moga zostac uruchomione."
        : runtimeStatus.warnings.join("; "),
    warnings: runtimeStatus.warnings
  };
}

export async function initializeFirebaseServicesIfReady(
  env: FirebaseEnv
): Promise<FirebaseServicesStatus> {
  const status = getFirebaseServicesStatus(env);

  if (!status.ready) {
    return status;
  }

  await getFirebaseServices(env);

  return {
    ...status,
    initialized: true,
    message: "Uslugi Firebase sa uruchomione."
  };
}

export async function getFirebaseServices(env: FirebaseEnv): Promise<FirebaseServices> {
  const config = getFirebaseClientConfig(env);
  const runtimeStatus = getFirebaseRuntimeStatus(env);
  const [{ getApps, initializeApp }, { connectAuthEmulator, getAuth }, firestoreSdk] =
    await Promise.all([
      import("firebase/app"),
      import("firebase/auth"),
      import("firebase/firestore")
    ]);
  const {
    connectFirestoreEmulator,
    initializeFirestore,
    memoryLocalCache,
    persistentLocalCache,
    persistentMultipleTabManager
  } = firestoreSdk;
  const app = getApps()[0] ?? initializeApp(config);
  const auth = getAuth(app);
  const cacheMode = readFirestoreCacheMode();
  let firestore = firestoreInstances.get(app.name);

  if (!firestore) {
    firestore = initializeFirestore(app, {
      localCache:
        cacheMode === "PERSISTENT"
          ? persistentLocalCache({
              tabManager: persistentMultipleTabManager()
            })
          : memoryLocalCache()
    });
    firestoreInstances.set(app.name, firestore);
  }

  if (runtimeStatus.useEmulators) {
    const connectionKey = [
      app.name,
      runtimeStatus.emulatorHost,
      runtimeStatus.authEmulatorPort,
      runtimeStatus.firestoreEmulatorPort
    ].join(":");

    if (!emulatorConnections.has(connectionKey)) {
      connectAuthEmulator(
        auth,
        `http://${runtimeStatus.emulatorHost}:${String(runtimeStatus.authEmulatorPort)}`,
        { disableWarnings: true }
      );
      connectFirestoreEmulator(
        firestore,
        runtimeStatus.emulatorHost,
        runtimeStatus.firestoreEmulatorPort
      );
      emulatorConnections.add(connectionKey);
    }
  }

  return {
    app,
    auth,
    firestore
  };
}

export async function clearFirestoreLocalData(env: FirebaseEnv): Promise<void> {
  const { app, firestore } = await getFirebaseServices(env);
  const { clearIndexedDbPersistence, terminate } = await import("firebase/firestore");

  await terminate(firestore);
  await clearIndexedDbPersistence(firestore);
  firestoreInstances.delete(app.name);
}
