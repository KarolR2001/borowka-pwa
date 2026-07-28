import type { PaymentEligibilityResult } from "./paymentEligibility";
import type { PendingPaymentSession } from "./pendingPayments";

export const PAYMENT_METHODS = ["CASH", "BANK_TRANSFER", "OTHER"] as const;
export const PAYMENT_NOTE_MAX_LENGTH = 200;

export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export type PaymentConfirmationDraft = {
  confirmed: boolean;
  note: string;
  paidBusinessDate: string;
  paymentMethod: PaymentMethod;
};

export type PreparedPaymentConfirmation = {
  amountGrosz: number;
  expectedSessionRevision: number;
  note: string | null;
  paidBusinessDate: string;
  paymentId: string;
  paymentMethod: PaymentMethod;
  seasonId: string;
  sessionId: string;
  workerId: string;
  workerNameSnapshot: string;
};

export function createInitialPaymentConfirmationDraft(
  today = new Date()
): PaymentConfirmationDraft {
  return {
    confirmed: false,
    note: "",
    paidBusinessDate: formatLocalBusinessDate(today),
    paymentMethod: "CASH"
  };
}

export function preparePaymentConfirmation({
  draft,
  eligibility,
  session
}: {
  draft: PaymentConfirmationDraft;
  eligibility: PaymentEligibilityResult;
  session: PendingPaymentSession;
}): PreparedPaymentConfirmation {
  if (
    eligibility.status !== "ELIGIBLE" ||
    eligibility.blockers.length > 0 ||
    eligibility.sessionRevision === null ||
    eligibility.amountDueGrosz === null
  ) {
    throw new Error("Formularz wyplaty wymaga aktualnego wyniku ELIGIBLE.");
  }

  if (
    eligibility.sessionId !== session.sessionId ||
    eligibility.paymentId !== session.sessionId
  ) {
    throw new Error("Wynik kontroli dotyczy innej sesji.");
  }

  if (eligibility.amountDueGrosz !== session.amountDueGrosz) {
    throw new Error("Kwota listy zmienila sie po kontroli kwalifikacji.");
  }

  if (!isBusinessDate(draft.paidBusinessDate)) {
    throw new Error("Podaj prawidlowa date biznesowa wyplaty.");
  }

  if (!PAYMENT_METHODS.includes(draft.paymentMethod)) {
    throw new Error("Wybierz prawidlowa metode wyplaty.");
  }

  const note = draft.note.trim();

  if (note.length > PAYMENT_NOTE_MAX_LENGTH) {
    throw new Error(
      `Notatka moze miec maksymalnie ${String(PAYMENT_NOTE_MAX_LENGTH)} znakow.`
    );
  }

  if (!draft.confirmed) {
    throw new Error("Potwierdz wyplate calej sesji.");
  }

  return {
    amountGrosz: eligibility.amountDueGrosz,
    expectedSessionRevision: eligibility.sessionRevision,
    note: note || null,
    paidBusinessDate: draft.paidBusinessDate,
    paymentId: eligibility.paymentId,
    paymentMethod: draft.paymentMethod,
    seasonId: session.seasonId,
    sessionId: session.sessionId,
    workerId: session.workerId,
    workerNameSnapshot: session.workerName
  };
}

function isBusinessDate(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);

  if (!match) {
    return false;
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));

  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

function formatLocalBusinessDate(date: Date): string {
  if (Number.isNaN(date.getTime())) {
    throw new Error("Formularz wyplaty wymaga prawidlowej daty.");
  }

  return [
    String(date.getFullYear()).padStart(4, "0"),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0")
  ].join("-");
}
