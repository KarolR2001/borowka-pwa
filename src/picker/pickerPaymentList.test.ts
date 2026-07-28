import type { UserProfile } from "../domain/identity";
import {
  buildPickerPaymentList,
  defaultPickerPaymentFilters,
  filterPickerPaymentItems,
  loadPickerPaymentList,
  summarizePickerPaymentPeriod
} from "./pickerPaymentList";

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

describe("picker payment list", () => {
  it("keeps cancelled payments in history but outside paid totals", () => {
    const result = buildPickerPaymentList({
      actorProfile: pickerProfile,
      dataSource: "SERVER",
      paymentDocuments: [
        paymentDocument("payment-active", "session-paid", "ACTIVE", 5000),
        paymentDocument("payment-cancelled", "session-closed", "CANCELLED", 7500),
        paymentDocument("foreign-payment", "session-foreign", "ACTIVE", 9999, {
          workerId: "worker-other"
        })
      ],
      refreshedAtIso: "2026-07-30T10:00:00.000Z",
      seasonDocuments: [seasonDocument()],
      sessionDocuments: [
        sessionDocument("session-paid", "PAID", 5000, "2026-07-28"),
        sessionDocument("session-closed", "CLOSED", 7500, "2026-07-27"),
        sessionDocument("session-open", "OPEN", null, "2026-07-29")
      ]
    });

    expect(result.invalidPaymentCount).toBe(1);
    expect(result.payments).toEqual([
      expect.objectContaining({
        id: "payment-cancelled",
        status: "CANCELLED"
      }),
      expect.objectContaining({ id: "payment-active", status: "ACTIVE" })
    ]);
    expect(summarizePickerPaymentPeriod(result, defaultPickerPaymentFilters)).toEqual({
      accruedAmountGrosz: 12_500,
      activePaymentCount: 1,
      cancelledAmountGrosz: 7500,
      cancelledPaymentCount: 1,
      paidAmountGrosz: 5000,
      remainingAmountGrosz: 7500
    });

    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain("Tajna notatka");
    expect(serialized).not.toContain("admin-secret");
  });

  it("filters by source-session period and payment status", () => {
    const result = buildPickerPaymentList({
      actorProfile: pickerProfile,
      dataSource: "CACHE",
      paymentDocuments: [
        paymentDocument("payment-active", "session-paid", "ACTIVE", 5000),
        paymentDocument("payment-cancelled", "session-closed", "CANCELLED", 7500)
      ],
      refreshedAtIso: "2026-07-30T10:00:00.000Z",
      seasonDocuments: [seasonDocument()],
      sessionDocuments: [
        sessionDocument("session-paid", "PAID", 5000, "2026-07-28"),
        sessionDocument("session-closed", "CLOSED", 7500, "2026-07-27")
      ]
    });
    const filters = {
      fromDate: "2026-07-28",
      seasonId: "season-2026",
      status: "ACTIVE" as const,
      toDate: "2026-07-28"
    };

    expect(filterPickerPaymentItems(result.payments, filters)).toEqual([
      expect.objectContaining({ id: "payment-active" })
    ]);
    expect(summarizePickerPaymentPeriod(result, filters)).toMatchObject({
      accruedAmountGrosz: 5000,
      paidAmountGrosz: 5000,
      remainingAmountGrosz: 0
    });
  });

  it("marks an invalid source relation and excludes it from paid totals", () => {
    const result = buildPickerPaymentList({
      actorProfile: pickerProfile,
      dataSource: "SERVER",
      paymentDocuments: [
        paymentDocument("payment-mismatch", "session-paid", "ACTIVE", 1000, {
          seasonId: "season-other"
        })
      ],
      refreshedAtIso: "2026-07-30T10:00:00.000Z",
      seasonDocuments: [seasonDocument()],
      sessionDocuments: [
        sessionDocument("session-paid", "PAID", 1000, "2026-07-29"),
        sessionDocument("session-foreign", "PAID", 1000, "2026-07-29", {
          workerId: "worker-other"
        })
      ]
    });

    expect(result.invalidSessionCount).toBe(1);
    expect(result.missingSourceSessionCount).toBe(1);
    expect(result.payments[0]?.sessionBusinessDate).toBeNull();
    expect(
      summarizePickerPaymentPeriod(result, defaultPickerPaymentFilters)
    ).toMatchObject({
      accruedAmountGrosz: 1000,
      paidAmountGrosz: 0,
      remainingAmountGrosz: 1000
    });
  });

  it("rejects another role before opening Firebase", async () => {
    await expect(
      loadPickerPaymentList(
        {},
        {
          actorProfile: { ...pickerProfile, role: "ADMIN", workerId: null },
          isOnline: true
        }
      )
    ).rejects.toThrow("Moje wyplaty wymagaja aktywnego profilu pickera");
  });
});

function seasonDocument() {
  return {
    id: "season-2026",
    data: {
      closedAt: null,
      closedBy: null,
      createdAt: "2026-01-01T00:00:00.000Z",
      createdBy: "admin-secret",
      endDate: "2026-09-30",
      id: "season-2026",
      isDefault: true,
      name: "Sezon 2026",
      reopenedAt: null,
      startDate: "2026-07-01",
      status: "OPEN"
    }
  };
}

function sessionDocument(
  id: string,
  status: "OPEN" | "CLOSED" | "PAID",
  amountDueGrosz: number | null,
  businessDate: string,
  overrides: Record<string, unknown> = {}
) {
  return {
    id,
    data: {
      allowBatchQuantitySnapshot: true,
      amountDueGrosz,
      businessDate,
      calculationBasisSnapshot: "QUANTITY",
      calculationVersion: "1",
      cancellationReason: null,
      cancelledAt: null,
      cancelledBy: null,
      closedAtDevice: "2026-07-29T12:00:00.000Z",
      closedAtServer: "2026-07-29T12:00:01.000Z",
      closedBy: "operator-secret",
      createdAtDevice: "2026-07-29T08:00:00.000Z",
      createdAtServer: "2026-07-29T08:00:01.000Z",
      createdBy: "operator-secret",
      createdDeviceId: "device-secret",
      id,
      legacyImport: false,
      legacySourceRows: [],
      note: "Tajna notatka sesji",
      paidAt: status === "PAID" ? "2026-07-30T10:00:00.000Z" : null,
      paymentId: status === "PAID" ? "payment-active" : null,
      planIdSnapshot: "plan-ubianka",
      planNameSnapshot: "Za ubianke",
      quantityPrecisionSnapshot: 1,
      rateGroszSnapshot: 1500,
      rateVersionIdSnapshot: "rate-1",
      revision: 2,
      seasonId: "season-2026",
      status,
      totalEntryCount: 1,
      totalQuantityMilli: 1000,
      totalWeightG: 4000,
      unitLabelPluralSnapshot: "ubianki",
      unitLabelSnapshot: "ubianka",
      updatedAtServer: "2026-07-30T10:00:00.000Z",
      weightRequiredSnapshot: false,
      workerId: "worker-anna",
      workerNameSnapshot: "Anna Zbieracz",
      ...overrides
    }
  };
}

function paymentDocument(
  id: string,
  sessionId: string,
  status: "ACTIVE" | "CANCELLED",
  amountGrosz: number,
  overrides: Record<string, unknown> = {}
) {
  return {
    id,
    data: {
      amountGrosz,
      cancellationReason: status === "CANCELLED" ? "Powod administracyjny" : null,
      cancelledAt: status === "CANCELLED" ? "2026-07-30T11:00:00.000Z" : null,
      cancelledBy: status === "CANCELLED" ? "admin-secret" : null,
      creationAttemptId: `attempt-${id}`,
      createdAtServer: "2026-07-30T10:00:00.000Z",
      createdBy: "admin-secret",
      id,
      legacyImport: false,
      note: "Tajna notatka wyplaty",
      paidBusinessDate: status === "CANCELLED" ? "2026-07-30" : "2026-07-29",
      paymentMethod: status === "CANCELLED" ? "CASH" : "BANK_TRANSFER",
      seasonId: "season-2026",
      sessionId,
      status,
      workerId: "worker-anna",
      workerNameSnapshot: "Anna Zbieracz",
      ...overrides
    }
  };
}
