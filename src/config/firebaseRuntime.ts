type FirebaseRuntimeEnv = Record<string, string | boolean | undefined>;

export type FirebaseRuntimeMode = "local-emulator" | "development" | "production";

export type FirebaseRuntimeStatus = {
  appEnvironment: string;
  mode: FirebaseRuntimeMode;
  useEmulators: boolean;
  emulatorHost: string;
  authEmulatorPort: number;
  firestoreEmulatorPort: number;
  label: string;
  warnings: string[];
};

export function getFirebaseRuntimeStatus(env: FirebaseRuntimeEnv): FirebaseRuntimeStatus {
  const appEnvironment = readString(env.VITE_APP_ENV, "local");
  const useEmulators = readBoolean(
    env.VITE_USE_FIREBASE_EMULATORS,
    appEnvironment === "local"
  );
  const emulatorHost = readString(env.VITE_FIREBASE_EMULATOR_HOST, "127.0.0.1");
  const authEmulatorPort = readPort(env.VITE_FIREBASE_AUTH_EMULATOR_PORT, 9099);
  const firestoreEmulatorPort = readPort(env.VITE_FIRESTORE_EMULATOR_PORT, 8080);
  const warnings: string[] = [];

  if (appEnvironment === "production" && useEmulators) {
    warnings.push("Production environment cannot use Firebase emulators.");
  }

  if (appEnvironment === "local" && !useEmulators) {
    warnings.push("Local environment should use Firebase emulators.");
  }

  const mode: FirebaseRuntimeMode = useEmulators
    ? "local-emulator"
    : appEnvironment === "production"
      ? "production"
      : "development";

  return {
    appEnvironment,
    mode,
    useEmulators,
    emulatorHost,
    authEmulatorPort,
    firestoreEmulatorPort,
    label: createRuntimeLabel(
      mode,
      emulatorHost,
      authEmulatorPort,
      firestoreEmulatorPort
    ),
    warnings
  };
}

function createRuntimeLabel(
  mode: FirebaseRuntimeMode,
  emulatorHost: string,
  authEmulatorPort: number,
  firestoreEmulatorPort: number
): string {
  if (mode === "local-emulator") {
    return `emulatory ${emulatorHost}:${String(authEmulatorPort)}/${String(firestoreEmulatorPort)}`;
  }

  return mode === "production" ? "production" : "development";
}

function readString(value: string | boolean | undefined, fallback: string): string {
  return typeof value === "string" && value.trim().length > 0 ? value : fallback;
}

function readBoolean(value: string | boolean | undefined, fallback: boolean): boolean {
  if (typeof value === "boolean") {
    return value;
  }

  if (typeof value === "string") {
    return value.toLowerCase() === "true";
  }

  return fallback;
}

function readPort(value: string | boolean | undefined, fallback: number): number {
  if (typeof value !== "string") {
    return fallback;
  }

  const port = Number(value);

  return Number.isInteger(port) && port > 0 && port < 65536 ? port : fallback;
}
