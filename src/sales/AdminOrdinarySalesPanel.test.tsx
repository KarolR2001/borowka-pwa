import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import type { AuthSessionState } from "../auth/authSession";
import {
  AdminOrdinarySalesPanel,
  type OrdinarySalesApi
} from "./AdminOrdinarySalesPanel";
import type { OrdinarySaleStockCheck, SaleDocument } from "./saleStockPreflight";

type ReadyAuthState = Extract<AuthSessionState, { status: "READY" }>;

const adminState: ReadyAuthState = {
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

describe("AdminOrdinarySalesPanel", () => {
  it("updates changed stock and writes only after explicit confirmation", async () => {
    const user = userEvent.setup();
    const check = stockCheck(8000, true);
    const api = createApi();
    api.checkStock.mockResolvedValue({
      check,
      status: "CONFIRMATION_REQUIRED"
    });
    api.create.mockResolvedValue(confirmedResult(check));

    renderPanel(api);
    await fillAndPrepare(user);

    expect(
      await screen.findByText("Stan zmienil sie od otwarcia formularza")
    ).toBeVisible();
    expect(screen.getAllByText("5,000 kg")).toHaveLength(2);
    expect(api.create).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Potwierdz i zapisz" }));

    await waitFor(() => {
      expect(api.create).toHaveBeenCalledTimes(1);
    });
    expect(
      await screen.findByText("Sprzedaz zostala zapisana i potwierdzona przez serwer.")
    ).toBeVisible();
  });

  it("requires another click when stock changes between confirmation and write", async () => {
    const user = userEvent.setup();
    const firstCheck = stockCheck(10_000, false);
    const secondCheck = stockCheck(9000, true);
    const api = createApi();
    api.checkStock.mockResolvedValue({
      check: firstCheck,
      status: "CONFIRMATION_REQUIRED"
    });
    api.create
      .mockResolvedValueOnce({
        check: secondCheck,
        message:
          "Stan zmienil sie po potwierdzeniu. Sprawdz nowe podsumowanie i potwierdz ponownie.",
        status: "RECONFIRMATION_REQUIRED"
      })
      .mockResolvedValueOnce(confirmedResult(secondCheck));

    renderPanel(api);
    await fillAndPrepare(user);
    await user.click(await screen.findByRole("button", { name: "Potwierdz i zapisz" }));

    expect(
      await screen.findByText(
        "Stan zmienil sie po potwierdzeniu. Sprawdz nowe podsumowanie i potwierdz ponownie."
      )
    ).toBeVisible();
    expect(api.create).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole("button", { name: "Potwierdz i zapisz" }));

    await waitFor(() => {
      expect(api.create).toHaveBeenCalledTimes(2);
    });
    expect(
      await screen.findByText("Sprzedaz zostala zapisana i potwierdzona przez serwer.")
    ).toBeVisible();
  });

  it("keeps the confirmed payload stable until the administrator returns to editing", async () => {
    const user = userEvent.setup();
    const check = stockCheck(10_000, false);
    const api = createApi();
    api.checkStock.mockResolvedValue({
      check,
      status: "CONFIRMATION_REQUIRED"
    });

    renderPanel(api);
    await fillAndPrepare(user);

    expect(await screen.findByLabelText("Masa kg")).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "Wroc do edycji" }));

    expect(screen.getByLabelText("Masa kg")).toBeEnabled();
    expect(
      screen.queryByRole("button", { name: "Potwierdz i zapisz" })
    ).not.toBeInTheDocument();
    expect(api.create).not.toHaveBeenCalled();
  });

  it("does not load or expose sales to an operator", () => {
    const api = createApi();
    const operatorState: ReadyAuthState = {
      ...adminState,
      access: {
        role: "OPERATOR",
        status: "READY"
      },
      profile: {
        ...adminState.profile,
        role: "OPERATOR"
      }
    };

    renderPanel(api, operatorState);

    expect(
      screen.getByText("Sprzedaz jest dostepna tylko dla administratora.")
    ).toBeVisible();
    expect(api.listStockContexts).not.toHaveBeenCalled();
  });
});

function renderPanel(
  api: ReturnType<typeof createApi>,
  authState: AuthSessionState = adminState
) {
  return render(
    <AdminOrdinarySalesPanel
      authState={authState}
      deviceId="device-admin"
      env={{}}
      isOnline={true}
      ordinarySalesApi={api}
    />
  );
}

async function fillAndPrepare(user: ReturnType<typeof userEvent.setup>) {
  await screen.findByRole("option", { name: "Sezon 2026" });
  await user.type(screen.getByLabelText("Masa kg"), "3");
  await user.type(screen.getByLabelText("Cena za kg"), "12,50");
  await user.click(screen.getByRole("button", { name: "Sprawdz i przejdz dalej" }));
}

function createApi() {
  return {
    checkStock: vi.fn<OrdinarySalesApi["checkStock"]>(),
    create: vi.fn<OrdinarySalesApi["create"]>(),
    listStockContexts: vi.fn<OrdinarySalesApi["listStockContexts"]>().mockResolvedValue([
      {
        availableWeightG: 10_000,
        dataSource: "SERVER",
        isFresh: true,
        pendingDocumentCount: 0,
        refreshedAtIso: "2026-07-29T06:00:00.000Z",
        seasonId: "season-1",
        seasonName: "Sezon 2026"
      }
    ])
  };
}

function stockCheck(
  availableWeightG: number,
  stockChanged: boolean
): OrdinarySaleStockCheck {
  return {
    checkedAtIso: "2026-07-29T06:05:00.000Z",
    expectedAvailableWeightG: availableWeightG,
    sale: {
      availableWeightG,
      businessDate: new Date().toISOString().slice(0, 10),
      correctionDirection: null,
      entryType: "SALE",
      note: null,
      pendingDocumentCount: 0,
      priceGroszPerKg: 1250,
      projectedAvailableWeightG: availableWeightG - 3000,
      refreshedAtIso: "2026-07-29T06:05:00.000Z",
      revenuePreviewGrosz: 3750,
      seasonId: "season-1",
      seasonName: "Sezon 2026",
      status: "ACTIVE",
      stockDataSource: "SERVER",
      stockWasFresh: true,
      weightG: 3000
    },
    saleId: "sale-1",
    stockChanged
  };
}

function confirmedResult(check: OrdinarySaleStockCheck) {
  const sale: SaleDocument = {
    businessDate: check.sale.businessDate,
    cancellationReason: null,
    cancelledAt: null,
    cancelledBy: null,
    correctionDirection: null,
    createdAtServer: "server-time",
    createdBy: "admin-1",
    creationAttemptId: "sale-attempt-sale-1",
    entryType: "SALE",
    id: "sale-1",
    legacyImport: false,
    legacySourceRow: null,
    note: null,
    priceGroszPerKg: 1250,
    seasonId: "season-1",
    status: "ACTIVE",
    totalGrosz: 3750,
    weightG: 3000
  };

  return {
    auditEvent: {
      action: "SALE_CREATED" as const,
      actorRoleSnapshot: "ADMIN" as const,
      actorUid: "admin-1",
      afterSummary: null,
      beforeSummary: null,
      businessDate: sale.businessDate,
      createdAtDevice: "device-time",
      createdAtServer: "server-time",
      deviceId: "device-admin",
      entityId: "sale-1",
      entityType: "SALE" as const,
      id: "sale-created-sale-1",
      reason: null
    },
    concurrentStockChangeDetected: false,
    message: "Sprzedaz zostala zapisana i potwierdzona przez serwer.",
    postWriteAvailableWeightG: check.expectedAvailableWeightG - 3000,
    sale,
    status: "CONFIRMED" as const,
    stockIsConsistent: true
  };
}
