import {
  createAuditEventDraft,
  type AuditEventDocument,
  type AuditSummary
} from "../audit/auditEvents";
import type { UserProfile } from "../domain/identity";
import {
  assertHarvestSessionTransitionAllowed,
  type HarvestSessionAuditAction
} from "./harvestSessionState";
import { harvestSessionAuditSummary } from "./harvestAudit";
import type { HarvestSessionDocument } from "./openHarvestSession";

export type HarvestSessionCancelUpdate = Pick<
  HarvestSessionDocument,
  | "status"
  | "cancelledAt"
  | "cancelledBy"
  | "cancellationReason"
  | "updatedAtServer"
  | "revision"
>;

export type HarvestSessionCancelConfirmationSummary = {
  workerName: string;
  businessDate: string;
  sourceStatus: HarvestSessionDocument["status"];
  amountDueGrosz: number | null;
  totalEntryCount: number;
  totalQuantityMilli: number;
  totalWeightG: number;
  removesFromSettlementSums: true;
  leavesEntriesHistorical: true;
  pendingWriteCount: number;
  reason: string;
};

export type PrepareCancelHarvestSessionInput = {
  actorProfile: UserProfile;
  session: HarvestSessionDocument;
  isOnline: boolean;
  hasActivePayment: boolean;
  pendingWriteCount: number;
  reason: string;
  cancelledAtDevice: unknown;
  cancelledAtServer: unknown;
  auditId: string;
  deviceId: string;
};

export type PreparedCancelHarvestSession = {
  status: "CANCELLED";
  session: HarvestSessionDocument;
  sessionUpdate: HarvestSessionCancelUpdate;
  auditAction: Extract<HarvestSessionAuditAction, "HARVEST_SESSION_CANCELLED">;
  beforeSummary: AuditSummary;
  afterSummary: AuditSummary;
  auditEvent: AuditEventDocument;
  confirmationSummary: HarvestSessionCancelConfirmationSummary;
};

export function prepareCancelHarvestSession(
  input: PrepareCancelHarvestSessionInput
): PreparedCancelHarvestSession {
  const reason = normalizeReason(input.reason);
  assertPendingWriteCount(input.pendingWriteCount);
  assertKnownValue(input.cancelledAtDevice, "Anulowanie sesji wymaga czasu urzadzenia.");
  assertKnownValue(input.cancelledAtServer, "Anulowanie sesji wymaga czasu serwera.");

  const actorUid = normalizeRequiredText(
    input.actorProfile.uid,
    "Anulowanie sesji wymaga aktora."
  );
  const deviceId = normalizeRequiredText(
    input.deviceId,
    "Anulowanie sesji wymaga urzadzenia."
  );

  assertHarvestSessionTransitionAllowed({
    type: "CANCEL",
    fromStatus: input.session.status,
    actorRole: input.actorProfile.role,
    isOnline: input.isOnline,
    hasActivePayment: input.hasActivePayment,
    reason
  });

  if (input.session.paymentId !== null) {
    throw new Error("Sesja z identyfikatorem wyplaty wymaga anulowania wyplaty.");
  }

  const revision = incrementRevision(input.session.revision);
  const sessionUpdate: HarvestSessionCancelUpdate = {
    status: "CANCELLED",
    cancelledAt: input.cancelledAtServer,
    cancelledBy: actorUid,
    cancellationReason: reason,
    updatedAtServer: input.cancelledAtServer,
    revision
  };
  const session: HarvestSessionDocument = {
    ...input.session,
    ...sessionUpdate
  };
  const beforeSummary = harvestSessionCancelAuditSummary(input.session);
  const afterSummary = harvestSessionCancelAuditSummary(session);
  const auditEvent = createAuditEventDraft({
    id: input.auditId,
    actorUid,
    actorRoleSnapshot: input.actorProfile.role,
    action: "HARVEST_SESSION_CANCELLED",
    entityType: "HARVEST_SESSION",
    entityId: input.session.id,
    businessDate: input.session.businessDate,
    beforeSummary,
    afterSummary,
    reason,
    createdAtDevice: input.cancelledAtDevice,
    createdAtServer: input.cancelledAtServer,
    deviceId
  });

  return {
    status: "CANCELLED",
    session,
    sessionUpdate,
    auditAction: "HARVEST_SESSION_CANCELLED",
    beforeSummary,
    afterSummary,
    auditEvent,
    confirmationSummary: {
      workerName: input.session.workerNameSnapshot,
      businessDate: input.session.businessDate,
      sourceStatus: input.session.status,
      amountDueGrosz: input.session.amountDueGrosz,
      totalEntryCount: input.session.totalEntryCount,
      totalQuantityMilli: input.session.totalQuantityMilli,
      totalWeightG: input.session.totalWeightG,
      removesFromSettlementSums: true,
      leavesEntriesHistorical: true,
      pendingWriteCount: input.pendingWriteCount,
      reason
    }
  };
}

export function harvestSessionCancelAuditSummary(
  session: HarvestSessionDocument
): AuditSummary {
  return harvestSessionAuditSummary(session);
}

function assertPendingWriteCount(pendingWriteCount: number): void {
  if (!Number.isSafeInteger(pendingWriteCount) || pendingWriteCount < 0) {
    throw new Error("Liczba oczekujacych zapisow ma nieprawidlowy zakres.");
  }

  if (pendingWriteCount > 0) {
    throw new Error("Nie mozna anulowac sesji z oczekujacymi zapisami.");
  }
}

function normalizeReason(reason: string): string {
  const normalized = normalizeRequiredText(reason, "Anulowanie sesji wymaga powodu.");

  if (normalized.length < 3) {
    throw new Error("Powod anulowania sesji jest za krotki.");
  }

  return normalized;
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
