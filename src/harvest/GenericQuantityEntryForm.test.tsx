import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import {
  GenericQuantityEntryForm,
  calculateQuantityPreviewGrosz,
  createGenericQuantityEntryDraft,
  isQuantityAllowedByPrecision,
  type GenericQuantityEntryDraft,
  type GenericQuantityPlanConfig
} from "./GenericQuantityEntryForm";

const cratePlan: GenericQuantityPlanConfig = {
  name: "Za skrzynke",
  unitLabelSingular: "skrzynka",
  unitLabelPlural: "skrzynki",
  quantityPrecision: 0,
  weightRequired: true,
  allowBatchQuantity: true,
  description: "Plan do zbiorczych skrzynek z wymagana waga.",
  rateGroszPerUnit: 2200
};

const hourPlan: GenericQuantityPlanConfig = {
  name: "Za godzine",
  unitLabelSingular: "godzina",
  unitLabelPlural: "godziny",
  quantityPrecision: 2,
  weightRequired: false,
  allowBatchQuantity: true,
  description: null,
  rateGroszPerUnit: 3000
};

describe("GenericQuantityEntryForm", () => {
  it("renders plan-driven unit, precision, weight requirement, description and example", () => {
    render(<GenericQuantityEntryForm onSubmit={vi.fn()} plan={cratePlan} />);

    expect(screen.getByRole("heading", { name: "Za skrzynke" })).toBeInTheDocument();
    expect(
      screen.getByText("Plan do zbiorczych skrzynek z wymagana waga.")
    ).toBeInTheDocument();
    expect(screen.getByText("Waga wymagana")).toBeInTheDocument();
    expect(screen.getByText("Precyzja: 0")).toBeInTheDocument();
    expect(screen.getByText("Wpis zbiorczy dozwolony")).toBeInTheDocument();
    expect(screen.getByText("22,00 zł / skrzynka")).toBeInTheDocument();
    expect(screen.getByText("1 skrzynka")).toBeInTheDocument();
    expect(screen.getByText("22,00 zł")).toBeInTheDocument();
  });

  it("shows optional weight notice and generic description fallback", () => {
    render(<GenericQuantityEntryForm onSubmit={vi.fn()} plan={hourPlan} />);

    expect(
      screen.getByText("Plan ilosciowy generowany z konfiguracji.")
    ).toBeInTheDocument();
    expect(screen.getByText("Waga opcjonalna")).toBeInTheDocument();
    expect(
      screen.getByText("Wpis bez wagi nie zwiekszy stanu kilogramow.")
    ).toBeInTheDocument();
  });

  it("submits local draft and resets fields", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn<(draft: GenericQuantityEntryDraft) => void>();

    render(<GenericQuantityEntryForm onSubmit={onSubmit} plan={cratePlan} />);

    await user.clear(screen.getByLabelText("Ilosc skrzynka"));
    await user.type(screen.getByLabelText("Ilosc skrzynka"), "2");
    await user.type(screen.getByLabelText("Waga kg"), "14,250");
    await user.click(screen.getByRole("button", { name: "Zapisz wpis" }));

    expect(onSubmit).toHaveBeenCalledWith({
      quantityMilli: 2000,
      weightG: 14250,
      amountPreviewGrosz: 4400
    });
    expect(screen.getByLabelText("Ilosc skrzynka")).toHaveValue("1");
    expect(screen.getByLabelText("Waga kg")).toHaveValue("");
    expect(screen.getByText("Wpis ilosciowy dodany lokalnie.")).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByLabelText("Ilosc skrzynka")).toHaveFocus();
    });
  });

  it("accepts configured decimal precision and optional missing weight", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn<(draft: GenericQuantityEntryDraft) => void>();

    render(<GenericQuantityEntryForm onSubmit={onSubmit} plan={hourPlan} />);

    await user.clear(screen.getByLabelText("Ilosc godzina"));
    await user.type(screen.getByLabelText("Ilosc godzina"), "1,25");
    await user.click(screen.getByRole("button", { name: "Zapisz wpis" }));

    expect(onSubmit).toHaveBeenCalledWith({
      quantityMilli: 1250,
      weightG: null,
      amountPreviewGrosz: 3750
    });
  });

  it("rejects quantity outside configured precision", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();

    render(<GenericQuantityEntryForm onSubmit={onSubmit} plan={cratePlan} />);

    await user.clear(screen.getByLabelText("Ilosc skrzynka"));
    await user.type(screen.getByLabelText("Ilosc skrzynka"), "1,5");
    await user.type(screen.getByLabelText("Waga kg"), "10");
    await user.click(screen.getByRole("button", { name: "Zapisz wpis" }));

    expect(onSubmit).not.toHaveBeenCalled();
    expect(
      screen.getByText("Ilosc nie miesci sie w precyzji planu.")
    ).toBeInTheDocument();
  });

  it("rejects batch quantity when the plan disallows it and required missing weight", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    const singlePlan: GenericQuantityPlanConfig = {
      ...cratePlan,
      allowBatchQuantity: false
    };

    render(<GenericQuantityEntryForm onSubmit={onSubmit} plan={singlePlan} />);

    expect(screen.getByText("Tylko 1 jednostka")).toBeInTheDocument();

    await user.clear(screen.getByLabelText("Ilosc skrzynka"));
    await user.type(screen.getByLabelText("Ilosc skrzynka"), "2");
    await user.type(screen.getByLabelText("Waga kg"), "10");
    await user.click(screen.getByRole("button", { name: "Zapisz wpis" }));
    expect(screen.getByText("Plan nie dopuszcza wpisu zbiorczego.")).toBeInTheDocument();

    await user.clear(screen.getByLabelText("Ilosc skrzynka"));
    await user.type(screen.getByLabelText("Ilosc skrzynka"), "1");
    await user.clear(screen.getByLabelText("Waga kg"));
    await user.click(screen.getByRole("button", { name: "Zapisz wpis" }));
    expect(screen.getByText("Podaj wage wpisu.")).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("validates draft helpers and precision steps", () => {
    expect(isQuantityAllowedByPrecision(1000, 0)).toBe(true);
    expect(isQuantityAllowedByPrecision(1500, 0)).toBe(false);
    expect(isQuantityAllowedByPrecision(1500, 1)).toBe(true);
    expect(isQuantityAllowedByPrecision(1250, 1)).toBe(false);
    expect(isQuantityAllowedByPrecision(1250, 2)).toBe(true);
    expect(calculateQuantityPreviewGrosz(1250, 3000)).toBe(3750);
    expect(
      createGenericQuantityEntryDraft({
        quantity: "1,25",
        weight: "",
        plan: hourPlan
      })
    ).toEqual({
      quantityMilli: 1250,
      weightG: null,
      amountPreviewGrosz: 3750
    });
  });
});
