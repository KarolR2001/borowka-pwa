export type FirebaseClientConfig = {
  apiKey: string;
  authDomain: string;
  projectId: string;
  storageBucket: string;
  messagingSenderId: string;
  appId: string;
};

type FirebaseEnv = Record<string, string | boolean | undefined>;

const requiredKeys = [
  "VITE_FIREBASE_API_KEY",
  "VITE_FIREBASE_AUTH_DOMAIN",
  "VITE_FIREBASE_PROJECT_ID",
  "VITE_FIREBASE_STORAGE_BUCKET",
  "VITE_FIREBASE_MESSAGING_SENDER_ID",
  "VITE_FIREBASE_APP_ID"
] as const;

export function getFirebaseClientConfigStatus(env: FirebaseEnv): {
  ready: boolean;
  missingKeys: string[];
  message: string;
} {
  const missingKeys = requiredKeys.filter((key) => !env[key]);

  if (missingKeys.length === 0) {
    return {
      ready: true,
      missingKeys: [],
      message: "Konfiguracja klienta Firebase jest kompletna."
    };
  }

  return {
    ready: false,
    missingKeys,
    message: `Brak: ${missingKeys.join(", ")}`
  };
}

export function getFirebaseClientConfig(env: FirebaseEnv): FirebaseClientConfig {
  const status = getFirebaseClientConfigStatus(env);

  if (!status.ready) {
    throw new Error(`Firebase client config is incomplete. ${status.message}`);
  }

  return {
    apiKey: String(env.VITE_FIREBASE_API_KEY),
    authDomain: String(env.VITE_FIREBASE_AUTH_DOMAIN),
    projectId: String(env.VITE_FIREBASE_PROJECT_ID),
    storageBucket: String(env.VITE_FIREBASE_STORAGE_BUCKET),
    messagingSenderId: String(env.VITE_FIREBASE_MESSAGING_SENDER_ID),
    appId: String(env.VITE_FIREBASE_APP_ID)
  };
}
