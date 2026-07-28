import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import type { AuthSessionState } from "../auth/authSession";
import {
  PickerPaymentListPanel,
  type PickerPaymentListApi
} from "./PickerPaymentListPanel";
import type { PickerSessionDetailsApi } from "./PickerSessionDetailsPanel";
import type { PickerPaymentListResult } from "./pickerPaymentList";

const pickerState: AuthSessionState = {
  access: { role: "PICKER", status: "READY" },
  message: "Profil aktywny.",
  profile: {
    active: true,
    displayName: "Anna Konto",
    email: "anna@example.test",
    offlineConsent: true,
    registrationStatus: "APPROVED",
    role: "PICKER",
    uid: "picker-anna",
    workerId: "worker-anna"
  },
  status: "READY",
  user: { displayName: "Anna", email: "anna@example.test", uid: "picker-anna" }
};

describe("PickerPaymentListPanel", () => {
  it("shows period totals, cancelled history and opens the source session", async () => {
    const user = userEvent.setup();
    const load = vi
      .fn<PickerPaymentListApi["load"]>()
      .mockResolvedValue(paymentListResult());
    const detailsLoad = vi
      .fn<PickerSessionDetailsApi["load"]>()
      .mockResolvedValue(sessionDetailsResult());

    render(
      <PickerPaymentListPanel
        authState={pickerState}
        env={{}}
        isOnline={false}
        pickerPaymentListApi={{ load }}
        pickerSessionDetailsApi={{ load: detailsLoad }}
      />
    );

    expect(await screen.findByText("125,00 zł")).toBeInTheDocument();
    expect(screen.getAllByText("50,00 zł")).toHaveLength(2);
    expect(screen.getAllByText("75,00 zł")).toHaveLength(3);
    expect(screen.getByText("Wyplacono (1)")).toBeInTheDocument();
    expect(screen.getByText("Anulowane poza suma (1)")).toBeInTheDocument();
    expect(
      screen.getByText("Wyplaty z pamieci offline moga nie byc aktualne")
    ).toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText("Status"), "CANCELLED");

    expect(within(screen.getByRole("table")).getByText("Anulowana")).toBeInTheDocument();
    expect(screen.queryByText("Przelew bankowy")).not.toBeInTheDocument();

    await user.click(
      screen.getByRole("button", { name: "Otworz sesje wyplaty z 30.07.2026" })
    );

    expect(
      await screen.findByRole("heading", { name: "Sesja z 27.07.2026" })
    ).toBeInTheDocument();
    expect(detailsLoad).toHaveBeenCalledWith(
      {},
      expect.objectContaining({
        actorProfile: pickerState.profile,
        isOnline: false,
        sessionId: "session-closed"
      })
    );

    await user.click(screen.getByRole("button", { name: "Zglos niezgodnosc" }));
    expect(
      screen.getByText("Sesja zostala wybrana do zgloszenia niezgodnosci.")
    ).toBeInTheDocument();
  });

  it("does not load payment data for another role", () => {
    const load = vi.fn<PickerPaymentListApi["load"]>();

    render(
      <PickerPaymentListPanel
        authState={{
          ...pickerState,
          access: { role: "OPERATOR", status: "READY" },
          profile: { ...pickerState.profile, role: "OPERATOR", workerId: null }
        }}
        env={{}}
        isOnline
        pickerPaymentListApi={{ load }}
      />
    );

    expect(
      screen.getByText("Lista wymaga aktywnego konta zbieracza powiazanego z workerId.")
    ).toBeInTheDocument();
    expect(load).not.toHaveBeenCalled();
  });
});

function paymentListResult(): PickerPaymentListResult {
  return {
    dataSource: "CACHE",
    invalidPaymentCount: 0,
    invalidSeasonCount: 0,
    invalidSessionCount: 0,
    missingSourceSessionCount: 0,
    payments: [
      {
        amountGrosz: 7500,
        id: "payment-cancelled",
        paidBusinessDate: "2026-07-30",
        paymentMethod: "CASH",
        seasonId: "season-2026",
        seasonName: "Sezon 2026",
        sessionBusinessDate: "2026-07-27",
        sessionId: "session-closed",
        status: "CANCELLED"
      },
      {
        amountGrosz: 5000,
        id: "payment-active",
        paidBusinessDate: "2026-07-29",
        paymentMethod: "BANK_TRANSFER",
        seasonId: "season-2026",
        seasonName: "Sezon 2026",
        sessionBusinessDate: "2026-07-28",
        sessionId: "session-paid",
        status: "ACTIVE"
      }
    ],
    refreshedAtIso: "2026-07-30T10:00:00.000Z",
    seasons: [{ id: "season-2026", name: "Sezon 2026" }],
    sessions: [
      {
        amountDueGrosz: 5000,
        businessDate: "2026-07-28",
        seasonId: "season-2026",
        sessionId: "session-paid",
        status: "PAID"
      },
      {
        amountDueGrosz: 7500,
        businessDate: "2026-07-27",
        seasonId: "season-2026",
        sessionId: "session-closed",
        status: "CLOSED"
      }
    ]
  };
}

function sessionDetailsResult() {
  return {
    activeEntryCount: 1,
    amountDueGrosz: 7500,
    businessDate: "2026-07-27",
    calculationBasis: "QUANTITY" as const,
    dataSource: "CACHE" as const,
    entries: [],
    invalidEntryCount: 0,
    invalidPayment: false,
    payment: null,
    planName: "Za ubianke",
    quantityPrecision: 1,
    rateGrosz: 1500,
    seasonId: "season-2026",
    sessionId: "session-closed",
    status: "CLOSED" as const,
    totalQuantityMilli: 5000,
    totalWeightG: 20_000,
    unitLabel: "ubianka",
    unitLabelPlural: "ubianki"
  };
}
