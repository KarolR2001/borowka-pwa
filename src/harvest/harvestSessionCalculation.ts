import type { SettlementCalculationBasis } from "../domain/domainConfiguration";
import {
  HARVEST_SESSION_CALCULATION_VERSION,
  type HarvestSessionDocument
} from "./openHarvestSession";

export type CalculableHarvestEntryStatus = "ACTIVE" | "CANCELLED";

export type CalculableHarvestEntry = {
  id: string;
  status: CalculableHarvestEntryStatus;
  quantityMilli: number;
  weightG: number | null;
};

export type HarvestSessionCalculationSource = Pick<
  HarvestSessionDocument,
  "calculationBasisSnapshot" | "rateGroszSnapshot"
>;

export type HarvestSessionCalculationResult = {
  calculationVersion: string;
  calculationBasis: SettlementCalculationBasis;
  activeEntryCount: number;
  skippedCancelledEntryCount: number;
  totalQuantityMilli: number;
  totalWeightG: number;
  missingWeightEntryCount: number;
  amountDueGrosz: number;
};

export type HarvestSessionRunningTotals = Pick<
  HarvestSessionCalculationResult,
  "activeEntryCount" | "totalQuantityMilli" | "totalWeightG"
>;

export function calculateHarvestSessionTotals({
  session,
  entries
}: {
  session: HarvestSessionCalculationSource;
  entries: readonly CalculableHarvestEntry[];
}): HarvestSessionCalculationResult {
  const rateGrosz = assertSafePositiveInteger(
    session.rateGroszSnapshot,
    "Stawka sesji musi byc wieksza od zera."
  );
  let activeEntryCount = 0;
  let skippedCancelledEntryCount = 0;
  let totalQuantityMilli = 0;
  let totalWeightG = 0;
  let missingWeightEntryCount = 0;

  for (const entry of entries) {
    if (entry.status === "CANCELLED") {
      skippedCancelledEntryCount += 1;
      continue;
    }

    assertActiveEntry(entry);
    activeEntryCount = addSafeIntegers(
      activeEntryCount,
      1,
      "Liczba aktywnych wpisow przekracza bezpieczny zakres."
    );
    totalQuantityMilli = addSafeIntegers(
      totalQuantityMilli,
      entry.quantityMilli,
      "Suma ilosci sesji przekracza bezpieczny zakres."
    );

    if (entry.weightG === null) {
      missingWeightEntryCount += 1;

      if (session.calculationBasisSnapshot === "WEIGHT") {
        throw new Error("Plan wagowy wymaga wagi kazdego aktywnego wpisu.");
      }

      continue;
    }

    totalWeightG = addSafeIntegers(
      totalWeightG,
      entry.weightG,
      "Suma wagi sesji przekracza bezpieczny zakres."
    );
  }

  const basisMilli =
    session.calculationBasisSnapshot === "WEIGHT" ? totalWeightG : totalQuantityMilli;

  return {
    calculationVersion: HARVEST_SESSION_CALCULATION_VERSION,
    calculationBasis: session.calculationBasisSnapshot,
    activeEntryCount,
    skippedCancelledEntryCount,
    totalQuantityMilli,
    totalWeightG,
    missingWeightEntryCount,
    amountDueGrosz: calculateRoundedGroszFromMilli(basisMilli, rateGrosz)
  };
}

export function appendActiveHarvestEntryToSessionTotals({
  session,
  currentTotals,
  entry
}: {
  session: HarvestSessionCalculationSource;
  currentTotals: HarvestSessionRunningTotals;
  entry: CalculableHarvestEntry;
}): HarvestSessionCalculationResult {
  assertActiveEntry(entry);
  const activeEntryCount = addSafeIntegers(
    currentTotals.activeEntryCount,
    1,
    "Liczba aktywnych wpisow przekracza bezpieczny zakres."
  );
  const totalQuantityMilli = addSafeIntegers(
    currentTotals.totalQuantityMilli,
    entry.quantityMilli,
    "Suma ilosci sesji przekracza bezpieczny zakres."
  );
  const totalWeightG =
    entry.weightG === null
      ? assertSafeNonNegativeInteger(
          currentTotals.totalWeightG,
          "Suma wagi sesji ma nieprawidlowy zakres."
        )
      : addSafeIntegers(
          currentTotals.totalWeightG,
          entry.weightG,
          "Suma wagi sesji przekracza bezpieczny zakres."
        );

  if (session.calculationBasisSnapshot === "WEIGHT" && entry.weightG === null) {
    throw new Error("Plan wagowy wymaga wagi kazdego aktywnego wpisu.");
  }

  return {
    calculationVersion: HARVEST_SESSION_CALCULATION_VERSION,
    calculationBasis: session.calculationBasisSnapshot,
    activeEntryCount,
    skippedCancelledEntryCount: 0,
    totalQuantityMilli,
    totalWeightG,
    missingWeightEntryCount: entry.weightG === null ? 1 : 0,
    amountDueGrosz: calculateHarvestSessionAmountDueGrosz(session, {
      totalQuantityMilli,
      totalWeightG
    })
  };
}

export function calculateEntryAmountPreviewGrosz(
  session: HarvestSessionCalculationSource,
  entry: Pick<CalculableHarvestEntry, "quantityMilli" | "weightG">
): number {
  const rateGrosz = assertSafePositiveInteger(
    session.rateGroszSnapshot,
    "Stawka sesji musi byc wieksza od zera."
  );
  const basisMilli =
    session.calculationBasisSnapshot === "WEIGHT"
      ? assertSafePositiveInteger(entry.weightG, "Waga wpisu musi byc wieksza od zera.")
      : assertSafePositiveInteger(
          entry.quantityMilli,
          "Ilosc wpisu musi byc wieksza od zera."
        );

  return calculateRoundedGroszFromMilli(
    basisMilli,
    rateGrosz,
    "Kwota wpisu przekracza bezpieczny zakres."
  );
}

export function calculateHarvestSessionAmountDueGrosz(
  session: HarvestSessionCalculationSource,
  totals: Pick<HarvestSessionCalculationResult, "totalQuantityMilli" | "totalWeightG">
): number {
  const rateGrosz = assertSafePositiveInteger(
    session.rateGroszSnapshot,
    "Stawka sesji musi byc wieksza od zera."
  );
  const basisMilli =
    session.calculationBasisSnapshot === "WEIGHT"
      ? assertSafeNonNegativeInteger(
          totals.totalWeightG,
          "Suma wagi sesji ma nieprawidlowy zakres."
        )
      : assertSafeNonNegativeInteger(
          totals.totalQuantityMilli,
          "Suma ilosci sesji ma nieprawidlowy zakres."
        );

  return calculateRoundedGroszFromMilli(basisMilli, rateGrosz);
}

export function calculateRoundedGroszFromMilli(
  basisMilli: number,
  rateGrosz: number,
  overflowMessage = "Kwota sesji przekracza bezpieczny zakres."
): number {
  assertSafeNonNegativeInteger(
    basisMilli,
    "Podstawa obliczenia ma nieprawidlowy zakres."
  );
  assertSafePositiveInteger(rateGrosz, "Stawka sesji musi byc wieksza od zera.");

  const numerator = BigInt(basisMilli) * BigInt(rateGrosz);
  const quotient = numerator / 1000n;
  const remainder = numerator % 1000n;
  const rounded = quotient + (remainder >= 500n ? 1n : 0n);
  const value = Number(rounded);

  if (!Number.isSafeInteger(value)) {
    throw new Error(overflowMessage);
  }

  return value;
}

function assertActiveEntry(entry: CalculableHarvestEntry): void {
  if (entry.status !== "ACTIVE") {
    throw new Error("Nieznany status wpisu do obliczen sesji.");
  }

  if (!entry.id.trim()) {
    throw new Error("Wpis do obliczen wymaga identyfikatora.");
  }

  assertSafePositiveInteger(
    entry.quantityMilli,
    "Ilosc aktywnego wpisu musi byc wieksza od zera."
  );
}

function addSafeIntegers(left: number, right: number, message: string): number {
  assertSafeNonNegativeInteger(left, message);
  assertSafePositiveInteger(right, message);

  const value = left + right;

  if (!Number.isSafeInteger(value)) {
    throw new Error(message);
  }

  return value;
}

function assertSafePositiveInteger(value: number | null, message: string): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value)) {
    throw new Error(message);
  }

  if (value <= 0) {
    throw new Error(message);
  }

  return value;
}

function assertSafeNonNegativeInteger(value: number, message: string): number {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error(message);
  }

  return value;
}
