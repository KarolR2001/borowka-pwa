import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import type { PaymentEligibilityResult } from "./paymentEligibility";
import { PaymentConfirmationForm } from "./PaymentConfirmationForm";
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

describe("PaymentConfirmationForm", () => {
  it("shows immutable session data and prepares only administrator inputs", async () => {
    const user = userEvent.setup();
    const onPrepared = vi.fn();

    render(
      <PaymentConfirmationForm
        eligibility={eligibility}
        onCancel={vi.fn()}
        onPrepared={onPrepared}
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
    await user.click(screen.getByRole("button", { name: "Przygotuj wyplate" }));

    expect(await screen.findByText("Dane wyplaty sa gotowe do zapisu.")).toBeVisible();
    expect(onPrepared).toHaveBeenCalledWith(
      expect.objectContaining({
        amountGrosz: 12_500,
        expectedSessionRevision: 3,
        note: "Rozliczenie tygodnia",
        paymentMethod: "BANK_TRANSFER",
        sessionId: "session-1"
      })
    );
  });

  it("requires explicit confirmation and supports cancel", async () => {
    const user = userEvent.setup();
    const onCancel = vi.fn();

    render(
      <PaymentConfirmationForm
        eligibility={eligibility}
        onCancel={onCancel}
        session={session}
      />
    );

    await user.click(screen.getByRole("button", { name: "Przygotuj wyplate" }));
    expect(await screen.findByText("Potwierdz wyplate calej sesji.")).toBeVisible();

    await user.click(screen.getByRole("button", { name: "Anuluj" }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });
});
