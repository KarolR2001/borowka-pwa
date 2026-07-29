import { CALCULATION_RULE_VERSION } from "../domain/domainConfiguration";

export const SALE_REVENUE_CALCULATION_VERSION = String(CALCULATION_RULE_VERSION);
export const SALE_REVENUE_ROUNDING_RULE = "HALF_UP_TO_GROSZ" as const;
export const SALE_REVENUE_WEIGHT_DENOMINATOR_G = 1000;
export const MAX_SALE_WEIGHT_G = 1_000_000_000;
export const MAX_SALE_PRICE_GROSZ_PER_KG = 100_000_000;

export type SaleRevenueCalculation = {
  calculationVersion: string;
  exactNumeratorGroszGram: string;
  priceGroszPerKg: number;
  remainderMilliGrosz: number;
  roundingRule: typeof SALE_REVENUE_ROUNDING_RULE;
  totalGrosz: number;
  weightG: number;
  wholeGroszBeforeRounding: number;
};

export function calculateSaleRevenue({
  priceGroszPerKg,
  weightG
}: {
  priceGroszPerKg: number;
  weightG: number;
}): SaleRevenueCalculation {
  assertSafePositiveInteger(
    weightG,
    "Masa sprzedazy musi byc dodatnia liczba calkowita gramow."
  );
  assertSafeNonNegativeInteger(
    priceGroszPerKg,
    "Cena sprzedazy musi byc nieujemna liczba calkowita groszy za kilogram."
  );

  if (weightG > MAX_SALE_WEIGHT_G) {
    throw new Error("Masa sprzedazy przekracza limit jednego dokumentu.");
  }

  if (priceGroszPerKg > MAX_SALE_PRICE_GROSZ_PER_KG) {
    throw new Error("Cena sprzedazy przekracza limit jednego dokumentu.");
  }

  const numerator = BigInt(weightG) * BigInt(priceGroszPerKg);
  const denominator = BigInt(SALE_REVENUE_WEIGHT_DENOMINATOR_G);
  const wholeGrosz = numerator / denominator;
  const remainderMilliGrosz = Number(numerator % denominator);
  const roundedGrosz = (numerator + denominator / 2n) / denominator;

  if (
    wholeGrosz > BigInt(Number.MAX_SAFE_INTEGER) ||
    roundedGrosz > BigInt(Number.MAX_SAFE_INTEGER)
  ) {
    throw new Error("Przychod sprzedazy przekracza bezpieczny zakres liczbowy.");
  }

  return {
    calculationVersion: SALE_REVENUE_CALCULATION_VERSION,
    exactNumeratorGroszGram: numerator.toString(),
    priceGroszPerKg,
    remainderMilliGrosz,
    roundingRule: SALE_REVENUE_ROUNDING_RULE,
    totalGrosz: Number(roundedGrosz),
    weightG,
    wholeGroszBeforeRounding: Number(wholeGrosz)
  };
}

function assertSafePositiveInteger(value: number, message: string): void {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error(message);
  }
}

function assertSafeNonNegativeInteger(value: number, message: string): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error(message);
  }
}
