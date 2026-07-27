import type { AuditSummary } from "../audit/auditEvents";
import { APP_META } from "../config/appMeta";
import { getIdentityAccessState, type UserProfile } from "../domain/identity";
import { harvestSessionAuditSummary } from "../harvest/harvestAudit";
import type { HarvestSessionAuditAction } from "../harvest/harvestSessionState";
import {
  HARVEST_SESSION_CALCULATION_VERSION,
  INITIAL_HARVEST_SESSION_REVISION,
  describeHarvestSessionCalculation,
  findOpenHarvestSessionsForWorkerDate,
  type HarvestSessionDocument,
  type HarvestSessionLookup
} from "../harvest/openHarvestSession";
import {
  CONFIGURATION_CACHE_VERSION,
  type CachedSeason,
  type CachedSettlementPlan,
  type CachedWorker,
  type CachedWorkerRateVersion,
  type ConfigurationCacheReadiness,
  type ConfigurationCacheSnapshot
} from "./configurationCache";

export type OfflineHarvestSessionSyncState = "LOCAL_PENDING_SYNC";

export type PrepareOfflineHarvestSessionInput = {
  actorProfile: UserProfile;
  configurationSnapshot: ConfigurationCacheSnapshot | null;
  configurationReadiness: ConfigurationCacheReadiness;
  workerId: string;
  businessDate: string;
  id: string;
  createdDeviceId: string;
  createdAtDevice: unknown;
  note?: string | null;
  secondSessionReason?: string | null;
};

export type PreparedOfflineHarvestSession = {
  status: "CREATED_OFFLINE";
  session: HarvestSessionDocument;
  selectedSessionId: string;
  syncState: OfflineHarvestSessionSyncState;
  cacheSnapshotId: string;
  auditAction: HarvestSessionAuditAction;
  beforeSummary: AuditSummary | null;
  afterSummary: AuditSummary;
  reason: string | null;
  deviceId: string;
  existingOpenSessions: HarvestSessionLookup[];
  duplicateMode: "FIRST_SESSION" | "SECOND_SESSION_CONFIRMED";
  calculationDescription: string;
  message: string;
};

export type ExistingOfflineHarvestSessionContinuation = {
  status: "CONTINUE_EXISTING";
  selectedSessionId: string | null;
  cacheSnapshotId: string;
  existingOpenSessions: HarvestSessionLookup[];
  canCreateSecondSession: boolean;
  message: string;
};

export type PrepareOfflineHarvestSessionResult =
  PreparedOfflineHarvestSession | ExistingOfflineHarvestSessionContinuation;

export function prepareOfflineHarvestSession(
  input: PrepareOfflineHarvestSessionInput
): PrepareOfflineHarvestSessionResult {
  assertOfflineActorProfile(input.actorProfile);

  const id = normalizeRequiredText(input.id, "Sesja offline wymaga identyfikatora UUID.");
  const createdDeviceId = normalizeRequiredText(
    input.createdDeviceId,
    "Sesja offline wymaga urzadzenia tworzacego."
  );
  const snapshot = assertReadyConfigurationSnapshot({
    actorProfile: input.actorProfile,
    configurationReadiness: input.configurationReadiness,
    configurationSnapshot: input.configurationSnapshot,
    createdDeviceId
  });
  const createdBy = normalizeRequiredText(
    input.actorProfile.uid,
    "Sesja offline wymaga autora."
  );
  const businessDate = normalizeBusinessDate(input.businessDate);

  assertKnownDeviceTime(input.createdAtDevice);

  const activeSeason = assertCachedOpenSeason(snapshot.activeSeason, businessDate);
  const worker = findCachedWorker(snapshot.workers, input.workerId);
  const rateVersion = findEffectiveCachedRateVersion(
    worker,
    snapshot.rateVersions,
    businessDate
  );
  const plan = findCachedPlan(snapshot.plans, rateVersion);
  const existingOpenSessions = findOpenHarvestSessionsForWorkerDate(
    snapshot.openSessions,
    worker.id,
    businessDate
  );
  const secondSessionReason = normalizeOptionalText(input.secondSessionReason);

  if (existingOpenSessions.length > 0 && !secondSessionReason) {
    return {
      status: "CONTINUE_EXISTING",
      selectedSessionId: existingOpenSessions.at(0)?.id ?? null,
      cacheSnapshotId: snapshot.id,
      existingOpenSessions,
      canCreateSecondSession: input.actorProfile.role === "ADMIN",
      message: "W cache offline istnieje juz otwarta sesja tej osoby z ta data biznesowa."
    };
  }

  if (existingOpenSessions.length > 0 && input.actorProfile.role !== "ADMIN") {
    throw new Error(
      "Tylko administrator moze utworzyc druga sesje offline tej osoby i daty."
    );
  }

  const session: HarvestSessionDocument = {
    id,
    seasonId: activeSeason.id,
    workerId: worker.id,
    workerNameSnapshot: worker.displayName,
    businessDate,
    status: "OPEN",
    planIdSnapshot: plan.id,
    planNameSnapshot: plan.name,
    calculationBasisSnapshot: plan.calculationBasis,
    unitLabelSnapshot: plan.unitLabelSingular,
    unitLabelPluralSnapshot: plan.unitLabelPlural,
    rateVersionIdSnapshot: rateVersion.id,
    rateGroszSnapshot: rateVersion.rateGroszPerUnit,
    weightRequiredSnapshot: plan.weightRequired,
    quantityPrecisionSnapshot: plan.quantityPrecision,
    allowBatchQuantitySnapshot: plan.allowBatchQuantity,
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
    status: "CREATED_OFFLINE",
    session,
    selectedSessionId: session.id,
    syncState: "LOCAL_PENDING_SYNC",
    cacheSnapshotId: snapshot.id,
    auditAction: "HARVEST_SESSION_CREATED",
    beforeSummary: null,
    afterSummary: harvestSessionAuditSummary(session),
    reason: secondSessionReason,
    deviceId: createdDeviceId,
    existingOpenSessions,
    duplicateMode:
      existingOpenSessions.length > 0 ? "SECOND_SESSION_CONFIRMED" : "FIRST_SESSION",
    calculationDescription: describeHarvestSessionCalculation(session),
    message: `Utworzono lokalnie sesje offline dla ${session.workerNameSnapshot}.`
  };
}

function assertOfflineActorProfile(profile: UserProfile): void {
  const accessState = getIdentityAccessState(profile);

  if (accessState.status !== "READY") {
    throw new Error(
      `Profil nie jest zatwierdzony do pracy offline: ${accessState.reason}`
    );
  }

  if (profile.role !== "ADMIN" && profile.role !== "OPERATOR") {
    throw new Error("Tylko administrator albo operator moze utworzyc sesje offline.");
  }

  if (!profile.offlineConsent) {
    throw new Error("Sesja offline wymaga zgody na trwale dane offline.");
  }
}

function assertReadyConfigurationSnapshot({
  actorProfile,
  configurationReadiness,
  configurationSnapshot,
  createdDeviceId
}: {
  actorProfile: UserProfile;
  configurationReadiness: ConfigurationCacheReadiness;
  configurationSnapshot: ConfigurationCacheSnapshot | null;
  createdDeviceId: string;
}): ConfigurationCacheSnapshot {
  if (configurationReadiness.status !== "READY") {
    const details = configurationReadiness.missingRequirements.join(" ");
    throw new Error(
      details
        ? `Aplikacja nie jest przygotowana do pracy offline: ${details}`
        : "Aplikacja nie jest przygotowana do pracy offline."
    );
  }

  if (!configurationSnapshot) {
    throw new Error("Brak lokalnego snapshotu konfiguracji.");
  }

  if (configurationSnapshot.version !== CONFIGURATION_CACHE_VERSION) {
    throw new Error("Snapshot konfiguracji ma nieobslugiwana wersje.");
  }

  if (configurationSnapshot.schemaVersion !== APP_META.schemaVersion) {
    throw new Error("Snapshot konfiguracji ma nieaktualna wersje schematu.");
  }

  if (configurationSnapshot.calculationVersion !== APP_META.calculationVersion) {
    throw new Error("Snapshot konfiguracji ma nieaktualna wersje kalkulacji.");
  }

  if (configurationSnapshot.userUid !== actorProfile.uid) {
    throw new Error("Snapshot offline nalezy do innego konta.");
  }

  if (configurationSnapshot.account.uid !== actorProfile.uid) {
    throw new Error("Profil zapisany w cache nalezy do innego konta.");
  }

  if (configurationSnapshot.account.role !== actorProfile.role) {
    throw new Error("Rola profilu rozni sie od roli zapisanej w cache offline.");
  }

  if (!configurationSnapshot.account.offlineConsent) {
    throw new Error("Cache offline nie potwierdza zgody na trwale dane offline.");
  }

  if (configurationSnapshot.deviceId !== createdDeviceId.trim()) {
    throw new Error("Snapshot offline zostal przygotowany dla innego urzadzenia.");
  }

  if (configurationSnapshot.invalidDocumentCount > 0) {
    throw new Error("Cache offline zawiera bledne dokumenty konfiguracji.");
  }

  return configurationSnapshot;
}

function assertCachedOpenSeason(
  season: CachedSeason | null,
  businessDate: string
): CachedSeason {
  if (!season) {
    throw new Error("Brak aktywnego sezonu w cache offline.");
  }

  if (season.status !== "OPEN") {
    throw new Error("Sesje offline mozna otworzyc tylko w otwartym sezonie.");
  }

  const startDate = normalizeBusinessDate(season.startDate);
  const endDate = normalizeOptionalBusinessDate(season.endDate);

  if (businessDate < startDate || (endDate !== null && businessDate > endDate)) {
    throw new Error("Data sesji musi miescic sie w zakresie sezonu z cache offline.");
  }

  return season;
}

function findCachedWorker(
  workers: readonly CachedWorker[],
  workerId: string
): CachedWorker {
  const normalizedWorkerId = normalizeRequiredText(workerId, "Wybierz zbieracza.");
  const worker = workers.find((candidate) => candidate.id === normalizedWorkerId);

  if (!worker) {
    throw new Error("Wybrany zbieracz nie jest dostepny w cache offline.");
  }

  normalizeRequiredText(worker.displayName, "Zbieracz w cache offline musi miec nazwe.");

  if (!worker.active) {
    throw new Error("Nie mozna otworzyc sesji offline dla archiwalnego zbieracza.");
  }

  return worker;
}

function findEffectiveCachedRateVersion(
  worker: CachedWorker,
  rateVersions: readonly CachedWorkerRateVersion[],
  businessDate: string
): CachedWorkerRateVersion {
  const hasCurrentRateInCache = rateVersions.some(
    (rateVersion) => rateVersion.id === worker.currentRateVersionId
  );

  if (!hasCurrentRateInCache) {
    throw new Error("Brak biezacej stawki zbieracza w cache offline.");
  }

  const effectiveRates = rateVersions
    .filter(
      (rateVersion) =>
        rateVersion.workerId === worker.id &&
        rateVersion.active &&
        isCachedRateEffectiveOn(rateVersion, businessDate)
    )
    .sort((left, right) => right.validFrom.localeCompare(left.validFrom));

  if (effectiveRates.length === 0) {
    throw new Error("Brak stawki zbieracza w cache offline dla daty sesji.");
  }

  if (effectiveRates.length > 1) {
    throw new Error("Wykryto nakladajace sie stawki zbieracza w cache offline.");
  }

  const [rateVersion] = effectiveRates;

  if (!Number.isSafeInteger(rateVersion.rateGroszPerUnit)) {
    throw new Error("Stawka zbieracza w cache offline ma nieprawidlowa kwote.");
  }

  if (rateVersion.rateGroszPerUnit <= 0) {
    throw new Error("Stawka zbieracza w cache offline musi byc wieksza od zera.");
  }

  return rateVersion;
}

function findCachedPlan(
  plans: readonly CachedSettlementPlan[],
  rateVersion: CachedWorkerRateVersion
): CachedSettlementPlan {
  const plan = plans.find((candidate) => candidate.id === rateVersion.planId);

  if (!plan) {
    throw new Error("Brak planu rozliczenia w cache offline dla stawki zbieracza.");
  }

  if (!plan.active) {
    throw new Error("Nie mozna otworzyc sesji offline na archiwalnym planie.");
  }

  return plan;
}

function isCachedRateEffectiveOn(
  rateVersion: CachedWorkerRateVersion,
  businessDate: string
): boolean {
  const validFrom = normalizeBusinessDate(rateVersion.validFrom);
  const validTo = normalizeOptionalBusinessDate(rateVersion.validTo);

  return validFrom <= businessDate && (validTo === null || businessDate <= validTo);
}

function assertKnownDeviceTime(value: unknown): void {
  if (value === null || value === undefined) {
    throw new Error("Sesja offline wymaga czasu utworzenia na urzadzeniu.");
  }
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
