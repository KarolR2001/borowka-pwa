import type { UserProfile } from "../domain/identity";
import type { HarvestSessionDocument } from "../harvest/openHarvestSession";
import {
  createPaymentCancellationAuditId,
  preparePaymentCancellation
} from "./paymentCancellation";
import type { PaymentDocument } from "./paymentWrite";

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

describe("payment cancellation", () => {
  it("cancels the payment, restores CLOSED session and creates an audit", () => {
    const prepared = preparePaymentCancellation(cancellationInput());

    expect(prepared.paymentUpdate).toEqual({
      cancellationReason: "Bledna metoda wyplaty",
      cancelledAt: "server-time",
      cancelledBy: "admin-1",
      status: "CANCELLED"
    });
    expect(prepared.sessionUpdate).toEqual({
      paidAt: null,
      paymentId: null,
      revision: 5,
      status: "CLOSED",
      updatedAtServer: "server-time"
    });
    expect(prepared.auditEvent).toMatchObject({
      action: "PAYMENT_CANCELLED",
      entityId: "session-1--payment-r4",
      entityType: "PAYMENT",
      reason: "Bledna metoda wyplaty",
      beforeSummary: { status: "ACTIVE" },
      afterSummary: { status: "CANCELLED" }
    });
  });

  it("requires confirmation, reason, online mode and active admin", () => {
    expect(() =>
      preparePaymentCancellation(cancellationInput({ confirmed: false }))
    ).toThrow("Potwierdz skutki");
    expect(() => preparePaymentCancellation(cancellationInput({ reason: "x" }))).toThrow(
      "Powod anulowania"
    );
    expect(() =>
      preparePaymentCancellation(cancellationInput({ isOnline: false }))
    ).toThrow("aktywnego polaczenia");
    expect(() =>
      preparePaymentCancellation({
        ...cancellationInput(),
        actorProfile: { ...adminProfile, role: "OPERATOR" }
      })
    ).toThrow("aktywny administrator");
  });

  it("rejects a stale revision and a newer payment link", () => {
    expect(() =>
      preparePaymentCancellation(cancellationInput({ expectedSessionRevision: 3 }))
    ).toThrow("nowsze operacje");
    expect(() =>
      preparePaymentCancellation({
        ...cancellationInput(),
        session: {
          ...paidSession(),
          paymentId: "session-1--payment-r5",
          revision: 5
        },
        expectedSessionRevision: 5
      })
    ).toThrow("nie jest juz aktywnym rozliczeniem");
  });

  it("uses a stable audit id for one payment", () => {
    expect(createPaymentCancellationAuditId(" payment-r4 ")).toBe(
      "payment-cancelled-payment-r4"
    );
  });
});

function cancellationInput(
  overrides: Partial<Parameters<typeof preparePaymentCancellation>[0]> = {}
): Parameters<typeof preparePaymentCancellation>[0] {
  return {
    actorProfile: adminProfile,
    auditId: "payment-cancelled-session-1--payment-r4",
    cancelledAt: "server-time",
    confirmed: true,
    createdAtDevice: "device-time",
    createdAtServer: "server-time",
    deviceId: "device-admin",
    expectedSessionRevision: 4,
    isOnline: true,
    payment: activePayment(),
    paymentId: "session-1--payment-r4",
    reason: " Bledna metoda wyplaty ",
    session: paidSession(),
    updatedAtServer: "server-time",
    ...overrides
  };
}

function activePayment(): PaymentDocument {
  return {
    amountGrosz: 12_500,
    cancellationReason: null,
    cancelledAt: null,
    cancelledBy: null,
    creationAttemptId: "attempt-r4",
    createdAtServer: "paid-time",
    createdBy: "admin-2",
    id: "session-1--payment-r4",
    legacyImport: false,
    note: null,
    paidBusinessDate: "2026-07-28",
    paymentMethod: "CASH",
    seasonId: "season-1",
    sessionId: "session-1",
    status: "ACTIVE",
    workerId: "worker-1",
    workerNameSnapshot: "Anna"
  };
}

function paidSession(): HarvestSessionDocument {
  return {
    allowBatchQuantitySnapshot: true,
    amountDueGrosz: 12_500,
    businessDate: "2026-07-20",
    calculationBasisSnapshot: "WEIGHT",
    calculationVersion: "1",
    cancellationReason: null,
    cancelledAt: null,
    cancelledBy: null,
    closedAtDevice: "closed-device-time",
    closedAtServer: "closed-server-time",
    closedBy: "operator-1",
    createdAtDevice: "created-device-time",
    createdAtServer: "created-server-time",
    createdBy: "operator-1",
    createdDeviceId: "device-operator",
    id: "session-1",
    legacyImport: false,
    legacySourceRows: [],
    note: null,
    paidAt: "paid-time",
    paymentId: "session-1--payment-r4",
    planIdSnapshot: "plan-1",
    planNameSnapshot: "Za kilogram",
    quantityPrecisionSnapshot: 3,
    rateGroszSnapshot: 1000,
    rateVersionIdSnapshot: "rate-1",
    revision: 4,
    seasonId: "season-1",
    status: "PAID",
    totalEntryCount: 4,
    totalQuantityMilli: 4000,
    totalWeightG: 12_500,
    unitLabelPluralSnapshot: "kilogramy",
    unitLabelSnapshot: "kilogram",
    updatedAtServer: "paid-time",
    weightRequiredSnapshot: true,
    workerId: "worker-1",
    workerNameSnapshot: "Anna"
  };
}
