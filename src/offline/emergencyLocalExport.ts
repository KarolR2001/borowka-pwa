import { APP_META } from "../config/appMeta";
import type { DeviceIdentity } from "../devices/deviceIdentity";
import type { UserProfile } from "../domain/identity";
import type {
  SyncDocumentKind,
  SyncDocumentPresentation,
  SyncDocumentStatus
} from "./pendingWriteMetadata";
import type { SyncCenterModel } from "./syncCenter";

export const EMERGENCY_LOCAL_EXPORT_FORMAT = "BOROWKA_EMERGENCY_LOCAL_EXPORT";
export const EMERGENCY_LOCAL_EXPORT_FORMAT_VERSION = 2;
export const EMERGENCY_LOCAL_EXPORT_WARNING =
  "Eksport awaryjny urzadzenia zawiera tylko lokalne dane tego urzadzenia. Wymaga kontrolowanego przegladu administratora, nie jest automatycznie zaakceptowanym importem produkcyjnym i nie zastepuje pelnego eksportu chmury.";

export type EmergencyLocalExportDocument = {
  documentUuid: string;
  kind: SyncDocumentKind;
  localStatus: SyncDocumentStatus;
  sessionUuid: string | null;
  snapshot: unknown;
  synchronization: {
    currentDeviceId: string | null;
    firestoreMetadata: SyncDocumentPresentation["firestoreMetadata"];
    lastLocalWriteIso: string | null;
    lastSuccessfulSyncIso: string | null;
    pendingSync: boolean;
    rejectedReason: string | null;
    remoteDeviceId: string | null;
    savedLocally: boolean;
  };
};

export type EmergencyLocalExportPayload = {
  application: {
    buildDate: string;
    calculationVersion: string;
    environment: string;
    name: string;
    schemaVersion: string;
    version: string;
  };
  data: {
    entries: EmergencyLocalExportDocument[];
    relatedDocuments: EmergencyLocalExportDocument[];
    sessions: EmergencyLocalExportDocument[];
  };
  device: DeviceIdentity;
  exportedAtIso: string;
  format: {
    automaticProductionImportAllowed: false;
    dataScope: "CURRENT_DEVICE_LOCAL_PENDING_DATA";
    name: typeof EMERGENCY_LOCAL_EXPORT_FORMAT;
    purpose: "EMERGENCY_RECOVERY";
    productionImportPolicy: "CONTROLLED_REVIEW_REQUIRED";
    source: "LOCAL_DEVICE_STORAGE";
    version: typeof EMERGENCY_LOCAL_EXPORT_FORMAT_VERSION;
    warning: typeof EMERGENCY_LOCAL_EXPORT_WARNING;
  };
  summary: {
    actionableErrorCount: number;
    entryCount: number;
    localSavedCount: number;
    pendingSyncCount: number;
    rejectedCount: number;
    relatedDocumentCount: number;
    remoteChangedCount: number;
    sessionCount: number;
    totalDocumentCount: number;
  };
  user: Pick<
    UserProfile,
    | "active"
    | "displayName"
    | "email"
    | "registrationStatus"
    | "role"
    | "uid"
    | "workerId"
  >;
};

export function createEmergencyLocalExportPayload({
  device,
  exportedAtIso,
  model,
  user
}: {
  device: DeviceIdentity;
  exportedAtIso: string;
  model: SyncCenterModel;
  user: UserProfile;
}): EmergencyLocalExportPayload {
  const normalizedExportedAtIso = normalizeIso(exportedAtIso);
  const documents = model.metadataSummary.documents.map(createExportDocument);
  const sessions = documents.filter((document) => document.kind === "HARVEST_SESSION");
  const entries = documents.filter((document) => document.kind === "HARVEST_ENTRY");
  const relatedDocuments = documents.filter(
    (document) => document.kind !== "HARVEST_SESSION" && document.kind !== "HARVEST_ENTRY"
  );

  return {
    application: {
      buildDate: APP_META.buildDate,
      calculationVersion: APP_META.calculationVersion,
      environment: APP_META.environment,
      name: APP_META.name,
      schemaVersion: APP_META.schemaVersion,
      version: APP_META.version
    },
    data: {
      entries,
      relatedDocuments,
      sessions
    },
    device: {
      id: normalizeRequiredText(device.id, "Eksport awaryjny wymaga urzadzenia."),
      name: normalizeRequiredText(
        device.name,
        "Eksport awaryjny wymaga nazwy urzadzenia."
      ),
      platform: normalizeOptionalText(device.platform)
    },
    exportedAtIso: normalizedExportedAtIso,
    format: {
      automaticProductionImportAllowed: false,
      dataScope: "CURRENT_DEVICE_LOCAL_PENDING_DATA",
      name: EMERGENCY_LOCAL_EXPORT_FORMAT,
      purpose: "EMERGENCY_RECOVERY",
      productionImportPolicy: "CONTROLLED_REVIEW_REQUIRED",
      source: "LOCAL_DEVICE_STORAGE",
      version: EMERGENCY_LOCAL_EXPORT_FORMAT_VERSION,
      warning: EMERGENCY_LOCAL_EXPORT_WARNING
    },
    summary: {
      actionableErrorCount: model.metadataSummary.actionableErrorCount,
      entryCount: entries.length,
      localSavedCount: model.metadataSummary.localSavedCount,
      pendingSyncCount: model.metadataSummary.pendingSyncCount,
      rejectedCount: model.metadataSummary.rejectedCount,
      relatedDocumentCount: relatedDocuments.length,
      remoteChangedCount: model.metadataSummary.remoteChangedCount,
      sessionCount: sessions.length,
      totalDocumentCount: documents.length
    },
    user: {
      active: user.active,
      displayName: normalizeRequiredText(
        user.displayName,
        "Eksport awaryjny wymaga nazwy uzytkownika."
      ),
      email: normalizeRequiredText(
        user.email,
        "Eksport awaryjny wymaga e-maila uzytkownika."
      ),
      registrationStatus: user.registrationStatus,
      role: user.role,
      uid: normalizeRequiredText(user.uid, "Eksport awaryjny wymaga konta."),
      workerId: normalizeOptionalText(user.workerId)
    }
  };
}

export function createEmergencyLocalExportFilename(exportedAtIso: string): string {
  return `borowka-emergency-local-export-${normalizeIso(exportedAtIso).replace(
    /[:.]/g,
    "-"
  )}.json`;
}

function createExportDocument(
  document: SyncDocumentPresentation
): EmergencyLocalExportDocument {
  return {
    documentUuid: document.id,
    kind: document.kind,
    localStatus: document.status,
    sessionUuid:
      document.sessionId ?? (document.kind === "HARVEST_SESSION" ? document.id : null),
    snapshot: document.localSnapshot,
    synchronization: {
      currentDeviceId: document.currentDeviceId,
      firestoreMetadata: document.firestoreMetadata,
      lastLocalWriteIso: document.lastLocalWriteIso,
      lastSuccessfulSyncIso: document.lastSuccessfulSyncIso,
      pendingSync: document.pendingSync,
      rejectedReason: document.rejectedReason,
      remoteDeviceId: document.remoteDeviceId,
      savedLocally: document.savedLocally
    }
  };
}

function normalizeRequiredText(value: string, message: string): string {
  const trimmed = value.trim();

  if (!trimmed) {
    throw new Error(message);
  }

  return trimmed;
}

function normalizeOptionalText(value: string | null | undefined): string | null {
  const trimmed = value?.trim() ?? "";

  return trimmed || null;
}

function normalizeIso(value: string): string {
  const trimmed = normalizeRequiredText(value, "Eksport awaryjny wymaga czasu eksportu.");

  if (Number.isNaN(Date.parse(trimmed))) {
    throw new Error("Czas eksportu awaryjnego musi byc poprawnym ISO.");
  }

  return trimmed;
}
