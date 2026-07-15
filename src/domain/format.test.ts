import {
  formatBusinessDate,
  formatKilograms,
  formatMoney,
  parseDecimalToScaledInteger
} from "./format";

describe("domain formatting", () => {
  it("formats money from grosze", () => {
    expect(formatMoney(501615)).toBe("5016,15 zł");
  });

  it("formats grams as kilograms with three decimal places", () => {
    expect(formatKilograms(631510)).toBe("631,510 kg");
    expect(formatKilograms(-250)).toBe("-0,250 kg");
  });

  it("formats business dates without timezone shifts", () => {
    expect(formatBusinessDate("2026-07-15")).toBe("15.07.2026");
  });

  it("parses comma and dot decimal values to integer minor units", () => {
    expect(parseDecimalToScaledInteger("10,50", 2)).toBe(1050);
    expect(parseDecimalToScaledInteger("2.300", 3)).toBe(2300);
    expect(parseDecimalToScaledInteger("-0,250", 3)).toBe(-250);
  });

  it("rejects excess decimal precision", () => {
    expect(() => parseDecimalToScaledInteger("1,234", 2)).toThrow(
      "Too many fraction digits"
    );
  });
});
