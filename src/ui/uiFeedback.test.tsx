import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { CollapsibleFilters } from "./CollapsibleFilters";
import { InfoHint } from "./InfoHint";
import { TransientToast } from "./TransientToast";
import { useCloseDetailsOnOutsideClick } from "./useCloseDetailsOnOutsideClick";

function DetailsOutsideClickHarness() {
  useCloseDetailsOnOutsideClick();

  return (
    <div>
      <CollapsibleFilters>
        <label>
          Status
          <select>
            <option>Wszystkie</option>
          </select>
        </label>
      </CollapsibleFilters>
      <button type="button">Poza sekcją</button>
    </div>
  );
}

describe("shared UI feedback", () => {
  it("keeps filters collapsed until the user opens them", async () => {
    const user = userEvent.setup();

    render(
      <CollapsibleFilters activeCount={1}>
        <label>
          Status
          <select>
            <option>Wszystkie</option>
          </select>
        </label>
      </CollapsibleFilters>
    );

    const details = screen.getByText("Filtry").closest("details");
    expect(details).not.toHaveAttribute("open");

    await user.click(screen.getByText("Filtry"));
    expect(details).toHaveAttribute("open");
  });

  it("reveals a field explanation on demand", async () => {
    const user = userEvent.setup();

    render(<InfoHint text="Ta wartość określa sposób rozliczenia zbioru." />);

    const details = screen.getByLabelText("Pokaż wyjaśnienie").closest("details");
    expect(details).not.toHaveAttribute("open");

    await user.click(screen.getByLabelText("Pokaż wyjaśnienie"));
    expect(details).toHaveAttribute("open");
    expect(screen.getByRole("note")).toHaveTextContent("sposób rozliczenia");
  });

  it("closes an expanded section after a click outside it", async () => {
    const user = userEvent.setup();

    render(<DetailsOutsideClickHarness />);

    const details = screen.getByText("Filtry").closest("details");
    await user.click(screen.getByText("Filtry"));
    expect(details).toHaveAttribute("open");

    await user.click(screen.getByRole("button", { name: "Poza sekcją" }));
    expect(details).not.toHaveAttribute("open");
  });

  it("dismisses a transient notification after its timeout", () => {
    vi.useFakeTimers();
    const onDismiss = vi.fn();

    render(
      <TransientToast
        message="Połączenie zostało przywrócone. Pracujesz online."
        onDismiss={onDismiss}
        timeoutMs={1000}
        tone="SUCCESS"
      />
    );

    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(onDismiss).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });
});
