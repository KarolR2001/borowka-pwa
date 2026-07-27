import {
  evaluateSyncDocumentMetadata,
  type SyncDocumentKind,
  type SyncDocumentMetadataInput,
  type SyncDocumentPresentation
} from "./pendingWriteMetadata";

export const BUSINESS_SYNC_INTENTS = [
  "CREATE_HARVEST_SESSION",
  "UPSERT_HARVEST_ENTRY",
  "APPLY_ENTRY_CORRECTION",
  "CLOSE_HARVEST_SESSION",
  "WRITE_AUDIT_EVENT"
] as const;

export type BusinessSyncIntent = (typeof BUSINESS_SYNC_INTENTS)[number];

export type BusinessSyncDocumentInput = SyncDocumentMetadataInput & {
  dependsOnDocumentIds?: readonly string[];
  syncIntent: BusinessSyncIntent;
};

export type BusinessSyncOperation =
  | "CREATE_HARVEST_SESSION"
  | "UPSERT_HARVEST_ENTRIES"
  | "APPLY_ENTRY_CORRECTIONS"
  | "CONFIRM_SESSION_CLOSE"
  | "WRITE_AUDIT_EVENTS";

export type BusinessSyncPlanDocument = SyncDocumentPresentation & {
  dependsOnDocumentIds: string[];
  sequence: number;
  syncIntent: BusinessSyncIntent;
};

export type BusinessSyncStage = {
  documents: BusinessSyncPlanDocument[];
  label: string;
  operation: BusinessSyncOperation;
  requiresOrderedCommit: boolean;
  sequence: number;
  toleratesTransientState: boolean;
};

export type BusinessSyncPaymentGate = {
  canEnterPayments: boolean;
  label: string;
};

export type BusinessSyncSessionPlan = {
  blockedReason: string | null;
  businessDate: string;
  paymentGate: BusinessSyncPaymentGate;
  sessionId: string;
  stages: BusinessSyncStage[];
  warningMessages: string[];
  workerName: string;
};

export type BusinessSynchronizationPlan = {
  blockedReason: string | null;
  profileAndConfigurationReady: boolean;
  sessions: BusinessSyncSessionPlan[];
  warningMessages: string[];
};

export function buildBusinessSynchronizationPlan({
  configurationReady,
  documents,
  profileReady
}: {
  configurationReady: boolean;
  documents: readonly BusinessSyncDocumentInput[];
  profileReady: boolean;
}): BusinessSynchronizationPlan {
  assertBusinessSyncDocuments(documents);

  const profileAndConfigurationReady = profileReady && configurationReady;
  const warningMessages: string[] = [];
  const blockedReason = profileAndConfigurationReady
    ? null
    : "Synchronizacja wymaga istniejacego profilu i aktualnej konfiguracji.";
  const plannedDocuments = documents.map(createBusinessSyncPlanDocument);
  const sessions = createSessionPlans(plannedDocuments, profileAndConfigurationReady);

  if (!configurationReady) {
    warningMessages.push("Konfiguracja offline musi zostac odswiezona przed sync.");
  }

  if (!profileReady) {
    warningMessages.push("Profil aplikacji musi byc aktywny przed sync.");
  }

  return {
    blockedReason,
    profileAndConfigurationReady,
    sessions,
    warningMessages
  };
}

function createSessionPlans(
  documents: readonly BusinessSyncPlanDocument[],
  profileAndConfigurationReady: boolean
): BusinessSyncSessionPlan[] {
  const groupedDocuments = new Map<string, BusinessSyncPlanDocument[]>();

  for (const document of documents) {
    const sessionId = resolveBusinessSessionId(document);
    const group = groupedDocuments.get(sessionId) ?? [];

    group.push(document);
    groupedDocuments.set(sessionId, group);
  }

  return Array.from(groupedDocuments.entries())
    .map(([sessionId, sessionDocuments]) =>
      createSessionPlan(sessionId, sessionDocuments, profileAndConfigurationReady)
    )
    .sort(
      (left, right) =>
        right.businessDate.localeCompare(left.businessDate) ||
        left.workerName.localeCompare(right.workerName) ||
        left.sessionId.localeCompare(right.sessionId)
    );
}

function createSessionPlan(
  sessionId: string,
  documents: readonly BusinessSyncPlanDocument[],
  profileAndConfigurationReady: boolean
): BusinessSyncSessionPlan {
  const pendingDocuments = documents
    .filter(isPendingForBusinessSynchronization)
    .sort(compareBusinessDocuments);
  const blockedDocuments = documents.filter(
    (document) => document.status === "REJECTED" || document.status === "REMOTE_CHANGED"
  );
  const stages = profileAndConfigurationReady
    ? createBusinessSyncStages(pendingDocuments)
    : [];
  const firstDocument = documents[0];
  const warningMessages = createSessionWarnings(stages);
  const blockedReason =
    blockedDocuments.length > 0
      ? "Sesja wymaga przegladu konfliktu przed ponowieniem synchronizacji."
      : null;

  if (sessionId === "UNKNOWN_SESSION") {
    warningMessages.push("Czesc dokumentow nie ma identyfikatora sesji.");
  }

  return {
    blockedReason,
    businessDate: firstDocument.businessDate ?? "brak daty",
    paymentGate: createPaymentGate(documents, stages, blockedDocuments),
    sessionId,
    stages: blockedReason ? [] : stages,
    warningMessages,
    workerName: firstDocument.workerName ?? "Nieznana osoba"
  };
}

function createBusinessSyncStages(
  documents: readonly BusinessSyncPlanDocument[]
): BusinessSyncStage[] {
  const stages = new Map<BusinessSyncOperation, BusinessSyncPlanDocument[]>();

  for (const document of documents) {
    const operation = mapIntentToOperation(document.syncIntent);
    const group = stages.get(operation) ?? [];

    group.push(document);
    stages.set(operation, group);
  }

  return Array.from(stages.entries())
    .map(([operation, operationDocuments]) => ({
      documents: operationDocuments.sort(compareBusinessDocuments),
      label: createOperationLabel(operation),
      operation,
      requiresOrderedCommit: operationRequiresOrderedCommit(operation),
      sequence: operationSequence(operation),
      toleratesTransientState: operationToleratesTransientState(operation)
    }))
    .sort((left, right) => left.sequence - right.sequence);
}

function createSessionWarnings(stages: readonly BusinessSyncStage[]): string[] {
  const warnings: string[] = [];
  const hasPendingEntries = stages.some(
    (stage) =>
      stage.operation === "UPSERT_HARVEST_ENTRIES" ||
      stage.operation === "APPLY_ENTRY_CORRECTIONS"
  );
  const hasPendingClose = stages.some(
    (stage) => stage.operation === "CONFIRM_SESSION_CLOSE"
  );
  const hasPendingAudit = stages.some(
    (stage) => stage.operation === "WRITE_AUDIT_EVENTS"
  );

  if (hasPendingEntries && hasPendingClose) {
    warnings.push("Zamkniecie sesji musi czekac na synchronizacje wpisow.");
  }

  if (hasPendingClose && hasPendingAudit) {
    warnings.push("Audyt zamkniecia musi zostac zapisany po potwierdzeniu sesji.");
  }

  return warnings;
}

function createPaymentGate(
  documents: readonly BusinessSyncPlanDocument[],
  stages: readonly BusinessSyncStage[],
  blockedDocuments: readonly BusinessSyncPlanDocument[]
): BusinessSyncPaymentGate {
  const hasPendingDocuments = stages.length > 0 || blockedDocuments.length > 0;
  const sessionIsClosed = documents.some(
    (document) =>
      document.kind === "HARVEST_SESSION" &&
      document.businessStatus === "CLOSED" &&
      document.status === "SYNCED"
  );

  if (!sessionIsClosed || hasPendingDocuments) {
    return {
      canEnterPayments: false,
      label: "Wyplata zablokowana do czasu potwierdzenia sesji w chmurze."
    };
  }

  return {
    canEnterPayments: true,
    label: "Sesja moze wejsc do procesu wyplat."
  };
}

function createBusinessSyncPlanDocument(
  input: BusinessSyncDocumentInput
): BusinessSyncPlanDocument {
  return {
    ...evaluateSyncDocumentMetadata(input),
    dependsOnDocumentIds: [...(input.dependsOnDocumentIds ?? [])].sort(),
    sequence: intentSequence(input.syncIntent),
    syncIntent: input.syncIntent
  };
}

function isPendingForBusinessSynchronization(
  document: BusinessSyncPlanDocument
): boolean {
  return document.status === "LOCAL_SAVED" || document.status === "PENDING_SYNC";
}

function resolveBusinessSessionId(document: BusinessSyncPlanDocument): string {
  if (document.sessionId) {
    return document.sessionId;
  }

  if (document.kind === "HARVEST_SESSION") {
    return document.id;
  }

  return "UNKNOWN_SESSION";
}

function compareBusinessDocuments(
  left: BusinessSyncPlanDocument,
  right: BusinessSyncPlanDocument
): number {
  return (
    left.sequence - right.sequence ||
    (left.lastLocalWriteIso ?? "").localeCompare(right.lastLocalWriteIso ?? "") ||
    left.id.localeCompare(right.id)
  );
}

function assertBusinessSyncDocuments(
  documents: readonly BusinessSyncDocumentInput[]
): void {
  for (const document of documents) {
    assertIntentMatchesKind(document.syncIntent, document.kind);
  }
}

function assertIntentMatchesKind(
  intent: BusinessSyncIntent,
  kind: SyncDocumentKind
): void {
  const validKind = expectedKindForIntent(intent);

  if (kind !== validKind) {
    throw new Error("Intencja synchronizacji nie pasuje do rodzaju dokumentu.");
  }
}

function expectedKindForIntent(intent: BusinessSyncIntent): SyncDocumentKind {
  switch (intent) {
    case "CREATE_HARVEST_SESSION":
    case "CLOSE_HARVEST_SESSION":
      return "HARVEST_SESSION";
    case "UPSERT_HARVEST_ENTRY":
    case "APPLY_ENTRY_CORRECTION":
      return "HARVEST_ENTRY";
    case "WRITE_AUDIT_EVENT":
      return "AUDIT_EVENT";
  }
}

function mapIntentToOperation(intent: BusinessSyncIntent): BusinessSyncOperation {
  switch (intent) {
    case "CREATE_HARVEST_SESSION":
      return "CREATE_HARVEST_SESSION";
    case "UPSERT_HARVEST_ENTRY":
      return "UPSERT_HARVEST_ENTRIES";
    case "APPLY_ENTRY_CORRECTION":
      return "APPLY_ENTRY_CORRECTIONS";
    case "CLOSE_HARVEST_SESSION":
      return "CONFIRM_SESSION_CLOSE";
    case "WRITE_AUDIT_EVENT":
      return "WRITE_AUDIT_EVENTS";
  }
}

function intentSequence(intent: BusinessSyncIntent): number {
  return operationSequence(mapIntentToOperation(intent));
}

function operationSequence(operation: BusinessSyncOperation): number {
  switch (operation) {
    case "CREATE_HARVEST_SESSION":
      return 2;
    case "UPSERT_HARVEST_ENTRIES":
      return 3;
    case "APPLY_ENTRY_CORRECTIONS":
      return 4;
    case "CONFIRM_SESSION_CLOSE":
      return 5;
    case "WRITE_AUDIT_EVENTS":
      return 6;
  }
}

function createOperationLabel(operation: BusinessSyncOperation): string {
  switch (operation) {
    case "CREATE_HARVEST_SESSION":
      return "Utworz sesje";
    case "UPSERT_HARVEST_ENTRIES":
      return "Zapisz wpisy";
    case "APPLY_ENTRY_CORRECTIONS":
      return "Zapisz korekty lokalne";
    case "CONFIRM_SESSION_CLOSE":
      return "Potwierdz zamkniecie sesji";
    case "WRITE_AUDIT_EVENTS":
      return "Zapisz audyt";
  }
}

function operationRequiresOrderedCommit(operation: BusinessSyncOperation): boolean {
  return operation === "CONFIRM_SESSION_CLOSE" || operation === "WRITE_AUDIT_EVENTS";
}

function operationToleratesTransientState(operation: BusinessSyncOperation): boolean {
  return operation === "CREATE_HARVEST_SESSION" || operation === "UPSERT_HARVEST_ENTRIES";
}
