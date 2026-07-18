import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import {
  WeightEntryForm,
  calculateWeightEntryPreviewGrosz,
  createWeightEntryDraft,
  type WeightEntryDraft
} from "./WeightEntryForm";

describe("WeightEntryForm", () => {
  it("renders focused weight input and informational preview", () => {
    render(<WeightEntryForm onSubmit={vi.fn()} rateGroszPerKg={1000} />);

    expect(screen.getByLabelText("Waga kg")).toHaveValue("");
    expect(screen.getByText("10,00 zł / kg")).toBeInTheDocument();
    expect(screen.getByText("0,000 kg")).toBeInTheDocument();
    expect(screen.getByText("0,00 zł")).toBeInTheDocument();
    expect(
      screen.getByText(
        "Podglad wpisu jest informacyjny. Oficjalna kwota jest liczona raz przy zamknieciu sesji."
      )
    ).toBeInTheDocument();
  });

  it("understands comma and dot decimals and shows preview amount", async () => {
    const user = userEvent.setup();

    render(<WeightEntryForm onSubmit={vi.fn()} rateGroszPerKg={1200} />);

    await user.type(screen.getByLabelText("Waga kg"), "1,250");

    expect(screen.getByText("1,250 kg")).toBeInTheDocument();
    expect(screen.getByText("15,00 zł")).toBeInTheDocument();

    await user.clear(screen.getByLabelText("Waga kg"));
    await user.type(screen.getByLabelText("Waga kg"), "0.500");

    expect(screen.getByText("0,500 kg")).toBeInTheDocument();
    expect(screen.getByText("6,00 zł")).toBeInTheDocument();
  });

  it("submits exact grams and resets the weight input", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn<(draft: WeightEntryDraft) => void>();

    render(<WeightEntryForm onSubmit={onSubmit} rateGroszPerKg={1000} />);

    await user.type(screen.getByLabelText("Waga kg"), "3,495");
    await user.click(screen.getByRole("button", { name: "Zapisz wpis" }));

    expect(onSubmit).toHaveBeenCalledWith({
      quantityMilli: 3495,
      weightG: 3495,
      amountPreviewGrosz: 3495
    });
    expect(screen.getByLabelText("Waga kg")).toHaveValue("");
    expect(screen.getByText("Wpis wagowy dodany lokalnie.")).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByLabelText("Waga kg")).toHaveFocus();
    });
  });

  it("blocks a second submit while the local operation is pending", async () => {
    const user = userEvent.setup();
    let resolveSubmit!: () => void;
    const onSubmit = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveSubmit = resolve;
        })
    );

    render(<WeightEntryForm onSubmit={onSubmit} rateGroszPerKg={1000} />);

    await user.type(screen.getByLabelText("Waga kg"), "1");

    const submitButton = screen.getByRole("button", { name: "Zapisz wpis" });

    await user.click(submitButton);
    await user.click(submitButton);

    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(submitButton).toBeDisabled();

    resolveSubmit();

    await waitFor(() => {
      expect(submitButton).toBeEnabled();
    });
  });

  it("rejects empty, zero, negative and over-precision values", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();

    render(<WeightEntryForm onSubmit={onSubmit} rateGroszPerKg={1000} />);

    await user.click(screen.getByRole("button", { name: "Zapisz wpis" }));

    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByText("Invalid decimal value:")).toBeInTheDocument();

    await user.type(screen.getByLabelText("Waga kg"), "0");
    await user.click(screen.getByRole("button", { name: "Zapisz wpis" }));
    expect(screen.getByText("Waga musi byc wieksza od zera.")).toBeInTheDocument();

    await user.clear(screen.getByLabelText("Waga kg"));
    await user.type(screen.getByLabelText("Waga kg"), "-1");
    await user.click(screen.getByRole("button", { name: "Zapisz wpis" }));
    expect(screen.getByText("Waga musi byc wieksza od zera.")).toBeInTheDocument();

    await user.clear(screen.getByLabelText("Waga kg"));
    await user.type(screen.getByLabelText("Waga kg"), "1,2345");
    await user.click(screen.getByRole("button", { name: "Zapisz wpis" }));
    expect(screen.getByText("Too many fraction digits: 1,2345")).toBeInTheDocument();
  });

  it("creates drafts and preview amounts from exact grams", () => {
    expect(
      createWeightEntryDraft({
        weight: "0,500",
        rateGroszPerKg: 333
      })
    ).toEqual({
      quantityMilli: 500,
      weightG: 500,
      amountPreviewGrosz: 167
    });
    expect(calculateWeightEntryPreviewGrosz(3495, 1000)).toBe(3495);
    expect(() =>
      createWeightEntryDraft({
        weight: "1",
        rateGroszPerKg: 0
      })
    ).toThrow("Stawka za kilogram musi byc dodatnia liczba calkowita.");
  });

  it("disables submit and input when disabled", () => {
    render(<WeightEntryForm disabled={true} onSubmit={vi.fn()} rateGroszPerKg={1000} />);

    expect(screen.getByLabelText("Waga kg")).toBeDisabled();
    expect(screen.getByRole("button", { name: "Zapisz wpis" })).toBeDisabled();
  });
});
