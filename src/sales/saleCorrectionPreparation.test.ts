import {
  assertPreparedSaleCorrection,
  correctionDirectionLabel,
  createInitialSaleCorrectionDraft,
  prepareSaleCorrection,
  refreshPreparedSaleCorrectionStock
} from "./saleCorrectionPreparation";

const stockContexts = [
  {
    availableWeightG: 10_000,
    dataSource: "SERVER" as const,
    isFresh: true,
    pendingDocumentCount: 0,
    refreshedAtIso: "2026-07-29T06:00:00.000Z",
    seasonId: "season-1",
    seasonName: "Sezon 2026"
  }
];

describe("sale correction preparation", () => {
  it("prepares an increasing-stock correction with negative revenue impact", () => {
    const correction = prepareSaleCorrection({
      draft: {
        businessDate: "2026-07-29",
        correctionDirection: "INCREASE_STOCK",
        pricePlnPerKg: "12,50",
        reason: "Zwrot blednie ujetego wydania",
        seasonId: "season-1",
        weightKg: "3"
      },
      isOnline: true,
      stockContexts
    });

    expect(correction).toMatchObject({
      availableWeightG: 10_000,
      calculationVersion: "1",
      correctionDirection: "INCREASE_STOCK",
      entryType: "CORRECTION",
      note: "Zwrot blednie ujetego wydania",
      priceGroszPerKg: 1250,
      projectedAvailableWeightG: 13_000,
      revenueImpactGrosz: -3750,
      revenueMagnitudeGrosz: 3750,
      status: "ACTIVE",
      stockImpactG: 3000,
      weightG: 3000
    });
    expect(() => {
      assertPreparedSaleCorrection(correction);
    }).not.toThrow();
  });

  it("prepares a decreasing-stock correction with positive revenue impact", () => {
    expect(
      prepareSaleCorrection({
        draft: {
          businessDate: "2026-07-29",
          correctionDirection: "DECREASE_STOCK",
          pricePlnPerKg: "15,50",
          reason: "Brakujaca sprzedaz z dokumentu",
          seasonId: "season-1",
          weightKg: "12,345"
        },
        isOnline: true,
        stockContexts
      })
    ).toMatchObject({
      correctionDirection: "DECREASE_STOCK",
      projectedAvailableWeightG: -2345,
      revenueImpactGrosz: 19_135,
      revenueMagnitudeGrosz: 19_135,
      revenueRemainderMilliGrosz: 750,
      stockImpactG: -12_345
    });
  });

  it("refreshes only the stock snapshot while preserving correction values", () => {
    const prepared = prepareSaleCorrection({
      draft: {
        businessDate: "2026-07-29",
        correctionDirection: "DECREASE_STOCK",
        pricePlnPerKg: "12,50",
        reason: "Dodatkowy rozchod",
        seasonId: "season-1",
        weightKg: "3"
      },
      isOnline: true,
      stockContexts
    });

    expect(
      refreshPreparedSaleCorrectionStock(prepared, {
        ...stockContexts[0],
        availableWeightG: 8000,
        refreshedAtIso: "2026-07-29T06:05:00.000Z"
      })
    ).toMatchObject({
      availableWeightG: 8000,
      note: "Dodatkowy rozchod",
      projectedAvailableWeightG: 5000,
      revenueImpactGrosz: 3750,
      stockImpactG: -3000
    });
  });

  it("requires online mode, a reason and nonnegative values", () => {
    const draft = {
      ...createInitialSaleCorrectionDraft({
        businessDate: "2026-07-29",
        stockContexts
      }),
      pricePlnPerKg: "12,50",
      reason: "OK",
      weightKg: "1"
    };

    expect(() =>
      prepareSaleCorrection({ draft, isOnline: false, stockContexts })
    ).toThrow("wymaga polaczenia");
    expect(() => prepareSaleCorrection({ draft, isOnline: true, stockContexts })).toThrow(
      "co najmniej 3 znaki"
    );
    expect(() =>
      prepareSaleCorrection({
        draft: { ...draft, pricePlnPerKg: "-1", reason: "Powod korekty" },
        isOnline: true,
        stockContexts
      })
    ).toThrow("Cena korekty nie moze byc ujemna");
  });

  it("rejects a tampered prepared impact", () => {
    const prepared = prepareSaleCorrection({
      draft: {
        businessDate: "2026-07-29",
        correctionDirection: "INCREASE_STOCK",
        pricePlnPerKg: "12,50",
        reason: "Powod korekty",
        seasonId: "season-1",
        weightKg: "3"
      },
      isOnline: true,
      stockContexts
    });

    expect(() => {
      assertPreparedSaleCorrection({
        ...prepared,
        revenueImpactGrosz: 3750
      });
    }).toThrow("niespojny wplyw");
  });

  it("names both correction directions explicitly", () => {
    expect(correctionDirectionLabel("INCREASE_STOCK")).toContain(
      "zmniejszenie przychodu"
    );
    expect(correctionDirectionLabel("DECREASE_STOCK")).toContain("zwiekszenie przychodu");
  });
});
