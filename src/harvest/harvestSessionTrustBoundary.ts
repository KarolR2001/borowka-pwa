import {
  calculateHarvestSessionTotals,
  type CalculableHarvestEntry,
  type HarvestSessionCalculationResult
} from "./harvestSessionCalculation";
import type { HarvestSessionDocument } from "./openHarvestSession";

export type HarvestSessionTrustSource = "ACTIVE_ENTRIES";

export type HarvestSessionConsistencyIssueCode =
  | "TOTAL_ENTRY_COUNT_MISMATCH"
  | "TOTAL_QUANTITY_MILLI_MISMATCH"
  | "TOTAL_WEIGHT_G_MISMATCH"
  | "AMOUNT_DUE_GROSZ_MISMATCH"
  | "CALCULATION_VERSION_MISMATCH";

export type HarvestSessionConsistencyField =
  | "totalEntryCount"
  | "totalQuantityMilli"
  | "totalWeightG"
  | "amountDueGrosz"
  | "calculationVersion";

export type HarvestSessionConsistencyIssue = {
  code: HarvestSessionConsistencyIssueCode;
  field: HarvestSessionConsistencyField;
  expected: number | string;
  actual: number | string | null;
  message: string;
};

export type HarvestSessionOfficialAmountPolicy = "IF_PRESENT" | "REQUIRED" | "SKIP";

export type HarvestSessionTrustBoundarySession = Pick<
  HarvestSessionDocument,
  | "calculationBasisSnapshot"
  | "rateGroszSnapshot"
  | "totalEntryCount"
  | "totalQuantityMilli"
  | "totalWeightG"
  | "amountDueGrosz"
  | "calculationVersion"
>;

export type HarvestSessionConsistencyCheckInput = {
  session: HarvestSessionTrustBoundarySession;
  entries: readonly CalculableHarvestEntry[];
  officialAmountPolicy?: HarvestSessionOfficialAmountPolicy;
};

export type HarvestSessionConsistencyCheckResult =
  | {
      status: "CONSISTENT";
      trustedSource: HarvestSessionTrustSource;
      recalculated: HarvestSessionCalculationResult;
      issues: [];
    }
  | {
      status: "REVIEW_REQUIRED";
      trustedSource: HarvestSessionTrustSource;
      recalculated: HarvestSessionCalculationResult;
      issues: HarvestSessionConsistencyIssue[];
      recommendedTransition: "MARK_REVIEW_REQUIRED";
      reviewReason: string;
    };

export type PrepareTrustedHarvestSessionCloseInput = {
  session: Pick<HarvestSessionDocument, "status"> & HarvestSessionTrustBoundarySession;
  entries: readonly CalculableHarvestEntry[];
  requestedAmountDueGrosz?: number | null;
};

export type TrustedHarvestSessionCloseTotals = {
  trustedSource: HarvestSessionTrustSource;
  totalEntryCount: number;
  totalQuantityMilli: number;
  totalWeightG: number;
  amountDueGrosz: number;
  calculationVersion: string;
  skippedCancelledEntryCount: number;
  missingWeightEntryCount: number;
};

export function prepareTrustedHarvestSessionCloseTotals(
  input: PrepareTrustedHarvestSessionCloseInput
): TrustedHarvestSessionCloseTotals {
  if (input.session.status !== "OPEN") {
    throw new Error("Zamkniecie wymaga otwartej sesji.");
  }

  if (hasManualFinalAmount(input)) {
    throw new Error("Kwota koncowa sesji musi wynikac z przeliczenia aktywnych wpisow.");
  }

  const recalculated = calculateHarvestSessionTotals({
    session: input.session,
    entries: input.entries
  });

  if (recalculated.activeEntryCount === 0) {
    throw new Error("Nie mozna zamknac pustej sesji.");
  }

  return {
    trustedSource: "ACTIVE_ENTRIES",
    totalEntryCount: recalculated.activeEntryCount,
    totalQuantityMilli: recalculated.totalQuantityMilli,
    totalWeightG: recalculated.totalWeightG,
    amountDueGrosz: recalculated.amountDueGrosz,
    calculationVersion: recalculated.calculationVersion,
    skippedCancelledEntryCount: recalculated.skippedCancelledEntryCount,
    missingWeightEntryCount: recalculated.missingWeightEntryCount
  };
}

export function verifyHarvestSessionAggregatesFromEntries(
  input: HarvestSessionConsistencyCheckInput
): HarvestSessionConsistencyCheckResult {
  const recalculated = calculateHarvestSessionTotals({
    session: input.session,
    entries: input.entries
  });
  const issues: HarvestSessionConsistencyIssue[] = [];

  addMismatchIssue(issues, {
    code: "TOTAL_ENTRY_COUNT_MISMATCH",
    field: "totalEntryCount",
    expected: recalculated.activeEntryCount,
    actual: input.session.totalEntryCount,
    message: "Licznik aktywnych wpisow sesji nie zgadza sie z wpisami."
  });
  addMismatchIssue(issues, {
    code: "TOTAL_QUANTITY_MILLI_MISMATCH",
    field: "totalQuantityMilli",
    expected: recalculated.totalQuantityMilli,
    actual: input.session.totalQuantityMilli,
    message: "Suma ilosci sesji nie zgadza sie z aktywnymi wpisami."
  });
  addMismatchIssue(issues, {
    code: "TOTAL_WEIGHT_G_MISMATCH",
    field: "totalWeightG",
    expected: recalculated.totalWeightG,
    actual: input.session.totalWeightG,
    message: "Suma wagi sesji nie zgadza sie z aktywnymi wpisami."
  });
  addAmountIssueIfNeeded(
    issues,
    input.session.amountDueGrosz,
    recalculated.amountDueGrosz,
    input.officialAmountPolicy ?? "IF_PRESENT"
  );
  addMismatchIssue(issues, {
    code: "CALCULATION_VERSION_MISMATCH",
    field: "calculationVersion",
    expected: recalculated.calculationVersion,
    actual: input.session.calculationVersion,
    message: "Wersja kalkulacji sesji nie zgadza sie z aktualnym kalkulatorem."
  });

  if (issues.length === 0) {
    return {
      status: "CONSISTENT",
      trustedSource: "ACTIVE_ENTRIES",
      recalculated,
      issues: []
    };
  }

  return {
    status: "REVIEW_REQUIRED",
    trustedSource: "ACTIVE_ENTRIES",
    recalculated,
    issues,
    recommendedTransition: "MARK_REVIEW_REQUIRED",
    reviewReason: buildReviewReason(issues)
  };
}

function hasManualFinalAmount(input: PrepareTrustedHarvestSessionCloseInput): boolean {
  return Object.prototype.hasOwnProperty.call(input, "requestedAmountDueGrosz");
}

function addAmountIssueIfNeeded(
  issues: HarvestSessionConsistencyIssue[],
  actual: number | null,
  expected: number,
  policy: HarvestSessionOfficialAmountPolicy
): void {
  if (policy === "SKIP") {
    return;
  }

  if (actual === null) {
    if (policy === "REQUIRED") {
      issues.push({
        code: "AMOUNT_DUE_GROSZ_MISMATCH",
        field: "amountDueGrosz",
        expected,
        actual,
        message: "Oficjalna kwota sesji nie zostala zapisana."
      });
    }

    return;
  }

  addMismatchIssue(issues, {
    code: "AMOUNT_DUE_GROSZ_MISMATCH",
    field: "amountDueGrosz",
    expected,
    actual,
    message: "Oficjalna kwota sesji nie zgadza sie z aktywnymi wpisami."
  });
}

function addMismatchIssue(
  issues: HarvestSessionConsistencyIssue[],
  issue: HarvestSessionConsistencyIssue
): void {
  if (issue.actual === issue.expected) {
    return;
  }

  issues.push(issue);
}

function buildReviewReason(issues: readonly HarvestSessionConsistencyIssue[]): string {
  const fields = issues.map((issue) => issue.field).join(", ");

  return `Agregaty sesji wymagaja przegladu: ${fields}.`;
}
