import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import type { AuthSessionState } from "../auth/authSession";
import {
  PickerSessionDetailsPanel,
  type PickerSessionDetailsApi
} from "./PickerSessionDetailsPanel";

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

describe("PickerSessionDetailsPanel", () => {
  it("shows entries, correction, cancellation and payment without private metadata", async () => {
    const user = userEvent.setup();
    const onReportIssue = vi.fn();
    const load = vi.fn<PickerSessionDetailsApi["load"]>().mockResolvedValue({
      activeEntryCount: 2,
      amountDueGrosz: 7500,
      businessDate: "2026-07-29",
      calculationBasis: "QUANTITY",
      dataSource: "CACHE",
      entries: [
        {
          cancellationReason: "Bledna waga",
          id: "entry-1",
          kind: "ORIGINAL",
          quantityMilli: 1000,
          replacesEntryId: null,
          sequenceNumber: 1,
          status: "CANCELLED",
          weightG: 4000
        },
        {
          cancellationReason: null,
          id: "entry-2",
          kind: "CORRECTION",
          quantityMilli: 1500,
          replacesEntryId: "entry-1",
          sequenceNumber: 2,
          status: "ACTIVE",
          weightG: 6000
        }
      ],
      invalidEntryCount: 0,
      invalidPayment: false,
      payment: {
        amountGrosz: 7500,
        paidBusinessDate: "2026-07-30",
        paymentMethod: "BANK_TRANSFER",
        status: "ACTIVE"
      },
      planName: "Za ubianke",
      quantityPrecision: 1,
      rateGrosz: 1500,
      seasonId: "season-2026",
      sessionId: "session-paid",
      status: "PAID",
      totalQuantityMilli: 5000,
      totalWeightG: 20_000,
      unitLabel: "ubianka",
      unitLabelPlural: "ubianki"
    });

    render(
      <PickerSessionDetailsPanel
        authState={pickerState}
        detailsApi={{ load }}
        env={{}}
        isOnline={false}
        onClose={() => undefined}
        onReportIssue={onReportIssue}
        sessionId="session-paid"
      />
    );

    expect(
      await screen.findByRole("heading", { name: "Sesja z 29.07.2026" })
    ).toBeInTheDocument();
    expect(screen.getByText("Korekta wpisu entry-1")).toBeInTheDocument();
    expect(screen.getByText("Aktywny")).toBeInTheDocument();
    expect(screen.getByText("Powod: Bledna waga")).toBeInTheDocument();
    expect(screen.getByText("Przelew bankowy")).toBeInTheDocument();
    expect(screen.getByText("Szczegoly z pamieci offline")).toBeInTheDocument();
    expect(screen.queryByText(/operator|administrator/i)).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Zglos niezgodnosc" }));
    expect(onReportIssue).toHaveBeenCalledWith("session-paid");
  });

  it("shows a neutral error without leaking a foreign session", async () => {
    render(
      <PickerSessionDetailsPanel
        authState={pickerState}
        detailsApi={{ load: vi.fn().mockRejectedValue(new Error("foreign worker")) }}
        env={{}}
        isOnline
        onClose={() => undefined}
        onReportIssue={() => undefined}
        sessionId="session-foreign"
      />
    );

    expect(
      await screen.findByText("Nie udalo sie pobrac szczegolow tej sesji.")
    ).toBeInTheDocument();
    expect(screen.queryByText("foreign worker")).not.toBeInTheDocument();
  });
});
