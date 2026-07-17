import type { AuditSummary } from "../audit/auditEvents";
import {
  CALCULATION_RULE_VERSION,
  type SeasonDocument,
  type SettlementCalculationBasis,
  type SettlementPlanDocument,
  type WorkerDocument,
  type WorkerRateVersionDocument
} from "../domain/domainConfiguration";
import { formatMoney } from "../domain/format";
import type { UserProfile } from "../domain/identity";
import {
  checkHarvestSessionTransition,
  type HarvestSessionAuditAction,
  type HarvestSessionStatus
} from "./harvestSessionState";

export const INITIAL_HARVEST_SESSION_REVISION = 1;
export const HARVEST_SESSION_CALCULATION_VERSION = String(CALCULATION_RULE_VERSION);

export type HarvestSessionDocument = {
  id: string;
  seasonId: string;
  workerId: string;
  workerNameSnapshot: string;
  businessDate: string;
  status: HarvestSessionStatus;
  planIdSnapshot: string;
  planNameSnapshot: string;
  calculationBasisSnapshot: SettlementCalculationBasis;
  unitLabelSnapshot: string;
  rateVersionIdSnapshot: string;
  rateGroszSnapshot: number;
  weightRequiredSnapshot: boolean;
  quantityPrecisionSnapshot: number;
  totalEntryCount: number;
  totalQuantityMilli: number;
  totalWeightG: number;
  amountDueGrosz: number | null;
  calculationVersion: string;
  note: string | null;
  createdBy: string;
  createdDeviceId: string;
  createdAtDevice: unknown;
  createdAtServer: unknown;
  updatedAtServer: unknown;
  closedAtDevice: unknown;
  closedAtServer: unknown;
  closedBy: string | null;
  paidAt: unknown;
  paymentId: string | null;
  cancelledAt: unknown;
  cancelledBy: string | null;
  cancellationReason: string | null;
  revision: number;
  legacyImport: boolean;
  legacySourceRows: string[];
};

export type HarvestSessionLookup = Pick<
  HarvestSessionDocument,
  "id" | "workerId" | "businessDate" | "status"
>;

export type PrepareOpenHarvestSessionInput = {
  actorProfile: UserProfile;
  id: string;
  season: SeasonDocument;
  worker: WorkerDocument;
  plans: readonly SettlementPlanDocument[];
  rateVersions: readonly WorkerRateVersionDocument[];
  businessDate: string;
  existingSessions: readonly HarvestSessionLookup[];
  isOnline: boolean;
  note?: string | null;
  secondSessionReason?: string | null;
  createdDeviceId: string;
  createdAtDevice: unknown;
};

export type PreparedOpenHarvestSession = {
  status: "CREATED";
  session: HarvestSessionDocument;
  auditAction: HarvestSessionAuditAction;
  beforeSummary: AuditSummary | null;
  afterSummary: AuditSummary;
  reason: string | null;
  deviceId: string;
  existingOpenSessions: HarvestSessionLookup[];
  duplicateMode: "FIRST_SESSION" | "SECOND_SESSION_CONFIRMED";
  calculationDescription: string;
};

export type ExistingOpenHarvestSessionContinuation = {
  status: "CONTINUE_EXISTING";
  existingOpenSessions: HarvestSessionLookup[];
  canCreateSecondSession: boolean;
  message: string;
};

export type PrepareOpenHarvestSessionResult =
  PreparedOpenHarvestSession | ExistingOpenHarvestSessionContinuation;

export function createHarvestSessionId(
  randomUuid: () => string = defaultRandomUuid
): string {
  return normalizeRequiredText(randomUuid(), "Sesja wymaga identyfikatora UUID.");
}

export function prepareOpenHarvestSession(
  input: PrepareOpenHarvestSessionInput
): PrepareOpenHarvestSessionResult {
  const transitionCheck = checkHarvestSessionTransition({
    type: "CREATE",
    actorRole: input.actorProfile.role,
    isOnline: input.isOnline
  });

  if (transitionCheck.status === "DENIED") {
    throw new Error(transitionCheck.reason);
  }

  const id = normalizeRequiredText(input.id, "Sesja wymaga identyfikatora UUID.");
  const createdBy = normalizeRequiredText(input.actorProfile.uid, "Sesja wymaga autora.");
  const createdDeviceId = normalizeRequiredText(
    input.createdDeviceId,
    "Sesja wymaga urzadzenia tworzacego."
  );
  const businessDate = normalizeBusinessDate(input.businessDate);

  assertKnownDeviceTime(input.createdAtDevice);
  assertOpenSeason(input.season, businessDate);
  assertActiveWorker(input.worker);

  const rateVersion = findEffectiveWorkerRateVersion(
    input.worker,
    input.rateVersions,
    businessDate
  );
  const plan = findActivePlanForRate(input.plans, rateVersion);
  const existingOpenSessions = findOpenHarvestSessionsForWorkerDate(
    input.existingSessions,
    input.worker.id,
    businessDate
  );
  const secondSessionReason = normalizeOptionalText(input.secondSessionReason);

  if (existingOpenSessions.length > 0 && !secondSessionReason) {
    return {
      status: "CONTINUE_EXISTING",
      existingOpenSessions,
      canCreateSecondSession: input.actorProfile.role === "ADMIN",
      message: "Istnieje juz otwarta sesja tej osoby z ta data biznesowa."
    };
  }

  if (existingOpenSessions.length > 0 && input.actorProfile.role !== "ADMIN") {
    throw new Error("Tylko administrator moze utworzyc druga sesje tej osoby i daty.");
  }

  const session: HarvestSessionDocument = {
    id,
    seasonId: input.season.id,
    workerId: input.worker.id,
    workerNameSnapshot: input.worker.displayName,
    businessDate,
    status: "OPEN",
    planIdSnapshot: plan.id,
    planNameSnapshot: plan.name,
    calculationBasisSnapshot: plan.calculationBasis,
    unitLabelSnapshot: plan.unitLabelSingular,
    rateVersionIdSnapshot: rateVersion.id,
    rateGroszSnapshot: rateVersion.rateGroszPerUnit,
    weightRequiredSnapshot: plan.weightRequired,
    quantityPrecisionSnapshot: plan.quantityPrecision,
    totalEntryCount: 0,
    totalQuantityMilli: 0,
    totalWeightG: 0,
    amountDueGrosz: null,
    calculationVersion: HARVEST_SESSION_CALCULATION_VERSION,
    note: normalizeOptionalText(input.note),
    createdBy,
    createdDeviceId,
    createdAtDevice: input.createdAtDevice,
    createdAtServer: null,
    updatedAtServer: null,
    closedAtDevice: null,
    closedAtServer: null,
    closedBy: null,
    paidAt: null,
    paymentId: null,
    cancelledAt: null,
    cancelledBy: null,
    cancellationReason: null,
    revision: INITIAL_HARVEST_SESSION_REVISION,
    legacyImport: false,
    legacySourceRows: []
  };

  return {
    status: "CREATED",
    session,
    auditAction: transitionCheck.definition.auditAction,
    beforeSummary: null,
    afterSummary: harvestSessionAuditSummary(session),
    reason: secondSessionReason,
    deviceId: createdDeviceId,
    existingOpenSessions,
    duplicateMode:
      existingOpenSessions.length > 0 ? "SECOND_SESSION_CONFIRMED" : "FIRST_SESSION",
    calculationDescription: describeHarvestSessionCalculation(session)
  };
}

export function findOpenHarvestSessionsForWorkerDate(
  sessions: readonly HarvestSessionLookup[],
  workerId: string,
  businessDate: string
): HarvestSessionLookup[] {
  const normalizedWorkerId = normalizeRequiredText(workerId, "Wybierz zbieracza.");
  const normalizedBusinessDate = normalizeBusinessDate(businessDate);

  return sessions.filter(
    (session) =>
      session.status === "OPEN" &&
      session.workerId === normalizedWorkerId &&
      session.businessDate === normalizedBusinessDate
  );
}

export function findEffectiveWorkerRateVersion(
  worker: WorkerDocument,
  rateVersions: readonly WorkerRateVersionDocument[],
  businessDate: string
): WorkerRateVersionDocument {
  const normalizedBusinessDate = normalizeBusinessDate(businessDate);
  const effectiveRates = rateVersions
    .filter(
      (rateVersion) =>
        rateVersion.workerId === worker.id &&
        isWorkerRateVersionEffectiveOn(rateVersion, normalizedBusinessDate)
    )
    .sort((left, right) => right.validFrom.localeCompare(left.validFrom));

  if (effectiveRates.length === 0) {
    throw new Error("Brak stawki zbieracza obowiazujacej w dacie sesji.");
  }

  if (effectiveRates.length > 1) {
    throw new Error("Wykryto nakladajace sie stawki zbieracza dla daty sesji.");
  }

  const [rateVersion] = effectiveRates;

  if (!Number.isSafeInteger(rateVersion.rateGroszPerUnit)) {
    throw new Error("Stawka zbieracza ma nieprawidlowa kwote.");
  }

  if (rateVersion.rateGroszPerUnit <= 0) {
    throw new Error("Stawka zbieracza musi byc wieksza od zera.");
  }

  return rateVersion;
}

export function isWorkerRateVersionEffectiveOn(
  rateVersion: WorkerRateVersionDocument,
  businessDate: string
): boolean {
  const normalizedBusinessDate = normalizeBusinessDate(businessDate);
  const validFrom = normalizeBusinessDate(rateVersion.validFrom);
  const validTo = normalizeOptionalBusinessDate(rateVersion.validTo);

  return (
    validFrom <= normalizedBusinessDate &&
    (validTo === null || normalizedBusinessDate <= validTo)
  );
}

export function describeHarvestSessionCalculation(
  session: HarvestSessionDocument
): string {
  const formattedRate = formatMoney(session.rateGroszSnapshot);
  const basis =
    session.calculationBasisSnapshot === "WEIGHT" ? "aktywnej wagi" : "aktywnej ilosci";

  return `${formattedRate} za ${session.unitLabelSnapshot}; oficjalna kwota powstaje przy zamknieciu z sumy ${basis}.`;
}

function findActivePlanForRate(
  plans: readonly SettlementPlanDocument[],
  rateVersion: WorkerRateVersionDocument
): SettlementPlanDocument {
  const plan = plans.find((candidate) => candidate.id === rateVersion.planId);

  if (!plan) {
    throw new Error("Brak planu rozliczenia dla stawki zbieracza.");
  }

  if (!plan.active) {
    throw new Error("Nie mozna otworzyc sesji na archiwalnym planie.");
  }

  return plan;
}

function assertOpenSeason(season: SeasonDocument, businessDate: string): void {
  const startDate = normalizeBusinessDate(season.startDate);
  const endDate = normalizeOptionalBusinessDate(season.endDate);

  if (season.status !== "OPEN") {
    throw new Error("Sesje mozna otworzyc tylko w otwartym sezonie.");
  }

  if (businessDate < startDate || (endDate !== null && businessDate > endDate)) {
    throw new Error("Data sesji musi miescic sie w zakresie sezonu.");
  }
}

function assertActiveWorker(worker: WorkerDocument): void {
  normalizeRequiredText(worker.id, "Wybierz zbieracza.");
  normalizeRequiredText(worker.displayName, "Zbieracz musi miec nazwe.");

  if (!worker.active) {
    throw new Error("Nie mozna otworzyc sesji dla archiwalnego zbieracza.");
  }
}

function assertKnownDeviceTime(value: unknown): void {
  if (value === null || value === undefined) {
    throw new Error("Sesja wymaga czasu utworzenia na urzadzeniu.");
  }
}

function harvestSessionAuditSummary(session: HarvestSessionDocument): AuditSummary {
  return {
    status: session.status,
    seasonId: session.seasonId,
    workerId: session.workerId,
    businessDate: session.businessDate,
    planId: session.planIdSnapshot,
    rateVersionId: session.rateVersionIdSnapshot,
    rateGrosz: session.rateGroszSnapshot,
    revision: session.revision
  };
}

function defaultRandomUuid(): string {
  const cryptoApi = globalThis.crypto as { randomUUID?: () => string } | undefined;

  if (typeof cryptoApi?.randomUUID !== "function") {
    throw new Error("Brak generatora UUID sesji.");
  }

  return cryptoApi.randomUUID();
}

function normalizeRequiredText(value: string, message: string): string {
  const trimmed = value.trim();

  if (!trimmed) {
    throw new Error(message);
  }

  return trimmed;
}

function normalizeOptionalText(value: string | null | undefined): string | null {
  if (value === null || value === undefined) {
    return null;
  }

  const trimmed = value.trim();

  return trimmed.length > 0 ? trimmed : null;
}

function normalizeBusinessDate(
  value: string,
  message = "Podaj prawidlowa date biznesowa."
): string {
  const trimmed = normalizeRequiredText(value, message);
  const match = /^\d{4}-\d{2}-\d{2}$/.exec(trimmed);
  const parsed = Date.parse(`${trimmed}T00:00:00.000Z`);

  if (!match || Number.isNaN(parsed)) {
    throw new Error(message);
  }

  if (new Date(parsed).toISOString().slice(0, 10) !== trimmed) {
    throw new Error(message);
  }

  return trimmed;
}

function normalizeOptionalBusinessDate(value: string | null | undefined): string | null {
  return value === null || value === undefined ? null : normalizeBusinessDate(value);
}
