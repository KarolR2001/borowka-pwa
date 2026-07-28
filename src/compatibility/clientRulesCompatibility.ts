import { APP_META } from "../config/appMeta";
import type { SyncDocumentKind } from "../offline/pendingWriteMetadata";

export const CURRENT_RULES_REVISION = "rules-0001";
export const CLIENT_UPDATE_REQUIRED_MESSAGE =
  "Ta wersja aplikacji nie moze tworzyc nowych dokumentow. Zsynchronizuj dane oczekujace i zaktualizuj PWA.";

export type ClientReleaseDescriptor = {
  appVersion: string;
  rulesRevision: string;
  schemaVersion: string;
};

export const CURRENT_CLIENT_RELEASE: ClientReleaseDescriptor = {
  appVersion: APP_META.version,
  rulesRevision: CURRENT_RULES_REVISION,
  schemaVersion: APP_META.schemaVersion
};

export type LocalClientWrite = {
  appVersion: string;
  createdAtDeviceIso: string;
  documentId: string;
  fields: readonly string[];
  kind: SyncDocumentKind;
  origin: "NEW_WRITE" | "PENDING_OFFLINE";
  schemaVersion: string;
};

export type RulesCompatibilityPolicy = {
  currentRelease: ClientReleaseDescriptor;
  graceEndsAtIso: string;
  lastSupportedRelease: ClientReleaseDescriptor;
  optionalDuringGrace: Partial<Record<SyncDocumentKind, readonly string[]>>;
  requiredFields: Partial<Record<SyncDocumentKind, readonly string[]>>;
};

export type ClientWriteCompatibilityDecision = {
  action: "ALLOW_CURRENT" | "ALLOW_PENDING_RETRY" | "BLOCK_AND_REVIEW" | "REQUIRE_UPDATE";
  allowedByRulesRollout: boolean;
  message: string;
};

export type RulesRolloutAssessment = {
  decisions: {
    decision: ClientWriteCompatibilityDecision;
    documentId: string;
  }[];
  issues: string[];
  status: "BLOCKED" | "SAFE";
};

export function evaluateClientWriteCompatibility(
  write: LocalClientWrite,
  policy: RulesCompatibilityPolicy
): ClientWriteCompatibilityDecision {
  const createdAtDeviceIso = normalizeIso(write.createdAtDeviceIso);
  const graceEndsAtIso = normalizeIso(policy.graceEndsAtIso);
  const schemaVersion = normalizeRequiredText(write.schemaVersion);
  const appVersion = normalizeRequiredText(write.appVersion);

  if (
    schemaVersion === policy.currentRelease.schemaVersion &&
    appVersion === policy.currentRelease.appVersion
  ) {
    const hasCurrentFields = hasRequiredFields(write, policy, false);

    return {
      action: hasCurrentFields ? "ALLOW_CURRENT" : "BLOCK_AND_REVIEW",
      allowedByRulesRollout: hasCurrentFields,
      message: hasCurrentFields
        ? "Dokument ma aktualny format klienta."
        : "Aktualny klient nie dostarczyl wymaganych pol dokumentu."
    };
  }

  const isLastSupportedRelease =
    schemaVersion === policy.lastSupportedRelease.schemaVersion &&
    appVersion === policy.lastSupportedRelease.appVersion;

  if (!isLastSupportedRelease) {
    return {
      action: "BLOCK_AND_REVIEW",
      allowedByRulesRollout: false,
      message:
        "Format dokumentu jest starszy niz ostatnia wspierana wersja i wymaga przegladu."
    };
  }

  if (
    write.origin !== "PENDING_OFFLINE" ||
    Date.parse(createdAtDeviceIso) > Date.parse(graceEndsAtIso)
  ) {
    return {
      action: "REQUIRE_UPDATE",
      allowedByRulesRollout: false,
      message: CLIENT_UPDATE_REQUIRED_MESSAGE
    };
  }

  const hasCompatibleFields = hasRequiredFields(write, policy, true);

  return {
    action: hasCompatibleFields ? "ALLOW_PENDING_RETRY" : "BLOCK_AND_REVIEW",
    allowedByRulesRollout: hasCompatibleFields,
    message: hasCompatibleFields
      ? "Oczekujacy zapis ostatniego wspieranego klienta miesci sie w okresie zgodnosci."
      : "Oczekujacy zapis nie spelnia kontraktu okresu zgodnosci."
  };
}

export function assessRulesRollout(
  writes: readonly LocalClientWrite[],
  policy: RulesCompatibilityPolicy
): RulesRolloutAssessment {
  const decisions = writes.map((write) => ({
    decision: evaluateClientWriteCompatibility(write, policy),
    documentId: normalizeRequiredText(write.documentId)
  }));
  const issues = decisions
    .filter(({ decision }) => !decision.allowedByRulesRollout)
    .map(({ decision, documentId }) => `${documentId}: ${decision.message}`);

  return {
    decisions,
    issues,
    status: issues.length === 0 ? "SAFE" : "BLOCKED"
  };
}

export function prepareLastSupportedPendingWriteForRules<
  T extends Record<string, unknown>
>(kind: SyncDocumentKind, localSnapshot: T): T {
  if (kind !== "HARVEST_ENTRY") {
    return { ...localSnapshot };
  }

  return {
    ...localSnapshot,
    pendingSync: false
  };
}

function hasRequiredFields(
  write: LocalClientWrite,
  policy: RulesCompatibilityPolicy,
  allowGraceFields: boolean
): boolean {
  const fields = new Set(write.fields.map(normalizeRequiredText));
  const optionalFields = new Set(
    allowGraceFields ? (policy.optionalDuringGrace[write.kind] ?? []) : []
  );

  return (policy.requiredFields[write.kind] ?? []).every(
    (field) => fields.has(field) || optionalFields.has(field)
  );
}

function normalizeRequiredText(value: string): string {
  const trimmed = value.trim();

  if (!trimmed) {
    throw new Error("Kontrakt zgodnosci wymaga wartosci tekstowej.");
  }

  return trimmed;
}

function normalizeIso(value: string): string {
  const normalized = normalizeRequiredText(value);

  if (Number.isNaN(Date.parse(normalized))) {
    throw new Error("Kontrakt zgodnosci wymaga poprawnego czasu ISO.");
  }

  return normalized;
}
