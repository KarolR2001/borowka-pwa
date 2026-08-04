import type {
  SourceStockHarvestSession,
  SourceStockSale
} from "./sourceStockCalculation";
import { calculateSourceStockForSeason } from "./sourceStockCalculation";
import {
  operationalStockMovementId,
  type OperationalStockMovementDocument
} from "./operationalStockMovement";
import {
  evaluateHarvestSessionStockSource,
  evaluateSaleStockSource
} from "./stockSourceDefinition";

export const STOCK_RECONCILIATION_ISSUE_CODES = [
  "AGGREGATE_DIFFERENCE",
  "INVALID_MOVEMENTS",
  "INVALID_SOURCES",
  "MISMATCHED_MOVEMENTS",
  "MISSING_MOVEMENTS",
  "NEGATIVE_SOURCE_STOCK",
  "UNEXPECTED_MOVEMENTS"
] as const;

export type StockReconciliationIssueCode =
  (typeof STOCK_RECONCILIATION_ISSUE_CODES)[number];

export type StockReconciliationIssue = {
  code: StockReconciliationIssueCode;
  count: number;
  documentIds: string[];
  message: string;
};

export type StockReconciliationReport = {
  blocksOrdinarySale: boolean;
  checkedAtIso: string;
  differenceG: number;
  expectedMovementCount: number;
  issues: StockReconciliationIssue[];
  movementInvalidDocumentCount: number;
  operationalAvailableWeightG: number;
  operationalMovementCount: number;
  seasonId: string;
  source: {
    activeSaleWeightG: number;
    availableWeightG: number;
    confirmedHarvestWeightG: number;
    correctionDecreaseWeightG: number;
    correctionIncreaseWeightG: number;
    soldWeightG: number;
  };
  sourceInvalidDocumentCount: number;
};

type ExpectedMovement = Pick<
  OperationalStockMovementDocument,
  "id" | "seasonId" | "sourceId" | "sourceType" | "weightImpactG"
>;

export function reconcileStockSources({
  checkedAtIso,
  harvestSessions,
  movements,
  movementInvalidDocumentCount = 0,
  sales,
  seasonId,
  sourceInvalidDocumentCount = 0
}: {
  checkedAtIso: string;
  harvestSessions: readonly SourceStockHarvestSession[];
  movements: readonly OperationalStockMovementDocument[];
  movementInvalidDocumentCount?: number;
  sales: readonly SourceStockSale[];
  seasonId: string;
  sourceInvalidDocumentCount?: number;
}): StockReconciliationReport {
  const normalizedSeasonId = requiredText(seasonId);
  const normalizedCheckedAtIso = normalizeIso(checkedAtIso);
  assertNonNegativeInteger(sourceInvalidDocumentCount);
  assertNonNegativeInteger(movementInvalidDocumentCount);
  const sourceCalculation = calculateSourceStockForSeason({
    harvestSessions,
    sales,
    seasonId: normalizedSeasonId
  });
  const expectedMovements = buildExpectedMovements(
    harvestSessions,
    sales,
    normalizedSeasonId
  );
  const actualMovements = movements.filter(
    (movement) => movement.seasonId === normalizedSeasonId
  );
  const actualById = new Map<string, OperationalStockMovementDocument>();

  for (const movement of actualMovements) {
    if (actualById.has(movement.id)) {
      throw new Error("Uzgodnienie stanu zawiera zduplikowany ruch operacyjny.");
    }
    actualById.set(movement.id, movement);
  }

  const missingMovementIds: string[] = [];
  const mismatchedMovementIds: string[] = [];

  for (const expected of expectedMovements.values()) {
    const actual = actualById.get(expected.id);
    if (!actual) {
      missingMovementIds.push(expected.id);
      continue;
    }
    if (!movementMatches(actual, expected)) {
      mismatchedMovementIds.push(expected.id);
    }
  }

  const unexpectedMovementIds = [...actualById.keys()].filter(
    (id) => !expectedMovements.has(id)
  );
  const operationalAvailableWeightG = actualMovements.reduce(
    (total, movement) => safeAdd(total, movement.weightImpactG),
    0
  );
  const differenceG = safeAdd(
    operationalAvailableWeightG,
    -sourceCalculation.availableWeightG
  );
  const issues: StockReconciliationIssue[] = [];

  addCountIssue(
    issues,
    "INVALID_SOURCES",
    sourceInvalidDocumentCount,
    "Zrodla stanu zawieraja nieprawidlowe dokumenty."
  );
  addCountIssue(
    issues,
    "INVALID_MOVEMENTS",
    movementInvalidDocumentCount,
    "Projekcja stanu zawiera nieprawidlowe ruchy."
  );
  addDocumentIssue(
    issues,
    "MISSING_MOVEMENTS",
    missingMovementIds,
    "Brakuje ruchow operacyjnych dla dokumentow zrodlowych."
  );
  addDocumentIssue(
    issues,
    "MISMATCHED_MOVEMENTS",
    mismatchedMovementIds,
    "Ruchy operacyjne nie odpowiadaja aktualnym dokumentom zrodlowym."
  );
  addDocumentIssue(
    issues,
    "UNEXPECTED_MOVEMENTS",
    unexpectedMovementIds,
    "Projekcja zawiera ruchy bez odpowiadajacych dokumentow zrodlowych."
  );

  if (differenceG !== 0) {
    issues.push({
      code: "AGGREGATE_DIFFERENCE",
      count: 1,
      documentIds: [],
      message: "Operacyjny agregat kilogramow nie zgadza sie ze zrodlami."
    });
  }

  if (sourceCalculation.availableWeightG < 0) {
    issues.push({
      code: "NEGATIVE_SOURCE_STOCK",
      count: 1,
      documentIds: [],
      message: "Stan obliczony ze zrodel jest ujemny."
    });
  }

  return {
    blocksOrdinarySale: issues.length > 0,
    checkedAtIso: normalizedCheckedAtIso,
    differenceG,
    expectedMovementCount: expectedMovements.size,
    issues,
    movementInvalidDocumentCount,
    operationalAvailableWeightG,
    operationalMovementCount: actualMovements.length,
    seasonId: normalizedSeasonId,
    source: {
      activeSaleWeightG: sourceCalculation.activeSaleWeightG,
      availableWeightG: sourceCalculation.availableWeightG,
      confirmedHarvestWeightG: sourceCalculation.confirmedHarvestWeightG,
      correctionDecreaseWeightG: sourceCalculation.correctionDecreaseWeightG,
      correctionIncreaseWeightG: sourceCalculation.correctionIncreaseWeightG,
      soldWeightG: sourceCalculation.soldWeightG
    },
    sourceInvalidDocumentCount
  };
}

function buildExpectedMovements(
  harvestSessions: readonly SourceStockHarvestSession[],
  sales: readonly SourceStockSale[],
  seasonId: string
): Map<string, ExpectedMovement> {
  const result = new Map<string, ExpectedMovement>();

  for (const session of harvestSessions.filter((item) => item.seasonId === seasonId)) {
    const contribution = evaluateHarvestSessionStockSource(session);
    addExpectedMovement(result, {
      id: operationalStockMovementId("HARVEST_SESSION", session.id),
      seasonId,
      sourceId: session.id,
      sourceType: "HARVEST_SESSION",
      weightImpactG: contribution.contributionG
    });
  }

  for (const sale of sales.filter((item) => item.seasonId === seasonId)) {
    const contribution = evaluateSaleStockSource(sale);
    addExpectedMovement(result, {
      id: operationalStockMovementId("SALE", sale.id),
      seasonId,
      sourceId: sale.id,
      sourceType: "SALE",
      weightImpactG: contribution.contributionG
    });
  }

  return result;
}

function addExpectedMovement(
  result: Map<string, ExpectedMovement>,
  movement: ExpectedMovement
): void {
  if (result.has(movement.id)) {
    throw new Error("Uzgodnienie stanu zawiera zduplikowane zrodlo ruchu.");
  }
  result.set(movement.id, movement);
}

function movementMatches(
  actual: OperationalStockMovementDocument,
  expected: ExpectedMovement
): boolean {
  return (
    actual.id === expected.id &&
    actual.seasonId === expected.seasonId &&
    actual.sourceId === expected.sourceId &&
    actual.sourceType === expected.sourceType &&
    actual.weightImpactG === expected.weightImpactG
  );
}

function addCountIssue(
  issues: StockReconciliationIssue[],
  code: StockReconciliationIssueCode,
  count: number,
  message: string
): void {
  if (count > 0) {
    issues.push({ code, count, documentIds: [], message });
  }
}

function addDocumentIssue(
  issues: StockReconciliationIssue[],
  code: StockReconciliationIssueCode,
  documentIds: string[],
  message: string
): void {
  if (documentIds.length > 0) {
    issues.push({
      code,
      count: documentIds.length,
      documentIds: [...documentIds].sort(),
      message
    });
  }
}

function requiredText(value: string): string {
  const normalized = value.trim();
  if (!normalized) {
    throw new Error("Uzgodnienie stanu wymaga identyfikatora sezonu.");
  }
  return normalized;
}

function normalizeIso(value: string): string {
  const timestamp = Date.parse(value);
  if (Number.isNaN(timestamp)) {
    throw new Error("Uzgodnienie stanu wymaga poprawnego czasu kontroli.");
  }
  return new Date(timestamp).toISOString();
}

function assertNonNegativeInteger(value: number): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error("Uzgodnienie stanu zawiera nieprawidlowy licznik dokumentow.");
  }
}

function safeAdd(left: number, right: number): number {
  const result = left + right;
  if (
    !Number.isSafeInteger(left) ||
    !Number.isSafeInteger(right) ||
    !Number.isSafeInteger(result)
  ) {
    throw new Error("Uzgodnienie stanu przekracza bezpieczny zakres liczbowy.");
  }
  return result;
}
