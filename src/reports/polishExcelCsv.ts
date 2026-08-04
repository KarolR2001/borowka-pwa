const FORMULA_PREFIXES = new Set(["=", "+", "-", "@"]);
const BUSINESS_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const FILENAME_PREFIX_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export const POLISH_EXCEL_CSV_MIME_TYPE = "text/csv;charset=utf-8";

export function createPolishExcelCsv(rows: readonly (readonly string[])[]): string {
  return `\uFEFFsep=;\r\n${rows
    .map((row) => row.map(escapePolishExcelCsvCell).join(";"))
    .join("\r\n")}\r\n`;
}

export function formatPolishCsvMoney(amountGrosz: number): string {
  return formatScaledInteger(amountGrosz, 2, false);
}

export function formatPolishCsvKilograms(weightG: number): string {
  return formatScaledInteger(weightG, 3, true);
}

export function formatPolishCsvQuantity(quantityMilli: number): string {
  return formatScaledInteger(quantityMilli, 3, true);
}

export function formatPolishCsvBusinessDate(value: string): string {
  const normalized = value.trim();
  const parsed = new Date(`${normalized}T00:00:00.000Z`);

  if (
    !BUSINESS_DATE_PATTERN.test(normalized) ||
    Number.isNaN(parsed.getTime()) ||
    parsed.toISOString().slice(0, 10) !== normalized
  ) {
    throw new Error("CSV wymaga daty biznesowej YYYY-MM-DD.");
  }

  return normalized;
}

export function normalizePolishCsvGeneratedAt(value: string): string {
  const normalized = value.trim();
  const parsed = new Date(normalized);

  if (!normalized || Number.isNaN(parsed.getTime())) {
    throw new Error("CSV wymaga poprawnego czasu wygenerowania.");
  }

  return parsed.toISOString();
}

export function createPolishExcelCsvFilename(
  prefix: string,
  generatedAtIso: string
): string {
  const normalizedPrefix = prefix.trim();

  if (!FILENAME_PREFIX_PATTERN.test(normalizedPrefix)) {
    throw new Error("Nazwa raportu CSV ma nieprawidlowy format.");
  }

  return `${normalizedPrefix}-${normalizePolishCsvGeneratedAt(generatedAtIso).replace(
    /[:.]/g,
    "-"
  )}.csv`;
}

function escapePolishExcelCsvCell(value: string): string {
  const protectedValue = hasFormulaPrefix(value) ? `'${value}` : value;
  return `"${protectedValue.replace(/"/g, '""')}"`;
}

function hasFormulaPrefix(value: string): boolean {
  let index = 0;

  while (index < value.length && value.charCodeAt(index) <= 0x20) {
    index += 1;
  }

  return FORMULA_PREFIXES.has(value[index] ?? "");
}

function formatScaledInteger(
  value: number,
  fractionDigits: number,
  trimTrailingZeros: boolean
): string {
  if (!Number.isSafeInteger(value)) {
    throw new Error("CSV wymaga bezpiecznej wartosci calkowitej.");
  }

  const scale = 10 ** fractionDigits;
  const sign = value < 0 ? "-" : "";
  const absolute = Math.abs(value);
  const whole = Math.trunc(absolute / scale);
  const fixedFraction = String(absolute % scale).padStart(fractionDigits, "0");
  const fraction = trimTrailingZeros ? fixedFraction.replace(/0+$/, "") : fixedFraction;

  return `${sign}${String(whole)}${fraction ? `,${fraction}` : ""}`;
}
