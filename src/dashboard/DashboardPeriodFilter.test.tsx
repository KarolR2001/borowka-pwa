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

    expect(screen.getByLabelText("Okres")).toHaveValue("SEASON");
    await user.selectOptions(screen.getByLabelText("Okres"), "CUSTOM");

    expect(screen.getByLabelText("Od")).toHaveValue("2026-07-29");
    expect(screen.getByLabelText("Do")).toHaveValue("2026-07-29");

    await user.clear(screen.getByLabelText("Od"));
    expect(screen.getByText("Podaj poczatek i koniec wlasnego zakresu.")).toBeVisible();
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
