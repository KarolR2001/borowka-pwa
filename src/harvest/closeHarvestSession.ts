import {
  createAuditEventDraft,
  type AuditEventDocument,
  type AuditSummary
} from "../audit/auditEvents";
import type {
  SeasonDocument,
  WorkerDocument,
  WorkerRateVersionDocument
} from "../domain/domainConfiguration";
import type { UserProfile } from "../domain/identity";
import type { CalculableHarvestEntry } from "./harvestSessionCalculation";
import {
  assertHarvestSessionTransitionAllowed,
  type HarvestSessionAuditAction
} from "./harvestSessionState";
import {
  prepareTrustedHarvestSessionCloseTotals,
  type TrustedHarvestSessionCloseTotals
} from "./harvestSessionTrustBoundary";
import type { HarvestSessionDocument } from "./openHarvestSession";

export type HarvestSessionCloseUpdate = Pick<
  HarvestSessionDocument,
  | "status"
  | "totalEntryCount"
  | "totalQuantityMilli"
  | "totalWeightG"
  | "amountDueGrosz"
  | "calculationVersion"
  | "closedAtDevice"
  | "closedAtServer"
  | "closedBy"
  | "updatedAtServer"
  | "revision"
>;

export type HarvestSessionCloseConfirmationSummary = {
  workerName: string;
  businessDate: string;
  planName: string;
  unitLabel: string;
  rateGrosz: number;
  calculationBasis: HarvestSessionDocument["calculationBasisSnapshot"];
  totalEntryCount: number;
  totalQuantityMilli: number;
  totalWeightG: number;
  amountDueGrosz: number;
  skippedCancelledEntryCount: number;
  pendingWriteCount: number;
};

export type PrepareCloseHarvestSessionOnlineInput = {
  actorProfile: UserProfile;
  session: HarvestSessionDocument;
  entries: readonly CalculableHarvestEntry[];
  season: SeasonDocument;
  worker: WorkerDocument;
  rateVersion: WorkerRateVersionDocument | null;
  isOnline: boolean;
  pendingWriteCount: number;
  confirmationAccepted: boolean;
  closedAtDevice: unknown;
  closedAtServer: unknown;
  auditId: string;
  deviceId: string;
};

export type PreparedCloseHarvestSessionOnline = {
  status: "CLOSED";
  session: HarvestSessionDocument;
  sessionUpdate: HarvestSessionCloseUpdate;
  auditAction: Extract<HarvestSessionAuditAction, "HARVEST_SESSION_CLOSED">;
  beforeSummary: AuditSummary;
  afterSummary: AuditSummary;
  auditEvent: AuditEventDocument;
  trustedTotals: TrustedHarvestSessionCloseTotals;
  confirmationSummary: HarvestSessionCloseConfirmationSummary;
};

export function prepareCloseHarvestSessionOnline(
  input: PrepareCloseHarvestSessionOnlineInput
): PreparedCloseHarvestSessionOnline {
  assertCloseConfirmation(input.confirmationAccepted);
  assertPendingWriteCount(input.pendingWriteCount);

  const actorUid = normalizeRequiredText(
    input.actorProfile.uid,
    "Zamkniecie sesji wymaga aktora."
  );
  const deviceId = normalizeRequiredText(
    input.deviceId,
    "Zamkniecie sesji wymaga urzadzenia."
  );
  assertKnownValue(input.closedAtDevice, "Zamkniecie sesji wymaga czasu urzadzenia.");
  assertKnownValue(input.closedAtServer, "Zamkniecie sesji wymaga czasu serwera.");

  const activeEntryCount = input.entries.filter(
    (entry) => entry.status === "ACTIVE"
  ).length;

  assertHarvestSessionTransitionAllowed({
    type: "CLOSE",
    fromStatus: input.session.status,
    actorRole: input.actorProfile.role,
    isOnline: input.isOnline,
    activeEntryCount
  });
  assertSessionClosureContext({
    session: input.session,
    season: input.season,
    worker: input.worker,
    rateVersion: input.rateVersion
  });

  const trustedTotals = prepareTrustedHarvestSessionCloseTotals({
    session: input.session,
    entries: input.entries
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
    closedAtServer: input.closedAtServer,
    closedBy: actorUid,
    updatedAtServer: input.closedAtServer,
    revision
  };
  const session: HarvestSessionDocument = {
    ...input.session,
    ...sessionUpdate
  };
  const beforeSummary = harvestSessionCloseAuditSummary(input.session);
  const afterSummary = harvestSessionCloseAuditSummary(session);
  const auditEvent = createAuditEventDraft({
    id: input.auditId,
    actorUid,
    actorRoleSnapshot: input.actorProfile.role,
    action: "HARVEST_SESSION_CLOSED",
    entityType: "HARVEST_SESSION",
    entityId: input.session.id,
    businessDate: input.session.businessDate,
    beforeSummary,
    afterSummary,
    reason: null,
    createdAtDevice: input.closedAtDevice,
    createdAtServer: input.closedAtServer,
    deviceId
  });

  return {
    status: "CLOSED",
    session,
    sessionUpdate,
    auditAction: "HARVEST_SESSION_CLOSED",
    beforeSummary,
    afterSummary,
    auditEvent,
    trustedTotals,
    confirmationSummary: buildCloseConfirmationSummary(
      session,
      trustedTotals,
      input.pendingWriteCount
    )
  };
}

export function harvestSessionCloseAuditSummary(
  session: HarvestSessionDocument
): AuditSummary {
  return {
    status: session.status,
    totalEntryCount: session.totalEntryCount,
    totalQuantityMilli: session.totalQuantityMilli,
    totalWeightG: session.totalWeightG,
    amountDueGrosz: session.amountDueGrosz,
    calculationVersion: session.calculationVersion,
    closedBy: session.closedBy,
    revision: session.revision
  };
}

function buildCloseConfirmationSummary(
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

function assertCloseConfirmation(confirmationAccepted: boolean): void {
  if (!confirmationAccepted) {
    throw new Error("Zamkniecie sesji wymaga potwierdzenia podsumowania.");
  }
}

function assertPendingWriteCount(pendingWriteCount: number): void {
  if (!Number.isSafeInteger(pendingWriteCount) || pendingWriteCount < 0) {
    throw new Error("Liczba oczekujacych zapisow ma nieprawidlowy zakres.");
  }

  if (pendingWriteCount > 0) {
    throw new Error("Nie mozna zamknac sesji z oczekujacymi zapisami.");
  }
}

function assertSessionClosureContext({
  session,
  season,
  worker,
  rateVersion
}: {
  session: HarvestSessionDocument;
  season: SeasonDocument;
  worker: WorkerDocument;
  rateVersion: WorkerRateVersionDocument | null;
}): void {
  const businessDate = normalizeBusinessDate(session.businessDate);

  if (season.id !== session.seasonId) {
    throw new Error("Sesja nie nalezy do pobranego sezonu.");
  }

  if (season.status !== "OPEN") {
    throw new Error("Sesje mozna zamknac tylko w otwartym sezonie.");
  }

  if (!isDateWithinSeason(businessDate, season)) {
    throw new Error("Data sesji musi miescic sie w zakresie sezonu.");
  }

  if (worker.id !== session.workerId) {
    throw new Error("Sesja nie dotyczy pobranego zbieracza.");
  }

  if (!worker.active) {
    throw new Error("Nie mozna zamknac sesji nieaktywnego zbieracza.");
  }

  assertRateVersionMatchesSession(session, rateVersion, businessDate);
}

function assertRateVersionMatchesSession(
  session: HarvestSessionDocument,
  rateVersion: WorkerRateVersionDocument | null,
  businessDate: string
): void {
  if (!rateVersion) {
    throw new Error("Brak wersji stawki zapisanej w sesji.");
  }

  if (
    rateVersion.id !== session.rateVersionIdSnapshot ||
    rateVersion.workerId !== session.workerId ||
    rateVersion.planId !== session.planIdSnapshot ||
    rateVersion.rateGroszPerUnit !== session.rateGroszSnapshot
  ) {
    throw new Error("Wersja stawki nie zgadza sie ze snapshotem sesji.");
  }

  if (!isDateWithinRateVersion(businessDate, rateVersion)) {
    throw new Error("Snapshot stawki nie obowiazuje w dacie sesji.");
  }
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

function isDateWithinSeason(businessDate: string, season: SeasonDocument): boolean {
  return (
    businessDate >= normalizeBusinessDate(season.startDate) &&
    (season.endDate === null || businessDate <= normalizeBusinessDate(season.endDate))
  );
}

function isDateWithinRateVersion(
  businessDate: string,
  rateVersion: WorkerRateVersionDocument
): boolean {
  return (
    businessDate >= normalizeBusinessDate(rateVersion.validFrom) &&
    (rateVersion.validTo === null ||
      businessDate <= normalizeBusinessDate(rateVersion.validTo))
  );
}

function normalizeBusinessDate(value: string): string {
  const trimmed = normalizeRequiredText(value, "Podaj date biznesowa.");

  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    throw new Error("Podaj prawidlowa date biznesowa.");
  }

  const [year, month, day] = trimmed.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));

  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    throw new Error("Podaj prawidlowa date biznesowa.");
  }

  return trimmed;
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
