import { getFirebaseRuntimeStatus } from "./firebaseRuntime";

describe("firebase runtime status", () => {
  it("defaults local environment to Firebase emulators", () => {
    const status = getFirebaseRuntimeStatus({ VITE_APP_ENV: "local" });

    expect(status.mode).toBe("local-emulator");
    expect(status.useEmulators).toBe(true);
    expect(status.label).toBe("emulatory 127.0.0.1:9099/8080");
  });

  it("uses development mode when emulators are disabled", () => {
    const status = getFirebaseRuntimeStatus({
      VITE_APP_ENV: "development",
      VITE_USE_FIREBASE_EMULATORS: "false"
    });

    expect(status.mode).toBe("development");
    expect(status.warnings).toEqual([]);
  });

  it("warns when production is configured with emulators", () => {
    const status = getFirebaseRuntimeStatus({
      VITE_APP_ENV: "production",
      VITE_USE_FIREBASE_EMULATORS: "true"
    });

    expect(status.mode).toBe("local-emulator");
    expect(status.warnings).toContain(
      "Production environment cannot use Firebase emulators."
    );
  });
});
