import {
  REPORT_CATALOG,
  REPORT_IDS,
  reportDefinition,
  reportsForRole
} from "./reportCatalog";

describe("MVP report catalog", () => {
  it("contains every planned report exactly once in the approved order", () => {
    expect(REPORT_CATALOG.map((report) => report.id)).toEqual(REPORT_IDS);
    expect(new Set(REPORT_CATALOG.map((report) => report.id)).size).toBe(
      REPORT_IDS.length
    );
  });

  it("defines audience, filters, columns, sources and summation for every report", () => {
    for (const report of REPORT_CATALOG) {
      expect(report.audiences.length, report.id).toBeGreaterThan(0);
      expect(report.filters.length, report.id).toBeGreaterThan(0);
      expect(report.columns.length, report.id).toBeGreaterThan(0);
      expect(report.sources.length, report.id).toBeGreaterThan(0);
      expect(report.summationRules.length, report.id).toBeGreaterThan(0);
      expect(new Set(report.columns.map((column) => column.id)).size, report.id).toBe(
        report.columns.length
      );
      for (const column of report.columns) {
        expect(column.id, report.id).toMatch(/^[a-z][a-z0-9_]*$/);
        expect(column.label.trim(), report.id).not.toBe("");
      }
    }
  });

  it("keeps administrative reports away from operator and picker navigation", () => {
    expect(reportsForRole("ADMIN").map((report) => report.id)).toEqual(
      REPORT_IDS.filter((id) => id !== "PICKER_OWN_SUMMARY")
    );
    expect(reportsForRole("OPERATOR")).toEqual([]);
    expect(reportsForRole("PICKER").map((report) => report.id)).toEqual([
      "PICKER_OWN_SUMMARY"
    ]);
  });

  it("gates the private picker report with the existing feature flag", () => {
    const pickerReport = reportDefinition("PICKER_OWN_SUMMARY");

    expect(pickerReport.audiences).toEqual(["PICKER"]);
    expect(pickerReport.requiredFeatureFlag).toBe("pickerOwnReportExportEnabled");
    expect(pickerReport.sources).toContain("appSettings");
    expect(pickerReport.sources).toContain("harvestSessions");
    expect(pickerReport.sources).toContain("payments");

    for (const reportId of REPORT_IDS.filter((id) => id !== "PICKER_OWN_SUMMARY")) {
      expect(reportDefinition(reportId).requiredFeatureFlag).toBeNull();
    }
  });

  it("uses the approved result name and formula instead of profit", () => {
    const result = reportDefinition("RESULT_AFTER_HARVEST_COST");

    expect(result.label).toBe("Wynik po koszcie zbioru");
    expect(result.columns.map((column) => column.id)).toContain(
      "result_after_harvest_cost_grosz"
    );
    expect(result.summationRules.join(" ")).toContain(
      "Wynik to przychod minus koszt zbioru"
    );
    expect(
      REPORT_CATALOG.flatMap((report) => [
        report.label,
        ...report.columns.map((column) => column.label)
      ]).some((label) => label.toLocaleLowerCase("pl-PL").includes("zysk"))
    ).toBe(false);
  });
});
