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
      createPayment: vi.fn().mockResolvedValue(confirmedPaymentResult("session-a")),
      checkEligibility: vi.fn().mockResolvedValue({
        amountDueGrosz: 5000,
        blockers: [],
        checkedAtIso: "2026-07-28T12:00:00.000Z",
        paymentId: "session-a",
        sessionId: "session-a",
        sessionRevision: 2,
        status: "ELIGIBLE"
      }),
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
        deviceId="device-admin"
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

    await user.click(screen.getByRole("button", { name: "Sprawdz warunki" }));
    expect(await screen.findByText("Sesja spelnia warunki wyplaty.")).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Wyplac" }));
    expect(screen.getByText("Potwierdzenie wyplaty")).toBeVisible();
    expect(screen.getByText("Za kilogram, 10,00 zł / kilogramy")).toBeVisible();
    await user.click(
      screen.getByLabelText("Potwierdzam wyplate calej naleznosci za te sesje")
    );
    await user.click(screen.getByRole("button", { name: "Zapisz wyplate" }));
    expect(
      await screen.findByText("Firestore potwierdzil wyplate dla Anna.")
    ).toBeVisible();
    expect(api.createPayment).toHaveBeenCalledTimes(1);
    expect(vi.mocked(api.createPayment).mock.calls[0]?.[1]).toMatchObject({
      actorProfile: adminState.profile,
      confirmation: {
        amountGrosz: 5000,
        sessionId: "session-a"
      },
      deviceId: "device-admin",
      isOnline: true
    });
    expect(api.checkEligibility).toHaveBeenCalledWith(
      {},
      expect.objectContaining({ sessionId: "session-a" })
    );
  });

  it("reloads and sends current synchronization context", async () => {
    const user = userEvent.setup();
    const api: PendingPaymentsApi = {
      createPayment: vi.fn(),
      checkEligibility: vi.fn(),
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
        deviceId="device-admin"
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

  it("explains every blocker before leaving payment disabled", async () => {
    const user = userEvent.setup();
    const api: PendingPaymentsApi = {
      createPayment: vi.fn(),
      checkEligibility: vi.fn().mockResolvedValue({
        amountDueGrosz: 5000,
        blockers: [
          {
            code: "ONLINE_REQUIRED",
            message: "Wyplata wymaga internetu.",
            nextStep: "Odzyskaj polaczenie."
          },
          {
            code: "PENDING_SYNCHRONIZATION",
            message: "Dane oczekuja na synchronizacje.",
            nextStep: "Uruchom synchronizacje."
          }
        ],
        checkedAtIso: "2026-07-28T12:00:00.000Z",
        paymentId: "session-a",
        sessionId: "session-a",
        sessionRevision: 2,
        status: "BLOCKED"
      }),
      list: vi.fn().mockResolvedValue({
        excluded: {
          activePaymentCount: 0,
          missingAmountCount: 0,
          pendingSynchronizationCount: 0
        },
        invalidDocumentCount: 0,
        sessions: [pendingSession("session-a", "Anna", 5000)]
      })
    };

    render(
      <AdminPendingPaymentsPanel
        authState={adminState}
        deviceId="device-admin"
        env={{}}
        isOnline={false}
        pendingPaymentsApi={api}
        syncDocuments={[]}
      />
    );

    await user.click(await screen.findByRole("button", { name: "Sprawdz warunki" }));

    expect(await screen.findByText(/Wyplata wymaga internetu/)).toBeVisible();
    expect(screen.getByText(/Dane oczekuja na synchronizacje/)).toBeVisible();
    expect(screen.getByRole("button", { name: "Wyplac" })).toBeDisabled();
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
    rateGrosz: 1000,
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

function confirmedPaymentResult(sessionId: string) {
  return {
    auditId: `payment-created-${sessionId}`,
    confirmationSource: "SERVER_READ_AFTER_COMMIT" as const,
    message: "Firestore potwierdzil wyplate dla Anna.",
    payment: {
      amountGrosz: 5000,
      cancellationReason: null,
      cancelledAt: null,
      cancelledBy: null,
      createdAtServer: "server-time",
      createdBy: "admin-1",
      id: sessionId,
      legacyImport: false,
      note: null,
      paidBusinessDate: "2026-07-28",
      paymentMethod: "CASH" as const,
      seasonId: "season-2026",
      sessionId,
      status: "ACTIVE" as const,
      workerId: "worker-a",
      workerNameSnapshot: "Anna"
    },
    sessionRevision: 3,
    status: "CONFIRMED" as const
  };
}
