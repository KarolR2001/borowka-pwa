const POLISH_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

export function formatMoney(cents: number): string {
  assertSafeInteger(cents, "cents");

  return new Intl.NumberFormat("pl-PL", {
    style: "currency",
    currency: "PLN",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  })
    .format(cents / 100)
    .replace(/\u00a0/g, " ");
}

export function formatKilograms(grams: number): string {
  assertSafeInteger(grams, "grams");

  const sign = grams < 0 ? "-" : "";
  const absolute = Math.abs(grams);
  const whole = Math.floor(absolute / 1000);
  const fractional = String(absolute % 1000).padStart(3, "0");

  return `${sign}${String(whole)},${fractional} kg`;
}

export function formatBusinessDate(isoDate: string): string {
  const match = POLISH_DATE_PATTERN.exec(isoDate);

  if (!match) {
    throw new Error(`Invalid business date: ${isoDate}`);
  }

  const [, year, month, day] = match;
  return `${day}.${month}.${year}`;
}

export function parseDecimalToScaledInteger(
  input: string,
  fractionDigits: number
): number {
  if (!Number.isInteger(fractionDigits) || fractionDigits < 0 || fractionDigits > 6) {
    throw new Error("fractionDigits must be an integer from 0 to 6");
  }

  const normalized = input.trim().replace(",", ".");
  const match = /^([+-])?(\d+)(?:\.(\d+))?$/.exec(normalized);

  if (!match) {
    throw new Error(`Invalid decimal value: ${input}`);
  }

  const [, rawSign, rawWhole, rawFraction = ""] = match;

  if (rawFraction.length > fractionDigits) {
    throw new Error(`Too many fraction digits: ${input}`);
  }

  const scale = 10 ** fractionDigits;
  const sign = rawSign === "-" ? -1 : 1;
  const whole = Number(rawWhole);
  const fraction = Number(rawFraction.padEnd(fractionDigits, "0"));
  const value = sign * (whole * scale + fraction);

  assertSafeInteger(value, "scaled value");

  return value;
}

function assertSafeInteger(value: number, label: string): void {
  if (!Number.isSafeInteger(value)) {
    throw new Error(`${label} must be a safe integer`);
  }
}
