import { parseDecimalToScaledInteger } from "../domain/format";
import {
  STOCK_CORRECTION_DIRECTIONS,
  type StockCorrectionDirection
} from "../stock/stockSourceDefinition";
import type { SaleFormStockContext } from "./ordinarySalePreparation";
import {
  SALE_REVENUE_CALCULATION_VERSION,
  SALE_REVENUE_ROUNDING_RULE,
  calculateSaleRevenue
} from "./saleRevenueCalculation";

export const SALE_CORRECTION_REASON_MIN_LENGTH = 3;
export const SALE_CORRECTION_REASON_MAX_LENGTH = 200;

export type SaleCorrectionFormDraft = {
  businessDate: string;
  correctionDirection: StockCorrectionDirection;
  pricePlnPerKg: string;
  reason: string;
  seasonId: string;
  weightKg: string;
};

export type PreparedSaleCorrection = {
  availableWeightG: number;
  businessDate: string;
  calculationVersion: string;
  correctionDirection: StockCorrectionDirection;
  entryType: "CORRECTION";
  note: string;
  pendingDocumentCount: number;
  priceGroszPerKg: number;
  projectedAvailableWeightG: number;
  refreshedAtIso: string;
  revenueImpactGrosz: number;
  revenueMagnitudeGrosz: number;
  revenueRemainderMilliGrosz: number;
  revenueRoundingRule: typeof SALE_REVENUE_ROUNDING_RULE;
  seasonId: string;
  seasonName: string;
  status: "ACTIVE";
  stockDataSource: SaleFormStockContext["dataSource"];
  stockImpactG: number;
  stockWasFresh: boolean;
  weightG: number;
};

export function createInitialSaleCorrectionDraft({
  businessDate = currentBusinessDate(),
  stockContexts
}: {
  businessDate?: string;
  stockContexts: readonly SaleFormStockContext[];
}): SaleCorrectionFormDraft {
  return {
    businessDate,
    correctionDirection: "INCREASE_STOCK",
    pricePlnPerKg: "",
    reason: "",
    seasonId: stockContexts[0]?.seasonId ?? "",
    weightKg: ""
  };
}

export function prepareSaleCorrection({
  draft,
  isOnline,
  stockContexts
}: {
  draft: SaleCorrectionFormDraft;
  isOnline: boolean;
  stockContexts: readonly SaleFormStockContext[];
}): PreparedSaleCorrection {
  if (!isOnline) {
    throw new Error("Korekta sprzedazy wymaga polaczenia z internetem.");
  }

  return createSaleCorrectionPreview({ draft, stockContexts });
}

export function createSaleCorrectionPreview({
  draft,
  stockContexts
}: {
  draft: SaleCorrectionFormDraft;
  stockContexts: readonly SaleFormStockContext[];
}): PreparedSaleCorrection {
  assertBusinessDate(draft.businessDate);
  assertCorrectionDirection(draft.correctionDirection);
  const context = findStockContext(stockContexts, draft.seasonId);
  assertStockContext(context);
  const weightG = parseCorrectionWeight(draft.weightKg);
  const priceGroszPerKg = parseCorrectionPrice(draft.pricePlnPerKg);
  const note = normalizeCorrectionReason(draft.reason);
  const revenue = calculateSaleRevenue({ priceGroszPerKg, weightG });
  const stockImpactG =
    draft.correctionDirection === "INCREASE_STOCK" ? weightG : -weightG;
  const revenueImpactGrosz =
    revenue.totalGrosz === 0
      ? 0
      : draft.correctionDirection === "INCREASE_STOCK"
        ? -revenue.totalGrosz
        : revenue.totalGrosz;

  return {
    availableWeightG: context.availableWeightG,
    businessDate: draft.businessDate,
    calculationVersion: revenue.calculationVersion,
    correctionDirection: draft.correctionDirection,
    entryType: "CORRECTION",
    note,
    pendingDocumentCount: context.pendingDocumentCount,
    priceGroszPerKg,
    projectedAvailableWeightG: safeAdd(
      context.availableWeightG,
      stockImpactG,
      "Stan po korekcie przekracza bezpieczny zakres liczbowy."
    ),
    refreshedAtIso: new Date(context.refreshedAtIso).toISOString(),
    revenueImpactGrosz,
    revenueMagnitudeGrosz: revenue.totalGrosz,
    revenueRemainderMilliGrosz: revenue.remainderMilliGrosz,
    revenueRoundingRule: revenue.roundingRule,
    seasonId: context.seasonId,
    seasonName: context.seasonName,
    status: "ACTIVE",
    stockDataSource: context.dataSource,
    stockImpactG,
    stockWasFresh: context.isFresh,
    weightG
  };
}

export function refreshPreparedSaleCorrectionStock(
  prepared: PreparedSaleCorrection,
  context: SaleFormStockContext
): PreparedSaleCorrection {
  assertPreparedSaleCorrection(prepared);
  assertStockContext(context);

  if (context.seasonId !== prepared.seasonId) {
    throw new Error("Odswiezony stan dotyczy innego sezonu.");
  }

  return {
    ...prepared,
    availableWeightG: context.availableWeightG,
    pendingDocumentCount: context.pendingDocumentCount,
    projectedAvailableWeightG: safeAdd(
      context.availableWeightG,
      prepared.stockImpactG,
      "Stan po korekcie przekracza bezpieczny zakres liczbowy."
    ),
    refreshedAtIso: new Date(context.refreshedAtIso).toISOString(),
    seasonName: context.seasonName,
    stockDataSource: context.dataSource,
    stockWasFresh: context.isFresh
  };
}

export function assertPreparedSaleCorrection(correction: PreparedSaleCorrection): void {
  const reason = normalizeCorrectionReason(correction.note);
  assertCorrectionDirection(correction.correctionDirection);

  if (
    reason !== correction.note ||
    !correction.seasonId.trim() ||
    !correction.seasonName.trim() ||
    !isBusinessDate(correction.businessDate) ||
    !Number.isSafeInteger(correction.availableWeightG) ||
    !Number.isSafeInteger(correction.projectedAvailableWeightG) ||
    !Number.isSafeInteger(correction.pendingDocumentCount) ||
    correction.pendingDocumentCount < 0 ||
    correction.calculationVersion !== SALE_REVENUE_CALCULATION_VERSION
  ) {
    throw new Error("Przygotowana korekta ma nieprawidlowe dane.");
  }

  const revenue = calculateSaleRevenue({
    priceGroszPerKg: correction.priceGroszPerKg,
    weightG: correction.weightG
  });
  const expectedStockImpactG =
    correction.correctionDirection === "INCREASE_STOCK"
      ? correction.weightG
      : -correction.weightG;
  const expectedRevenueImpactGrosz =
    revenue.totalGrosz === 0
      ? 0
      : correction.correctionDirection === "INCREASE_STOCK"
        ? -revenue.totalGrosz
        : revenue.totalGrosz;

  if (
    correction.revenueMagnitudeGrosz !== revenue.totalGrosz ||
    correction.revenueRemainderMilliGrosz !== revenue.remainderMilliGrosz ||
    correction.stockImpactG !== expectedStockImpactG ||
    correction.revenueImpactGrosz !== expectedRevenueImpactGrosz ||
    correction.projectedAvailableWeightG !==
      correction.availableWeightG + expectedStockImpactG
  ) {
    throw new Error("Przygotowana korekta ma niespojny wplyw.");
  }
}

export function correctionDirectionLabel(direction: StockCorrectionDirection): string {
  assertCorrectionDirection(direction);
  return direction === "INCREASE_STOCK"
    ? "Zwrot do stanu i zmniejszenie przychodu"
    : "Dodatkowy rozchod i zwiekszenie przychodu";
}

function parseCorrectionWeight(value: string): number {
  let weightG: number;

  try {
    weightG = parseDecimalToScaledInteger(value, 3);
  } catch {
    throw new Error("Podaj mase korekty z dokladnoscia do 3 miejsc.");
  }

  if (!Number.isSafeInteger(weightG) || weightG <= 0) {
    throw new Error("Masa korekty musi byc wieksza od zera.");
  }

  return weightG;
}

function parseCorrectionPrice(value: string): number {
  let priceGroszPerKg: number;

  try {
    priceGroszPerKg = parseDecimalToScaledInteger(value, 2);
  } catch {
    throw new Error("Podaj cene korekty z dokladnoscia do 2 miejsc.");
  }

  if (!Number.isSafeInteger(priceGroszPerKg) || priceGroszPerKg < 0) {
    throw new Error("Cena korekty nie moze byc ujemna.");
  }

  return priceGroszPerKg;
}

function normalizeCorrectionReason(value: string): string {
  const normalized = value.trim();

  if (normalized.length < SALE_CORRECTION_REASON_MIN_LENGTH) {
    throw new Error("Powod korekty musi miec co najmniej 3 znaki.");
  }

  if (normalized.length > SALE_CORRECTION_REASON_MAX_LENGTH) {
    throw new Error("Powod korekty moze miec maksymalnie 200 znakow.");
  }

  return normalized;
}

function findStockContext(
  contexts: readonly SaleFormStockContext[],
  seasonId: string
): SaleFormStockContext {
  const normalizedSeasonId = seasonId.trim();

  if (!normalizedSeasonId) {
    throw new Error("Wybierz sezon korekty.");
  }

  const matches = contexts.filter((context) => context.seasonId === normalizedSeasonId);

  if (matches.length !== 1) {
    throw new Error(
      matches.length === 0
        ? "Brak stanu dla wybranego sezonu."
        : "Formularz zawiera zduplikowany kontekst sezonu."
    );
  }

  return matches[0];
}

function assertStockContext(context: SaleFormStockContext): void {
  if (
    !context.seasonId.trim() ||
    !context.seasonName.trim() ||
    !Number.isSafeInteger(context.availableWeightG) ||
    !Number.isSafeInteger(context.pendingDocumentCount) ||
    context.pendingDocumentCount < 0 ||
    typeof context.isFresh !== "boolean" ||
    Number.isNaN(new Date(context.refreshedAtIso).getTime())
  ) {
    throw new Error("Kontekst stanu korekty ma nieprawidlowe dane.");
  }
}

function assertCorrectionDirection(direction: StockCorrectionDirection): void {
  if (!STOCK_CORRECTION_DIRECTIONS.includes(direction)) {
    throw new Error("Wybierz kierunek korekty.");
  }
}

function assertBusinessDate(value: string): void {
  if (!isBusinessDate(value)) {
    throw new Error("Podaj prawidlowa date korekty.");
  }
}

function isBusinessDate(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);

  if (!match) {
    return false;
  }

  const date = new Date(
    Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]))
  );
  return (
    date.getUTCFullYear() === Number(match[1]) &&
    date.getUTCMonth() === Number(match[2]) - 1 &&
    date.getUTCDate() === Number(match[3])
  );
}

function safeAdd(left: number, right: number, message: string): number {
  const result = left + right;

  if (
    !Number.isSafeInteger(left) ||
    !Number.isSafeInteger(right) ||
    !Number.isSafeInteger(result)
  ) {
    throw new Error(message);
  }

  return result;
}

function currentBusinessDate(): string {
  const now = new Date();
  return [
    String(now.getFullYear()).padStart(4, "0"),
    String(now.getMonth() + 1).padStart(2, "0"),
    String(now.getDate()).padStart(2, "0")
  ].join("-");
}
