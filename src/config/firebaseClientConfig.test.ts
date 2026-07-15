import {
  getFirebaseClientConfig,
  getFirebaseClientConfigStatus
} from "./firebaseClientConfig";

describe("firebase client config", () => {
  it("returns a controlled missing configuration status", () => {
    const status = getFirebaseClientConfigStatus({});

    expect(status.ready).toBe(false);
    expect(status.missingKeys).toContain("VITE_FIREBASE_PROJECT_ID");
    expect(status.message).toContain("VITE_FIREBASE_API_KEY");
  });

  it("maps a complete public client config", () => {
    const config = getFirebaseClientConfig({
      VITE_FIREBASE_API_KEY: "dev-api-key",
      VITE_FIREBASE_AUTH_DOMAIN: "dev.firebaseapp.com",
      VITE_FIREBASE_PROJECT_ID: "borowka-dev",
      VITE_FIREBASE_STORAGE_BUCKET: "borowka-dev.appspot.com",
      VITE_FIREBASE_MESSAGING_SENDER_ID: "123",
      VITE_FIREBASE_APP_ID: "1:123:web:abc"
    });

    expect(config.projectId).toBe("borowka-dev");
  });
});
