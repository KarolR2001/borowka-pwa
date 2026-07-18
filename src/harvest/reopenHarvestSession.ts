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

export type HarvestSessionReopenUpdate = Pick<
  HarvestSessionDocument,
  | "status"
  | "amountDueGrosz"
  | "closedAtDevice"
  | "closedAtServer"
  | "closedBy"
  | "updatedAtServer"
  | "revision"
>;

export type HarvestSessionReopenConfirmationSummary = {
  workerName: string;
  businessDate: string;
  previousAmountDueGrosz: number;
  totalEntryCount: number;
  totalQuantityMilli: number;
  totalWeightG: number;
  reportsMayChange: true;
  pendingWriteCount: number;
  reason: string;
};

export type PrepareReopenHarvestSessionInput = {
  actorProfile: UserProfile;
  session: HarvestSessionDocument;
  isOnline: boolean;
  hasActivePayment: boolean;
  pendingWriteCount: number;
  reason: string;
  reopenedAtDevice: unknown;
  reopenedAtServer: unknown;
  auditId: string;
  deviceId: string;
};

export type PreparedReopenHarvestSession = {
  status: "REOPENED";
  session: HarvestSessionDocument;
  sessionUpdate: HarvestSessionReopenUpdate;
  auditAction: Extract<HarvestSessionAuditAction, "HARVEST_SESSION_REOPENED">;
  beforeSummary: AuditSummary;
  afterSummary: AuditSummary;
  auditEvent: AuditEventDocument;
  confirmationSummary: HarvestSessionReopenConfirmationSummary;
};

export function prepareReopenHarvestSession(
  input: PrepareReopenHarvestSessionInput
): PreparedReopenHarvestSession {
  const reason = normalizeReason(input.reason);
  assertPendingWriteCount(input.pendingWriteCount);
  assertKnownValue(input.reopenedAtDevice, "Ponowne otwarcie wymaga czasu urzadzenia.");
  assertKnownValue(input.reopenedAtServer, "Ponowne otwarcie wymaga czasu serwera.");

  const actorUid = normalizeRequiredText(
    input.actorProfile.uid,
    "Ponowne otwarcie wymaga aktora."
  );
  const deviceId = normalizeRequiredText(
    input.deviceId,
    "Ponowne otwarcie wymaga urzadzenia."
  );
  const previousAmountDueGrosz = assertOfficialAmount(input.session.amountDueGrosz);

  assertHarvestSessionTransitionAllowed({
    type: "REOPEN",
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
  const sessionUpdate: HarvestSessionReopenUpdate = {
    status: "OPEN",
    amountDueGrosz: null,
    closedAtDevice: null,
    closedAtServer: null,
    closedBy: null,
    updatedAtServer: input.reopenedAtServer,
    revision
  };
  const session: HarvestSessionDocument = {
    ...input.session,
    ...sessionUpdate
  };
  const beforeSummary = harvestSessionReopenAuditSummary(input.session);
  const afterSummary = harvestSessionReopenAuditSummary(session);
  const auditEvent = createAuditEventDraft({
    id: input.auditId,
    actorUid,
    actorRoleSnapshot: input.actorProfile.role,
    action: "HARVEST_SESSION_REOPENED",
    entityType: "HARVEST_SESSION",
    entityId: input.session.id,
    businessDate: input.session.businessDate,
    beforeSummary,
    afterSummary,
    reason,
    createdAtDevice: input.reopenedAtDevice,
    createdAtServer: input.reopenedAtServer,
    deviceId
  });

  return {
    status: "REOPENED",
    session,
    sessionUpdate,
    auditAction: "HARVEST_SESSION_REOPENED",
    beforeSummary,
    afterSummary,
    auditEvent,
    confirmationSummary: {
      workerName: input.session.workerNameSnapshot,
      businessDate: input.session.businessDate,
      previousAmountDueGrosz,
      totalEntryCount: input.session.totalEntryCount,
      totalQuantityMilli: input.session.totalQuantityMilli,
      totalWeightG: input.session.totalWeightG,
      reportsMayChange: true,
      pendingWriteCount: input.pendingWriteCount,
      reason
    }
  };
}

export function harvestSessionReopenAuditSummary(
  session: HarvestSessionDocument
): AuditSummary {
  return harvestSessionAuditSummary(session);
}

function assertOfficialAmount(amountDueGrosz: number | null): number {
  if (!Number.isSafeInteger(amountDueGrosz) || amountDueGrosz === null) {
    throw new Error("Ponowne otwarcie wymaga oficjalnej kwoty zamknietej sesji.");
  }

  if (amountDueGrosz < 0) {
    throw new Error("Oficjalna kwota sesji ma nieprawidlowy zakres.");
  }

  return amountDueGrosz;
}

function assertPendingWriteCount(pendingWriteCount: number): void {
  if (!Number.isSafeInteger(pendingWriteCount) || pendingWriteCount < 0) {
    throw new Error("Liczba oczekujacych zapisow ma nieprawidlowy zakres.");
  }

  if (pendingWriteCount > 0) {
    throw new Error("Nie mozna ponownie otworzyc sesji z oczekujacymi zapisami.");
  }
}

function normalizeReason(reason: string): string {
  const normalized = normalizeRequiredText(
    reason,
    "Ponowne otwarcie sesji wymaga powodu."
  );

  if (normalized.length < 3) {
    throw new Error("Powod ponownego otwarcia jest za krotki.");
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
