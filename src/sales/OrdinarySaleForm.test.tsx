import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { OrdinarySaleForm } from "./OrdinarySaleForm";
import type {
  PreparedOrdinarySale,
  SaleFormStockContext
} from "./ordinarySalePreparation";

const contexts: SaleFormStockContext[] = [
  {
    availableWeightG: 100_000,
    dataSource: "SERVER",
    isFresh: true,
    pendingDocumentCount: 0,
    refreshedAtIso: "2026-07-29T05:00:00.000Z",
    seasonId: "season-2026",
    seasonName: "Sezon 2026"
  },
  {
    availableWeightG: 20_000,
    dataSource: "CACHE",
    isFresh: false,
    pendingDocumentCount: 2,
    refreshedAtIso: "2026-07-28T15:00:00.000Z",
    seasonId: "season-2025",
    seasonName: "Sezon 2025"
  }
];

describe("OrdinarySaleForm", () => {
  it("shows current and live projected sale values", async () => {
    const user = userEvent.setup();

    render(
      <OrdinarySaleForm isOnline={true} onPrepare={vi.fn()} stockContexts={contexts} />
    );

    expect(screen.getAllByText("100,000 kg")).toHaveLength(2);
    expect(screen.getByText("0,000 kg")).toBeVisible();

    await user.type(screen.getByLabelText("Masa kg"), "12,345");
    await user.type(screen.getByLabelText("Cena za kg"), "15.50");

    expect(screen.getByText("12,345 kg")).toBeVisible();
    expect(screen.getByText("15,50 zł / kg")).toBeVisible();
    expect(screen.getByText("191,35 zł")).toBeVisible();
    expect(screen.getByText("87,655 kg")).toBeVisible();
  });

  it("prepares exact values for the fresh-stock preflight", async () => {
    const user = userEvent.setup();
    const onPrepare = vi.fn<(sale: PreparedOrdinarySale) => void>();

    render(
      <OrdinarySaleForm isOnline={true} onPrepare={onPrepare} stockContexts={contexts} />
    );

    await user.type(screen.getByLabelText("Masa kg"), "12,345");
    await user.type(screen.getByLabelText("Cena za kg"), "15,50");
    await user.type(screen.getByLabelText("Notatka"), "Odbior przy gospodarstwie");
    await user.click(screen.getByRole("button", { name: "Sprawdz i przejdz dalej" }));

    expect(onPrepare).toHaveBeenCalledWith(
      expect.objectContaining({
        entryType: "SALE",
        note: "Odbior przy gospodarstwie",
        priceGroszPerKg: 1550,
        projectedAvailableWeightG: 87_655,
        revenuePreviewGrosz: 19_135,
        seasonId: "season-2026",
        weightG: 12_345
      })
    );
    expect(
      screen.getByText("Dane sprzedazy sa gotowe do ponownego sprawdzenia stanu.")
    ).toBeVisible();
  });

  it("blocks offline preparation and explains the reason", () => {
    render(
      <OrdinarySaleForm isOnline={false} onPrepare={vi.fn()} stockContexts={contexts} />
    );

    expect(screen.getByText("Sprzedaz wymaga polaczenia z internetem.")).toBeVisible();
    expect(
      screen.getByRole("button", { name: "Sprawdz i przejdz dalej" })
    ).toBeDisabled();
  });

  it("marks cached or pending stock as potentially stale", async () => {
    const user = userEvent.setup();

    render(
      <OrdinarySaleForm isOnline={true} onPrepare={vi.fn()} stockContexts={contexts} />
    );

    await user.selectOptions(screen.getByLabelText("Sezon"), "season-2025");

    expect(
      screen.getByText("Stan moze byc nieaktualny. Odswiez dane przed zatwierdzeniem.")
    ).toBeVisible();
    expect(screen.getAllByText("20,000 kg")).toHaveLength(2);
  });

  it("shows the amount exceeding visible stock without hiding it", async () => {
    const user = userEvent.setup();

    render(
      <OrdinarySaleForm isOnline={true} onPrepare={vi.fn()} stockContexts={contexts} />
    );

    await user.type(screen.getByLabelText("Masa kg"), "120");
    await user.type(screen.getByLabelText("Cena za kg"), "10");

    expect(screen.getByText("-20,000 kg")).toBeVisible();
    expect(
      screen.getByText("Sprzedaz przekracza widoczny stan o 20,000 kg.")
    ).toBeVisible();
  });

  it("shows validation errors and does not prepare invalid input", async () => {
    const user = userEvent.setup();
    const onPrepare = vi.fn();

    render(
      <OrdinarySaleForm isOnline={true} onPrepare={onPrepare} stockContexts={contexts} />
    );

    await user.type(screen.getByLabelText("Masa kg"), "1,2345");
    await user.type(screen.getByLabelText("Cena za kg"), "10");
    await user.click(screen.getByRole("button", { name: "Sprawdz i przejdz dalej" }));

    expect(
      screen.getByText("Podaj mase w kilogramach z dokladnoscia do 3 miejsc.")
    ).toBeVisible();
    expect(onPrepare).not.toHaveBeenCalled();
  });

  it("submits only once while preparation is pending", async () => {
    const user = userEvent.setup();
    let resolvePreparation: () => void = () => undefined;
    const pendingPreparation = new Promise<void>((resolve) => {
      resolvePreparation = resolve;
    });
    const onPrepare = vi.fn().mockReturnValue(pendingPreparation);

    render(
      <OrdinarySaleForm isOnline={true} onPrepare={onPrepare} stockContexts={contexts} />
    );

    await user.type(screen.getByLabelText("Masa kg"), "1");
    await user.type(screen.getByLabelText("Cena za kg"), "10");
    await user.dblClick(screen.getByRole("button", { name: "Sprawdz i przejdz dalej" }));

    expect(onPrepare).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: "Sprawdzanie..." })).toBeDisabled();

    await act(async () => {
      resolvePreparation();
      await pendingPreparation;
    });
  });
});
