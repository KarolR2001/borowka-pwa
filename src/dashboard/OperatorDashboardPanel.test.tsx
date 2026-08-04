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

  it("shows operational metrics and sessions without financial data", async () => {
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

    expect(await screen.findByText("Pulpit operatora")).toBeVisible();
    expect(within(metric("Aktywny sezon")).getByText("Sezon 2026")).toBeVisible();
    expect(within(metric("Dostepne operacyjnie")).getByText("12,500 kg")).toBeVisible();
    expect(screen.getByText("Potwierdzony przez serwer")).toBeVisible();
    expect(screen.getAllByText("Zbieracz A")).toHaveLength(2);
    expect(screen.getByText("Moje konflikty synchronizacji")).toBeVisible();
    expect(
      screen.getByText("Operacja wymaga sprawdzenia w centrum synchronizacji.")
    ).toBeVisible();
    expect(screen.queryByText(/przychod/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/wyplat/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/stawka.*zl/i)).not.toBeInTheDocument();
    expect(api.load).toHaveBeenCalledWith(
      {},
      expect.objectContaining({
        actorProfile: operatorState.profile,
        isOnline: true,
        periodSelection: {
          customFromDate: "",
          customToDate: "",
          preset: "TODAY"
        },
        syncDocuments: [{ id: "pending-1", kind: "HARVEST_ENTRY", pendingSync: true }]
      })
    );
  });

  it("moves to the new harvest form and refreshes the dashboard", async () => {
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

    await screen.findByText("Pulpit operatora");
    await user.click(screen.getByRole("button", { name: "Nowy zbior" }));
    expect(input).toHaveFocus();

    await user.click(screen.getByRole("button", { name: "Odswiez pulpit operatora" }));
    await waitFor(() => {
      expect(api.load).toHaveBeenCalledTimes(2);
    });
    target.remove();
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

    expect(
      await screen.findByText(
        "Pracujesz offline. Stan kilogramow pochodzi z kopii lokalnej."
      )
    ).toBeVisible();
    expect(
      screen.getByText("Czesc zmian stanu kilogramow oczekuje na potwierdzenie.")
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
      screen.getByText("Widok jest dostepny tylko dla aktywnego operatora.")
    ).toBeVisible();
    await waitFor(() => {
      expect(offlineApi.load).toHaveBeenCalledTimes(1);
    });
  });

  it("keeps the last server state separate from the local prediction offline", async () => {
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

    expect(await screen.findByText("12,500 kg")).toBeVisible();
    rerender(
      <OperatorDashboardPanel
        api={api}
        authState={operatorState}
        env={{}}
        isOnline={false}
        syncDocuments={[{ id: "pending-1", kind: "HARVEST_SESSION", pendingSync: true }]}
      />
    );

    expect(
      await screen.findByText(
        "Tryb offline. Widoczny stan serwera nie jest stanem aktualnym."
      )
    ).toBeVisible();
    expect(screen.getByText("Ostatni oficjalny stan serwera")).toBeVisible();
    expect(screen.getByText("Lokalne sesje poza stanem")).toBeVisible();
    expect(screen.getByText("Przewidywane lokalnie")).toBeVisible();
    expect(screen.getByLabelText("Okres")).toBeDisabled();
    expect(screen.getByRole("button", { name: "Nowy zbior" })).toBeEnabled();
    expect(
      screen.getByRole("button", { name: "Odswiez pulpit operatora" })
    ).toBeDisabled();
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

    expect(await screen.findByText("12,500 kg")).toBeVisible();
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
      await screen.findByText("Nie udalo sie pobrac pulpitu operatora.")
    ).toBeVisible();
    expect(screen.queryByText("12,500 kg")).not.toBeInTheDocument();
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
      localPendingCount: 1,
      openSessionCount: 2,
      ownClosedSessionCount: 2,
      ownOpenSessionCount: 1
    },
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
