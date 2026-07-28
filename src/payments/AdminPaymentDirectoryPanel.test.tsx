import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import type { AuthSessionState } from "../auth/authSession";
import {
  AdminPaymentDirectoryPanel,
  type AdminPaymentDirectoryApi
} from "./AdminPaymentDirectoryPanel";
import type {
  AdminPaymentDirectoryItem,
  AdminPaymentDirectoryResult
} from "./paymentDirectory";

const adminState: AuthSessionState = {
  access: {
    role: "ADMIN",
    status: "READY"
  },
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

describe("AdminPaymentDirectoryPanel", () => {
  it("shows active totals, details, export and cancellation entry", async () => {
    const user = userEvent.setup();
    const result = directoryResult();
    const api: AdminPaymentDirectoryApi = {
      downloadCsv: vi.fn(),
      list: vi.fn().mockResolvedValue(result)
    };
    const onRequestCancellation = vi.fn();

    render(
      <AdminPaymentDirectoryPanel
        adminPaymentDirectoryApi={api}
        authState={adminState}
        env={{}}
        onRequestCancellation={onRequestCancellation}
      />
    );

    expect(await screen.findByText("175,00 zł")).toBeVisible();
    const summary = screen.getByLabelText("Podsumowanie historii wyplat");
    expect(within(summary).getByText("Anulowane")).toBeVisible();
    expect(within(summary).getByText("Importowane")).toBeVisible();

    await user.click(
      screen.getByRole("button", {
        name: "Otworz szczegoly wyplaty session-active"
      })
    );
    expect(screen.getByRole("heading", { name: "Anna" })).toBeVisible();
    expect(screen.getByText("Rozliczenie tygodnia")).toBeVisible();
    expect(screen.getAllByText("admin-1").length).toBeGreaterThan(0);
    expect(screen.getByText("Sesja zrodlowa")).toBeVisible();

    await user.click(screen.getByRole("button", { name: "Przejdz do anulowania" }));
    expect(onRequestCancellation).toHaveBeenCalledWith("session-active");
    expect(
      screen.getByText("Wybrano wyplate session-active do anulowania.")
    ).toBeVisible();

    await user.click(screen.getByRole("button", { name: "Eksport CSV" }));
    expect(api.downloadCsv).toHaveBeenCalledTimes(1);
    expect(vi.mocked(api.downloadCsv).mock.calls[0]?.[0]).toContain(
      '"session-cancelled"'
    );
    expect(vi.mocked(api.downloadCsv).mock.calls[0]?.[1]).toMatch(
      /^borowka-wyplaty-.*\.csv$/
    );
  });

  it("filters cancelled and imported payments without changing the source total", async () => {
    const user = userEvent.setup();
    const api: AdminPaymentDirectoryApi = {
      downloadCsv: vi.fn(),
      list: vi.fn().mockResolvedValue(directoryResult())
    };

    render(
      <AdminPaymentDirectoryPanel
        adminPaymentDirectoryApi={api}
        authState={adminState}
        env={{}}
      />
    );

    const table = await screen.findByRole("table");
    expect(within(table).getByText("Anna")).toBeVisible();
    expect(within(table).getByText("Barbara")).toBeVisible();
    expect(within(table).getByText("Celina")).toBeVisible();

    await user.selectOptions(screen.getByLabelText("Status"), "CANCELLED");
    expect(within(table).getByText("Barbara")).toBeVisible();
    expect(within(table).queryByText("Anna")).not.toBeInTheDocument();
    expect(within(table).getByText("75,00 zł")).toBeVisible();

    await user.selectOptions(screen.getByLabelText("Status"), "IMPORTED");
    expect(within(table).getByText("Celina")).toBeVisible();
    expect(within(table).queryByText("Barbara")).not.toBeInTheDocument();
    expect(within(table).getByText("125,00 zł")).toBeVisible();
  });

  it("does not load financial data for a non-admin", async () => {
    const api: AdminPaymentDirectoryApi = {
      downloadCsv: vi.fn(),
      list: vi.fn()
    };

    render(
      <AdminPaymentDirectoryPanel
        adminPaymentDirectoryApi={api}
        authState={{
          ...adminState,
          access: {
            role: "OPERATOR",
            status: "READY"
          },
          profile: {
            ...adminState.profile,
            role: "OPERATOR"
          }
        }}
        env={{}}
      />
    );

    expect(
      screen.getByText("Lista wyplat jest dostepna tylko dla administratora.")
    ).toBeVisible();
    await waitFor(() => {
      expect(api.list).not.toHaveBeenCalled();
    });
  });
});

function directoryResult(): AdminPaymentDirectoryResult {
  return {
    invalidPaymentCount: 0,
    invalidSeasonCount: 0,
    invalidSessionCount: 0,
    missingSourceSessionCount: 0,
    payments: [
      payment("session-active", "Anna", 5000, {
        note: "Rozliczenie tygodnia"
      }),
      payment("session-cancelled", "Barbara", 7500, {
        cancellationReason: "Bledna metoda",
        cancelledAtIso: "2026-07-22T10:00:00.000Z",
        cancelledBy: "admin-2",
        status: "CANCELLED"
      }),
      payment("session-imported", "Celina", 12_500, {
        legacyImport: true,
        paidBusinessDate: "2026-07-22"
      })
    ]
  };
}

function payment(
  id: string,
  workerName: string,
  amountGrosz: number,
  overrides: Partial<AdminPaymentDirectoryItem> = {}
): AdminPaymentDirectoryItem {
  return {
    amountGrosz,
    cancellationReason: null,
    cancelledAtIso: null,
    cancelledBy: null,
    createdAtIso: "2026-07-20T12:00:00.000Z",
    createdBy: "admin-1",
    id,
    legacyImport: false,
    note: null,
    paidBusinessDate: "2026-07-20",
    paymentMethod: "CASH",
    seasonId: "season-2026",
    seasonName: "Sezon 2026",
    sessionId: id,
    sourceSession: {
      businessDate: "2026-07-18",
      calculationBasis: "WEIGHT",
      closedAtIso: "2026-07-18T12:00:00.000Z",
      closedBy: "operator-1",
      planName: "Za kilogram",
      rateGrosz: 1000,
      revision: 3,
      status: "PAID",
      totalEntryCount: 2,
      totalQuantityMilli: 2000,
      totalWeightG: 5000,
      unitLabel: "kilogramy"
    },
    status: "ACTIVE",
    workerId: `worker-${workerName.toLowerCase()}`,
    workerName,
    ...overrides
  };
}
