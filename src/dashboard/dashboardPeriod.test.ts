import {
  businessDateMatchesPeriod,
  currentWarsawBusinessDate,
  dashboardPeriodSelectionError,
  resolveDashboardPeriod,
  selectionForDashboardPeriodPreset
} from "./dashboardPeriod";

describe("dashboard period", () => {
  it("uses Europe/Warsaw when UTC is still on the previous business day", () => {
    expect(currentWarsawBusinessDate(new Date("2026-03-29T22:30:00.000Z"))).toBe(
      "2026-03-30"
    );
  });

  it("resolves today, ISO week and month from the business date", () => {
    expect(
      resolveDashboardPeriod(
        { customFromDate: "", customToDate: "", preset: "TODAY" },
        { todayBusinessDate: "2026-08-02" }
      )
    ).toMatchObject({
      dateBasis: "BUSINESS_DATE",
      fromDate: "2026-08-02",
      toDate: "2026-08-02"
    });
    expect(
      resolveDashboardPeriod(
        { customFromDate: "", customToDate: "", preset: "CURRENT_WEEK" },
        { todayBusinessDate: "2026-08-02" }
      )
    ).toMatchObject({
      fromDate: "2026-07-27",
      toDate: "2026-08-02"
    });
    expect(
      resolveDashboardPeriod(
        { customFromDate: "", customToDate: "", preset: "CURRENT_MONTH" },
        { todayBusinessDate: "2028-02-12" }
      )
    ).toMatchObject({
      fromDate: "2028-02-01",
      toDate: "2028-02-29"
    });
  });

  it("uses season boundaries and validates a custom inclusive range", () => {
    const season = resolveDashboardPeriod(
      { customFromDate: "", customToDate: "", preset: "SEASON" },
      {
        seasonEndDate: "2026-09-30",
        seasonStartDate: "2026-07-01",
        todayBusinessDate: "2026-07-29"
      }
    );
    const custom = resolveDashboardPeriod(
      {
        customFromDate: "2026-07-10",
        customToDate: "2026-07-12",
        preset: "CUSTOM"
      },
      { todayBusinessDate: "2026-07-29" }
    );

    expect(season).toMatchObject({
      fromDate: "2026-07-01",
      toDate: "2026-09-30"
    });
    expect(businessDateMatchesPeriod("2026-07-10", custom)).toBe(true);
    expect(businessDateMatchesPeriod("2026-07-12", custom)).toBe(true);
    expect(businessDateMatchesPeriod("2026-07-13", custom)).toBe(false);
    expect(custom.label).toContain("10.07.2026 - 12.07.2026");
  });

  it("prepares custom dates and rejects incomplete or reversed input", () => {
    expect(
      selectionForDashboardPeriodPreset(
        { customFromDate: "", customToDate: "", preset: "SEASON" },
        "CUSTOM",
        "2026-07-29"
      )
    ).toEqual({
      customFromDate: "2026-07-29",
      customToDate: "2026-07-29",
      preset: "CUSTOM"
    });
    expect(
      dashboardPeriodSelectionError({
        customFromDate: "",
        customToDate: "2026-07-29",
        preset: "CUSTOM"
      })
    ).toBe("Podaj poczatek i koniec wlasnego zakresu.");
    expect(
      dashboardPeriodSelectionError({
        customFromDate: "2026-07-30",
        customToDate: "2026-07-29",
        preset: "CUSTOM"
      })
    ).toBe("Data poczatkowa nie moze byc pozniejsza niz koncowa.");
  });
});
