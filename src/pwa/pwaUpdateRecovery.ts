import type { SynchronizationRunStatus } from "../offline/automaticSynchronization";
import type {
  SyncDocumentKind,
  SyncDocumentMetadataInput
} from "../offline/pendingWriteMetadata";
import { summarizeSyncDocumentMetadata } from "../offline/pendingWriteMetadata";
import type { PwaUpdateDecision } from "./pwaUpdatePolicy";

export const PWA_UPDATE_RECOVERY_FORMAT = "BOROWKA_PWA_UPDATE_RECOVERY";
export const PWA_UPDATE_RECOVERY_VERSION = 1;

export type PwaUpdateRecoveryDocument = {
  id: string;
  kind: SyncDocumentKind;
};

export type PwaUpdateRecoveryBaseline = {
  createdAtIso: string;
  expectedDocuments: PwaUpdateRecoveryDocument[];
  format: typeof PWA_UPDATE_RECOVERY_FORMAT;
  formatVersion: typeof PWA_UPDATE_RECOVERY_VERSION;
  sourceVersion: string;
  targetVersion: string;
};

export type PwaUpdateActivationBlockerCode =
  | "UPDATE_NOT_AVAILABLE"
  | "SYNCHRONIZATION_NOT_SUCCESSFUL"
  | "PENDING_DATA_REMAINS"
  | "UPDATE_POLICY_BLOCKED"
  | "SERVER_DOCUMENT_MISSING"
  | "SERVER_DOCUMENT_DUPLICATED";

export type PwaUpdateActivationGate = {
  blockers: {
    code: PwaUpdateActivationBlockerCode;
    documentKeys: string[];
  }[];
  canActivate: boolean;
  expectedDocumentCount: number;
  status: "READY" | "BLOCKED";
};

export type PwaUpdateCompletion = {
  activeVersion: string;
  expectedDocumentCount: number;
  issues: string[];
  sourceVersion: string;
  status: "PASS" | "FAIL";
  targetVersion: string;
};

export function createPwaUpdateRecoveryBaseline({
  createdAt = new Date(),
  pendingDocuments,
  sourceVersion,
  targetVersion
}: {
  createdAt?: Date;
  pendingDocuments: readonly SyncDocumentMetadataInput[];
  sourceVersion: string;
  targetVersion: string;
}): PwaUpdateRecoveryBaseline {
  const normalizedSourceVersion = normalizeRequiredText(
    sourceVersion,
    "Baseline aktualizacji wymaga wersji A."
  );
  const normalizedTargetVersion = normalizeRequiredText(
    targetVersion,
    "Baseline aktualizacji wymaga wersji B."
  );

  if (normalizedSourceVersion === normalizedTargetVersion) {
    throw new Error("Wersja B musi roznic sie od wersji A.");
  }

  const expectedDocuments = deduplicateDocuments(
    pendingDocuments.map(({ id, kind }) => ({ id, kind }))
  );

  if (expectedDocuments.length === 0) {
    throw new Error("Baseline aktualizacji wymaga oczekujacych dokumentow wersji A.");
  }

  return {
    createdAtIso: createdAt.toISOString(),
    expectedDocuments,
    format: PWA_UPDATE_RECOVERY_FORMAT,
    formatVersion: PWA_UPDATE_RECOVERY_VERSION,
    sourceVersion: normalizedSourceVersion,
    targetVersion: normalizedTargetVersion
  };
}

export function evaluatePwaUpdateActivationGate({
  baseline,
  confirmedServerDocuments,
  currentSyncDocuments,
  decision,
  synchronizationStatus,
  updateAvailable
}: {
  baseline: PwaUpdateRecoveryBaseline;
  confirmedServerDocuments: readonly PwaUpdateRecoveryDocument[];
  currentSyncDocuments: readonly SyncDocumentMetadataInput[];
  decision: PwaUpdateDecision;
  synchronizationStatus: SynchronizationRunStatus;
  updateAvailable: boolean;
}): PwaUpdateActivationGate {
  const blockers: PwaUpdateActivationGate["blockers"] = [];
  const currentSummary = summarizeSyncDocumentMetadata(currentSyncDocuments);
  const currentPendingCount =
    currentSummary.localSavedCount +
    currentSummary.pendingSyncCount +
    currentSummary.rejectedCount +
    currentSummary.remoteChangedCount;
  const serverCounts = countDocuments(confirmedServerDocuments);
  const expectedKeys = baseline.expectedDocuments.map(createDocumentKey);
  const missing = expectedKeys.filter((key) => !serverCounts.has(key));
  const duplicated = expectedKeys.filter((key) => (serverCounts.get(key) ?? 0) > 1);

  if (!updateAvailable) {
    blockers.push({ code: "UPDATE_NOT_AVAILABLE", documentKeys: [] });
  }

  if (synchronizationStatus !== "SUCCESS") {
    blockers.push({ code: "SYNCHRONIZATION_NOT_SUCCESSFUL", documentKeys: [] });
  }

  if (currentPendingCount > 0) {
    blockers.push({ code: "PENDING_DATA_REMAINS", documentKeys: [] });
  }

  if (!decision.canApplyUpdate) {
    blockers.push({ code: "UPDATE_POLICY_BLOCKED", documentKeys: [] });
  }

  if (missing.length > 0) {
    blockers.push({ code: "SERVER_DOCUMENT_MISSING", documentKeys: missing });
  }

  if (duplicated.length > 0) {
    blockers.push({ code: "SERVER_DOCUMENT_DUPLICATED", documentKeys: duplicated });
  }

  return {
    blockers,
    canActivate: blockers.length === 0,
    expectedDocumentCount: expectedKeys.length,
    status: blockers.length === 0 ? "READY" : "BLOCKED"
  };
}

export function verifyPwaUpdateCompletion({
  activeVersion,
  baseline,
  gate
}: {
  activeVersion: string;
  baseline: PwaUpdateRecoveryBaseline;
  gate: PwaUpdateActivationGate;
}): PwaUpdateCompletion {
  const normalizedActiveVersion = normalizeRequiredText(
    activeVersion,
    "Kontrola aktualizacji wymaga aktywnej wersji."
  );
  const issues: string[] = [];

  if (!gate.canActivate) {
    issues.push("ACTIVATION_GATE_NOT_READY");
  }

  if (normalizedActiveVersion !== baseline.targetVersion) {
    issues.push("TARGET_VERSION_NOT_ACTIVE");
  }

  return {
    activeVersion: normalizedActiveVersion,
    expectedDocumentCount: baseline.expectedDocuments.length,
    issues,
    sourceVersion: baseline.sourceVersion,
    status: issues.length === 0 ? "PASS" : "FAIL",
    targetVersion: baseline.targetVersion
  };
}

function deduplicateDocuments(
  documents: readonly PwaUpdateRecoveryDocument[]
): PwaUpdateRecoveryDocument[] {
  const byKey = new Map<string, PwaUpdateRecoveryDocument>();

  for (const document of documents) {
    const normalized = {
      id: normalizeRequiredText(document.id, "Dokument aktualizacji wymaga UUID."),
      kind: document.kind
    };

    byKey.set(createDocumentKey(normalized), normalized);
  }

  return Array.from(byKey.values()).sort((left, right) =>
    createDocumentKey(left).localeCompare(createDocumentKey(right))
  );
}

function countDocuments(
  documents: readonly PwaUpdateRecoveryDocument[]
): Map<string, number> {
  const counts = new Map<string, number>();

  for (const document of documents) {
    const key = createDocumentKey(document);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  return counts;
}

function createDocumentKey(document: PwaUpdateRecoveryDocument): string {
  return `${document.kind}:${normalizeRequiredText(
    document.id,
    "Dokument aktualizacji wymaga UUID."
  )}`;
}

function normalizeRequiredText(value: string, message: string): string {
  const normalized = value.trim();

  if (!normalized) {
    throw new Error(message);
  }

  return normalized;
}
