import type { AuditSummary } from "../audit/auditEvents";
import type { UserProfile } from "../domain/identity";
import {
  harvestSessionCloseAuditSummary,
  type HarvestSessionCloseConfirmationSummary,
  type HarvestSessionCloseUpdate
} from "../harvest/closeHarvestSession";
import { resolveHarvestSessionCloseAuditAction } from "../harvest/harvestAudit";
import type { HarvestSessionAuditAction } from "../harvest/harvestSessionState";
import type { CalculableHarvestEntry } from "../harvest/harvestSessionCalculation";
import {
  prepareTrustedHarvestSessionCloseTotals,
  type TrustedHarvestSessionCloseTotals
} from "../harvest/harvestSessionTrustBoundary";
import type { HarvestEntryDocument } from "../harvest/harvestSessionDashboard";
import type { HarvestSessionDocument } from "../harvest/openHarvestSession";

export type OfflineHarvestSessionCloseSyncState = "LOCAL_CLOSED_PENDING_SYNC";
export type OfflineHarvestSessionAmountOfficiality = "PENDING_SERVER_CONFIRMATION";
export type OfflineHarvestSessionCloseConflictPolicy =
  "SERVER_RECHECK_REQUIRED_REVIEW_ON_CONFLICT";

export type PrepareOfflineHarvestSessionCloseInput = {
  actorProfile: UserProfile;
  session: HarvestSessionDocument;
  entries: HarvestEntryDocument[];
  confirmationAccepted: boolean;
  closedAtDevice: unknown;
  deviceId: string;
};

export type PreparedOfflineHarvestSessionClose = {
  status: "CLOSED_OFFLINE";
  session: HarvestSessionDocument;
  sessionUpdate: HarvestSessionCloseUpdate;
  selectedSessionId: null;
  syncState: OfflineHarvestSessionCloseSyncState;
  entriesLocked: true;
  paymentAvailable: false;
  amountOfficiality: OfflineHarvestSessionAmountOfficiality;
  conflictPolicy: OfflineHarvestSessionCloseConflictPolicy;
  auditAction: Extract<
    HarvestSessionAuditAction,
    "HARVEST_SESSION_CLOSED" | "HARVEST_SESSION_RECLOSED"
  >;
  beforeSummary: AuditSummary;
  afterSummary: AuditSummary;
  trustedTotals: TrustedHarvestSessionCloseTotals;
  confirmationSummary: HarvestSessionCloseConfirmationSummary;
  pendingWriteCount: number;
  message: string;
};

export function prepareOfflineHarvestSessionClose(
  input: PrepareOfflineHarvestSessionCloseInput
): PreparedOfflineHarvestSessionClose {
  assertCloseConfirmation(input.confirmationAccepted);
  assertOfflineCloseActor(input.actorProfile);
  assertActorCanCloseSession(input.actorProfile, input.session);

  const actorUid = normalizeRequiredText(
    input.actorProfile.uid,
    "Zamkniecie sesji offline wymaga aktora."
  );
  normalizeRequiredText(input.deviceId, "Zamkniecie sesji offline wymaga urzadzenia.");
  assertKnownValue(
    input.closedAtDevice,
    "Zamkniecie sesji offline wymaga czasu urzadzenia."
  );

  const trustedTotals = prepareTrustedHarvestSessionCloseTotals({
    session: input.session,
    entries: input.entries.map(toCalculableHarvestEntry)
  });
  const revision = incrementRevision(input.session.revision);
  const sessionUpdate: HarvestSessionCloseUpdate = {
    status: "CLOSED",
    totalEntryCount: trustedTotals.totalEntryCount,
    totalQuantityMilli: trustedTotals.totalQuantityMilli,
    totalWeightG: trustedTotals.totalWeightG,
    amountDueGrosz: trustedTotals.amountDueGrosz,
    calculationVersion: trustedTotals.calculationVersion,
    closedAtDevice: input.closedAtDevice,
    closedAtServer: null,
    closedBy: actorUid,
    updatedAtServer: null,
    revision
  };
  const session: HarvestSessionDocument = {
    ...input.session,
    ...sessionUpdate
  };
  const pendingWriteCount = countOfflineClosePendingWrites(input.entries);

  return {
    status: "CLOSED_OFFLINE",
    session,
    sessionUpdate,
    selectedSessionId: null,
    syncState: "LOCAL_CLOSED_PENDING_SYNC",
    entriesLocked: true,
    paymentAvailable: false,
    amountOfficiality: "PENDING_SERVER_CONFIRMATION",
    conflictPolicy: "SERVER_RECHECK_REQUIRED_REVIEW_ON_CONFLICT",
    auditAction: resolveHarvestSessionCloseAuditAction(input.session),
    beforeSummary: harvestSessionCloseAuditSummary(input.session),
    afterSummary: harvestSessionCloseAuditSummary(session),
    trustedTotals,
    confirmationSummary: buildOfflineCloseConfirmationSummary(
      session,
      trustedTotals,
      pendingWriteCount
    ),
    pendingWriteCount,
    message: `Zamknieto lokalnie sesje dla ${session.workerNameSnapshot}.`
  };
}

export function countOfflineClosePendingWrites(
  entries: readonly Pick<HarvestEntryDocument, "pendingSync">[]
): number {
  return 1 + entries.filter((entry) => entry.pendingSync).length;
}

function buildOfflineCloseConfirmationSummary(
  session: HarvestSessionDocument,
  trustedTotals: TrustedHarvestSessionCloseTotals,
  pendingWriteCount: number
): HarvestSessionCloseConfirmationSummary {
  return {
    workerName: session.workerNameSnapshot,
    businessDate: session.businessDate,
    planName: session.planNameSnapshot,
    unitLabel: session.unitLabelSnapshot,
    rateGrosz: session.rateGroszSnapshot,
    calculationBasis: session.calculationBasisSnapshot,
    totalEntryCount: trustedTotals.totalEntryCount,
    totalQuantityMilli: trustedTotals.totalQuantityMilli,
    totalWeightG: trustedTotals.totalWeightG,
    amountDueGrosz: trustedTotals.amountDueGrosz,
    skippedCancelledEntryCount: trustedTotals.skippedCancelledEntryCount,
    pendingWriteCount
  };
}

function toCalculableHarvestEntry(entry: HarvestEntryDocument): CalculableHarvestEntry {
  return {
    id: entry.id,
    status: entry.status,
    quantityMilli: entry.quantityMilli,
    weightG: entry.weightG
  };
}

function assertCloseConfirmation(confirmationAccepted: boolean): void {
  if (!confirmationAccepted) {
    throw new Error("Zamkniecie sesji offline wymaga potwierdzenia podsumowania.");
  }
}

function assertOfflineCloseActor(actorProfile: UserProfile): void {
  if (
    !actorProfile.active ||
    actorProfile.registrationStatus !== "APPROVED" ||
    (actorProfile.role !== "ADMIN" && actorProfile.role !== "OPERATOR")
  ) {
    throw new Error(
      "Zamkniecie sesji offline wymaga aktywnego administratora albo operatora."
    );
  }
}

function assertActorCanCloseSession(
  actorProfile: UserProfile,
  session: HarvestSessionDocument
): void {
  if (actorProfile.role === "ADMIN" || session.createdBy === actorProfile.uid) {
    return;
  }

  throw new Error("Operator moze zamknac offline tylko prowadzona przez siebie sesje.");
}

function incrementRevision(revision: number): number {
  if (!Number.isSafeInteger(revision) || revision < 1) {
    throw new Error("Rewizja sesji ma nieprawidlowy zakres.");
  }

  if (revision === Number.MAX_SAFE_INTEGER) {
    throw new Error("Rewizja sesji przekracza bezpieczny zakres.");
  }

  return revision + 1;
}

function normalizeRequiredText(value: string, message: string): string {
  const trimmed = value.trim().replace(/\s+/g, " ");

  if (!trimmed) {
    throw new Error(message);
  }

  return trimmed;
}

function assertKnownValue(value: unknown, message: string): void {
  if (value === null || value === undefined) {
    throw new Error(message);
  }
}
