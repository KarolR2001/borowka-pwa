import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";

import { DashboardPeriodFilter } from "./DashboardPeriodFilter";
import {
  DEFAULT_DASHBOARD_PERIOD,
  type DashboardPeriodSelection
} from "./dashboardPeriod";

describe("DashboardPeriodFilter", () => {
  it("offers all presets and initializes an editable custom range", async () => {
    const user = userEvent.setup();

    render(<FilterHarness />);

    await user.click(screen.getByText("Zakres dat"));
    expect(screen.getByRole("button", { name: "Dzisiaj" })).toBeVisible();
    expect(
      screen.getByRole("button", { name: "Cały sezon", pressed: true })
    ).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Własny zakres" }));

    expect(screen.getByLabelText("Od")).toHaveValue("2026-07-29");
    expect(screen.getByLabelText("Do")).toHaveValue("2026-07-29");

    await user.clear(screen.getByLabelText("Od"));
    expect(screen.getByText("Podaj początek i koniec własnego zakresu.")).toBeVisible();
  });

  it("closes the date options after clicking outside the filter", async () => {
    const user = userEvent.setup();

    render(
      <>
        <FilterHarness />
        <button type="button">Poza zakresem dat</button>
      </>
    );

    await user.click(screen.getByText("Zakres dat"));
    expect(screen.getByRole("button", { name: "Dzisiaj" })).toBeVisible();

    await user.click(screen.getByRole("button", { name: "Poza zakresem dat" }));
    expect(
      document.querySelector("details.dashboard-period-collapse")
    ).not.toHaveAttribute("open");
  });
});

function FilterHarness() {
  const [selection, setSelection] = useState<DashboardPeriodSelection>(
    DEFAULT_DASHBOARD_PERIOD
  );

  return (
    <DashboardPeriodFilter
      idPrefix="test"
      onChange={setSelection}
      selection={selection}
      todayBusinessDate="2026-07-29"
    />
  );
}
