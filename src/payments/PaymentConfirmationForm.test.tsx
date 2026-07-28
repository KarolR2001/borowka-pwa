import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import type { PaymentEligibilityResult } from "./paymentEligibility";
import { PaymentConfirmationForm } from "./PaymentConfirmationForm";
import type { PendingPaymentSession } from "./pendingPayments";
import type { PaymentWriteResult } from "./paymentWrite";

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

const confirmedResult: PaymentWriteResult = {
  auditId: "payment-created-session-1",
  confirmationSource: "SERVER_READ_AFTER_COMMIT",
  message: "Firestore potwierdzil wyplate dla Anna.",
  payment: {
    amountGrosz: 12_500,
    cancellationReason: null,
    cancelledAt: null,
    cancelledBy: null,
    createdAtServer: "server-time",
    createdBy: "admin-1",
    id: "session-1",
    legacyImport: false,
    note: "Rozliczenie tygodnia",
    paidBusinessDate: "2026-07-28",
    paymentMethod: "BANK_TRANSFER",
    seasonId: "season-1",
    sessionId: "session-1",
    status: "ACTIVE",
    workerId: "worker-1",
    workerNameSnapshot: "Anna"
  },
  sessionRevision: 4,
  status: "CONFIRMED"
};

describe("PaymentConfirmationForm", () => {
  it("shows immutable data and confirms the server-accepted payment", async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn().mockResolvedValue(confirmedResult);
    const onConfirmed = vi.fn();

    render(
      <PaymentConfirmationForm
        eligibility={eligibility}
        onCancel={vi.fn()}
        onConfirm={onConfirm}
        onConfirmed={onConfirmed}
        session={session}
      />
    );

    expect(screen.getByText("20.07.2026 / session-1")).toBeVisible();
    expect(screen.getByText("Za kilogram, 10,00 zł / kilogramy")).toBeVisible();
    expect(screen.getByText("125,00 zł")).toBeVisible();
    expect(screen.queryByRole("textbox", { name: /kwota/i })).not.toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText("Metoda"), "BANK_TRANSFER");
    await user.type(screen.getByLabelText("Notatka"), "Rozliczenie tygodnia");
    await user.click(
      screen.getByLabelText("Potwierdzam wyplate calej naleznosci za te sesje")
    );
    await user.click(screen.getByRole("button", { name: "Zapisz wyplate" }));

    expect(
      await screen.findByText("Firestore potwierdzil wyplate dla Anna.")
    ).toBeVisible();
    expect(onConfirm).toHaveBeenCalledWith(
      expect.objectContaining({
        amountGrosz: 12_500,
        expectedSessionRevision: 3,
        note: "Rozliczenie tygodnia",
        paymentMethod: "BANK_TRANSFER",
        sessionId: "session-1"
      })
    );
    expect(onConfirmed).toHaveBeenCalledWith(confirmedResult);
    expect(screen.getByRole("button", { name: "Zapisz wyplate" })).toBeDisabled();
  });

  it("requires explicit confirmation and supports cancel", async () => {
    const user = userEvent.setup();
    const onCancel = vi.fn();

    render(
      <PaymentConfirmationForm
        eligibility={eligibility}
        onCancel={onCancel}
        onConfirm={vi.fn().mockResolvedValue(confirmedResult)}
        session={session}
      />
    );

    await user.click(screen.getByRole("button", { name: "Zapisz wyplate" }));
    expect(await screen.findByText("Potwierdz wyplate calej sesji.")).toBeVisible();

    await user.click(screen.getByRole("button", { name: "Anuluj" }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it("does not show success when Firestore cannot confirm the transaction", async () => {
    const user = userEvent.setup();

    render(
      <PaymentConfirmationForm
        eligibility={eligibility}
        onCancel={vi.fn()}
        onConfirm={vi
          .fn()
          .mockRejectedValue(
            new Error(
              "Nie mozna potwierdzic wyniku wyplaty. Po odzyskaniu polaczenia odswiez liste przed ponowieniem."
            )
          )}
        session={session}
      />
    );

    await user.click(
      screen.getByLabelText("Potwierdzam wyplate calej naleznosci za te sesje")
    );
    await user.click(screen.getByRole("button", { name: "Zapisz wyplate" }));

    expect(await screen.findByText(/Nie mozna potwierdzic wyniku wyplaty/)).toBeVisible();
    expect(
      screen.queryByText("Firestore potwierdzil wyplate dla Anna.")
    ).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Zapisz wyplate" })).toBeEnabled();
  });
});
