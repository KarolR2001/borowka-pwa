import type { UserProfile } from "../domain/identity";
import type { SourceStockCalculationResult } from "../stock/sourceStockCalculation";
import type { PreparedOrdinarySale } from "./ordinarySalePreparation";
import {
  createOrdinarySaleId,
  decodeSaleDocument,
  evaluateOrdinarySaleStockCheck,
  prepareOrdinarySaleDocument,
  type FreshSaleStock
} from "./saleStockPreflight";

const adminProfile: UserProfile = {
  active: true,
  displayName: "Admin",
  email: "admin@example.test",
  offlineConsent: false,
  registrationStatus: "APPROVED",
  role: "ADMIN",
  uid: "admin-1",
  workerId: null
};

describe("ordinary sale stock preflight", () => {
  it("requires confirmation against a fresh unchanged server stock", () => {
    const result = evaluateOrdinarySaleStockCheck({
      freshStock: stock(10_000),
      preparedSale: preparedSale(),
      saleId: "sale-1"
    });

    expect(result).toMatchObject({
      check: {
        expectedAvailableWeightG: 10_000,
        sale: {
          availableWeightG: 10_000,
          projectedAvailableWeightG: 7000,
          stockDataSource: "SERVER",
          stockWasFresh: true
        },
        saleId: "sale-1",
        stockChanged: false
      },
      status: "CONFIRMATION_REQUIRED"
    });
  });

  it("updates the summary and marks a changed stock for reconfirmation", () => {
    const result = evaluateOrdinarySaleStockCheck({
      freshStock: stock(8000),
      preparedSale: preparedSale(),
      saleId: "sale-1"
    });

    expect(result).toMatchObject({
      check: {
        expectedAvailableWeightG: 8000,
        sale: {
          availableWeightG: 8000,
          projectedAvailableWeightG: 5000
        },
        stockChanged: true
      },
      status: "CONFIRMATION_REQUIRED"
    });
  });

  it("blocks an ordinary sale exceeding the fresh stock", () => {
    const result = evaluateOrdinarySaleStockCheck({
      freshStock: stock(2000),
      preparedSale: preparedSale(),
      saleId: "sale-1"
    });

    expect(result).toMatchObject({
      check: {
        sale: {
          availableWeightG: 2000,
          projectedAvailableWeightG: -1000
        }
      },
      status: "BLOCKED"
    });
    expect(result.status === "BLOCKED" ? result.message : "").toContain(
      "przekracza aktualny stan"
    );
  });

  it("blocks a negative stock and malformed source documents", () => {
    const negativeResult = evaluateOrdinarySaleStockCheck({
      freshStock: stock(-1),
      preparedSale: preparedSale(),
      saleId: "sale-1"
    });
    expect(negativeResult.status).toBe("BLOCKED");
    expect(negativeResult.status === "BLOCKED" ? negativeResult.message : "").toContain(
      "ujemny"
    );

    const invalidResult = evaluateOrdinarySaleStockCheck({
      freshStock: { ...stock(10_000), invalidDocumentCount: 1 },
      preparedSale: preparedSale(),
      saleId: "sale-1"
    });
    expect(invalidResult.status).toBe("BLOCKED");
    expect(invalidResult.status === "BLOCKED" ? invalidResult.message : "").toContain(
      "nieprawidlowe dokumenty"
    );
  });

  it("prepares and decodes an active ordinary sale document", () => {
    const document = prepareOrdinarySaleDocument({
      actorProfile: adminProfile,
      checkedSale: preparedSale(),
      createdAtServer: "server-time",
      creationAttemptId: "sale-attempt-sale-1",
      saleId: "sale-1"
    });

    expect(document).toEqual({
      businessDate: "2026-07-29",
      calculationVersion: "1",
      cancellationReason: null,
      cancelledAt: null,
      cancelledBy: null,
      correctionDirection: null,
      createdAtServer: "server-time",
      createdBy: "admin-1",
      creationAttemptId: "sale-attempt-sale-1",
      entryType: "SALE",
      id: "sale-1",
      legacyImport: false,
      legacySourceRow: null,
      note: "Odbiorca A",
      priceGroszPerKg: 1250,
      seasonId: "season-1",
      status: "ACTIVE",
      totalGrosz: 3750,
      weightG: 3000
    });
    expect(decodeSaleDocument("sale-1", document)).toEqual(document);
  });

  it("rejects malformed sale documents and non-admin writes", () => {
    const document = prepareOrdinarySaleDocument({
      actorProfile: adminProfile,
      checkedSale: preparedSale(),
      createdAtServer: "server-time",
      creationAttemptId: "sale-attempt-sale-1",
      saleId: "sale-1"
    });

    expect(
      decodeSaleDocument("sale-1", {
        ...document,
        correctionDirection: "INCREASE_STOCK"
      })
    ).toBeNull();
    expect(
      decodeSaleDocument("sale-1", {
        ...document,
        totalGrosz: document.totalGrosz - 1
      })
    ).toBeNull();
    expect(
      decodeSaleDocument("sale-1", {
        ...document,
        calculationVersion: "legacy"
      })
    ).toBeNull();
    expect(() =>
      prepareOrdinarySaleDocument({
        actorProfile: { ...adminProfile, role: "OPERATOR" },
        checkedSale: preparedSale(),
        createdAtServer: "server-time",
        creationAttemptId: "sale-attempt-sale-1",
        saleId: "sale-1"
      })
    ).toThrow("tylko aktywny administrator");
  });

  it("uses a stable validated UUID supplied by the caller", () => {
    expect(createOrdinarySaleId(() => "sale-uuid-1")).toBe("sale-uuid-1");
    expect(() => createOrdinarySaleId(() => " ")).toThrow(
      "Nie udalo sie utworzyc identyfikatora"
    );
  });
});

function preparedSale(): PreparedOrdinarySale {
  return {
    availableWeightG: 10_000,
    businessDate: "2026-07-29",
    correctionDirection: null,
    entryType: "SALE",
    note: "Odbiorca A",
    pendingDocumentCount: 0,
    priceGroszPerKg: 1250,
    projectedAvailableWeightG: 7000,
    refreshedAtIso: "2026-07-29T06:00:00.000Z",
    revenueCalculationVersion: "1",
    revenuePreviewGrosz: 3750,
    revenueRemainderMilliGrosz: 0,
    revenueRoundingRule: "HALF_UP_TO_GROSZ",
    seasonId: "season-1",
    seasonName: "Sezon 2026",
    status: "ACTIVE",
    stockDataSource: "SERVER",
    stockWasFresh: true,
    weightG: 3000
  };
}

function stock(availableWeightG: number): FreshSaleStock {
  const calculation: SourceStockCalculationResult = {
    activeSaleWeightG: 0,
    availableWeightG,
    confirmedHarvestWeightG: Math.max(availableWeightG, 0),
    correctionDecreaseWeightG: 0,
    correctionIncreaseWeightG: 0,
    seasonId: "season-1",
    soldWeightG: 0,
    sourceCounts: {
      activeCorrectionDocuments: 0,
      activeSaleDocuments: 0,
      cancelledSaleDocuments: 0,
      harvestSessionDocuments: 1,
      includedHarvestSessionDocuments: 1,
      saleDocuments: 0
    }
  };

  return {
    calculation,
    context: {
      availableWeightG,
      dataSource: "SERVER",
      isFresh: true,
      pendingDocumentCount: 0,
      refreshedAtIso: "2026-07-29T06:05:00.000Z",
      seasonId: "season-1",
      seasonName: "Sezon 2026"
    },
    invalidDocumentCount: 0
  };
}
