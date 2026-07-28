import type { PaymentEligibilityResult } from "./paymentEligibility";
import {
  createInitialPaymentConfirmationDraft,
  preparePaymentConfirmation
} from "./paymentConfirmation";
import type { PendingPaymentSession } from "./pendingPayments";

const session: PendingPaymentSession = {
  amountDueGrosz: 12_500,
  businessDate: "2026-07-20",
  calculationBasis: "WEIGHT",
  closedAt: null,
  closedBy: "operator-1",
  paymentHistory: "NONE",
  planId: "plan-1",
  planName: "Za kilogram",
  rateGrosz: 1000,
  seasonId: "season-1",
  seasonName: "Sezon 2026",
  sessionId: "session-1",
  syncStatus: "SYNCED",
  totalEntryCount: 4,
  totalQuantityMilli: 4000,
  totalWeightG: 12_500,
  unitLabel: "kilogramy",
  workerId: "worker-1",
  workerName: "Anna"
};

const eligibility: PaymentEligibilityResult = {
  amountDueGrosz: 12_500,
  blockers: [],
  checkedAtIso: "2026-07-28T12:00:00.000Z",
  paymentId: "session-1",
  sessionId: "session-1",
  sessionRevision: 3,
  status: "ELIGIBLE"
};

describe("payment confirmation", () => {
  it("prepares immutable payment data from an eligible session", () => {
    expect(
      preparePaymentConfirmation({
        draft: {
          confirmed: true,
          note: "  wyplata przy wadze  ",
          paidBusinessDate: "2026-07-28",
          paymentMethod: "CASH"
        },
        eligibility,
        session
      })
    ).toEqual({
      amountGrosz: 12_500,
      expectedSessionRevision: 3,
      note: "wyplata przy wadze",
      paidBusinessDate: "2026-07-28",
      paymentId: "session-1",
      paymentMethod: "CASH",
      seasonId: "season-1",
      sessionId: "session-1",
      workerId: "worker-1",
      workerNameSnapshot: "Anna"
    });
  });

  it("requires eligibility, matching immutable amount and confirmation", () => {
    expect(() =>
      preparePaymentConfirmation({
        draft: {
          ...createInitialPaymentConfirmationDraft(new Date("2026-07-28T12:00:00.000Z")),
          confirmed: true
        },
        eligibility: { ...eligibility, status: "BLOCKED" },
        session
      })
    ).toThrow("Formularz wyplaty wymaga aktualnego wyniku ELIGIBLE.");

    expect(() =>
      preparePaymentConfirmation({
        draft: {
          ...createInitialPaymentConfirmationDraft(),
          confirmed: true
        },
        eligibility: { ...eligibility, amountDueGrosz: 999 },
        session
      })
    ).toThrow("Kwota listy zmienila sie po kontroli kwalifikacji.");

    expect(() =>
      preparePaymentConfirmation({
        draft: createInitialPaymentConfirmationDraft(),
        eligibility,
        session
      })
    ).toThrow("Potwierdz wyplate calej sesji.");
  });

  it("validates payment date, method and note length", () => {
    expect(() =>
      preparePaymentConfirmation({
        draft: {
          confirmed: true,
          note: "",
          paidBusinessDate: "2026-02-30",
          paymentMethod: "CASH"
        },
        eligibility,
        session
      })
    ).toThrow("Podaj prawidlowa date biznesowa wyplaty.");

    expect(() =>
      preparePaymentConfirmation({
        draft: {
          confirmed: true,
          note: "x".repeat(201),
          paidBusinessDate: "2026-07-28",
          paymentMethod: "OTHER"
        },
        eligibility,
        session
      })
    ).toThrow("Notatka moze miec maksymalnie 200 znakow.");
  });
});
