import { getFirebaseServices } from "../config/firebaseServices";
import {
  SEASONS_COLLECTION,
  WORKERS_COLLECTION,
  type SeasonDocument
} from "../domain/domainConfiguration";
import type { UserProfile } from "../domain/identity";
import { decodeHarvestSession } from "../harvest/harvestSessionDashboard";
import { HARVEST_SESSIONS_COLLECTION } from "../harvest/harvestSessionState";
import type { HarvestSessionDocument } from "../harvest/openHarvestSession";
import {
  summarizeSyncDocumentMetadata,
  type SyncDocumentMetadataInput,
  type SyncMetadataSummary
} from "../offline/pendingWriteMetadata";
import { decodePaymentDocument, type PaymentDocument } from "../payments/paymentWrite";
import { PAYMENTS_COLLECTION } from "../payments/pendingPayments";
import {
  decodeSaleDocument,
  SALES_COLLECTION,
  type SaleDocument
} from "../sales/saleStockPreflight";
import { activeSaleRevenueImpact } from "../sales/saleDirectory";
import { decodeSeason } from "../seasons/seasons";
import { calculateSourceStockForSeason } from "../stock/sourceStockCalculation";
import { decodeWorker } from "../workers/workerDirectory";
import {
  businessDateMatchesPeriod,
  currentWarsawBusinessDate,
  DEFAULT_DASHBOARD_PERIOD,
  resolveDashboardPeriod,
  type DashboardPeriodSelection,
  type ResolvedDashboardPeriod
} from "./dashboardPeriod";
import { dashboardPeriodQueryConstraints } from "./dashboardReadStrategy";

type FirebaseEnv = Record<string, string | boolean | undefined>;

export type AdminDashboardMetrics = {
  accruedGrosz: number;
  activeWorkerCount: number;
  availableWeightG: number;
  confirmedHarvestWeightG: number;
  dueGrosz: number;
  inProgressHarvestWeightG: number;
  openSessionCount: number;
  paidGrosz: number;
  resultAfterHarvestCostGrosz: number;
  reviewRequiredSessionCount: number;
  revenueGrosz: number;
  soldWeightG: number;
};

export type AdminDashboardSeason = {
  endDate: string | null;
  id: string;
  isDefault: boolean;
  metrics: AdminDashboardMetrics;
  name: string;
  period: ResolvedDashboardPeriod;
  startDate: string;
  status: SeasonDocument["status"];
  warnings: string[];
};

export type AdminDashboardSeasonOption = Omit<
  AdminDashboardSeason,
  "metrics" | "period" | "warnings"
>;

export type AdminDashboardResult = {
  calculationSource: "FIRESTORE_AGGREGATION" | "LOCAL_SNAPSHOT" | "SOURCE_DOCUMENTS";
  invalidDocumentCounts: {
    payments: number;
    sales: number;
    seasons: number;
    sessions: number;
    workers: number;
  };
  localSyncSummary: SyncMetadataSummary;
  refreshedAtIso: string;
  seasons: AdminDashboardSeasonOption[];
  selectedSeason: AdminDashboardSeason | null;
};

export type LoadAdminDashboardInput = {
  actorProfile: UserProfile;
  businessDate?: string;
  isOnline: boolean;
  periodSelection?: DashboardPeriodSelection;
  selectedSeasonId?: string | null;
  syncDocuments: readonly SyncDocumentMetadataInput[];
};

type RawDocument = {
  data: unknown;
  id: string;
};

export async function loadAdminDashboard(
  env: FirebaseEnv,
  input: LoadAdminDashboardInput
): Promise<AdminDashboardResult> {
  assertAdminOnline(input.actorProfile, input.isOnline);
  const { firestore } = await getFirebaseServices(env);
  const {
    collection,
    count,
    getAggregateFromServer,
    getDocsFromServer,
    query,
    sum,
    where
  } = await import("firebase/firestore");
  const seasonSnapshot = await getDocsFromServer(
    collection(firestore, SEASONS_COLLECTION)
  );
  const decodedSeasons = decodeSeasons(toRawDocuments(seasonSnapshot.docs));
  const seasons = decodedSeasons.seasons.sort(compareSeasons);
  const selectedSeason = selectSeason(seasons, input.selectedSeasonId ?? null);
  const localSyncSummary = summarizeSyncDocumentMetadata(input.syncDocuments);
  const refreshedAtIso = new Date().toISOString();
  const invalidDocumentCounts = {
    payments: 0,
    sales: 0,
    seasons: decodedSeasons.invalidCount,
    sessions: 0,
    workers: 0
  };

  if (!selectedSeason) {
    return {
      calculationSource: "FIRESTORE_AGGREGATION",
      invalidDocumentCounts,
      localSyncSummary,
      refreshedAtIso,
      seasons: [],
      selectedSeason: null
    };
  }

  const businessDate = input.businessDate ?? currentWarsawBusinessDate();
  const period = resolveDashboardPeriod(
    input.periodSelection ?? DEFAULT_DASHBOARD_PERIOD,
    {
      seasonEndDate: selectedSeason.endDate,
      seasonStartDate: selectedSeason.startDate,
      todayBusinessDate: businessDate
    }
  );
  const sessionPeriodConstraints = dashboardPeriodQueryConstraints(
    "businessDate",
    period,
    where
  );
  const salePeriodConstraints = dashboardPeriodQueryConstraints(
    "businessDate",
    period,
    where
  );
  const paymentPeriodConstraints = dashboardPeriodQueryConstraints(
    "paidBusinessDate",
    period,
    where
  );
  const sessions = collection(firestore, HARVEST_SESSIONS_COLLECTION);
  const sales = collection(firestore, SALES_COLLECTION);
  const payments = collection(firestore, PAYMENTS_COLLECTION);
  const workers = collection(firestore, WORKERS_COLLECTION);
  const [
    settled,
    open,
    review,
    ordinarySales,
    stockIncreases,
    stockDecreases,
    paid,
    activeWorkers
  ] = await Promise.all([
    getAggregateFromServer(
      query(
        sessions,
        where("seasonId", "==", selectedSeason.id),
        where("status", "in", ["CLOSED", "PAID"]),
        ...sessionPeriodConstraints
      ),
      {
        accruedGrosz: sum("amountDueGrosz"),
        confirmedHarvestWeightG: sum("totalWeightG")
      }
    ),
    getAggregateFromServer(
      query(
        sessions,
        where("seasonId", "==", selectedSeason.id),
        where("status", "==", "OPEN"),
        ...sessionPeriodConstraints
      ),
      {
        inProgressHarvestWeightG: sum("totalWeightG"),
        openSessionCount: count()
      }
    ),
    getAggregateFromServer(
      query(
        sessions,
        where("seasonId", "==", selectedSeason.id),
        where("status", "==", "REVIEW_REQUIRED"),
        ...sessionPeriodConstraints
      ),
      { reviewRequiredSessionCount: count() }
    ),
    getAggregateFromServer(
      query(
        sales,
        where("seasonId", "==", selectedSeason.id),
        where("status", "==", "ACTIVE"),
        where("entryType", "==", "SALE"),
        ...salePeriodConstraints
      ),
      { revenueGrosz: sum("totalGrosz"), soldWeightG: sum("weightG") }
    ),
    getAggregateFromServer(
      query(
        sales,
        where("seasonId", "==", selectedSeason.id),
        where("status", "==", "ACTIVE"),
        where("entryType", "==", "CORRECTION"),
        where("correctionDirection", "==", "INCREASE_STOCK"),
        ...salePeriodConstraints
      ),
      { revenueGrosz: sum("totalGrosz"), soldWeightG: sum("weightG") }
    ),
    getAggregateFromServer(
      query(
        sales,
        where("seasonId", "==", selectedSeason.id),
        where("status", "==", "ACTIVE"),
        where("entryType", "==", "CORRECTION"),
        where("correctionDirection", "==", "DECREASE_STOCK"),
        ...salePeriodConstraints
      ),
      { revenueGrosz: sum("totalGrosz"), soldWeightG: sum("weightG") }
    ),
    getAggregateFromServer(
      query(
        payments,
        where("seasonId", "==", selectedSeason.id),
        where("status", "==", "ACTIVE"),
        ...paymentPeriodConstraints
      ),
      { paidGrosz: sum("amountGrosz") }
    ),
    getAggregateFromServer(query(workers, where("active", "==", true)), {
      activeWorkerCount: count()
    })
  ]);

  return {
    calculationSource: "FIRESTORE_AGGREGATION",
    invalidDocumentCounts,
    localSyncSummary,
    refreshedAtIso,
    seasons: seasons.map(toSeasonOption),
    selectedSeason: buildAggregatedSeasonDashboard({
      activeWorkerCount: activeWorkers.data().activeWorkerCount,
      accruedGrosz: settled.data().accruedGrosz,
      confirmedHarvestWeightG: settled.data().confirmedHarvestWeightG,
      inProgressHarvestWeightG: open.data().inProgressHarvestWeightG,
      invalidDocumentCounts,
      localSyncSummary,
      openSessionCount: open.data().openSessionCount,
      paidGrosz: paid.data().paidGrosz,
      period,
      reviewRequiredSessionCount: review.data().reviewRequiredSessionCount,
      saleRevenueGrosz: ordinarySales.data().revenueGrosz,
      saleWeightG: ordinarySales.data().soldWeightG,
      season: selectedSeason,
      stockDecreaseRevenueGrosz: stockDecreases.data().revenueGrosz,
      stockDecreaseWeightG: stockDecreases.data().soldWeightG,
      stockIncreaseRevenueGrosz: stockIncreases.data().revenueGrosz,
      stockIncreaseWeightG: stockIncreases.data().soldWeightG
    })
  };
}

export function buildAdminDashboard({
  businessDate = currentWarsawBusinessDate(),
  paymentDocuments,
  periodSelection = DEFAULT_DASHBOARD_PERIOD,
  refreshedAtIso,
  saleDocuments,
  seasonDocuments,
  selectedSeasonId,
  sessionDocuments,
  syncDocuments,
  workerDocuments
}: {
  businessDate?: string;
  paymentDocuments: readonly RawDocument[];
  periodSelection?: DashboardPeriodSelection;
  refreshedAtIso: string;
  saleDocuments: readonly RawDocument[];
  seasonDocuments: readonly RawDocument[];
  selectedSeasonId?: string | null;
  sessionDocuments: readonly RawDocument[];
  syncDocuments: readonly SyncDocumentMetadataInput[];
  workerDocuments: readonly RawDocument[];
}): AdminDashboardResult {
  assertIso(refreshedAtIso);
  const seasons: SeasonDocument[] = [];
  const sessions: HarvestSessionDocument[] = [];
  const sales: SaleDocument[] = [];
  const payments: PaymentDocument[] = [];
  let invalidSeasonCount = 0;
  let invalidSessionCount = 0;
  let invalidSaleCount = 0;
  let invalidPaymentCount = 0;
  let invalidWorkerCount = 0;
  let activeWorkerCount = 0;

  for (const document of seasonDocuments) {
    const decoded = decodeSeason(document.id, document.data);

    if (decoded.status === "FOUND") {
      seasons.push(decoded.season);
    } else {
      invalidSeasonCount += 1;
    }
  }

  for (const document of sessionDocuments) {
    const decoded = decodeHarvestSession(document.id, document.data);

    if (decoded.status === "FOUND") {
      sessions.push(decoded.session);
    } else {
      invalidSessionCount += 1;
    }
  }

  for (const document of saleDocuments) {
    const sale = decodeSaleDocument(document.id, document.data);

    if (sale) {
      sales.push(sale);
    } else {
      invalidSaleCount += 1;
    }
  }

  for (const document of paymentDocuments) {
    const payment = decodePaymentDocument(document.id, document.data);

    if (payment) {
      payments.push(payment);
    } else {
      invalidPaymentCount += 1;
    }
  }

  for (const document of workerDocuments) {
    const decoded = decodeWorker(document.id, document.data);

    if (decoded.status === "FOUND") {
      if (decoded.worker.active) {
        activeWorkerCount += 1;
      }
    } else {
      invalidWorkerCount += 1;
    }
  }

  const invalidDocumentCounts = {
    payments: invalidPaymentCount,
    sales: invalidSaleCount,
    seasons: invalidSeasonCount,
    sessions: invalidSessionCount,
    workers: invalidWorkerCount
  };
  const localSyncSummary = summarizeSyncDocumentMetadata(syncDocuments);

  return {
    calculationSource: "SOURCE_DOCUMENTS",
    invalidDocumentCounts,
    localSyncSummary,
    refreshedAtIso,
    seasons: seasons.sort(compareSeasons).map(toSeasonOption),
    selectedSeason: (() => {
      const season = selectSeason(seasons, selectedSeasonId ?? null);

      return season
        ? buildSeasonDashboard({
            activeWorkerCount,
            businessDate,
            invalidDocumentCounts,
            localSyncSummary,
            payments,
            periodSelection,
            sales,
            season,
            sessions
          })
        : null;
    })()
  };
}

export function buildAggregatedSeasonDashboard({
  activeWorkerCount,
  accruedGrosz,
  confirmedHarvestWeightG,
  inProgressHarvestWeightG,
  invalidDocumentCounts,
  localSyncSummary,
  openSessionCount,
  paidGrosz,
  period,
  reviewRequiredSessionCount,
  saleRevenueGrosz,
  saleWeightG,
  season,
  stockDecreaseRevenueGrosz,
  stockDecreaseWeightG,
  stockIncreaseRevenueGrosz,
  stockIncreaseWeightG
}: {
  activeWorkerCount: number;
  accruedGrosz: number;
  confirmedHarvestWeightG: number;
  inProgressHarvestWeightG: number;
  invalidDocumentCounts: AdminDashboardResult["invalidDocumentCounts"];
  localSyncSummary: SyncMetadataSummary;
  openSessionCount: number;
  paidGrosz: number;
  period: ResolvedDashboardPeriod;
  reviewRequiredSessionCount: number;
  saleRevenueGrosz: number;
  saleWeightG: number;
  season: SeasonDocument;
  stockDecreaseRevenueGrosz: number;
  stockDecreaseWeightG: number;
  stockIncreaseRevenueGrosz: number;
  stockIncreaseWeightG: number;
}): AdminDashboardSeason {
  const values = {
    activeWorkerCount,
    accruedGrosz,
    confirmedHarvestWeightG,
    inProgressHarvestWeightG,
    openSessionCount,
    paidGrosz,
    reviewRequiredSessionCount,
    saleRevenueGrosz,
    saleWeightG,
    stockDecreaseRevenueGrosz,
    stockDecreaseWeightG,
    stockIncreaseRevenueGrosz,
    stockIncreaseWeightG
  };

  for (const value of Object.values(values)) {
    assertAggregateInteger(value);
  }

  const soldWeightG = safeAdd(
    safeAdd(saleWeightG, stockDecreaseWeightG),
    -stockIncreaseWeightG
  );
  const revenueGrosz = safeAdd(
    safeAdd(saleRevenueGrosz, stockDecreaseRevenueGrosz),
    -stockIncreaseRevenueGrosz
  );
  const availableWeightG = safeAdd(confirmedHarvestWeightG, -soldWeightG);
  const dueGrosz = safeAdd(accruedGrosz, -paidGrosz);
  const resultAfterHarvestCostGrosz = safeAdd(revenueGrosz, -accruedGrosz);

  return {
    ...toSeasonOption(season),
    metrics: {
      accruedGrosz,
      activeWorkerCount,
      availableWeightG,
      confirmedHarvestWeightG,
      dueGrosz,
      inProgressHarvestWeightG,
      openSessionCount,
      paidGrosz,
      resultAfterHarvestCostGrosz,
      reviewRequiredSessionCount,
      revenueGrosz,
      soldWeightG
    },
    period,
    warnings: buildWarnings({
      availableWeightG,
      dueGrosz,
      invalidDocumentCounts,
      localSyncSummary
    })
  };
}

export function hydrateAdminDashboardSnapshot(
  result: AdminDashboardResult,
  syncDocuments: readonly SyncDocumentMetadataInput[]
): AdminDashboardResult {
  const localSyncSummary = summarizeSyncDocumentMetadata(syncDocuments);

  return {
    ...result,
    calculationSource: "LOCAL_SNAPSHOT",
    localSyncSummary,
    selectedSeason: result.selectedSeason
      ? {
          ...result.selectedSeason,
          warnings: buildWarnings({
            availableWeightG: result.selectedSeason.metrics.availableWeightG,
            dueGrosz: result.selectedSeason.metrics.dueGrosz,
            invalidDocumentCounts: result.invalidDocumentCounts,
            localSyncSummary
          })
        }
      : null
  };
}

export function prepareAdminDashboardSnapshot(
  result: AdminDashboardResult
): AdminDashboardResult {
  return hydrateAdminDashboardSnapshot(result, []);
}

export function isAdminDashboardSnapshot(value: unknown): value is AdminDashboardResult {
  if (
    !isRecord(value) ||
    !isAdminCalculationSource(value.calculationSource) ||
    !isInvalidDocumentCounts(value.invalidDocumentCounts) ||
    !isRecord(value.localSyncSummary) ||
    typeof value.refreshedAtIso !== "string" ||
    Number.isNaN(Date.parse(value.refreshedAtIso)) ||
    !Array.isArray(value.seasons) ||
    !value.seasons.every(isSeasonOption)
  ) {
    return false;
  }

  return value.selectedSeason === null || isDashboardSeason(value.selectedSeason);
}

function buildSeasonDashboard({
  activeWorkerCount,
  businessDate,
  invalidDocumentCounts,
  localSyncSummary,
  payments,
  periodSelection,
  sales,
  season,
  sessions
}: {
  activeWorkerCount: number;
  businessDate: string;
  invalidDocumentCounts: AdminDashboardResult["invalidDocumentCounts"];
  localSyncSummary: SyncMetadataSummary;
  payments: readonly PaymentDocument[];
  periodSelection: DashboardPeriodSelection;
  sales: readonly SaleDocument[];
  season: SeasonDocument;
  sessions: readonly HarvestSessionDocument[];
}): AdminDashboardSeason {
  const period = resolveDashboardPeriod(periodSelection, {
    seasonEndDate: season.endDate,
    seasonStartDate: season.startDate,
    todayBusinessDate: businessDate
  });
  const seasonSessions = sessions.filter(
    (session) =>
      session.seasonId === season.id &&
      businessDateMatchesPeriod(session.businessDate, period)
  );
  const seasonSales = sales.filter(
    (sale) =>
      sale.seasonId === season.id && businessDateMatchesPeriod(sale.businessDate, period)
  );
  const seasonPayments = payments.filter(
    (payment) =>
      payment.seasonId === season.id &&
      businessDateMatchesPeriod(payment.paidBusinessDate, period)
  );
  const stock = calculateSourceStockForSeason({
    harvestSessions: seasonSessions,
    sales: seasonSales,
    seasonId: season.id
  });
  let inProgressHarvestWeightG = 0;
  let accruedGrosz = 0;
  let paidGrosz = 0;
  let revenueGrosz = 0;

  for (const session of seasonSessions) {
    if (session.status === "OPEN") {
      inProgressHarvestWeightG = safeAdd(inProgressHarvestWeightG, session.totalWeightG);
    }

    if (
      (session.status === "CLOSED" || session.status === "PAID") &&
      session.amountDueGrosz !== null
    ) {
      accruedGrosz = safeAdd(accruedGrosz, session.amountDueGrosz);
    }
  }

  for (const payment of seasonPayments) {
    if (payment.status === "ACTIVE") {
      paidGrosz = safeAdd(paidGrosz, payment.amountGrosz);
    }
  }

  for (const sale of seasonSales) {
    revenueGrosz = safeAdd(revenueGrosz, activeSaleRevenueImpact(sale));
  }

  const dueGrosz = safeAdd(accruedGrosz, -paidGrosz);
  const resultAfterHarvestCostGrosz = safeAdd(revenueGrosz, -accruedGrosz);
  const warnings = buildWarnings({
    availableWeightG: stock.availableWeightG,
    dueGrosz,
    invalidDocumentCounts,
    localSyncSummary
  });

  return {
    endDate: season.endDate,
    id: season.id,
    isDefault: season.isDefault,
    metrics: {
      accruedGrosz,
      activeWorkerCount,
      availableWeightG: stock.availableWeightG,
      confirmedHarvestWeightG: stock.confirmedHarvestWeightG,
      dueGrosz,
      inProgressHarvestWeightG,
      openSessionCount: seasonSessions.filter((session) => session.status === "OPEN")
        .length,
      paidGrosz,
      resultAfterHarvestCostGrosz,
      reviewRequiredSessionCount: seasonSessions.filter(
        (session) => session.status === "REVIEW_REQUIRED"
      ).length,
      revenueGrosz,
      soldWeightG: stock.soldWeightG
    },
    name: season.name,
    period,
    startDate: season.startDate,
    status: season.status,
    warnings
  };
}

function buildWarnings({
  availableWeightG,
  dueGrosz,
  invalidDocumentCounts,
  localSyncSummary
}: {
  availableWeightG: number;
  dueGrosz: number;
  invalidDocumentCounts: AdminDashboardResult["invalidDocumentCounts"];
  localSyncSummary: SyncMetadataSummary;
}): string[] {
  const warnings: string[] = [];
  const pendingLocalCount =
    localSyncSummary.localSavedCount + localSyncSummary.pendingSyncCount;
  const invalidCount = Object.values(invalidDocumentCounts).reduce(
    (total, count) => total + count,
    0
  );

  if (pendingLocalCount > 0) {
    warnings.push(
      `Biezace urzadzenie ma lokalne zapisy oczekujace: ${String(pendingLocalCount)}.`
    );
  }

  if (localSyncSummary.actionableErrorCount > 0) {
    warnings.push(
      `Synchronizacja wymaga dzialania dla ${String(
        localSyncSummary.actionableErrorCount
      )} dokumentow.`
    );
  }

  if (availableWeightG < 0) {
    warnings.push("Stan dostepnych kilogramow jest ujemny i wymaga korekty.");
  }

  if (dueGrosz < 0) {
    warnings.push("Wyplacona kwota przekracza naliczenia i wymaga kontroli.");
  }

  if (invalidCount > 0) {
    warnings.push(`Pominieto nieprawidlowe dokumenty zrodlowe: ${String(invalidCount)}.`);
  }

  return warnings;
}

function compareSeasons(left: SeasonDocument, right: SeasonDocument): number {
  return (
    Number(right.isDefault) - Number(left.isDefault) ||
    statusPriority(left.status) - statusPriority(right.status) ||
    right.startDate.localeCompare(left.startDate) ||
    left.name.localeCompare(right.name, "pl")
  );
}

function decodeSeasons(documents: readonly RawDocument[]): {
  invalidCount: number;
  seasons: SeasonDocument[];
} {
  const seasons: SeasonDocument[] = [];
  let invalidCount = 0;

  for (const document of documents) {
    const decoded = decodeSeason(document.id, document.data);

    if (decoded.status === "FOUND") {
      seasons.push(decoded.season);
    } else {
      invalidCount += 1;
    }
  }

  return { invalidCount, seasons };
}

function selectSeason(
  seasons: readonly SeasonDocument[],
  requestedId: string | null
): SeasonDocument | null {
  if (requestedId) {
    const requested = seasons.find((season) => season.id === requestedId);
    if (requested) {
      return requested;
    }
  }

  return (
    seasons.find((season) => season.isDefault) ??
    seasons.find((season) => season.status === "OPEN") ??
    seasons.at(0) ??
    null
  );
}

function toSeasonOption(season: SeasonDocument): AdminDashboardSeasonOption {
  return {
    endDate: season.endDate,
    id: season.id,
    isDefault: season.isDefault,
    name: season.name,
    startDate: season.startDate,
    status: season.status
  };
}

function statusPriority(status: SeasonDocument["status"]): number {
  switch (status) {
    case "OPEN":
      return 0;
    case "PLANNED":
      return 1;
    case "CLOSED":
      return 2;
    case "ARCHIVED":
      return 3;
  }
}

function toRawDocuments(
  documents: readonly {
    data: (options?: { serverTimestamps?: "estimate" }) => unknown;
    id: string;
  }[]
): RawDocument[] {
  return documents.map((document) => ({
    data: document.data({ serverTimestamps: "estimate" }),
    id: document.id
  }));
}

function assertAdminOnline(profile: UserProfile, isOnline: boolean): void {
  if (
    profile.role !== "ADMIN" ||
    !profile.active ||
    profile.registrationStatus !== "APPROVED"
  ) {
    throw new Error("Pulpit finansowy wymaga aktywnego administratora.");
  }

  if (!isOnline) {
    throw new Error("Odswiezenie pulpitu administratora wymaga polaczenia online.");
  }
}

function assertIso(value: string): void {
  if (Number.isNaN(new Date(value).getTime())) {
    throw new Error("Pulpit administratora wymaga poprawnego czasu odswiezenia.");
  }
}

function safeAdd(left: number, right: number): number {
  const result = left + right;

  if (!Number.isSafeInteger(result)) {
    throw new Error("Metryka pulpitu przekracza bezpieczny zakres.");
  }

  return result;
}

function assertAggregateInteger(value: number): void {
  if (!Number.isSafeInteger(value)) {
    throw new Error("Agregat pulpitu zawiera nieprawidlowa wartosc liczbowa.");
  }
}

function isAdminCalculationSource(value: unknown): boolean {
  return (
    value === "FIRESTORE_AGGREGATION" ||
    value === "LOCAL_SNAPSHOT" ||
    value === "SOURCE_DOCUMENTS"
  );
}

function isInvalidDocumentCounts(value: unknown): boolean {
  return (
    isRecord(value) &&
    [value.payments, value.sales, value.seasons, value.sessions, value.workers].every(
      isNonNegativeSafeInteger
    )
  );
}

function isSeasonOption(value: unknown): boolean {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.name === "string" &&
    typeof value.startDate === "string" &&
    (value.endDate === null || typeof value.endDate === "string") &&
    typeof value.isDefault === "boolean" &&
    isSeasonStatus(value.status)
  );
}

function isDashboardSeason(value: unknown): value is AdminDashboardSeason {
  if (
    !isRecord(value) ||
    !isSeasonOption(value) ||
    !isRecord(value.metrics) ||
    !isRecord(value.period) ||
    !Array.isArray(value.warnings) ||
    !value.warnings.every((warning) => typeof warning === "string")
  ) {
    return false;
  }

  return (
    [
      value.metrics.accruedGrosz,
      value.metrics.activeWorkerCount,
      value.metrics.availableWeightG,
      value.metrics.confirmedHarvestWeightG,
      value.metrics.dueGrosz,
      value.metrics.inProgressHarvestWeightG,
      value.metrics.openSessionCount,
      value.metrics.paidGrosz,
      value.metrics.resultAfterHarvestCostGrosz,
      value.metrics.reviewRequiredSessionCount,
      value.metrics.revenueGrosz,
      value.metrics.soldWeightG
    ].every(isSafeInteger) &&
    value.period.dateBasis === "BUSINESS_DATE" &&
    typeof value.period.label === "string" &&
    ["TODAY", "CURRENT_WEEK", "CURRENT_MONTH", "SEASON", "CUSTOM"].includes(
      String(value.period.preset)
    ) &&
    (value.period.fromDate === null || typeof value.period.fromDate === "string") &&
    (value.period.toDate === null || typeof value.period.toDate === "string")
  );
}

function isSeasonStatus(value: unknown): value is SeasonDocument["status"] {
  return ["OPEN", "PLANNED", "CLOSED", "ARCHIVED"].includes(String(value));
}

function isNonNegativeSafeInteger(value: unknown): boolean {
  return isSafeInteger(value) && value >= 0;
}

function isSafeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
