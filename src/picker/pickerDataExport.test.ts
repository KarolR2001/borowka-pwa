import {
  createPickerDataExportCsv,
  createPickerDataExportFilename,
  filterPickerDataExport,
  type PickerDataExportResult
} from "./pickerDataExport";

describe("picker data export", () => {
  it("filters own sessions and payments by season and session date", () => {
    const filtered = filterPickerDataExport(result(), {
      fromDate: "2026-07-01",
      seasonId: "season-a",
      toDate: "2026-07-15"
    });

    expect(filtered.sessions.map((session) => session.sessionId)).toEqual([
      "session-paid"
    ]);
    expect(filtered.payments.map((payment) => payment.id)).toEqual(["payment-active"]);
    expect(filtered.seasonLabel).toBe("Sezon A");
    expect(filtered.summary).toEqual({
      accruedAmountGrosz: 5000,
      cancelledPaymentAmountGrosz: 0,
      paidAmountGrosz: 5000,
      remainingAmountGrosz: 0
    });
  });

  it("creates a Polish Excel CSV with metadata, raw values and formula safety", () => {
    const source = result();
    const csv = createPickerDataExportCsv({
      exportedAtIso: "2026-07-28T18:30:00.000Z",
      filtered: filterPickerDataExport(source, {
        fromDate: "",
        seasonId: "season-a",
        toDate: ""
      }),
      result: source
    });

    expect(csv.startsWith("\uFEFFsep=;\r\n")).toBe(true);
    expect(csv).toContain('"Wygenerowano UTC";"2026-07-28T18:30:00.000Z"');
    expect(csv).toContain('"Kompletnosc";"PELNY ODCZYT SERWERA"');
    expect(csv).toContain('"Sezon";"Sezon A"');
    expect(csv).toContain('"NALICZENIE"');
    expect(csv).toContain('"WYPLATA"');
    expect(csv).toContain('"50,00";"5000"');
    expect(csv).toContain(`"'=Plan testowy"`);
    expect(csv).not.toContain("Prywatna notatka");
    expect(createPickerDataExportFilename("2026-07-28T18:30:00.000Z")).toBe(
      "borowka-moje-dane-2026-07-28T18-30-00-000Z.csv"
    );
  });

  it("marks a cache export as incomplete and rejects a disabled export", () => {
    const cached = result({ dataSource: "CACHE" });
    const csv = createPickerDataExportCsv({
      exportedAtIso: "2026-07-28T18:30:00.000Z",
      filtered: filterPickerDataExport(cached, {
        fromDate: "",
        seasonId: "",
        toDate: ""
      }),
      result: cached
    });

    expect(csv).toContain('"Kompletnosc";"NIEPELNY - DANE Z CACHE"');
    expect(() =>
      filterPickerDataExport(result({ enabled: false }), {
        fromDate: "",
        seasonId: "",
        toDate: ""
      })
    ).toThrow("wylaczony");
  });

  it("rejects an inverted date range", () => {
    expect(() =>
      filterPickerDataExport(result(), {
        fromDate: "2026-07-20",
        seasonId: "",
        toDate: "2026-07-10"
      })
    ).toThrow("Data poczatkowa");
  });
});

function result(overrides: Partial<PickerDataExportResult> = {}): PickerDataExportResult {
  return {
    dataSource: "SERVER",
    enabled: true,
    invalidPaymentCount: 0,
    invalidSeasonCount: 0,
    invalidSessionCount: 0,
    missingSourceSessionCount: 0,
    payments: [
      {
        amountGrosz: 5000,
        id: "payment-active",
        paidBusinessDate: "2026-07-11",
        paymentMethod: "CASH",
        seasonId: "season-a",
        seasonName: "Sezon A",
        sessionBusinessDate: "2026-07-10",
        sessionId: "session-paid",
        status: "ACTIVE"
      },
      {
        amountGrosz: 3000,
        id: "payment-cancelled",
        paidBusinessDate: "2026-07-21",
        paymentMethod: "BANK_TRANSFER",
        seasonId: "season-a",
        seasonName: "Sezon A",
        sessionBusinessDate: "2026-07-20",
        sessionId: "session-closed",
        status: "CANCELLED"
      },
      {
        amountGrosz: 9000,
        id: "payment-season-b",
        paidBusinessDate: "2026-08-06",
        paymentMethod: "CASH",
        seasonId: "season-b",
        seasonName: "Sezon B",
        sessionBusinessDate: "2026-08-05",
        sessionId: "session-b",
        status: "ACTIVE"
      }
    ],
    refreshedAtIso: "2026-07-28T18:00:00.000Z",
    seasons: [
      { id: "season-a", name: "Sezon A" },
      { id: "season-b", name: "Sezon B" }
    ],
    sessions: [
      {
        amountDueGrosz: 5000,
        businessDate: "2026-07-10",
        calculationBasis: "WEIGHT",
        planName: "=Plan testowy",
        quantityPrecision: 3,
        seasonId: "season-a",
        seasonName: "Sezon A",
        sessionId: "session-paid",
        status: "PAID",
        syncIssue: null,
        totalEntryCount: 1,
        totalQuantityMilli: 5000,
        totalWeightG: 5000,
        unitLabelPlural: "kilogramy"
      },
      {
        amountDueGrosz: 3000,
        businessDate: "2026-07-20",
        calculationBasis: "QUANTITY",
        planName: "Za ubianke",
        quantityPrecision: 1,
        seasonId: "season-a",
        seasonName: "Sezon A",
        sessionId: "session-closed",
        status: "CLOSED",
        syncIssue: null,
        totalEntryCount: 2,
        totalQuantityMilli: 2000,
        totalWeightG: 4200,
        unitLabelPlural: "ubianki"
      },
      {
        amountDueGrosz: 9000,
        businessDate: "2026-08-05",
        calculationBasis: "WEIGHT",
        planName: "Za kilogram",
        quantityPrecision: 3,
        seasonId: "season-b",
        seasonName: "Sezon B",
        sessionId: "session-b",
        status: "PAID",
        syncIssue: null,
        totalEntryCount: 1,
        totalQuantityMilli: 9000,
        totalWeightG: 9000,
        unitLabelPlural: "kilogramy"
      }
    ],
    sessionSummaries: [
      {
        amountDueGrosz: 5000,
        businessDate: "2026-07-10",
        seasonId: "season-a",
        sessionId: "session-paid",
        status: "PAID"
      },
      {
        amountDueGrosz: 3000,
        businessDate: "2026-07-20",
        seasonId: "season-a",
        sessionId: "session-closed",
        status: "CLOSED"
      },
      {
        amountDueGrosz: 9000,
        businessDate: "2026-08-05",
        seasonId: "season-b",
        sessionId: "session-b",
        status: "PAID"
      }
    ],
    settingUpdatedAtIso: "2026-07-28T17:00:00.000Z",
    workerId: "worker-own",
    ...overrides
  };
}
