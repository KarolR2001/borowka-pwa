import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { CollapsibleFilters } from "./CollapsibleFilters";

describe("CollapsibleFilters", () => {
  it("closes after an interaction outside the expanded filters", async () => {
    const user = userEvent.setup();

    render(
      <>
        <CollapsibleFilters>
          <label>
            Sezon
            <select aria-label="Sezon">
              <option>Sezon 2026</option>
            </select>
          </label>
        </CollapsibleFilters>
        <button type="button">Poza filtrami</button>
      </>
    );

    await user.click(screen.getByText("Filtry"));
    expect(screen.getByLabelText("Sezon")).toBeVisible();

    await user.click(screen.getByRole("button", { name: "Poza filtrami" }));
    expect(document.querySelector("details.collapsible-filters")).not.toHaveAttribute(
      "open"
    );
  });
});
