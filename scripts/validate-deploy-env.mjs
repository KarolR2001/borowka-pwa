import { pathToFileURL } from "node:url";

const targetConfig = {
  development: {
    expectedAppEnvironment: "development",
    requireProductionConfirmation: false
  },
  production: {
    expectedAppEnvironment: "production",
    requireProductionConfirmation: true
  }
};

const requiredClientEnv = [
  "VITE_FIREBASE_API_KEY",
  "VITE_FIREBASE_AUTH_DOMAIN",
  "VITE_FIREBASE_PROJECT_ID",
  "VITE_FIREBASE_STORAGE_BUCKET",
  "VITE_FIREBASE_MESSAGING_SENDER_ID",
  "VITE_FIREBASE_APP_ID"
];

const requiredServiceAccountFields = [
  "type",
  "project_id",
  "client_email",
  "private_key"
];

/**
 * @param {Record<string, unknown>} record
 * @param {string} name
 */
const readRecordString = (record, name) => {
  const value = record[name];
  return typeof value === "string" ? value.trim() : "";
};

/**
 * @param {Record<string, string | undefined>} env
 * @param {string} name
 */
const read = (env, name) => {
  const value = env[name];
  return typeof value === "string" ? value.trim() : "";
};

/**
 * @param {string} rawValue
 * @param {string[]} errors
 * @returns {{ type: string, project_id: string, client_email: string, private_key: string } | undefined}
 */
const parseServiceAccount = (rawValue, errors) => {
  if (!rawValue) {
    errors.push("FIREBASE_SERVICE_ACCOUNT_JSON is required.");
    return undefined;
  }

  try {
    const parsed = JSON.parse(rawValue);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      errors.push("FIREBASE_SERVICE_ACCOUNT_JSON must be a JSON object.");
      return undefined;
    }

    const record = /** @type {Record<string, unknown>} */ (parsed);
    for (const field of requiredServiceAccountFields) {
      if (!readRecordString(record, field)) {
        errors.push(`FIREBASE_SERVICE_ACCOUNT_JSON is missing ${field}.`);
      }
    }

    return {
      type: readRecordString(record, "type"),
      project_id: readRecordString(record, "project_id"),
      client_email: readRecordString(record, "client_email"),
      private_key: readRecordString(record, "private_key")
    };
  } catch {
    errors.push("FIREBASE_SERVICE_ACCOUNT_JSON must be valid JSON.");
    return undefined;
  }
};

/**
 * @param {string | undefined} target
 * @param {Record<string, string | undefined>} env
 */
export const validateDeployEnvironment = (target, env = process.env) => {
  const config = targetConfig[target];
  const errors = [];

  if (!config) {
    return {
      ok: false,
      errors: [
        `Unknown deploy target "${target ?? ""}". Use "development" or "production".`
      ]
    };
  }

  const projectId = read(env, "FIREBASE_PROJECT_ID");
  if (!projectId) {
    errors.push("FIREBASE_PROJECT_ID is required.");
  }

  const serviceAccount = parseServiceAccount(
    read(env, "FIREBASE_SERVICE_ACCOUNT_JSON"),
    errors
  );

  if (
    serviceAccount?.project_id &&
    projectId &&
    serviceAccount.project_id !== projectId
  ) {
    errors.push(
      "FIREBASE_SERVICE_ACCOUNT_JSON project_id must match FIREBASE_PROJECT_ID."
    );
  }

  const appEnvironment = read(env, "VITE_APP_ENV");
  if (appEnvironment !== config.expectedAppEnvironment) {
    errors.push(
      `VITE_APP_ENV must be "${config.expectedAppEnvironment}" for ${target} deploy.`
    );
  }

  if (read(env, "VITE_USE_FIREBASE_EMULATORS") !== "false") {
    errors.push("VITE_USE_FIREBASE_EMULATORS must be false for deploy.");
  }

  for (const name of requiredClientEnv) {
    if (!read(env, name)) {
      errors.push(`${name} is required.`);
    }
  }

  const clientProjectId = read(env, "VITE_FIREBASE_PROJECT_ID");
  if (projectId && clientProjectId && clientProjectId !== projectId) {
    errors.push("VITE_FIREBASE_PROJECT_ID must match FIREBASE_PROJECT_ID.");
  }

  if (
    config.requireProductionConfirmation &&
    read(env, "CONFIRM_PRODUCTION_DEPLOY") !== "true"
  ) {
    errors.push("CONFIRM_PRODUCTION_DEPLOY must be true for production deploy.");
  }

  return {
    ok: errors.length === 0,
    errors
  };
};

const main = () => {
  const target = /** @type {string | undefined} */ (process.argv[2]);
  const result = validateDeployEnvironment(target);

  if (!result.ok) {
    console.error(`Deploy environment validation failed for ${target ?? ""}.`);
    for (const error of result.errors) {
      console.error(`- ${error}`);
    }
    process.exit(1);
  }

  console.log(`Deploy environment validation passed for ${target}.`);
};

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
