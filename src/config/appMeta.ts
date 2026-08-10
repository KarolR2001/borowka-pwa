import packageJson from "../../package.json";

const viteEnv = import.meta.env as unknown as Record<string, unknown>;

function readStringEnv(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim().length > 0 ? value : fallback;
}

export const APP_META = {
  name: "Borowka PWA",
  version: packageJson.version,
  buildId: readStringEnv(viteEnv.VITE_BUILD_ID, "local"),
  schemaVersion: "schema-0001",
  calculationVersion: "calc-0001",
  buildDate: "2026-08-10",
  environment: readStringEnv(viteEnv.VITE_APP_ENV, "local")
} as const;
