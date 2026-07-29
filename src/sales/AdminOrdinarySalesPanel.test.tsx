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

  it("requires an additional confirmation before writing a correction", async () => {
    const user = userEvent.setup();
    const api = createApi();
    api.checkCorrection.mockImplementation((_env, input) =>
      Promise.resolve({
        check: {
          checkedAtIso: "2026-07-29T06:05:00.000Z",
          correction: {
            ...input.preparedCorrection,
            refreshedAtIso: "2026-07-29T06:05:00.000Z"
          },
          correctionId: "correction-1",
          expectedAvailableWeightG: 10_000,
          stockChanged: false
        },
        status: "CONFIRMATION_REQUIRED"
      })
    );
    api.createCorrection.mockImplementation((_env, input) =>
      Promise.resolve(correctionConfirmedResult(input.check.correction))
    );

    renderPanel(api);
    await screen.findByRole("option", { name: "Sezon 2026" });
    await user.click(screen.getByRole("button", { name: "Korekta" }));
    await user.type(screen.getByLabelText("Masa kg"), "3");
    await user.type(screen.getByLabelText("Cena za kg"), "12,50");
    await user.type(screen.getByLabelText("Powod korekty"), "Powod korekty sprzedazy");
    await user.click(screen.getByRole("button", { name: "Sprawdz korekte" }));

    const confirmButton = await screen.findByRole("button", {
      name: "Potwierdz i zapisz korekte"
    });
    expect(confirmButton).toBeDisabled();
    expect(api.createCorrection).not.toHaveBeenCalled();

    await user.click(
      screen.getByLabelText(
        "Potwierdzam kierunek, wplyw na stan i przychod oraz podany powod."
      )
    );
    await user.click(confirmButton);

    await waitFor(() => {
      expect(api.createCorrection).toHaveBeenCalledTimes(1);
    });
    expect(
      await screen.findByText(
        "Korekta sprzedazy zostala zapisana i potwierdzona przez serwer."
      )
    ).toBeVisible();
  });

  it("requires a reason and explicit confirmation before cancelling a sale", async () => {
    const user = userEvent.setup();
    const api = createApi();
    const sale = activeSaleDocument();
    api.listCancellationCandidates.mockResolvedValue([
      { sale, seasonName: "Sezon 2026" }
    ]);
    api.cancelSale.mockResolvedValue(cancellationResult(sale));

    renderPanel(api);
    await screen.findByRole("option", { name: "Sezon 2026" });
    await user.click(screen.getByRole("button", { name: "Anulowanie" }));
    await user.click(await screen.findByRole("radio", { name: /Sprzedaz.*2026-07-29/ }));

    const confirmation = screen.getByLabelText(
      "Potwierdzam anulowanie, jego wplyw na stan i przychod oraz podany powod."
    );
    expect(confirmation).toBeDisabled();
    expect(screen.getByText("+3,000 kg")).toBeVisible();
    expect(screen.getByText(/-37,50/)).toBeVisible();

    await user.type(screen.getByLabelText("Powod anulowania"), "Bledna masa");
    await user.click(confirmation);
    await user.click(screen.getByRole("button", { name: "Anuluj operacje" }));

    await waitFor(() => {
      expect(api.cancelSale).toHaveBeenCalledTimes(1);
    });
    expect(api.cancelSale.mock.calls[0]?.[1]).toMatchObject({
      confirmed: true,
      reason: "Bledna masa",
      saleId: "sale-1"
    });
    expect(
      await screen.findByText(
        "Operacja sprzedazy zostala anulowana. Dokument i powod pozostaly w historii."
      )
    ).toBeVisible();
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
    cancelSale: vi.fn<OrdinarySalesApi["cancelSale"]>(),
    checkCorrection: vi.fn<OrdinarySalesApi["checkCorrection"]>(),
    checkStock: vi.fn<OrdinarySalesApi["checkStock"]>(),
    create: vi.fn<OrdinarySalesApi["create"]>(),
    createCorrection: vi.fn<OrdinarySalesApi["createCorrection"]>(),
    listCancellationCandidates: vi
      .fn<OrdinarySalesApi["listCancellationCandidates"]>()
      .mockResolvedValue([]),
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

function correctionConfirmedResult(
  correction: import("./saleCorrectionPreparation").PreparedSaleCorrection
) {
  const document: SaleDocument = {
    businessDate: correction.businessDate,
    calculationVersion: correction.calculationVersion,
    cancellationReason: null,
    cancelledAt: null,
    cancelledBy: null,
    correctionDirection: correction.correctionDirection,
    createdAtServer: "server-time",
    createdBy: "admin-1",
    creationAttemptId: "sale-correction-attempt-correction-1",
    entryType: "CORRECTION",
    id: "correction-1",
    legacyImport: false,
    legacySourceRow: null,
    note: correction.note,
    priceGroszPerKg: correction.priceGroszPerKg,
    seasonId: correction.seasonId,
    status: "ACTIVE",
    totalGrosz: correction.revenueMagnitudeGrosz,
    weightG: correction.weightG
  };

  return {
    auditEvent: {
      action: "SALE_CORRECTION_CREATED" as const,
      actorRoleSnapshot: "ADMIN" as const,
      actorUid: "admin-1",
      afterSummary: null,
      beforeSummary: null,
      businessDate: correction.businessDate,
      createdAtDevice: "device-time",
      createdAtServer: "server-time",
      deviceId: "device-admin",
      entityId: document.id,
      entityType: "SALE" as const,
      id: "sale-correction-created-correction-1",
      reason: correction.note
    },
    concurrentStockChangeDetected: false,
    correction: document,
    message: "Korekta sprzedazy zostala zapisana i potwierdzona przez serwer.",
    postWriteAvailableWeightG: correction.projectedAvailableWeightG,
    status: "CONFIRMED" as const
  };
}

function activeSaleDocument(): SaleDocument {
  return {
    businessDate: "2026-07-29",
    calculationVersion: "1",
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
    note: "Odbiorca A",
    priceGroszPerKg: 1250,
    seasonId: "season-1",
    status: "ACTIVE",
    totalGrosz: 3750,
    weightG: 3000
  };
}

function cancellationResult(sale: SaleDocument) {
  const cancelledSale: SaleDocument = {
    ...sale,
    cancellationReason: "Bledna masa",
    cancelledAt: "server-time",
    cancelledBy: "admin-1",
    status: "CANCELLED"
  };

  return {
    auditEvent: {
      action: "SALE_CANCELLED" as const,
      actorRoleSnapshot: "ADMIN" as const,
      actorUid: "admin-1",
      afterSummary: null,
      beforeSummary: null,
      businessDate: sale.businessDate,
      createdAtDevice: "device-time",
      createdAtServer: "server-time",
      deviceId: "device-admin",
      entityId: sale.id,
      entityType: "SALE" as const,
      id: "sale-cancelled-sale-1",
      reason: "Bledna masa"
    },
    cancelledSale,
    impact: {
      revenueImpactGrosz: -3750,
      stockImpactG: 3000
    },
    message:
      "Operacja sprzedazy zostala anulowana. Dokument i powod pozostaly w historii.",
    postWriteAvailableWeightG: 13_000,
    status: "CANCELLED" as const
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
      revenueCalculationVersion: "1",
      revenuePreviewGrosz: 3750,
      revenueRemainderMilliGrosz: 0,
      revenueRoundingRule: "HALF_UP_TO_GROSZ",
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
    calculationVersion: "1",
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
