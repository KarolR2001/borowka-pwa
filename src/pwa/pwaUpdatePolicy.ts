import type { SyncDocumentMetadataInput } from "../offline/pendingWriteMetadata";
import { summarizeSyncDocumentMetadata } from "../offline/pendingWriteMetadata";

export const PWA_UPDATE_INTENT_FORMAT = "BOROWKA_PWA_UPDATE_INTENT";
export const PWA_UPDATE_INTENT_VERSION = 1;
export const PWA_UPDATE_INTENT_STORAGE_KEY = "borowka:pwa-update-intent:v1";

export type PwaUpdateBlockerCode =
  "ACTIVE_FORM" | "ACTIVE_HARVEST_SESSION" | "PENDING_LOCAL_DATA";

export type PwaUpdateDecision = {
  blockers: {
    code: PwaUpdateBlockerCode;
    message: string;
  }[];
  canApplyUpdate: boolean;
  pendingDocumentCount: number;
  status: "READY" | "DEFER_REQUIRED";
};

export type PwaUpdateIntent = {
  appVersion: string;
  deviceId: string;
  expectedLocalDocumentIds: string[];
  format: typeof PWA_UPDATE_INTENT_FORMAT;
  formatVersion: typeof PWA_UPDATE_INTENT_VERSION;
  requestedAtIso: string;
  schemaVersion: string;
  userUid: string | null;
};

export type PwaSchemaMigration = {
  fromSchemaVersion: string;
  migrate: (intent: PwaUpdateIntent) => Promise<void>;
  toSchemaVersion: string;
};

export type PwaUpdateIntegrityIssueCode =
  | "DEVICE_CHANGED"
  | "LOCAL_DOCUMENT_MISSING"
  | "SCHEMA_MIGRATION_MISSING"
  | "SCHEMA_MIGRATION_FAILED";

export type PwaUpdateIntegrityReport = {
  checkedAtIso: string;
  issues: {
    code: PwaUpdateIntegrityIssueCode;
    message: string;
  }[];
  migratedSchemaVersions: string[];
  status: "READY" | "REVIEW_REQUIRED";
};

export type PwaUpdateIntentStorage = {
  clear: () => void;
  read: () => PwaUpdateIntent | null;
  write: (intent: PwaUpdateIntent) => void;
};

export function evaluatePwaUpdateDecision({
  hasActiveForm,
  hasActiveHarvestSession,
  syncDocuments
}: {
  hasActiveForm: boolean;
  hasActiveHarvestSession: boolean;
  syncDocuments: readonly SyncDocumentMetadataInput[];
}): PwaUpdateDecision {
  const summary = summarizeSyncDocumentMetadata(syncDocuments);
  const pendingDocumentCount =
    summary.localSavedCount +
    summary.pendingSyncCount +
    summary.rejectedCount +
    summary.remoteChangedCount;
  const blockers: PwaUpdateDecision["blockers"] = [];

  if (hasActiveForm) {
    blockers.push({
      code: "ACTIVE_FORM",
      message: "Dokoncz albo anuluj aktywny formularz przed aktualizacja."
    });
  }

  if (hasActiveHarvestSession) {
    blockers.push({
      code: "ACTIVE_HARVEST_SESSION",
      message: "Aktualizacje odlozono do bezpiecznego momentu poza aktywna sesja."
    });
  }

  if (pendingDocumentCount > 0) {
    blockers.push({
      code: "PENDING_LOCAL_DATA",
      message: `Najpierw rozlicz ${String(pendingDocumentCount)} lokalnych dokumentow.`
    });
  }

  return {
    blockers,
    canApplyUpdate: blockers.length === 0,
    pendingDocumentCount,
    status: blockers.length === 0 ? "READY" : "DEFER_REQUIRED"
  };
}

export function createPwaUpdateIntent({
  appVersion,
  deviceId,
  requestedAt = new Date(),
  schemaVersion,
  syncDocuments,
  userUid
}: {
  appVersion: string;
  deviceId: string;
  requestedAt?: Date;
  schemaVersion: string;
  syncDocuments: readonly SyncDocumentMetadataInput[];
  userUid: string | null;
}): PwaUpdateIntent {
  return {
    appVersion: normalizeRequiredText(
      appVersion,
      "Aktualizacja wymaga wersji aplikacji."
    ),
    deviceId: normalizeRequiredText(deviceId, "Aktualizacja wymaga urzadzenia."),
    expectedLocalDocumentIds: Array.from(
      new Set(syncDocuments.map((document) => normalizeDocumentId(document.id)))
    ).sort(),
    format: PWA_UPDATE_INTENT_FORMAT,
    formatVersion: PWA_UPDATE_INTENT_VERSION,
    requestedAtIso: requestedAt.toISOString(),
    schemaVersion: normalizeRequiredText(
      schemaVersion,
      "Aktualizacja wymaga wersji schematu."
    ),
    userUid: normalizeOptionalText(userUid)
  };
}

export async function runPwaUpdateIntegrityCheck({
  currentDeviceId,
  currentLocalDocumentIds,
  currentSchemaVersion,
  intent,
  migrations = [],
  checkedAt = new Date()
}: {
  checkedAt?: Date;
  currentDeviceId: string;
  currentLocalDocumentIds: readonly string[];
  currentSchemaVersion: string;
  intent: PwaUpdateIntent;
  migrations?: readonly PwaSchemaMigration[];
}): Promise<PwaUpdateIntegrityReport> {
  const issues: PwaUpdateIntegrityReport["issues"] = [];
  const migratedSchemaVersions: string[] = [];
  const normalizedDeviceId = normalizeRequiredText(
    currentDeviceId,
    "Kontrola aktualizacji wymaga urzadzenia."
  );
  const normalizedCurrentSchemaVersion = normalizeRequiredText(
    currentSchemaVersion,
    "Kontrola aktualizacji wymaga wersji schematu."
  );

  if (intent.deviceId !== normalizedDeviceId) {
    issues.push({
      code: "DEVICE_CHANGED",
      message: "Identyfikator urzadzenia zmienil sie podczas aktualizacji."
    });
  }

  const currentDocumentIds = new Set(currentLocalDocumentIds.map(normalizeDocumentId));
  const missingDocumentIds = intent.expectedLocalDocumentIds.filter(
    (documentId) => !currentDocumentIds.has(documentId)
  );

  if (missingDocumentIds.length > 0) {
    issues.push({
      code: "LOCAL_DOCUMENT_MISSING",
      message: `Po aktualizacji brakuje lokalnych dokumentow: ${missingDocumentIds.join(", ")}.`
    });
  }

  let migratedSchemaVersion = intent.schemaVersion;
  const visitedSchemaVersions = new Set<string>();

  while (migratedSchemaVersion !== normalizedCurrentSchemaVersion) {
    if (visitedSchemaVersions.has(migratedSchemaVersion)) {
      issues.push(createMissingMigrationIssue(migratedSchemaVersion));
      break;
    }

    visitedSchemaVersions.add(migratedSchemaVersion);
    const migration = migrations.find(
      (candidate) => candidate.fromSchemaVersion === migratedSchemaVersion
    );

    if (!migration) {
      issues.push(createMissingMigrationIssue(migratedSchemaVersion));
      break;
    }

    try {
      await migration.migrate(intent);
      migratedSchemaVersion = migration.toSchemaVersion;
      migratedSchemaVersions.push(migratedSchemaVersion);
    } catch {
      issues.push({
        code: "SCHEMA_MIGRATION_FAILED",
        message: `Migracja schematu ${migration.fromSchemaVersion} -> ${migration.toSchemaVersion} nie powiodla sie.`
      });
      break;
    }
  }

  return {
    checkedAtIso: checkedAt.toISOString(),
    issues,
    migratedSchemaVersions,
    status: issues.length === 0 ? "READY" : "REVIEW_REQUIRED"
  };
}

export function createBrowserPwaUpdateIntentStorage(
  storage: Storage = globalThis.localStorage
): PwaUpdateIntentStorage {
  return {
    clear: () => {
      storage.removeItem(PWA_UPDATE_INTENT_STORAGE_KEY);
    },
    read: () => {
      const serialized = storage.getItem(PWA_UPDATE_INTENT_STORAGE_KEY);

      if (!serialized) {
        return null;
      }

      return parsePwaUpdateIntent(JSON.parse(serialized) as unknown);
    },
    write: (intent) => {
      storage.setItem(PWA_UPDATE_INTENT_STORAGE_KEY, JSON.stringify(intent));
    }
  };
}

export function parsePwaUpdateIntent(value: unknown): PwaUpdateIntent {
  if (!isRecord(value)) {
    throw new Error("Znacznik aktualizacji ma niepoprawny format.");
  }

  if (
    value.format !== PWA_UPDATE_INTENT_FORMAT ||
    value.formatVersion !== PWA_UPDATE_INTENT_VERSION
  ) {
    throw new Error("Znacznik aktualizacji ma nieobslugiwana wersje.");
  }

  if (!Array.isArray(value.expectedLocalDocumentIds)) {
    throw new Error("Znacznik aktualizacji nie zawiera listy dokumentow.");
  }

  const requestedAtIso = normalizeRequiredText(
    value.requestedAtIso,
    "Znacznik aktualizacji wymaga czasu."
  );

  if (Number.isNaN(Date.parse(requestedAtIso))) {
    throw new Error("Znacznik aktualizacji ma niepoprawny czas.");
  }

  return {
    appVersion: normalizeRequiredText(
      value.appVersion,
      "Znacznik aktualizacji wymaga wersji aplikacji."
    ),
    deviceId: normalizeRequiredText(
      value.deviceId,
      "Znacznik aktualizacji wymaga urzadzenia."
    ),
    expectedLocalDocumentIds: value.expectedLocalDocumentIds
      .map(normalizeDocumentId)
      .sort(),
    format: PWA_UPDATE_INTENT_FORMAT,
    formatVersion: PWA_UPDATE_INTENT_VERSION,
    requestedAtIso,
    schemaVersion: normalizeRequiredText(
      value.schemaVersion,
      "Znacznik aktualizacji wymaga wersji schematu."
    ),
    userUid: normalizeOptionalText(value.userUid)
  };
}

function createMissingMigrationIssue(
  fromSchemaVersion: string
): PwaUpdateIntegrityReport["issues"][number] {
  return {
    code: "SCHEMA_MIGRATION_MISSING",
    message: `Brak kontrolowanej migracji schematu ${fromSchemaVersion}. Dane lokalne pozostaja zachowane do przegladu.`
  };
}

function normalizeDocumentId(value: unknown): string {
  return normalizeRequiredText(value, "Dokument lokalny wymaga ID.");
}

function normalizeRequiredText(value: unknown, message: string): string {
  if (typeof value !== "string") {
    throw new Error(message);
  }

  const trimmed = value.trim();

  if (!trimmed) {
    throw new Error(message);
  }

  return trimmed;
}

function normalizeOptionalText(value: unknown): string | null {
  if (value === null || value === undefined) {
    return null;
  }

  return normalizeRequiredText(value, "Opcjonalna wartosc tekstowa jest niepoprawna.");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
