import type { UserProfile } from "../domain/identity";
import {
  buildPickerSessionDetails,
  loadPickerSessionDetails
} from "./pickerSessionDetails";

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

describe("picker session details", () => {
  it("returns only safe session, entry and active payment fields", () => {
    const result = buildPickerSessionDetails({
      actorProfile: pickerProfile,
      dataSource: "SERVER",
      entryDocuments: [
        entryDocument("entry-1", { sequenceNumber: 1 }),
        entryDocument("entry-2", {
          cancellationReason: "Bledna waga",
          sequenceNumber: 2,
          status: "CANCELLED"
        }),
        entryDocument("entry-3", {
          replacesEntryId: "entry-2",
          sequenceNumber: 3
        }),
        entryDocument("foreign-entry", {
          workerId: "worker-other"
        })
      ],
      paymentDocument: paymentDocument(),
      sessionDocument: sessionDocument()
    });

    expect(result).toMatchObject({
      activeEntryCount: 2,
      amountDueGrosz: 7500,
      businessDate: "2026-07-29",
      dataSource: "SERVER",
      invalidEntryCount: 1,
      invalidPayment: false,
      payment: {
        amountGrosz: 7500,
        paidBusinessDate: "2026-07-30",
        paymentMethod: "BANK_TRANSFER",
        status: "ACTIVE"
      },
      planName: "Za ubianke",
      rateGrosz: 1500,
      status: "PAID"
    });
    expect(result.entries).toEqual([
      expect.objectContaining({ id: "entry-1", kind: "ORIGINAL", status: "ACTIVE" }),
      expect.objectContaining({
        cancellationReason: "Bledna waga",
        id: "entry-2",
        kind: "ORIGINAL",
        status: "CANCELLED"
      }),
      expect.objectContaining({
        id: "entry-3",
        kind: "CORRECTION",
        replacesEntryId: "entry-2"
      })
    ]);
    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain("Tajna notatka administracyjna");
    expect(serialized).not.toContain("operator-secret");
    expect(serialized).not.toContain("device-secret");
  });

  it("rejects a foreign session and marks an inconsistent or missing payment", () => {
    expect(() =>
      buildPickerSessionDetails({
        actorProfile: pickerProfile,
        dataSource: "CACHE",
        entryDocuments: [],
        paymentDocument: null,
        sessionDocument: sessionDocument({ workerId: "worker-other" })
      })
    ).toThrow("Sesja nie nalezy do aktywnego profilu pickera.");

    const result = buildPickerSessionDetails({
      actorProfile: pickerProfile,
      dataSource: "CACHE",
      entryDocuments: [],
      paymentDocument: paymentDocument({ status: "CANCELLED" }),
      sessionDocument: sessionDocument()
    });

    expect(result.payment).toBeNull();
    expect(result.invalidPayment).toBe(true);

    const missingPayment = buildPickerSessionDetails({
      actorProfile: pickerProfile,
      dataSource: "SERVER",
      entryDocuments: [],
      paymentDocument: null,
      sessionDocument: sessionDocument()
    });

    expect(missingPayment.payment).toBeNull();
    expect(missingPayment.invalidPayment).toBe(true);
  });

  it("rejects another role before opening Firebase", async () => {
    await expect(
      loadPickerSessionDetails(
        {},
        {
          actorProfile: { ...pickerProfile, role: "ADMIN", workerId: null },
          isOnline: true,
          sessionId: "session-paid"
        }
      )
    ).rejects.toThrow("Szczegoly sesji wymagaja aktywnego profilu pickera.");
  });
});

function sessionDocument(overrides: Record<string, unknown> = {}) {
  return {
    id: "session-paid",
    data: {
      allowBatchQuantitySnapshot: true,
      amountDueGrosz: 7500,
      businessDate: "2026-07-29",
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
      id: "session-paid",
      legacyImport: false,
      legacySourceRows: [],
      note: "Tajna notatka administracyjna",
      paidAt: "2026-07-30T10:00:00.000Z",
      paymentId: "payment-active",
      planIdSnapshot: "plan-ubianka",
      planNameSnapshot: "Za ubianke",
      quantityPrecisionSnapshot: 1,
      rateGroszSnapshot: 1500,
      rateVersionIdSnapshot: "rate-1",
      revision: 3,
      seasonId: "season-2026",
      status: "PAID",
      totalEntryCount: 2,
      totalQuantityMilli: 5000,
      totalWeightG: 20_000,
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

function entryDocument(id: string, overrides: Record<string, unknown> = {}) {
  return {
    id,
    data: {
      amountPreviewGrosz: 1500,
      businessDate: "2026-07-29",
      cancellationReason: null,
      cancelledAtServer: null,
      cancelledBy: null,
      createdAtDevice: "2026-07-29T09:00:00.000Z",
      createdAtServer: "2026-07-29T09:00:01.000Z",
      createdBy: "operator-secret",
      createdDeviceId: "device-secret",
      id,
      pendingSync: false,
      quantityMilli: 1000,
      replacesEntryId: null,
      revision: 1,
      seasonId: "season-2026",
      sequenceNumber: 1,
      sessionId: "session-paid",
      status: "ACTIVE",
      stockWeightG: 4000,
      weightG: 4000,
      workerId: "worker-anna",
      ...overrides
    }
  };
}

function paymentDocument(overrides: Record<string, unknown> = {}) {
  return {
    id: "payment-active",
    data: {
      amountGrosz: 7500,
      cancellationReason: null,
      cancelledAt: null,
      cancelledBy: null,
      creationAttemptId: "attempt-1",
      createdAtServer: "2026-07-30T10:00:00.000Z",
      createdBy: "admin-secret",
      id: "payment-active",
      legacyImport: false,
      note: "Tajna notatka wyplaty",
      paidBusinessDate: "2026-07-30",
      paymentMethod: "BANK_TRANSFER",
      seasonId: "season-2026",
      sessionId: "session-paid",
      status: "ACTIVE",
      workerId: "worker-anna",
      workerNameSnapshot: "Anna Zbieracz",
      ...overrides
    }
  };
}
