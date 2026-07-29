import { describe, expect, it } from "vitest";

import {
  calculateSourceStockForSeason,
  type SourceStockHarvestSession,
  type SourceStockSale
} from "./sourceStockCalculation";

describe("source stock calculation", () => {
  it("calculates a transparent control result from one season", () => {
    const result = calculateSourceStockForSeason({
      harvestSessions: [
        session("closed", "season-2026", "CLOSED", 100_000),
        session("paid", "season-2026", "PAID", 20_000),
        session("open", "season-2026", "OPEN", 90_000),
        session("review", "season-2026", "REVIEW_REQUIRED", 80_000),
        session("cancelled", "season-2026", "CANCELLED", 70_000),
        session("other-season", "season-2025", "CLOSED", 999_000)
      ],
      sales: [
        sale("sale", "season-2026", "SALE", "ACTIVE", 30_000),
        sale("sale-cancelled", "season-2026", "SALE", "CANCELLED", 5000),
        sale(
          "correction-increase",
          "season-2026",
          "CORRECTION",
          "ACTIVE",
          2000,
          "INCREASE_STOCK"
        ),
        sale(
          "correction-decrease",
          "season-2026",
          "CORRECTION",
          "ACTIVE",
          3000,
          "DECREASE_STOCK"
        ),
        sale(
          "correction-cancelled",
          "season-2026",
          "CORRECTION",
          "CANCELLED",
          4000,
          "INCREASE_STOCK"
        ),
        sale("other-season-sale", "season-2025", "SALE", "ACTIVE", 999_000)
      ],
      seasonId: "season-2026"
    });

    expect(result).toEqual({
      activeSaleWeightG: 30_000,
      availableWeightG: 89_000,
      confirmedHarvestWeightG: 120_000,
      correctionDecreaseWeightG: 3000,
      correctionIncreaseWeightG: 2000,
      seasonId: "season-2026",
      soldWeightG: 31_000,
      sourceCounts: {
        activeCorrectionDocuments: 2,
        activeSaleDocuments: 1,
        cancelledSaleDocuments: 2,
        harvestSessionDocuments: 5,
        includedHarvestSessionDocuments: 2,
        saleDocuments: 5
      }
    });
  });

  it("returns zero totals for a season without sources", () => {
    expect(
      calculateSourceStockForSeason({
        harvestSessions: [],
        sales: [],
        seasonId: "season-empty"
      })
    ).toEqual({
      activeSaleWeightG: 0,
      availableWeightG: 0,
      confirmedHarvestWeightG: 0,
      correctionDecreaseWeightG: 0,
      correctionIncreaseWeightG: 0,
      seasonId: "season-empty",
      soldWeightG: 0,
      sourceCounts: {
        activeCorrectionDocuments: 0,
        activeSaleDocuments: 0,
        cancelledSaleDocuments: 0,
        harvestSessionDocuments: 0,
        includedHarvestSessionDocuments: 0,
        saleDocuments: 0
      }
    });
  });

  it("exposes a negative available stock instead of hiding the inconsistency", () => {
    const result = calculateSourceStockForSeason({
      harvestSessions: [session("closed", "season-2026", "CLOSED", 10_000)],
      sales: [sale("sale", "season-2026", "SALE", "ACTIVE", 12_000)],
      seasonId: "season-2026"
    });

    expect(result.availableWeightG).toBe(-2000);
    expect(result.soldWeightG).toBe(12_000);
  });

  it("allows an increasing correction to make net sold weight negative", () => {
    const result = calculateSourceStockForSeason({
      harvestSessions: [],
      sales: [
        sale("increase", "season-2026", "CORRECTION", "ACTIVE", 3000, "INCREASE_STOCK")
      ],
      seasonId: "season-2026"
    });

    expect(result.soldWeightG).toBe(-3000);
    expect(result.availableWeightG).toBe(3000);
  });

  it("does not validate malformed numerical data from another season", () => {
    expect(
      calculateSourceStockForSeason({
        harvestSessions: [
          session("selected", "season-2026", "CLOSED", 5000),
          session("unrelated", "season-2025", "CLOSED", -1)
        ],
        sales: [
          sale("selected", "season-2026", "SALE", "ACTIVE", 1000),
          sale("unrelated", "season-2025", "SALE", "ACTIVE", -1)
        ],
        seasonId: "season-2026"
      }).availableWeightG
    ).toBe(4000);
  });

  it.each([
    ["harvest session", [session("duplicate", "season-2026", "CLOSED", 1000)], []],
    ["sale", [], [sale("duplicate", "season-2026", "SALE", "ACTIVE", 1000)]]
  ] as const)("rejects a duplicated %s source", (_, harvestBase, saleBase) => {
    expect(() =>
      calculateSourceStockForSeason({
        harvestSessions: [...harvestBase, ...harvestBase],
        sales: [...saleBase, ...saleBase],
        seasonId: "season-2026"
      })
    ).toThrow("Kalkulacja stanu zawiera zduplikowany dokument");
  });

  it("rejects a blank source document id in the selected season", () => {
    expect(() =>
      calculateSourceStockForSeason({
        harvestSessions: [session(" ", "season-2026", "CLOSED", 1000)],
        sales: [],
        seasonId: "season-2026"
      })
    ).toThrow("Dokument sesji zbioru wymaga identyfikatora.");
  });

  it("rejects a blank season id", () => {
    expect(() =>
      calculateSourceStockForSeason({
        harvestSessions: [],
        sales: [],
        seasonId: " "
      })
    ).toThrow("Kalkulacja stanu wymaga identyfikatora sezonu.");
  });

  it("rejects an invalid selected source through the shared source contract", () => {
    expect(() =>
      calculateSourceStockForSeason({
        harvestSessions: [],
        sales: [sale("invalid", "season-2026", "SALE", "ACTIVE", 0)],
        seasonId: "season-2026"
      })
    ).toThrow("Masa operacji sprzedazy musi byc dodatnia");
  });

  it("rejects overflow while summing source categories", () => {
    expect(() =>
      calculateSourceStockForSeason({
        harvestSessions: [
          session("first", "season-2026", "CLOSED", Number.MAX_SAFE_INTEGER),
          session("second", "season-2026", "PAID", 1)
        ],
        sales: [],
        seasonId: "season-2026"
      })
    ).toThrow("Kalkulacja stanu przekracza bezpieczny zakres liczbowy.");
  });

  it("rejects overflow in the final available stock", () => {
    expect(() =>
      calculateSourceStockForSeason({
        harvestSessions: [
          session("harvest", "season-2026", "CLOSED", Number.MAX_SAFE_INTEGER)
        ],
        sales: [
          sale(
            "increase",
            "season-2026",
            "CORRECTION",
            "ACTIVE",
            Number.MAX_SAFE_INTEGER,
            "INCREASE_STOCK"
          )
        ],
        seasonId: "season-2026"
      })
    ).toThrow("Kalkulacja stanu przekracza bezpieczny zakres liczbowy.");
  });
});

function session(
  id: string,
  seasonId: string,
  status: SourceStockHarvestSession["status"],
  totalWeightG: number
): SourceStockHarvestSession {
  return {
    id,
    seasonId,
    status,
    totalWeightG
  };
}

function sale(
  id: string,
  seasonId: string,
  entryType: SourceStockSale["entryType"],
  status: SourceStockSale["status"],
  weightG: number,
  correctionDirection: SourceStockSale["correctionDirection"] = null
): SourceStockSale {
  return {
    correctionDirection,
    entryType,
    id,
    seasonId,
    status,
    weightG
  };
}
