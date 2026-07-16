import {
  getFirebaseServicesStatus,
  initializeFirebaseServicesIfReady
} from "./firebaseServices";

const completeEnv = {
  VITE_APP_ENV: "development",
  VITE_USE_FIREBASE_EMULATORS: "false",
  VITE_FIREBASE_API_KEY: "dev-api-key",
  VITE_FIREBASE_AUTH_DOMAIN: "borowka-pwa-dev.firebaseapp.com",
  VITE_FIREBASE_PROJECT_ID: "borowka-pwa-dev",
  VITE_FIREBASE_STORAGE_BUCKET: "borowka-pwa-dev.appspot.com",
  VITE_FIREBASE_MESSAGING_SENDER_ID: "123456789",
  VITE_FIREBASE_APP_ID: "1:123456789:web:dev"
};

describe("firebase services", () => {
  it("reports missing client configuration without initializing services", () => {
    const status = getFirebaseServicesStatus({});

    expect(status.ready).toBe(false);
    expect(status.initialized).toBe(false);
    expect(status.message).toContain("VITE_FIREBASE_API_KEY");
  });

  it("reports ready development services for complete config", () => {
    const status = getFirebaseServicesStatus(completeEnv);

    expect(status).toMatchObject({
      ready: true,
      initialized: false,
      mode: "development"
    });
  });

  it("blocks production emulator configuration", () => {
    const status = getFirebaseServicesStatus({
      ...completeEnv,
      VITE_APP_ENV: "production",
      VITE_USE_FIREBASE_EMULATORS: "true"
    });

    expect(status.ready).toBe(false);
    expect(status.warnings).toContain(
      "Production environment cannot use Firebase emulators."
    );
  });

  it("initializes services only when configuration is complete", async () => {
    await expect(initializeFirebaseServicesIfReady({})).resolves.toMatchObject({
      initialized: false
    });
    await expect(initializeFirebaseServicesIfReady(completeEnv)).resolves.toMatchObject({
      initialized: true
    });
  });
});
