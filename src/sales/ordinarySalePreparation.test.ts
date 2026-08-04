import { describe, expect, it } from "vitest";

import {
  calculateSaleRevenuePreviewGrosz,
  createInitialOrdinarySaleDraft,
  createOrdinarySalePreview,
  prepareOrdinarySale,
  type OrdinarySaleFormDraft,
  type SaleFormStockContext
} from "./ordinarySalePreparation";

const stockContexts: SaleFormStockContext[] = [
  {
    availableWeightG: 100_000,
    dataSource: "SERVER",
    isFresh: true,
    pendingDocumentCount: 0,
    refreshedAtIso: "2026-07-29T05:00:00.000Z",
    seasonId: "season-2026",
    seasonName: "Sezon 2026"
  },
  {
    availableWeightG: 20_000,
    dataSource: "CACHE",
    isFresh: false,
    pendingDocumentCount: 2,
    refreshedAtIso: "2026-07-28T15:00:00.000Z",
    seasonId: "season-2025",
    seasonName: "Sezon 2025"
  }
];

describe("ordinary sale form model", () => {
  it("creates an initial draft for the first available season", () => {
    expect(
      createInitialOrdinarySaleDraft({
        businessDate: "2026-07-29",
        stockContexts
      })
    ).toEqual({
      businessDate: "2026-07-29",
      note: "",
      pricePlnPerKg: "",
      seasonId: "season-2026",
      weightKg: ""
    });
  });

  it("prepares exact grams, grosze and a projected stock", () => {
    expect(
      prepareOrdinarySale({
        draft: draft({
          note: "  Odbior przy gospodarstwie  ",
          pricePlnPerKg: "15,50",
          weightKg: "12.345"
        }),
        isOnline: true,
        stockContexts
      })
    ).toEqual({
      availableWeightG: 100_000,
      businessDate: "2026-07-29",
      correctionDirection: null,
      entryType: "SALE",
      note: "Odbior przy gospodarstwie",
      pendingDocumentCount: 0,
      priceGroszPerKg: 1550,
      projectedAvailableWeightG: 87_655,
      refreshedAtIso: "2026-07-29T05:00:00.000Z",
      revenueCalculationVersion: "1",
      revenuePreviewGrosz: 19_135,
      revenueRemainderMilliGrosz: 750,
      revenueRoundingRule: "HALF_UP_TO_GROSZ",
      seasonId: "season-2026",
      seasonName: "Sezon 2026",
      status: "ACTIVE",
      stockDataSource: "SERVER",
      stockWasFresh: true,
      weightG: 12_345
    });
  });

  it("allows zero price but rejects zero or negative weight and negative price", () => {
    expect(
      createOrdinarySalePreview({
        draft: draft({ pricePlnPerKg: "0", weightKg: "1" }),
        stockContexts
      }).revenuePreviewGrosz
    ).toBe(0);

    expect(() =>
      createOrdinarySalePreview({
        draft: draft({ weightKg: "0" }),
        stockContexts
      })
    ).toThrow("Masa sprzedazy musi byc wieksza od zera.");
    expect(() =>
      createOrdinarySalePreview({
        draft: draft({ pricePlnPerKg: "-0,01" }),
        stockContexts
      })
    ).toThrow("Cena zwyklej sprzedazy nie moze byc ujemna.");
  });

  it("rejects excessive precision and an impossible business date", () => {
    expect(() =>
      createOrdinarySalePreview({
        draft: draft({ weightKg: "1,2345" }),
        stockContexts
      })
    ).toThrow("Podaj mase w kilogramach z dokladnoscia do 3 miejsc.");
    expect(() =>
      createOrdinarySalePreview({
        draft: draft({ pricePlnPerKg: "10,001" }),
        stockContexts
      })
    ).toThrow("Podaj cene za kilogram z dokladnoscia do 2 miejsc.");
    expect(() =>
      createOrdinarySalePreview({
        draft: draft({ businessDate: "2026-02-30" }),
        stockContexts
      })
    ).toThrow("Podaj prawidlowa date biznesowa sprzedazy.");
  });

  it("requires online preparation and a unique selected season context", () => {
    expect(() =>
      prepareOrdinarySale({
        draft: draft(),
        isOnline: false,
        stockContexts
      })
    ).toThrow("Sprzedaz wymaga polaczenia z internetem.");

    expect(() =>
      createOrdinarySalePreview({
        draft: draft({ seasonId: "missing" }),
        stockContexts
      })
    ).toThrow("Brak stanu zrodlowego dla wybranego sezonu.");

    expect(() =>
      createOrdinarySalePreview({
        draft: draft(),
        stockContexts: [stockContexts[0], stockContexts[0]]
      })
    ).toThrow("Formularz zawiera zduplikowany kontekst sezonu.");
  });

  it("blocks ordinary sale preparation for a season with a reconciliation alarm", () => {
    expect(() =>
      prepareOrdinarySale({
        draft: draft(),
        isOnline: true,
        stockContexts: [
          {
            ...stockContexts[0],
            reconciliation: {
              blocksOrdinarySale: true,
              checkedAtIso: "2026-07-29T05:00:00.000Z",
              differenceG: -1000,
              expectedMovementCount: 1,
              issues: [
                {
                  code: "AGGREGATE_DIFFERENCE",
                  count: 1,
                  documentIds: [],
                  message: "Roznica."
                }
              ],
              movementInvalidDocumentCount: 0,
              operationalAvailableWeightG: 99_000,
              operationalMovementCount: 1,
              seasonId: "season-2026",
              source: {
                activeSaleWeightG: 0,
                availableWeightG: 100_000,
                confirmedHarvestWeightG: 100_000,
                correctionDecreaseWeightG: 0,
                correctionIncreaseWeightG: 0,
                soldWeightG: 0
              },
              sourceInvalidDocumentCount: 0
            }
          }
        ]
      })
    ).toThrow("Zwykla sprzedaz jest zablokowana do czasu wyjasnienia alarmu stanu.");
  });

  it("keeps a negative projected stock visible for the fresh preflight", () => {
    expect(
      createOrdinarySalePreview({
        draft: draft({ weightKg: "120" }),
        stockContexts
      }).projectedAvailableWeightG
    ).toBe(-20_000);
  });

  it("rounds the preview to one grosz with integer arithmetic", () => {
    expect(calculateSaleRevenuePreviewGrosz(1, 500)).toBe(1);
    expect(calculateSaleRevenuePreviewGrosz(333, 1000)).toBe(333);
    expect(calculateSaleRevenuePreviewGrosz(12_345, 1550)).toBe(19_135);
  });

  it("rejects an unsafe revenue preview", () => {
    expect(() =>
      calculateSaleRevenuePreviewGrosz(Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER)
    ).toThrow("Masa sprzedazy przekracza limit jednego dokumentu.");
  });
});

function draft(overrides: Partial<OrdinarySaleFormDraft> = {}): OrdinarySaleFormDraft {
  return {
    businessDate: "2026-07-29",
    note: "",
    pricePlnPerKg: "10,00",
    seasonId: "season-2026",
    weightKg: "1,000",
    ...overrides
  };
}
