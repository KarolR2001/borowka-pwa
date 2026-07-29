import type { UserProfile } from "../domain/identity";
import type { FreshSaleStock } from "./saleStockPreflight";
import {
  createSaleCorrectionId,
  evaluateSaleCorrectionCheck,
  prepareSaleCorrectionAudit,
  prepareSaleCorrectionDocument
} from "./saleCorrectionWrite";
import { prepareSaleCorrection } from "./saleCorrectionPreparation";

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

describe("sale correction write", () => {
  it("refreshes stock and requires confirmation", () => {
    const result = evaluateSaleCorrectionCheck({
      correctionId: "correction-1",
      freshStock: freshStock(8000),
      preparedCorrection: preparedCorrection("DECREASE_STOCK")
    });

    expect(result).toMatchObject({
      check: {
        correction: {
          availableWeightG: 8000,
          projectedAvailableWeightG: 5000
        },
        correctionId: "correction-1",
        expectedAvailableWeightG: 8000,
        stockChanged: true
      },
      status: "CONFIRMATION_REQUIRED"
    });
  });

  it("blocks a correction when source documents are invalid", () => {
    const result = evaluateSaleCorrectionCheck({
      correctionId: "correction-1",
      freshStock: {
        ...freshStock(10_000),
        invalidDocumentCount: 1
      },
      preparedCorrection: preparedCorrection("INCREASE_STOCK")
    });

    expect(result.status).toBe("BLOCKED");
    if (result.status === "BLOCKED") {
      expect(result.message).toContain("nieprawidlowe dokumenty");
    }
  });

  it("creates a separate correction document with author and server time", () => {
    const document = prepareSaleCorrectionDocument({
      actorProfile: adminProfile,
      correctionId: "correction-1",
      createdAtServer: "server-time",
      creationAttemptId: "attempt-1",
      preparedCorrection: preparedCorrection("INCREASE_STOCK")
    });

    expect(document).toMatchObject({
      calculationVersion: "1",
      correctionDirection: "INCREASE_STOCK",
      createdAtServer: "server-time",
      createdBy: "admin-1",
      entryType: "CORRECTION",
      id: "correction-1",
      note: "Powod korekty sprzedazy",
      totalGrosz: 3750,
      weightG: 3000
    });
  });

  it("creates a dedicated audit with direction, impacts and reason", () => {
    expect(
      prepareSaleCorrectionAudit({
        actorProfile: adminProfile,
        correctionId: "correction-1",
        createdAtDevice: "device-time",
        createdAtServer: "server-time",
        deviceId: "device-admin",
        preparedCorrection: preparedCorrection("INCREASE_STOCK")
      })
    ).toMatchObject({
      action: "SALE_CORRECTION_CREATED",
      actorUid: "admin-1",
      afterSummary: {
        correctionDirection: "INCREASE_STOCK",
        projectedStockWeightG: 13_000,
        revenueImpactGrosz: -3750
      },
      entityId: "correction-1",
      entityType: "SALE",
      id: "sale-correction-created-correction-1",
      reason: "Powod korekty sprzedazy"
    });
  });

  it("creates a stable validated correction id", () => {
    expect(createSaleCorrectionId(() => "correction-uuid")).toBe("correction-uuid");
    expect(() => createSaleCorrectionId(() => " ")).toThrow(
      "Nie udalo sie utworzyc identyfikatora korekty"
    );
  });

  it("rejects a non-admin correction author", () => {
    expect(() =>
      prepareSaleCorrectionDocument({
        actorProfile: { ...adminProfile, role: "OPERATOR" },
        correctionId: "correction-1",
        createdAtServer: "server-time",
        creationAttemptId: "attempt-1",
        preparedCorrection: preparedCorrection("INCREASE_STOCK")
      })
    ).toThrow("tylko aktywny administrator");
  });
});

function preparedCorrection(direction: "INCREASE_STOCK" | "DECREASE_STOCK") {
  return prepareSaleCorrection({
    draft: {
      businessDate: "2026-07-29",
      correctionDirection: direction,
      pricePlnPerKg: "12,50",
      reason: "Powod korekty sprzedazy",
      seasonId: "season-1",
      weightKg: "3"
    },
    isOnline: true,
    stockContexts: [
      {
        availableWeightG: 10_000,
        dataSource: "SERVER",
        isFresh: true,
        pendingDocumentCount: 0,
        refreshedAtIso: "2026-07-29T06:00:00.000Z",
        seasonId: "season-1",
        seasonName: "Sezon 2026"
      }
    ]
  });
}

function freshStock(availableWeightG: number): FreshSaleStock {
  return {
    calculation: {
      activeSaleWeightG: 0,
      availableWeightG,
      confirmedHarvestWeightG: availableWeightG,
      correctionDecreaseWeightG: 0,
      correctionIncreaseWeightG: 0,
      seasonId: "season-1",
      soldWeightG: 0,
      sourceCounts: {
        activeCorrectionDocuments: 0,
        activeSaleDocuments: 0,
        cancelledSaleDocuments: 0,
        harvestSessionDocuments: 0,
        includedHarvestSessionDocuments: 0,
        saleDocuments: 0
      }
    },
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
