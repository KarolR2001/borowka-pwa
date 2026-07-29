import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { SaleCorrectionForm } from "./SaleCorrectionForm";
import type { PreparedSaleCorrection } from "./saleCorrectionPreparation";

const stockContexts = [
  {
    availableWeightG: 10_000,
    dataSource: "SERVER" as const,
    isFresh: true,
    pendingDocumentCount: 0,
    refreshedAtIso: "2026-07-29T06:00:00.000Z",
    seasonId: "season-1",
    seasonName: "Sezon 2026"
  }
];

describe("SaleCorrectionForm", () => {
  it("shows the stock and revenue effect of returning kilograms to stock", async () => {
    const user = userEvent.setup();
    render(
      <SaleCorrectionForm
        isOnline={true}
        onPrepare={vi.fn()}
        stockContexts={stockContexts}
      />
    );

    await fillCorrection(user);

    expect(screen.getByText("+3,000 kg")).toBeVisible();
    expect(screen.getByText("13,000 kg")).toBeVisible();
    expect(screen.getByText("-37,50 zł")).toBeVisible();
    expect(screen.getByText("Zwrot do stanu i zmniejszenie przychodu")).toBeVisible();
  });

  it("prepares a separately typed decreasing-stock correction", async () => {
    const user = userEvent.setup();
    const onPrepare = vi.fn<(correction: PreparedSaleCorrection) => void>();
    render(
      <SaleCorrectionForm
        isOnline={true}
        onPrepare={onPrepare}
        stockContexts={stockContexts}
      />
    );

    await user.click(screen.getByLabelText("Dodatkowy rozchod"));
    await fillCorrection(user);
    await user.click(screen.getByRole("button", { name: "Sprawdz korekte" }));

    await waitFor(() => {
      expect(onPrepare).toHaveBeenCalledTimes(1);
    });
    expect(onPrepare).toHaveBeenCalledWith(
      expect.objectContaining({
        correctionDirection: "DECREASE_STOCK",
        entryType: "CORRECTION",
        note: "Powod korekty sprzedazy",
        projectedAvailableWeightG: 7000,
        revenueImpactGrosz: 3750,
        stockImpactG: -3000
      })
    );
  });

  it("requires a reason and blocks submission offline", async () => {
    const user = userEvent.setup();
    const onPrepare = vi.fn();
    const { rerender } = render(
      <SaleCorrectionForm
        isOnline={true}
        onPrepare={onPrepare}
        stockContexts={stockContexts}
      />
    );

    await user.type(screen.getByLabelText("Masa kg"), "3");
    await user.type(screen.getByLabelText("Cena za kg"), "12,50");
    await user.type(screen.getByLabelText("Powod korekty"), "OK");
    await user.click(screen.getByRole("button", { name: "Sprawdz korekte" }));

    expect(
      await screen.findByText("Powod korekty musi miec co najmniej 3 znaki.")
    ).toBeVisible();
    expect(onPrepare).not.toHaveBeenCalled();

    rerender(
      <SaleCorrectionForm
        isOnline={false}
        onPrepare={onPrepare}
        stockContexts={stockContexts}
      />
    );
    expect(screen.getByRole("button", { name: "Sprawdz korekte" })).toBeDisabled();
    expect(
      screen.getByText("Korekta sprzedazy wymaga polaczenia z internetem.")
    ).toBeVisible();
  });
});

async function fillCorrection(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText("Masa kg"), "3");
  await user.type(screen.getByLabelText("Cena za kg"), "12,50");
  await user.type(screen.getByLabelText("Powod korekty"), "Powod korekty sprzedazy");
}
