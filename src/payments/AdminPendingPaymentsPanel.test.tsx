import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import type { AuthSessionState } from "../auth/authSession";
import {
  AdminPendingPaymentsPanel,
  type PendingPaymentsApi
} from "./AdminPendingPaymentsPanel";

const adminState: AuthSessionState = {
  status: "READY",
  user: {
    uid: "admin-1",
    email: "admin@example.test",
    displayName: "Admin"
  },
  profile: {
    uid: "admin-1",
    email: "admin@example.test",
    displayName: "Admin",
    role: "ADMIN",
    workerId: null,
    active: true,
    registrationStatus: "APPROVED",
    offlineConsent: false
  },
  access: {
    status: "READY",
    role: "ADMIN"
  },
  message: "Gotowe."
};

describe("AdminPendingPaymentsPanel", () => {
  it("renders eligible sessions, totals and filters", async () => {
    const user = userEvent.setup();
    const api: PendingPaymentsApi = {
      list: vi.fn().mockResolvedValue({
        excluded: {
          activePaymentCount: 1,
          missingAmountCount: 0,
          pendingSynchronizationCount: 2
        },
        invalidDocumentCount: 0,
        sessions: [
          pendingSession("session-a", "Anna", 5000),
          pendingSession("session-b", "Barbara", 7500)
        ]
      })
    };

    render(
      <AdminPendingPaymentsPanel
        authState={adminState}
        env={{}}
        isOnline={true}
        pendingPaymentsApi={api}
        syncDocuments={[]}
      />
    );

    expect(await screen.findByText("125,00 zł")).toBeVisible();
    expect(within(screen.getByRole("table")).getByText("Anna")).toBeVisible();
    expect(within(screen.getByRole("table")).getByText("Barbara")).toBeVisible();
    expect(screen.getByText("Anulowana wyplata")).toBeVisible();
    expect(screen.getByText("Wykluczone pending")).toBeVisible();

    await user.selectOptions(screen.getByLabelText("Zbieracz"), "worker-a");

    expect(within(screen.getByRole("table")).getByText("Anna")).toBeVisible();
    expect(
      within(screen.getByRole("table")).queryByText("Barbara")
    ).not.toBeInTheDocument();
    expect(screen.getAllByText("50,00 zł")).toHaveLength(2);
  });

  it("reloads and sends current synchronization context", async () => {
    const user = userEvent.setup();
    const api: PendingPaymentsApi = {
      list: vi.fn().mockResolvedValue({
        excluded: {
          activePaymentCount: 0,
          missingAmountCount: 0,
          pendingSynchronizationCount: 0
        },
        invalidDocumentCount: 0,
        sessions: []
      })
    };
    const syncDocuments = [
      {
        id: "session-a",
        kind: "HARVEST_SESSION" as const,
        pendingSync: true
      }
    ];

    render(
      <AdminPendingPaymentsPanel
        authState={adminState}
        env={{}}
        isOnline={false}
        pendingPaymentsApi={api}
        syncDocuments={syncDocuments}
      />
    );

    await screen.findByText("Brak sesji spelniajacych filtry.");
    await user.click(screen.getByRole("button", { name: "Odswiez liste" }));

    await waitFor(() => {
      expect(api.list).toHaveBeenCalledTimes(2);
    });
    expect(api.list).toHaveBeenLastCalledWith(
      {},
      expect.objectContaining({
        isOnline: false,
        syncDocuments
      })
    );
  });
});

function pendingSession(sessionId: string, workerName: string, amountDueGrosz: number) {
  return {
    amountDueGrosz,
    businessDate: "2026-07-18",
    calculationBasis: "WEIGHT" as const,
    closedAt: "2026-07-18T12:00:00.000Z",
    closedBy: "operator-1",
    paymentHistory:
      sessionId === "session-a" ? ("CANCELLED" as const) : ("NONE" as const),
    planId: "plan-a",
    planName: "Za kilogram",
    seasonId: "season-2026",
    seasonName: "Sezon 2026",
    sessionId,
    syncStatus: "SYNCED" as const,
    totalEntryCount: 2,
    totalQuantityMilli: 2000,
    totalWeightG: 5000,
    unitLabel: "kilogramy",
    workerId: sessionId === "session-a" ? "worker-a" : "worker-b",
    workerName
  };
}
