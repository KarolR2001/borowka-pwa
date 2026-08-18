import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import type { AuthSessionState } from "../auth/authSession";
import {
  OperatorDashboardPanel,
  type OperatorDashboardApi
} from "./OperatorDashboardPanel";
import type { OperatorDashboardResult } from "./operatorDashboard";

type ReadyAuthState = Extract<AuthSessionState, { status: "READY" }>;

const operatorState: ReadyAuthState = {
  access: { role: "OPERATOR", status: "READY" },
  message: "Gotowe.",
  profile: {
    active: true,
    displayName: "Operator",
    email: "operator@example.test",
    offlineConsent: true,
    registrationStatus: "APPROVED",
    role: "OPERATOR",
    uid: "operator-1",
    workerId: null
  },
  status: "READY",
  user: {
    displayName: "Operator",
    email: "operator@example.test",
    uid: "operator-1"
  }
};

describe("OperatorDashboardPanel", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("shows only essential operational metrics without financial data", async () => {
    const api = dashboardApi();

    render(
      <OperatorDashboardPanel
        api={api}
        authState={operatorState}
        env={{}}
        isOnline={true}
        syncDocuments={[{ id: "pending-1", kind: "HARVEST_ENTRY", pendingSync: true }]}
      />
    );

    expect((await screen.findAllByText("12,500 kg")).length).toBeGreaterThan(0);
    expect(within(metric("Aktywny sezon")).getByText("Sezon 2026")).toBeVisible();
    expect(within(metric("Zebrano dzisiaj")).getByText("12,500 kg")).toBeVisible();
    expect(within(metric("Dostępne kilogramy")).getByText("12,500 kg")).toBeVisible();
    expect(screen.queryByText("Zbieracz A")).not.toBeInTheDocument();
    expect(screen.queryByText("Otwarte sesje")).not.toBeInTheDocument();
    expect(screen.queryByText("Moje otwarte")).not.toBeInTheDocument();
    expect(screen.queryByText("Moje zamknięte dziś")).not.toBeInTheDocument();
    expect(screen.queryByText("Lokalnie oczekujące")).not.toBeInTheDocument();
    expect(screen.queryByText(/moje konflikty/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/przychod/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/wyplat/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/stawka.*zl/i)).not.toBeInTheDocument();
    expect(screen.queryByText("Naliczone zbieraczom")).not.toBeInTheDocument();
    expect(screen.queryByText("Wynik po koszcie zbioru")).not.toBeInTheDocument();
    expect(screen.queryByText("Sprzedano")).not.toBeInTheDocument();
    expect(api.load).toHaveBeenCalledWith(
      {},
      expect.objectContaining({
        actorProfile: operatorState.profile,
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

  it("moves to the new harvest form without a manual refresh control", async () => {
    const user = userEvent.setup();
    const api = dashboardApi();
    const target = document.createElement("div");
    const input = document.createElement("input");
    target.scrollIntoView = vi.fn();
    target.id = "new-harvest-session";
    target.append(input);
    document.body.append(target);

    render(
      <OperatorDashboardPanel
        api={api}
        authState={operatorState}
        env={{}}
        isOnline={true}
        syncDocuments={[]}
      />
    );

    await screen.findAllByText("12,500 kg");
    await user.click(screen.getByRole("button", { name: "Nowy zbiór" }));
    expect(input).toHaveFocus();

    expect(
      screen.queryByRole("button", { name: "Odśwież pulpit operatora" })
    ).not.toBeInTheDocument();
    expect(api.load).toHaveBeenCalledTimes(1);
    target.remove();
  });

  it("shows daily harvest totals for each picker when one day is selected", async () => {
    const api = dashboardApi({
      dailyWorkerHarvest: {
        businessDate: "2026-07-29",
        workers: [
          { weightG: 7500, workerId: "worker-anna", workerName: "Anna Zbieracz" },
          { weightG: 4250, workerId: "worker-bartek", workerName: "Bartek Zbieracz" }
        ]
      },
      metrics: {
        ...dashboardResult().metrics,
        harvestedWeightG: 11_750
      },
      period: {
        dateBasis: "BUSINESS_DATE",
        fromDate: "2026-07-29",
        label: "Dzisiaj: 29.07.2026",
        preset: "TODAY",
        toDate: "2026-07-29"
      }
    });

    render(
      <OperatorDashboardPanel
        api={api}
        authState={operatorState}
        env={{}}
        isOnline={true}
        syncDocuments={[]}
      />
    );

    const harvest = await screen.findByLabelText("Dzienne zbiory zbieraczy");
    expect(within(harvest).getByText("Anna Zbieracz")).toBeVisible();
    expect(within(harvest).getByText("7,500 kg")).toBeVisible();
    expect(within(harvest).getByText("Bartek Zbieracz")).toBeVisible();
    expect(within(harvest).getByText("4,250 kg")).toBeVisible();
  });

  it("marks cached offline stock and does not load for another role", async () => {
    const offlineApi = dashboardApi({
      connection: "OFFLINE",
      stock: {
        dataSource: "CACHE",
        invalidMovementCount: 0,
        movementCount: 3,
        pendingMovementCount: 1
      }
    });
    const { rerender } = render(
      <OperatorDashboardPanel
        api={offlineApi}
        authState={operatorState}
        env={{}}
        isOnline={false}
        syncDocuments={[]}
      />
    );

    await screen.findAllByText("12,500 kg");
    expect(screen.queryByText(/offline/i)).not.toBeInTheDocument();
    expect(
      screen.getByText("Część zmian stanu kilogramów oczekuje na potwierdzenie.")
    ).toBeVisible();

    const pickerState: ReadyAuthState = {
      ...operatorState,
      access: { role: "PICKER", status: "READY" },
      profile: {
        ...operatorState.profile,
        role: "PICKER",
        workerId: "worker-1"
      }
    };
    rerender(
      <OperatorDashboardPanel
        api={offlineApi}
        authState={pickerState}
        env={{}}
        isOnline={false}
        syncDocuments={[]}
      />
    );

    expect(
      screen.getByText("Widok jest dostępny tylko dla aktywnego operatora.")
    ).toBeVisible();
    await waitFor(() => {
      expect(offlineApi.load).toHaveBeenCalledTimes(1);
    });
  });

  it("keeps the last server state without exposing local counters offline", async () => {
    const api = dashboardApi();
    const { rerender } = render(
      <OperatorDashboardPanel
        api={api}
        authState={operatorState}
        env={{}}
        isOnline={true}
        syncDocuments={[]}
      />
    );

    expect((await screen.findAllByText("12,500 kg")).length).toBeGreaterThan(0);
    rerender(
      <OperatorDashboardPanel
        api={api}
        authState={operatorState}
        env={{}}
        isOnline={false}
        syncDocuments={[{ id: "pending-1", kind: "HARVEST_SESSION", pendingSync: true }]}
      />
    );

    expect(screen.queryByText(/tryb offline/i)).not.toBeInTheDocument();
    expect(screen.queryByText("Lokalne sesje poza stanem")).not.toBeInTheDocument();
    expect(screen.queryByText("Przewidywane lokalnie")).not.toBeInTheDocument();
    expect(screen.getByText("Bieżący tydzień")).toBeDisabled();
    expect(screen.getByRole("button", { name: "Nowy zbiór" })).toBeEnabled();
    expect(
      screen.queryByRole("button", { name: "Odśwież pulpit operatora" })
    ).not.toBeInTheDocument();
    expect(api.load).toHaveBeenCalledTimes(1);
  });

  it("does not expose an in-memory dashboard after the account changes", async () => {
    const load = vi
      .fn<OperatorDashboardApi["load"]>()
      .mockImplementation((_env, input) =>
        input.isOnline
          ? Promise.resolve(dashboardResult())
          : Promise.reject(new Error("Brak cache nowego konta."))
      );
    const api: OperatorDashboardApi = { load };
    const { rerender } = render(
      <OperatorDashboardPanel
        api={api}
        authState={operatorState}
        env={{}}
        isOnline={true}
        syncDocuments={[]}
      />
    );

    expect((await screen.findAllByText("12,500 kg")).length).toBeGreaterThan(0);
    const otherOperatorState: ReadyAuthState = {
      ...operatorState,
      profile: { ...operatorState.profile, uid: "operator-2" },
      user: { ...operatorState.user, uid: "operator-2" }
    };
    rerender(
      <OperatorDashboardPanel
        api={api}
        authState={otherOperatorState}
        env={{}}
        isOnline={false}
        syncDocuments={[]}
      />
    );

    expect(
      await screen.findByText("Nie udało się pobrać pulpitu operatora.")
    ).toBeVisible();
    expect(screen.queryAllByText("12,500 kg")).toHaveLength(0);
    expect(load).toHaveBeenCalledTimes(2);
  });
});

function metric(label: string): HTMLElement {
  const element = screen
    .getByText(label)
    .closest<HTMLElement>(".operator-dashboard__metric");

  if (!element) {
    throw new Error(`Nie znaleziono metryki: ${label}.`);
  }

  return element;
}

function dashboardApi(
  overrides: Partial<OperatorDashboardResult> = {}
): OperatorDashboardApi {
  return {
    load: vi
      .fn<OperatorDashboardApi["load"]>()
      .mockResolvedValue(dashboardResult(overrides))
  };
}

function dashboardResult(
  overrides: Partial<OperatorDashboardResult> = {}
): OperatorDashboardResult {
  return {
    activeSeason: {
      id: "season-1",
      name: "Sezon 2026"
    },
    conflicts: [
      {
        detail: "Operacja wymaga sprawdzenia w centrum synchronizacji.",
        id: "entry-1",
        label: "Wpis zbioru"
      }
    ],
    connection: "ONLINE",
    metrics: {
      availableWeightG: 12_500,
      conflictCount: 1,
      harvestedWeightG: 12_500,
      localPendingCount: 1,
      openSessionCount: 2,
      ownClosedSessionCount: 2,
      ownOpenSessionCount: 1
    },
    dailyWorkerHarvest: null,
    openSessions: [
      {
        businessDate: "2026-07-29",
        id: "session-1",
        status: "OPEN",
        workerName: "Zbieracz A"
      },
      {
        businessDate: "2026-07-29",
        id: "session-2",
        status: "OPEN",
        workerName: "Zbieracz B"
      }
    ],
    ownRecentSessions: [
      {
        businessDate: "2026-07-29",
        id: "session-1",
        status: "OPEN",
        workerName: "Zbieracz A"
      }
    ],
    period: {
      dateBasis: "BUSINESS_DATE",
      fromDate: "2026-07-29",
      label: "Dzisiaj: 29.07.2026",
      preset: "TODAY",
      toDate: "2026-07-29"
    },
    lastServerSyncIso: "2026-07-29T08:00:00.000Z",
    refreshedAtIso: "2026-07-29T08:00:00.000Z",
    stock: {
      dataSource: "SERVER",
      invalidMovementCount: 0,
      movementCount: 3,
      pendingMovementCount: 0
    },
    ...overrides
  };
}
