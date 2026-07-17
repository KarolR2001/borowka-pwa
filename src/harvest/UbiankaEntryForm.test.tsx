import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import {
  UbiankaEntryForm,
  createUbiankaEntryDraft,
  type UbiankaEntryDraft
} from "./UbiankaEntryForm";

describe("UbiankaEntryForm", () => {
  it("renders default quantity and optional weight notice", () => {
    render(
      <UbiankaEntryForm
        allowBatchQuantity={true}
        onSubmit={vi.fn()}
        weightRequired={false}
      />
    );

    expect(screen.getByLabelText("Ilosc")).toHaveValue("1");
    expect(screen.getByLabelText("Waga kg")).toHaveValue("");
    expect(screen.getByText("Waga opcjonalna")).toBeInTheDocument();
    expect(
      screen.getByText("Wpis bez wagi nie zwiekszy stanu kilogramow.")
    ).toBeInTheDocument();
    expect(screen.getByText("1 ubianka")).toBeInTheDocument();
  });

  it("uses quick quantity buttons and repeat-last quantity", async () => {
    const user = userEvent.setup();

    render(
      <UbiankaEntryForm
        allowBatchQuantity={true}
        lastQuantityMilli={1500}
        onSubmit={vi.fn()}
        weightRequired={false}
      />
    );

    await user.click(screen.getByRole("button", { name: "0,5" }));
    expect(screen.getByLabelText("Ilosc")).toHaveValue("0,5");
    expect(screen.getByText("0,5 ubianka")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "2" }));
    expect(screen.getByLabelText("Ilosc")).toHaveValue("2");

    await user.click(screen.getByRole("button", { name: "Powtorz ilosc" }));
    expect(screen.getByLabelText("Ilosc")).toHaveValue("1,5");
  });

  it("submits a local draft and resets the form without repeating weight", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn<(draft: UbiankaEntryDraft) => void>();

    render(
      <UbiankaEntryForm
        allowBatchQuantity={true}
        onSubmit={onSubmit}
        weightRequired={false}
      />
    );

    await user.clear(screen.getByLabelText("Ilosc"));
    await user.type(screen.getByLabelText("Ilosc"), "2");
    await user.type(screen.getByLabelText("Waga kg"), "8,750");
    await user.click(screen.getByRole("button", { name: "Zapisz wpis" }));

    expect(onSubmit).toHaveBeenCalledWith({
      quantityMilli: 2000,
      weightG: 8750
    });
    expect(screen.getByLabelText("Ilosc")).toHaveValue("1");
    expect(screen.getByLabelText("Waga kg")).toHaveValue("");
    expect(screen.getByText("Wpis dodany lokalnie.")).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByLabelText("Waga kg")).toHaveFocus();
    });
  });

  it("allows an optional missing weight", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn<(draft: UbiankaEntryDraft) => void>();

    render(
      <UbiankaEntryForm
        allowBatchQuantity={true}
        onSubmit={onSubmit}
        weightRequired={false}
      />
    );

    await user.click(screen.getByRole("button", { name: "Zapisz wpis" }));

    expect(onSubmit).toHaveBeenCalledWith({
      quantityMilli: 1000,
      weightG: null
    });
  });

  it("requires weight when the plan requires weight", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();

    render(
      <UbiankaEntryForm
        allowBatchQuantity={true}
        onSubmit={onSubmit}
        weightRequired={true}
      />
    );

    await user.click(screen.getByRole("button", { name: "Zapisz wpis" }));

    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByText("Podaj wage wpisu.")).toBeInTheDocument();
  });

  it("blocks batch quantity when the plan does not allow it", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();

    render(
      <UbiankaEntryForm
        allowBatchQuantity={false}
        onSubmit={onSubmit}
        weightRequired={false}
      />
    );

    expect(screen.getByRole("button", { name: "2" })).toBeDisabled();

    await user.clear(screen.getByLabelText("Ilosc"));
    await user.type(screen.getByLabelText("Ilosc"), "2");
    await user.click(screen.getByRole("button", { name: "Zapisz wpis" }));

    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByText("Plan nie dopuszcza wpisu zbiorczego.")).toBeInTheDocument();
  });

  it("creates draft values from decimal input", () => {
    expect(
      createUbiankaEntryDraft({
        quantity: "0,5",
        weight: "1.250",
        weightRequired: false,
        allowBatchQuantity: true
      })
    ).toEqual({
      quantityMilli: 500,
      weightG: 1250
    });
    expect(() =>
      createUbiankaEntryDraft({
        quantity: "0",
        weight: "",
        weightRequired: false,
        allowBatchQuantity: true
      })
    ).toThrow("Ilosc musi byc wieksza od zera.");
    expect(() =>
      createUbiankaEntryDraft({
        quantity: "1",
        weight: "-1",
        weightRequired: false,
        allowBatchQuantity: true
      })
    ).toThrow("Waga musi byc wieksza od zera.");
  });
});
