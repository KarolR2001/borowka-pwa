import type { UserProfile } from "../domain/identity";
import {
  calculateSaleCancellationImpact,
  createSaleCancellationAuditId,
  prepareSaleCancellation
} from "./saleCancellation";
import type { SaleDocument } from "./saleStockPreflight";

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

describe("sale cancellation", () => {
  it.each([
    {
      correctionDirection: null,
      entryType: "SALE",
      revenueImpactGrosz: -3750,
      stockImpactG: 3000
    },
    {
      correctionDirection: "INCREASE_STOCK",
      entryType: "CORRECTION",
      revenueImpactGrosz: 3750,
      stockImpactG: -3000
    },
    {
      correctionDirection: "DECREASE_STOCK",
      entryType: "CORRECTION",
      revenueImpactGrosz: -3750,
      stockImpactG: 3000
    }
  ] as const)(
    "reverses stock and revenue for $entryType $correctionDirection",
    ({ correctionDirection, entryType, revenueImpactGrosz, stockImpactG }) => {
      expect(
        calculateSaleCancellationImpact(saleDocument({ correctionDirection, entryType }))
      ).toEqual({ revenueImpactGrosz, stockImpactG });
    }
  );

  it("prepares an immutable status update and matching audit", () => {
    const sale = saleDocument({});
    const prepared = prepareSaleCancellation({
      actorProfile: adminProfile,
      auditId: "sale-cancelled-sale-1",
      cancelledAt: "server-time",
      confirmed: true,
      createdAtDevice: "device-time",
      createdAtServer: "server-time",
      deviceId: "device-admin",
      isOnline: true,
      reason: "  Bledna masa  ",
      sale,
      saleId: sale.id
    });

    expect(prepared.saleUpdate).toEqual({
      cancellationReason: "Bledna masa",
      cancelledAt: "server-time",
      cancelledBy: "admin-1",
      status: "CANCELLED"
    });
    expect(prepared.cancelledSale).toEqual({
      ...sale,
      ...prepared.saleUpdate
    });
    expect(prepared.impact).toEqual({
      revenueImpactGrosz: -3750,
      stockImpactG: 3000
    });
    expect(prepared.auditEvent).toMatchObject({
      action: "SALE_CANCELLED",
      actorUid: "admin-1",
      afterSummary: {
        revenueImpactGrosz: -3750,
        saleId: "sale-1",
        status: "CANCELLED",
        stockImpactG: 3000
      },
      beforeSummary: {
        revenueImpactGrosz: 3750,
        saleId: "sale-1",
        status: "ACTIVE",
        stockImpactG: -3000
      },
      entityId: "sale-1",
      reason: "Bledna masa"
    });
  });

  it("rejects missing confirmation, invalid reasons and inactive documents", () => {
    const baseInput = {
      actorProfile: adminProfile,
      auditId: "sale-cancelled-sale-1",
      cancelledAt: "server-time",
      confirmed: true,
      createdAtDevice: "device-time",
      createdAtServer: "server-time",
      deviceId: "device-admin",
      isOnline: true,
      reason: "Bledna masa",
      sale: saleDocument({}),
      saleId: "sale-1"
    };

    expect(() => prepareSaleCancellation({ ...baseInput, confirmed: false })).toThrow(
      "Potwierdz skutki"
    );
    expect(() => prepareSaleCancellation({ ...baseInput, reason: "x" })).toThrow(
      "Powod anulowania"
    );
    expect(() =>
      prepareSaleCancellation({
        ...baseInput,
        sale: {
          ...baseInput.sale,
          cancellationReason: "Inny powod",
          cancelledAt: "old-time",
          cancelledBy: "admin-1",
          status: "CANCELLED"
        }
      })
    ).toThrow("nie jest juz aktywna");
  });

  it("creates a deterministic audit identifier", () => {
    expect(createSaleCancellationAuditId("sale-1")).toBe("sale-cancelled-sale-1");
  });
});

function saleDocument({
  correctionDirection = null,
  entryType = "SALE"
}: {
  correctionDirection?: SaleDocument["correctionDirection"];
  entryType?: SaleDocument["entryType"];
}): SaleDocument {
  return {
    businessDate: "2026-07-29",
    calculationVersion: "1",
    cancellationReason: null,
    cancelledAt: null,
    cancelledBy: null,
    correctionDirection,
    createdAtServer: "server-time",
    createdBy: "admin-1",
    creationAttemptId: "sale-attempt-sale-1",
    entryType,
    id: "sale-1",
    legacyImport: false,
    legacySourceRow: null,
    note: entryType === "CORRECTION" ? "Powod korekty" : "Odbiorca A",
    priceGroszPerKg: 1250,
    seasonId: "season-1",
    status: "ACTIVE",
    totalGrosz: 3750,
    weightG: 3000
  };
}
