import { describe, expect, it } from "vitest";

import { validateDeployEnvironment } from "../../scripts/validate-deploy-env.mjs";

const serviceAccount = (projectId = "borowka-pwa-dev") =>
  JSON.stringify({
    type: "service_account",
    project_id: projectId,
    client_email: `firebase-deploy@${projectId}.iam.gserviceaccount.com`,
    private_key: "test-private-key"
  });

const validDevelopmentEnv = {
  FIREBASE_PROJECT_ID: "borowka-pwa-dev",
  FIREBASE_SERVICE_ACCOUNT_JSON: serviceAccount(),
  VITE_APP_ENV: "development",
  VITE_USE_FIREBASE_EMULATORS: "false",
  VITE_FIREBASE_API_KEY: "dev-api-key",
  VITE_FIREBASE_AUTH_DOMAIN: "borowka-pwa-dev.firebaseapp.com",
  VITE_FIREBASE_PROJECT_ID: "borowka-pwa-dev",
  VITE_FIREBASE_STORAGE_BUCKET: "borowka-pwa-dev.appspot.com",
  VITE_FIREBASE_MESSAGING_SENDER_ID: "123456789",
  VITE_FIREBASE_APP_ID: "1:123456789:web:dev"
};

describe("deploy environment validation", () => {
  it("accepts a complete development configuration", () => {
    expect(validateDeployEnvironment("development", validDevelopmentEnv)).toEqual({
      ok: true,
      errors: []
    });
  });

  it("requires all Firebase client variables", () => {
    const result = validateDeployEnvironment("development", {
      ...validDevelopmentEnv,
      VITE_FIREBASE_API_KEY: ""
    });

    expect(result.ok).toBe(false);
    expect(result.errors).toContain("VITE_FIREBASE_API_KEY is required.");
  });

  it("rejects emulator mode during deploy", () => {
    const result = validateDeployEnvironment("development", {
      ...validDevelopmentEnv,
      VITE_USE_FIREBASE_EMULATORS: "true"
    });

    expect(result.ok).toBe(false);
    expect(result.errors).toContain(
      "VITE_USE_FIREBASE_EMULATORS must be false for deploy."
    );
  });

  it("rejects mismatched Firebase projects", () => {
    const result = validateDeployEnvironment("development", {
      ...validDevelopmentEnv,
      VITE_FIREBASE_PROJECT_ID: "borowka-pwa-prod"
    });

    expect(result.ok).toBe(false);
    expect(result.errors).toContain(
      "VITE_FIREBASE_PROJECT_ID must match FIREBASE_PROJECT_ID."
    );
  });

  it("rejects a service account from another project", () => {
    const result = validateDeployEnvironment("development", {
      ...validDevelopmentEnv,
      FIREBASE_SERVICE_ACCOUNT_JSON: serviceAccount("borowka-pwa-prod")
    });

    expect(result.ok).toBe(false);
    expect(result.errors).toContain(
      "FIREBASE_SERVICE_ACCOUNT_JSON project_id must match FIREBASE_PROJECT_ID."
    );
  });

  it("requires explicit production confirmation", () => {
    const result = validateDeployEnvironment("production", {
      ...validDevelopmentEnv,
      FIREBASE_PROJECT_ID: "borowka-pwa-prod",
      FIREBASE_SERVICE_ACCOUNT_JSON: serviceAccount("borowka-pwa-prod"),
      VITE_APP_ENV: "production",
      VITE_FIREBASE_AUTH_DOMAIN: "borowka-pwa-prod.firebaseapp.com",
      VITE_FIREBASE_PROJECT_ID: "borowka-pwa-prod",
      VITE_FIREBASE_STORAGE_BUCKET: "borowka-pwa-prod.appspot.com"
    });

    expect(result.ok).toBe(false);
    expect(result.errors).toContain(
      "CONFIRM_PRODUCTION_DEPLOY must be true for production deploy."
    );
  });
});
