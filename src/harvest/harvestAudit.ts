import {
  createAuditEventDraft,
  type AuditAction,
  type AuditEntityType,
  type AuditEventDocument,
  type AuditSummary
} from "../audit/auditEvents";
import type { UserProfile } from "../domain/identity";
import type { CorrectableHarvestEntry } from "./harvestEntryCorrection";
import type { HarvestSessionDocument } from "./openHarvestSession";

export const HARVEST_SESSION_OPERATION_AUDIT_ACTIONS = [
  "HARVEST_SESSION_CREATED",
  "HARVEST_SESSION_CLOSED",
  "HARVEST_SESSION_RECLOSED",
  "HARVEST_SESSION_REOPENED",
  "HARVEST_SESSION_CANCELLED",
  "HARVEST_SESSION_MARKED_REVIEW_REQUIRED",
  "HARVEST_SESSION_REVIEW_RESOLVED"
] as const satisfies readonly AuditAction[];

export const HARVEST_ENTRY_OPERATION_AUDIT_ACTIONS = [
  "HARVEST_ENTRY_CREATED",
  "HARVEST_ENTRY_CANCELLED"
] as const satisfies readonly AuditAction[];

export const HARVEST_OPERATION_AUDIT_ACTIONS = [
  ...HARVEST_SESSION_OPERATION_AUDIT_ACTIONS,
  ...HARVEST_ENTRY_OPERATION_AUDIT_ACTIONS
] as const satisfies readonly AuditAction[];

export const HARVEST_AUDIT_ENTITY_TYPES = [
  "HARVEST_SESSION",
  "HARVEST_ENTRY"
] as const satisfies readonly AuditEntityType[];

export type HarvestOperationAuditAction =
  (typeof HARVEST_OPERATION_AUDIT_ACTIONS)[number];
export type HarvestAuditEntityType = (typeof HARVEST_AUDIT_ENTITY_TYPES)[number];

export type HarvestOperationAuditEventInput = {
  id: string;
  actorProfile: Pick<UserProfile, "uid" | "role">;
  action: HarvestOperationAuditAction;
  entityId: string;
  businessDate: string | null;
  beforeSummary?: AuditSummary | null;
  afterSummary?: AuditSummary | null;
  reason?: string | null;
  createdAtDevice: unknown;
  createdAtServer: unknown;
  deviceId: string;
};

export type HarvestEntryAuditSnapshot = CorrectableHarvestEntry &
  Partial<{
    cancellationReason: string;
    cancelledBy: string;
    replacesEntryId: string;
  }>;

export type HarvestEntryCorrectionAuditEventsInput = {
  cancellationAuditId: string;
  replacementAuditId: string;
  actorProfile: Pick<UserProfile, "uid" | "role">;
  entryBeforeCancellation: CorrectableHarvestEntry;
  entryAfterCancellation: HarvestEntryAuditSnapshot;
  replacementEntry: HarvestEntryAuditSnapshot;
  reason: string;
  createdAtDevice: unknown;
  createdAtServer: unknown;
  deviceId: string;
};

const REASON_REQUIRED_ACTIONS = [
  "HARVEST_SESSION_REOPENED",
  "HARVEST_SESSION_CANCELLED",
  "HARVEST_SESSION_MARKED_REVIEW_REQUIRED",
  "HARVEST_SESSION_REVIEW_RESOLVED",
  "HARVEST_ENTRY_CANCELLED"
] as const satisfies readonly HarvestOperationAuditAction[];

export function createHarvestOperationAuditEventDraft(
  input: HarvestOperationAuditEventInput
): AuditEventDocument {
  const reason = normalizeHarvestAuditReason(input.action, input.reason);

  return createAuditEventDraft({
    id: input.id,
    actorUid: input.actorProfile.uid,
    actorRoleSnapshot: input.actorProfile.role,
    action: input.action,
    entityType: harvestAuditEntityTypeForAction(input.action),
    entityId: input.entityId,
    businessDate: input.businessDate,
    beforeSummary: input.beforeSummary,
    afterSummary: input.afterSummary,
    reason,
    createdAtDevice: input.createdAtDevice,
    createdAtServer: input.createdAtServer,
    deviceId: input.deviceId
  });
}

export function createHarvestEntryCorrectionAuditEvents(
  input: HarvestEntryCorrectionAuditEventsInput
): readonly [AuditEventDocument, AuditEventDocument] {
  const cancellationReason = normalizeRequiredReason(input.reason);
  assertSameEntryIdentity(input.entryBeforeCancellation, input.entryAfterCancellation);
  assertReplacementMatchesCancelledEntry(
    input.entryAfterCancellation,
    input.replacementEntry
  );

  const cancelledEvent = createHarvestOperationAuditEventDraft({
    id: input.cancellationAuditId,
    actorProfile: input.actorProfile,
    action: "HARVEST_ENTRY_CANCELLED",
    entityId: input.entryBeforeCancellation.id,
    businessDate: input.entryBeforeCancellation.businessDate,
    beforeSummary: harvestEntryAuditSummary(input.entryBeforeCancellation),
    afterSummary: harvestEntryAuditSummary(input.entryAfterCancellation),
    reason: cancellationReason,
    createdAtDevice: input.createdAtDevice,
    createdAtServer: input.createdAtServer,
    deviceId: input.deviceId
  });
  const replacementEvent = createHarvestOperationAuditEventDraft({
    id: input.replacementAuditId,
    actorProfile: input.actorProfile,
    action: "HARVEST_ENTRY_CREATED",
    entityId: input.replacementEntry.id,
    businessDate: input.replacementEntry.businessDate,
    beforeSummary: null,
    afterSummary: harvestEntryAuditSummary(input.replacementEntry),
    reason: cancellationReason,
    createdAtDevice: input.createdAtDevice,
    createdAtServer: input.createdAtServer,
    deviceId: input.deviceId
  });

  return [cancelledEvent, replacementEvent];
}

export function harvestAuditEntityTypeForAction(
  action: HarvestOperationAuditAction
): HarvestAuditEntityType {
  return HARVEST_ENTRY_OPERATION_AUDIT_ACTIONS.includes(
    action as (typeof HARVEST_ENTRY_OPERATION_AUDIT_ACTIONS)[number]
  )
    ? "HARVEST_ENTRY"
    : "HARVEST_SESSION";
}

export function isHarvestAuditReasonRequired(
  action: HarvestOperationAuditAction
): boolean {
  return REASON_REQUIRED_ACTIONS.includes(
    action as (typeof REASON_REQUIRED_ACTIONS)[number]
  );
}

export function resolveHarvestSessionCloseAuditAction(
  session: HarvestSessionDocument
): Extract<
  HarvestOperationAuditAction,
  "HARVEST_SESSION_CLOSED" | "HARVEST_SESSION_RECLOSED"
> {
  return session.revision > 1 ? "HARVEST_SESSION_RECLOSED" : "HARVEST_SESSION_CLOSED";
}

export function harvestSessionAuditSummary(
  session: HarvestSessionDocument
): AuditSummary {
  return {
    status: session.status,
    seasonId: session.seasonId,
    workerId: session.workerId,
    businessDate: session.businessDate,
    planId: session.planIdSnapshot,
    rateVersionId: session.rateVersionIdSnapshot,
    rateGroszPerUnit: session.rateGroszSnapshot,
    totalEntryCount: session.totalEntryCount,
    totalQuantityMilli: session.totalQuantityMilli,
    totalWeightG: session.totalWeightG,
    amountDueGrosz: session.amountDueGrosz,
    calculationVersion: session.calculationVersion,
    closedBy: session.closedBy,
    paymentId: session.paymentId,
    revision: session.revision
  };
}

export function harvestEntryAuditSummary(entry: HarvestEntryAuditSnapshot): AuditSummary {
  return {
    entryId: entry.id,
    sessionId: entry.sessionId,
    seasonId: entry.seasonId,
    workerId: entry.workerId,
    businessDate: entry.businessDate,
    status: entry.status,
    sequenceNumber: entry.sequenceNumber,
    quantityMilli: entry.quantityMilli,
    weightG: entry.weightG,
    pendingSync: entry.pendingSync,
    createdBy: entry.createdBy,
    createdDeviceId: entry.createdDeviceId,
    replacesEntryId: entry.replacesEntryId ?? null,
    cancelledBy: entry.cancelledBy ?? null
  };
}

function normalizeHarvestAuditReason(
  action: HarvestOperationAuditAction,
  reason: string | null | undefined
): string | null {
  if (!isHarvestAuditReasonRequired(action)) {
    return normalizeOptionalReason(reason);
  }

  return normalizeRequiredReason(reason);
}

function normalizeRequiredReason(reason: string | null | undefined): string {
  const normalized = normalizeOptionalReason(reason);

  if (!normalized) {
    throw new Error("Audyt operacji zbioru wymaga powodu.");
  }

  if (normalized.length < 3) {
    throw new Error("Powod audytu operacji zbioru jest za krotki.");
  }

  return normalized;
}

function normalizeOptionalReason(reason: string | null | undefined): string | null {
  if (reason === null || reason === undefined) {
    return null;
  }

  const normalized = reason.trim().replace(/\s+/g, " ");

  return normalized.length > 0 ? normalized : null;
}

function assertSameEntryIdentity(
  before: CorrectableHarvestEntry,
  after: HarvestEntryAuditSnapshot
): void {
  if (before.id !== after.id) {
    throw new Error("Audyt anulowania wpisu wymaga tego samego identyfikatora wpisu.");
  }

  if (after.status !== "CANCELLED") {
    throw new Error("Audyt anulowania wpisu wymaga statusu CANCELLED po zmianie.");
  }
}

function assertReplacementMatchesCancelledEntry(
  cancelledEntry: HarvestEntryAuditSnapshot,
  replacementEntry: HarvestEntryAuditSnapshot
): void {
  if (replacementEntry.replacesEntryId !== cancelledEntry.id) {
    throw new Error("Audyt korekty wpisu wymaga powiazania replacement -> cancelled.");
  }

  if (replacementEntry.sessionId !== cancelledEntry.sessionId) {
    throw new Error("Wpis zastepujacy musi nalezec do tej samej sesji.");
  }

  if (replacementEntry.workerId !== cancelledEntry.workerId) {
    throw new Error("Wpis zastepujacy musi nalezec do tego samego zbieracza.");
  }

  if (replacementEntry.status !== "ACTIVE") {
    throw new Error("Wpis zastepujacy w audycie musi byc aktywny.");
  }
}
