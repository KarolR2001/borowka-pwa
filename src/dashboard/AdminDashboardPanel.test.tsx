import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import type { AuthSessionState } from "../auth/authSession";
import { AdminDashboardPanel, type AdminDashboardApi } from "./AdminDashboardPanel";
import type { AdminDashboardResult } from "./adminDashboard";

type ReadyAuthState = Extract<AuthSessionState, { status: "READY" }>;

const adminState: ReadyAuthState = {
  access: { role: "ADMIN", status: "READY" },
  message: "Gotowe.",
  profile: {
    active: true,
    displayName: "Admin",
    email: "admin@example.test",
    offlineConsent: false,
    registrationStatus: "APPROVED",
    role: "ADMIN",
    uid: "admin-1",
    workerId: null
  },
  status: "READY",
  user: {
    displayName: "Admin",
    email: "admin@example.test",
    uid: "admin-1"
  }
};

describe("AdminDashboardPanel", () => {
  it("shows the default season, exact result label, warnings and season switch", async () => {
    const user = userEvent.setup();
    const api = dashboardApi();

    render(
      <AdminDashboardPanel
        api={api}
        authState={adminState}
        env={{}}
        isOnline={true}
        syncDocuments={[{ id: "pending-1", kind: "HARVEST_ENTRY", pendingSync: true }]}
      />
    );

    expect(await screen.findByText("Pulpit administratora")).toBeVisible();
    expect(screen.getByText("15,000 kg")).toBeVisible();
    expect(screen.getByText("Wynik po koszcie zbioru")).toBeVisible();
    expect(
      screen.getByText("Przychod minus naliczenia zbieraczy; bez innych kosztow.")
    ).toBeVisible();
    expect(screen.queryByText("Zysk")).not.toBeInTheDocument();
    expect(
      screen.getByText("Stan dostepnych kilogramow jest ujemny i wymaga korekty.")
    ).toBeVisible();
    expect(within(dashboardMetric("Lokalnie oczekujace")).getByText("1")).toBeVisible();

    await user.selectOptions(screen.getByLabelText("Sezon"), "season-2");
    expect(
      within(dashboardMetric("Zebrano potwierdzone")).getByText("8,000 kg")
    ).toBeVisible();
    expect(
      screen.getByText(
        "Inne urzadzenia pracujace calkowicie offline moga miec sesje, ktorych chmura jeszcze nie zna."
      )
    ).toBeVisible();
    await user.selectOptions(screen.getByLabelText("Okres"), "CURRENT_WEEK");
    await waitFor(() => {
      expect(api.load).toHaveBeenLastCalledWith(
        {},
        expect.objectContaining({
          periodSelection: {
            customFromDate: "",
            customToDate: "",
            preset: "CURRENT_WEEK"
          }
        })
      );
    });
    expect(api.load).toHaveBeenCalledWith(
      {},
      expect.objectContaining({
        actorProfile: adminState.profile,
        isOnline: true,
        periodSelection: {
          customFromDate: "",
          customToDate: "",
          preset: "SEASON"
        },
        syncDocuments: [{ id: "pending-1", kind: "HARVEST_ENTRY", pendingSync: true }]
      })
    );
  });

  it("does not load financial metrics for an operator", async () => {
    const api = dashboardApi();
    const operatorState: ReadyAuthState = {
      ...adminState,
      access: { role: "OPERATOR", status: "READY" },
      profile: { ...adminState.profile, role: "OPERATOR" }
    };

    render(
      <AdminDashboardPanel
        api={api}
        authState={operatorState}
        env={{}}
        isOnline={true}
        syncDocuments={[]}
      />
    );

    expect(
      screen.getByText("Metryki finansowe sa dostepne tylko dla administratora.")
    ).toBeVisible();
    await waitFor(() => {
      expect(api.load).not.toHaveBeenCalled();
    });
  });
});

function dashboardApi(): AdminDashboardApi {
  return {
    load: vi.fn<AdminDashboardApi["load"]>().mockResolvedValue(dashboardResult())
  };
}

function dashboardMetric(label: string): HTMLElement {
  const metric = screen.getByText(label).closest<HTMLElement>(".admin-dashboard__metric");

  if (!metric) {
    throw new Error(`Nie znaleziono metryki pulpitu: ${label}.`);
  }

  return metric;
}

function dashboardResult(): AdminDashboardResult {
  return {
    invalidDocumentCounts: {
      payments: 0,
      sales: 0,
      seasons: 0,
      sessions: 0,
      workers: 0
    },
    localSyncSummary: {
      actionableErrorCount: 0,
      documents: [],
      lastSuccessfulSyncIso: null,
      localSavedCount: 0,
      pendingSyncCount: 1,
      rejectedCount: 0,
      remoteChangedCount: 0,
      syncedCount: 0,
      totalDocumentCount: 1
    },
    refreshedAtIso: "2026-07-29T08:00:00.000Z",
    seasons: [
      seasonSummary({
        id: "season-1",
        isDefault: true,
        metrics: {
          availableWeightG: -1000,
          confirmedHarvestWeightG: 15_000
        },
        name: "Sezon 2026",
        warnings: ["Stan dostepnych kilogramow jest ujemny i wymaga korekty."]
      }),
      seasonSummary({
        id: "season-2",
        isDefault: false,
        metrics: {
          availableWeightG: 8000,
          confirmedHarvestWeightG: 8000
        },
        name: "Sezon 2025",
        status: "CLOSED",
        warnings: []
      })
    ]
  };
}

function seasonSummary(
  overrides: Omit<Partial<AdminDashboardResult["seasons"][number]>, "metrics"> & {
    id: string;
    metrics?: Partial<AdminDashboardResult["seasons"][number]["metrics"]>;
    name: string;
  }
): AdminDashboardResult["seasons"][number] {
  const {
    id,
    metrics,
    name,
    period = {
      dateBasis: "BUSINESS_DATE" as const,
      fromDate: "2026-07-01",
      label: "Caly sezon: 01.07.2026 - 30.09.2026",
      preset: "SEASON" as const,
      toDate: "2026-09-30"
    },
    ...seasonOverrides
  } = overrides;

  return {
    endDate: "2026-09-30",
    id,
    isDefault: false,
    metrics: {
      accruedGrosz: 10_000,
      activeWorkerCount: 2,
      availableWeightG: 5000,
      confirmedHarvestWeightG: 10_000,
      dueGrosz: 5000,
      inProgressHarvestWeightG: 1000,
      openSessionCount: 1,
      paidGrosz: 5000,
      resultAfterHarvestCostGrosz: -2500,
      reviewRequiredSessionCount: 1,
      revenueGrosz: 7500,
      soldWeightG: 5000,
      ...metrics
    },
    name,
    period,
    startDate: "2026-07-01",
    status: "OPEN",
    warnings: [],
    ...seasonOverrides
  };
}
