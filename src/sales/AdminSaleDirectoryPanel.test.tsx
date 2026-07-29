import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import type { AuthSessionState } from "../auth/authSession";
import {
  AdminSaleDirectoryPanel,
  type AdminSaleDirectoryApi
} from "./AdminSaleDirectoryPanel";
import type { AdminSaleDirectoryItem } from "./saleDirectory";

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

describe("AdminSaleDirectoryPanel", () => {
  it("filters the financial list, opens details and requests cancellation", async () => {
    const user = userEvent.setup();
    const onRequestCancellation = vi.fn();
    const api = directoryApi([
      saleItem({ id: "sale-1" }),
      saleItem({
        businessDate: "2026-07-28",
        correctionDirection: "INCREASE_STOCK",
        entryType: "CORRECTION",
        id: "correction-1",
        note: "Zwrot do stanu",
        totalGrosz: 1250,
        weightG: 1000
      }),
      saleItem({
        businessDate: "2026-07-27",
        cancellationReason: "Bledna masa",
        cancelledAt: "2026-07-29T10:00:00.000Z",
        cancelledAtIso: "2026-07-29T10:00:00.000Z",
        cancelledBy: "admin-1",
        cancelledByName: "Admin",
        id: "sale-cancelled",
        status: "CANCELLED"
      })
    ]);

    render(
      <AdminSaleDirectoryPanel
        api={api}
        authState={adminState}
        env={{}}
        isOnline={true}
        onRequestCancellation={onRequestCancellation}
      />
    );

    expect(await screen.findByText("Lista sprzedazy")).toBeVisible();
    expect(screen.getByText("25,00 zł")).toBeVisible();
    expect(screen.getByText("3")).toBeVisible();

    await user.selectOptions(screen.getByLabelText("Typ"), "CORRECTION");
    expect(screen.getByText("Zwrot do stanu")).toBeVisible();
    expect(screen.queryByText("Odbiorca A")).not.toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText("Typ"), "ALL");
    await user.click(screen.getByTitle("Otworz szczegoly operacji sale-1"));
    expect(await screen.findByText("Id operacji")).toBeVisible();
    expect(screen.getByText("sale-1")).toBeVisible();

    await user.click(screen.getByRole("button", { name: "Przejdz do anulowania" }));
    expect(onRequestCancellation).toHaveBeenCalledWith("sale-1");
  });

  it("does not load or expose the list to an operator", async () => {
    const api = directoryApi([]);
    const operatorState: ReadyAuthState = {
      ...adminState,
      access: { role: "OPERATOR", status: "READY" },
      profile: { ...adminState.profile, role: "OPERATOR" }
    };

    render(
      <AdminSaleDirectoryPanel
        api={api}
        authState={operatorState}
        env={{}}
        isOnline={true}
        onRequestCancellation={vi.fn()}
      />
    );

    expect(
      screen.getByText("Lista finansowa jest dostepna tylko dla administratora.")
    ).toBeVisible();
    await waitFor(() => {
      expect(api.list).not.toHaveBeenCalled();
    });
  });
});

function directoryApi(sales: AdminSaleDirectoryItem[]): AdminSaleDirectoryApi {
  return {
    list: vi.fn<AdminSaleDirectoryApi["list"]>().mockResolvedValue({
      invalidSaleCount: 0,
      invalidSeasonCount: 0,
      invalidUserCount: 0,
      sales
    })
  };
}

function saleItem(
  overrides: Partial<AdminSaleDirectoryItem> & { id: string }
): AdminSaleDirectoryItem {
  return {
    authorName: "Admin",
    businessDate: "2026-07-29",
    calculationVersion: "1",
    cancellationReason: null,
    cancelledAt: null,
    cancelledAtIso: null,
    cancelledBy: null,
    cancelledByName: null,
    correctionDirection: null,
    createdAtIso: "2026-07-29T08:00:00.000Z",
    createdAtServer: "2026-07-29T08:00:00.000Z",
    createdBy: "admin-1",
    creationAttemptId: `attempt-${overrides.id}`,
    entryType: "SALE",
    legacyImport: false,
    legacySourceRow: null,
    note: "Odbiorca A",
    priceGroszPerKg: 1250,
    seasonId: "season-1",
    seasonName: "Sezon 2026",
    status: "ACTIVE",
    totalGrosz: 3750,
    weightG: 3000,
    ...overrides
  };
}
