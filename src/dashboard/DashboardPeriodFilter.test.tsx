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

    const periodSelect = screen.getByLabelText(/Zakres dat/);
    expect(periodSelect).toHaveValue("SEASON");
    await user.selectOptions(periodSelect, "Własny zakres");

    expect(screen.getByLabelText("Od")).toHaveValue("2026-07-29");
    expect(screen.getByLabelText("Do")).toHaveValue("2026-07-29");

    await user.clear(screen.getByLabelText("Od"));
    expect(screen.getByText("Podaj początek i koniec własnego zakresu.")).toBeVisible();
  });

  it("keeps the classic dropdown available without an expandable filter", async () => {
    const user = userEvent.setup();

    render(
      <>
        <FilterHarness />
        <button type="button">Poza zakresem dat</button>
      </>
    );

    await user.click(screen.getByRole("button", { name: "Poza zakresem dat" }));
    expect(screen.getByLabelText(/Zakres dat/)).toBeVisible();
    expect(document.querySelector("details.dashboard-period-collapse")).toBeNull();
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
