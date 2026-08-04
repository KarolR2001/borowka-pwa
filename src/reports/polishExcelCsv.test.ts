import {
  createPolishExcelCsv,
  createPolishExcelCsvFilename,
  formatPolishCsvBusinessDate,
  formatPolishCsvKilograms,
  formatPolishCsvMoney,
  formatPolishCsvQuantity,
  normalizePolishCsvGeneratedAt
} from "./polishExcelCsv";

describe("Polish Excel CSV", () => {
  it("uses UTF-8 BOM, semicolon directive, CRLF, quoting and Polish text", () => {
    const csv = createPolishExcelCsv([
      ["Nazwa", "Kwota"],
      ["Zażółć gęślą", "12,50"],
      ['Cytat "A"; druga linia\nwartosci', "0,00"]
    ]);

    expect(csv.startsWith("\uFEFFsep=;\r\n")).toBe(true);
    expect(csv).toContain('"Zażółć gęślą";"12,50"');
    expect(csv).toContain('"Cytat ""A""; druga linia\nwartosci"');
    expect(csv.replace(/\r\n/g, "")).not.toContain('\n"');
    expect(csv.endsWith("\r\n")).toBe(true);
  });

  it("neutralizes formula prefixes including leading whitespace and controls", () => {
    const csv = createPolishExcelCsv([
      ["=SUM(A1:A2)", "+CMD", "-10,00", "@IMPORT", ' \t=HYPERLINK("x")']
    ]);

    expect(csv).toContain(`"'=SUM(A1:A2)"`);
    expect(csv).toContain(`"'+CMD"`);
    expect(csv).toContain(`"'-10,00"`);
    expect(csv).toContain(`"'@IMPORT"`);
    expect(csv).toContain(`"' \t=HYPERLINK(""x"")"`);
  });

  it("formats source integers without floating point rounding", () => {
    expect(formatPolishCsvMoney(0)).toBe("0,00");
    expect(formatPolishCsvMoney(12_345)).toBe("123,45");
    expect(formatPolishCsvMoney(-125)).toBe("-1,25");
    expect(formatPolishCsvKilograms(1234)).toBe("1,234");
    expect(formatPolishCsvKilograms(5000)).toBe("5");
    expect(formatPolishCsvQuantity(1200)).toBe("1,2");
    expect(() => formatPolishCsvMoney(Number.MAX_VALUE)).toThrow("bezpiecznej");
  });

  it("keeps business dates and generated timestamps stable", () => {
    expect(formatPolishCsvBusinessDate("2026-08-04")).toBe("2026-08-04");
    expect(normalizePolishCsvGeneratedAt("2026-08-04T18:30:00+02:00")).toBe(
      "2026-08-04T16:30:00.000Z"
    );
    expect(createPolishExcelCsvFilename("borowka-raport", "2026-08-04T16:30:00Z")).toBe(
      "borowka-raport-2026-08-04T16-30-00-000Z.csv"
    );
    expect(() => formatPolishCsvBusinessDate("2026-02-30")).toThrow("YYYY-MM-DD");
    expect(() => formatPolishCsvBusinessDate("2026-99-01")).toThrow("YYYY-MM-DD");
    expect(() =>
      createPolishExcelCsvFilename("../raport", "2026-08-04T16:30:00Z")
    ).toThrow("format");
  });
});
