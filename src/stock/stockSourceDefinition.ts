import type { HarvestSessionStatus } from "../harvest/harvestSessionState";

export const SALE_ENTRY_TYPES = ["SALE", "CORRECTION"] as const;
export const SALE_STATUSES = ["ACTIVE", "CANCELLED"] as const;
export const STOCK_CORRECTION_DIRECTIONS = ["INCREASE_STOCK", "DECREASE_STOCK"] as const;

export type SaleEntryType = (typeof SALE_ENTRY_TYPES)[number];
export type SaleStatus = (typeof SALE_STATUSES)[number];
export type StockCorrectionDirection = (typeof STOCK_CORRECTION_DIRECTIONS)[number];

export type StockSourceImpact = "INCREASE" | "DECREASE" | "NONE";

export type StockSourceContribution = {
  contributionG: number;
  impact: StockSourceImpact;
  reason:
    | "CONFIRMED_HARVEST"
    | "SESSION_NOT_CONFIRMED"
    | "ACTIVE_SALE"
    | "ACTIVE_CORRECTION"
    | "SALE_CANCELLED";
};

export type HarvestSessionStockSource = {
  status: HarvestSessionStatus;
  totalWeightG: number;
};

export type SaleStockSource = {
  correctionDirection?: StockCorrectionDirection | null;
  entryType: SaleEntryType;
  status: SaleStatus;
  weightG: number;
};

export function evaluateHarvestSessionStockSource(
  session: HarvestSessionStockSource
): StockSourceContribution {
  assertSafeNonNegativeInteger(
    session.totalWeightG,
    "Suma wagi sesji musi byc nieujemna liczba calkowita gramow."
  );

  if (session.status !== "CLOSED" && session.status !== "PAID") {
    return {
      contributionG: 0,
      impact: "NONE",
      reason: "SESSION_NOT_CONFIRMED"
    };
  }

  return {
    contributionG: session.totalWeightG,
    impact: "INCREASE",
    reason: "CONFIRMED_HARVEST"
  };
}

export function evaluateSaleStockSource(sale: SaleStockSource): StockSourceContribution {
  assertSafePositiveInteger(
    sale.weightG,
    "Masa operacji sprzedazy musi byc dodatnia liczba calkowita gramow."
  );

  if (sale.entryType === "SALE" && sale.correctionDirection != null) {
    throw new Error("Zwykla sprzedaz nie moze miec kierunku korekty.");
  }

  if (sale.entryType === "CORRECTION" && sale.correctionDirection == null) {
    throw new Error("Korekta sprzedazy wymaga jawnego kierunku wplywu na stan.");
  }

  if (sale.status === "CANCELLED") {
    return {
      contributionG: 0,
      impact: "NONE",
      reason: "SALE_CANCELLED"
    };
  }

  if (sale.entryType === "SALE") {
    return {
      contributionG: -sale.weightG,
      impact: "DECREASE",
      reason: "ACTIVE_SALE"
    };
  }

  const increasesStock = sale.correctionDirection === "INCREASE_STOCK";

  return {
    contributionG: increasesStock ? sale.weightG : -sale.weightG,
    impact: increasesStock ? "INCREASE" : "DECREASE",
    reason: "ACTIVE_CORRECTION"
  };
}

function assertSafeNonNegativeInteger(value: number, message: string): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error(message);
  }
}

function assertSafePositiveInteger(value: number, message: string): void {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error(message);
  }
}
