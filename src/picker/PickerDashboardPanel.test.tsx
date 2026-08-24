import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import type { AuthSessionState } from "../auth/authSession";
import { PickerDashboardPanel, type PickerDashboardApi } from "./PickerDashboardPanel";
import type { PickerDashboardResult } from "./pickerDashboard";

const pickerState: AuthSessionState = {
  access: {
    role: "PICKER",
    status: "READY"
  },
  message: "Profil aplikacji jest aktywny.",
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
  user: {
    displayName: "Anna Konto",
    email: "anna@example.test",
    uid: "picker-anna"
  }
};

describe("PickerDashboardPanel", () => {
  it("shows private totals, source state and separate quantity plans", async () => {
    const load = vi.fn<PickerDashboardApi["load"]>().mockResolvedValue(
      dashboardResult({
        dataSource: "CACHE"
      })
    );

    render(
      <PickerDashboardPanel
        authState={pickerState}
        env={{}}
        isOnline={false}
        pickerDashboardApi={{ load }}
      />
    );

    expect(await screen.findByText("19,500 kg")).toBeInTheDocument();
    expect(screen.getByText(/^67,50 /)).toBeInTheDocument();
    expect(screen.queryByText(/offline/i)).not.toBeInTheDocument();
    expect(screen.getByText("4,5 ubianki")).toBeInTheDocument();
    expect(screen.getByText("Anna Konto / Anna Zbieracz")).toBeInTheDocument();
    expect(screen.getByText("Naliczono")).toBeInTheDocument();
    expect(screen.getByText("Wypłacono")).toBeInTheDocument();
    expect(screen.queryByText("Dostępne")).not.toBeInTheDocument();
    expect(screen.queryByText("Sprzedano")).not.toBeInTheDocument();
    expect(screen.queryByText("Przychód")).not.toBeInTheDocument();
    expect(screen.queryByText("Wynik po koszcie zbioru")).not.toBeInTheDocument();
    expect(load).toHaveBeenCalledWith(
      {},
      expect.objectContaining({
        actorProfile: pickerState.profile,
        isOnline: false,
        periodSelection: {
          customFromDate: "",
          customToDate: "",
          preset: "SEASON"
        },
        selectedSeasonId: null
      })
    );
  });

  it("reloads for the selected date range without a manual refresh control", async () => {
    const user = userEvent.setup();
    const load = vi.fn<PickerDashboardApi["load"]>().mockResolvedValue(dashboardResult());

    render(
      <PickerDashboardPanel
        authState={pickerState}
        env={{}}
        isOnline
        pickerDashboardApi={{ load }}
      />
    );

    await screen.findByText("19,500 kg");
    await user.selectOptions(screen.getByLabelText(/Zakres dat/), "CURRENT_WEEK");

    await waitFor(() => {
      const lastCall = load.mock.calls.at(-1);
      if (!lastCall) {
        throw new Error("Brak ponownego wywołania pulpitu pickera.");
      }
      const input = lastCall[1];
      if (!input) {
        throw new Error("Brak parametrów ponownego wywołania pulpitu pickera.");
      }
      expect(input.periodSelection?.preset).toBe("CURRENT_WEEK");
    });

    expect(
      screen.queryByRole("button", { name: "Odśwież pulpit zbieracza" })
    ).not.toBeInTheDocument();
    expect(load).toHaveBeenCalledTimes(2);
  });

  it("does not load data for an administrator", () => {
    const load = vi.fn<PickerDashboardApi["load"]>();

    render(
      <PickerDashboardPanel
        authState={{
          ...pickerState,
          access: { role: "ADMIN", status: "READY" },
          profile: {
            ...pickerState.profile,
            role: "ADMIN",
            workerId: null
          }
        }}
        env={{}}
        isOnline
        pickerDashboardApi={{ load }}
      />
    );

    expect(
      screen.getByText("Widok wymaga aktywnego konta powiązanego ze zbieraczem.")
    ).toBeInTheDocument();
    expect(load).not.toHaveBeenCalled();
  });
});

function dashboardResult(
  overrides: Partial<PickerDashboardResult> = {}
): PickerDashboardResult {
  return {
    accruedAmountGrosz: 6750,
    dataSource: "SERVER",
    invalidPaymentCount: 0,
    invalidSeasonCount: 0,
    invalidSessionCount: 0,
    invalidWorker: false,
    paidAmountGrosz: 2250,
    period: {
      dateBasis: "BUSINESS_DATE",
      fromDate: "2026-07-01",
      label: "Cały sezon: 01.07.2026 - 30.09.2026",
      preset: "SEASON",
      toDate: "2026-09-30"
    },
    quantities: [
      {
        planId: "plan-ubianka",
        planName: "Za ubianke",
        quantityPrecision: 1,
        sessionCount: 2,
        totalQuantityMilli: 4500,
        unitLabelPlural: "ubianki"
      }
    ],
    refreshedAtIso: "2026-07-28T18:30:00.000Z",
    remainingAmountGrosz: 4500,
    selectedSeasonId: "season-2026",
    selectedSeasonName: "Sezon 2026",
    seasons: [
      {
        endDate: "2026-09-30",
        id: "season-2026",
        isDefault: true,
        name: "Sezon 2026",
        startDate: "2026-07-01",
        status: "OPEN"
      },
      {
        endDate: "2025-09-30",
        id: "season-2025",
        isDefault: false,
        name: "Sezon 2025",
        startDate: "2025-07-01",
        status: "CLOSED"
      }
    ],
    sessionCounts: {
      closed: 1,
      open: 1,
      paid: 1
    },
    totalWeightG: 19_500,
    userName: "Anna Konto",
    workerId: "worker-anna",
    workerName: "Anna Zbieracz",
    ...overrides
  };
}
