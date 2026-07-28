import type { UserProfile } from "../domain/identity";
import { buildPickerDashboard, loadPickerDashboard } from "./pickerDashboard";

const pickerProfile: UserProfile = {
  active: true,
  displayName: "Anna Konto",
  email: "anna@example.test",
  offlineConsent: true,
  registrationStatus: "APPROVED",
  role: "PICKER",
  uid: "picker-anna",
  workerId: "worker-anna"
};

describe("picker dashboard", () => {
  it("summarizes only the picker's selected season and active payments", () => {
    const result = buildPickerDashboard({
      actorProfile: pickerProfile,
      dataSource: "SERVER",
      paymentDocuments: [
        paymentDocument("payment-active", { amountGrosz: 2250 }),
        paymentDocument("payment-cancelled", {
          amountGrosz: 4500,
          status: "CANCELLED"
        }),
        paymentDocument("payment-other-season", {
          amountGrosz: 1000,
          seasonId: "season-2025"
        })
      ],
      refreshedAtIso: "2026-07-28T18:30:00.000Z",
      seasonDocuments: [
        seasonDocument("season-2026", { isDefault: true }),
        seasonDocument("season-2025", {
          name: "Sezon 2025",
          startDate: "2025-07-01",
          status: "CLOSED"
        })
      ],
      sessionDocuments: [
        sessionDocument("session-open", {
          amountDueGrosz: null,
          status: "OPEN",
          totalQuantityMilli: 2500,
          totalWeightG: 2500
        }),
        sessionDocument("session-closed", {
          amountDueGrosz: 4500,
          calculationBasisSnapshot: "QUANTITY",
          planIdSnapshot: "plan-ubianka",
          planNameSnapshot: "Za ubianke",
          quantityPrecisionSnapshot: 1,
          status: "CLOSED",
          totalQuantityMilli: 3000,
          totalWeightG: 12_000,
          unitLabelPluralSnapshot: "ubianki"
        }),
        sessionDocument("session-paid", {
          amountDueGrosz: 2250,
          calculationBasisSnapshot: "QUANTITY",
          planIdSnapshot: "plan-ubianka",
          planNameSnapshot: "Za ubianke",
          quantityPrecisionSnapshot: 1,
          status: "PAID",
          totalQuantityMilli: 1500,
          totalWeightG: 5000,
          unitLabelPluralSnapshot: "ubianki"
        }),
        sessionDocument("session-cancelled", {
          amountDueGrosz: 9000,
          status: "CANCELLED",
          totalWeightG: 50_000
        }),
        sessionDocument("session-other-season", {
          amountDueGrosz: 1000,
          seasonId: "season-2025",
          status: "CLOSED",
          totalWeightG: 10_000
        })
      ],
      workerDocument: workerDocument()
    });

    expect(result).toMatchObject({
      accruedAmountGrosz: 6750,
      dataSource: "SERVER",
      invalidPaymentCount: 0,
      invalidSeasonCount: 0,
      invalidSessionCount: 0,
      invalidWorker: false,
      paidAmountGrosz: 2250,
      refreshedAtIso: "2026-07-28T18:30:00.000Z",
      remainingAmountGrosz: 4500,
      selectedSeasonId: "season-2026",
      selectedSeasonName: "Sezon 2026",
      sessionCounts: {
        closed: 1,
        open: 1,
        paid: 1
      },
      totalWeightG: 19_500,
      userName: "Anna Konto",
      workerId: "worker-anna",
      workerName: "Anna Zbieracz"
    });
    expect(result.quantities).toEqual([
      {
        planId: "plan-ubianka",
        planName: "Za ubianke",
        quantityPrecision: 1,
        sessionCount: 2,
        totalQuantityMilli: 4500,
        unitLabelPlural: "ubianki"
      }
    ]);
  });

  it("keeps quantities separated by plan and reports invalid or foreign documents", () => {
    const result = buildPickerDashboard({
      actorProfile: pickerProfile,
      dataSource: "CACHE",
      paymentDocuments: [
        paymentDocument("foreign-payment", { workerId: "worker-other" }),
        { id: "broken-payment", data: { id: "broken-payment" } }
      ],
      refreshedAtIso: "2026-07-28T18:30:00Z",
      seasonDocuments: [
        seasonDocument("season-2026", { isDefault: true }),
        { id: "broken-season", data: { id: "broken-season" } }
      ],
      sessionDocuments: [
        sessionDocument("session-a", {
          calculationBasisSnapshot: "QUANTITY",
          planIdSnapshot: "plan-a",
          planNameSnapshot: "Plan A",
          totalQuantityMilli: 1000
        }),
        sessionDocument("session-b", {
          calculationBasisSnapshot: "QUANTITY",
          planIdSnapshot: "plan-b",
          planNameSnapshot: "Plan B",
          totalQuantityMilli: 2000
        }),
        sessionDocument("foreign-session", { workerId: "worker-other" })
      ],
      workerDocument: workerDocument({
        linkedUserUid: "picker-other"
      })
    });

    expect(result.dataSource).toBe("CACHE");
    expect(result.quantities.map((quantity) => quantity.planId)).toEqual([
      "plan-a",
      "plan-b"
    ]);
    expect(result).toMatchObject({
      invalidPaymentCount: 2,
      invalidSeasonCount: 1,
      invalidSessionCount: 1,
      invalidWorker: true,
      workerName: null
    });
  });

  it("rejects a profile other than an approved picker before Firebase initialization", async () => {
    await expect(
      loadPickerDashboard(
        {},
        {
          actorProfile: {
            ...pickerProfile,
            role: "ADMIN",
            workerId: null
          },
          isOnline: true
        }
      )
    ).rejects.toThrow("Pulpit zbieracza wymaga aktywnego profilu z workerId.");
  });
});

function seasonDocument(id: string, overrides: Record<string, unknown> = {}) {
  return {
    id,
    data: {
      closedAt: null,
      closedBy: null,
      createdAt: "2026-06-01T00:00:00.000Z",
      createdBy: "admin-1",
      endDate: "2026-09-30",
      id,
      isDefault: false,
      name: "Sezon 2026",
      reopenedAt: null,
      startDate: "2026-07-01",
      status: "OPEN",
      ...overrides
    }
  };
}

function workerDocument(overrides: Record<string, unknown> = {}) {
  return {
    id: "worker-anna",
    data: {
      active: true,
      archivedAt: null,
      createdAt: "2026-06-01T00:00:00.000Z",
      createdBy: "admin-1",
      currentPlanId: "plan-weight",
      currentRateVersionId: "rate-1",
      displayName: "Anna Zbieracz",
      emailContact: null,
      id: "worker-anna",
      legacyName: null,
      linkedUserUid: "picker-anna",
      normalizedName: "anna zbieracz",
      notes: null,
      phone: null,
      updatedAt: "2026-06-01T00:00:00.000Z",
      ...overrides
    }
  };
}

function paymentDocument(id: string, overrides: Record<string, unknown> = {}) {
  return {
    id,
    data: {
      amountGrosz: 2250,
      cancellationReason: null,
      cancelledAt: null,
      cancelledBy: null,
      creationAttemptId: `attempt-${id}`,
      createdAtServer: "2026-07-28T12:00:00.000Z",
      createdBy: "admin-1",
      id,
      legacyImport: false,
      note: null,
      paidBusinessDate: "2026-07-28",
      paymentMethod: "CASH",
      seasonId: "season-2026",
      sessionId: "session-paid",
      status: "ACTIVE",
      workerId: "worker-anna",
      workerNameSnapshot: "Anna Zbieracz",
      ...overrides
    }
  };
}

function sessionDocument(id: string, overrides: Record<string, unknown> = {}) {
  return {
    id,
    data: {
      allowBatchQuantitySnapshot: true,
      amountDueGrosz: null,
      businessDate: "2026-07-28",
      calculationBasisSnapshot: "WEIGHT",
      calculationVersion: "1",
      cancellationReason: null,
      cancelledAt: null,
      cancelledBy: null,
      closedAtDevice: null,
      closedAtServer: null,
      closedBy: null,
      createdAtDevice: "2026-07-28T08:00:00.000Z",
      createdAtServer: "2026-07-28T08:00:01.000Z",
      createdBy: "operator-1",
      createdDeviceId: "device-1",
      id,
      legacyImport: false,
      legacySourceRows: [],
      note: null,
      paidAt: null,
      paymentId: null,
      planIdSnapshot: "plan-weight",
      planNameSnapshot: "Za kilogram",
      quantityPrecisionSnapshot: 3,
      rateGroszSnapshot: 1000,
      rateVersionIdSnapshot: "rate-1",
      revision: 1,
      seasonId: "season-2026",
      status: "OPEN",
      totalEntryCount: 1,
      totalQuantityMilli: 1000,
      totalWeightG: 1000,
      unitLabelPluralSnapshot: "kilogramy",
      unitLabelSnapshot: "kilogram",
      updatedAtServer: null,
      weightRequiredSnapshot: true,
      workerId: "worker-anna",
      workerNameSnapshot: "Anna Zbieracz",
      ...overrides
    }
  };
}
