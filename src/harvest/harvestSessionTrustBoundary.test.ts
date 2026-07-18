import {
  createInitialDomainSeed,
  type WorkerDocument
} from "../domain/domainConfiguration";
import type { UserProfile } from "../domain/identity";
import {
  prepareTrustedHarvestSessionCloseTotals,
  verifyHarvestSessionAggregatesFromEntries
} from "./harvestSessionTrustBoundary";
import {
  HARVEST_SESSION_CALCULATION_VERSION,
  prepareOpenHarvestSession,
  type HarvestSessionDocument
} from "./openHarvestSession";
import type { CalculableHarvestEntry } from "./harvestSessionCalculation";

const createdAt = "2026-07-17T10:00:00.000Z";
const seed = createInitialDomainSeed({ createdAt });

const operatorProfile: UserProfile = {
  uid: "operator-1",
  email: "operator@example.test",
  displayName: "Operator",
  role: "OPERATOR",
  active: true,
  registrationStatus: "APPROVED",
  offlineConsent: true
};

function createSession(
  worker: WorkerDocument = seed.workers[0],
  overrides: Partial<HarvestSessionDocument> = {}
): HarvestSessionDocument {
  const result = prepareOpenHarvestSession({
    actorProfile: operatorProfile,
    id: `session-${worker.id}`,
    season: seed.seasons[0],
    worker,
    plans: seed.settlementPlans,
    rateVersions: seed.workerRateVersions,
    businessDate: "2026-07-17",
    existingSessions: [],
    isOnline: true,
    createdDeviceId: "device-1",
    createdAtDevice: createdAt
  });

  if (result.status !== "CREATED") {
    throw new Error("Expected created session.");
  }

  return {
    ...result.session,
    ...overrides
  };
}

function activeEntry(
  id: string,
  quantityMilli: number,
  weightG: number | null = quantityMilli
): CalculableHarvestEntry {
  return {
    id,
    status: "ACTIVE",
    quantityMilli,
    weightG
  };
}

function cancelledEntry(
  id: string,
  quantityMilli: number,
  weightG: number | null = quantityMilli
): CalculableHarvestEntry {
  return {
    id,
    status: "CANCELLED",
    quantityMilli,
    weightG
  };
}

describe("harvest session trust boundary", () => {
  it("prepares close totals from active entries instead of existing session aggregates", () => {
    const session = createSession(undefined, {
      totalEntryCount: 999,
      totalQuantityMilli: 999_000,
      totalWeightG: 999_000,
      amountDueGrosz: 1
    });
    const result = prepareTrustedHarvestSessionCloseTotals({
      session,
      entries: [
        activeEntry("entry-1", 1000),
        activeEntry("entry-2", 1495),
        cancelledEntry("entry-3", 1000)
      ]
    });

    expect(result).toMatchObject({
      trustedSource: "ACTIVE_ENTRIES",
      totalEntryCount: 2,
      totalQuantityMilli: 2495,
      totalWeightG: 2495,
      amountDueGrosz: 2495,
      calculationVersion: HARVEST_SESSION_CALCULATION_VERSION,
      skippedCancelledEntryCount: 1,
      missingWeightEntryCount: 0
    });
  });

  it("rejects manual final amount input and empty close attempts", () => {
    const session = createSession();

    expect(() =>
      prepareTrustedHarvestSessionCloseTotals({
        session,
        entries: [activeEntry("entry-1", 1000)],
        requestedAmountDueGrosz: 777
      })
    ).toThrow("Kwota koncowa sesji musi wynikac z przeliczenia aktywnych wpisow.");
    expect(() =>
      prepareTrustedHarvestSessionCloseTotals({
        session,
        entries: []
      })
    ).toThrow("Nie mozna zamknac pustej sesji.");
  });

  it("rejects closing non-open sessions", () => {
    const session = createSession(undefined, {
      status: "CLOSED"
    });

    expect(() =>
      prepareTrustedHarvestSessionCloseTotals({
        session,
        entries: [activeEntry("entry-1", 1000)]
      })
    ).toThrow("Zamkniecie wymaga otwartej sesji.");
  });

  it("confirms consistent persisted aggregates against active entries", () => {
    const entries = [activeEntry("entry-1", 1000), cancelledEntry("entry-2", 1000)];
    const session = createSession(undefined, {
      status: "CLOSED",
      totalEntryCount: 1,
      totalQuantityMilli: 1000,
      totalWeightG: 1000,
      amountDueGrosz: 1000,
      calculationVersion: HARVEST_SESSION_CALCULATION_VERSION
    });

    expect(
      verifyHarvestSessionAggregatesFromEntries({
        session,
        entries,
        officialAmountPolicy: "REQUIRED"
      })
    ).toMatchObject({
      status: "CONSISTENT",
      trustedSource: "ACTIVE_ENTRIES",
      issues: [],
      recalculated: {
        activeEntryCount: 1,
        skippedCancelledEntryCount: 1,
        amountDueGrosz: 1000
      }
    });
  });

  it("marks manipulated aggregate fields for review", () => {
    const session = createSession(undefined, {
      totalEntryCount: 3,
      totalQuantityMilli: 3000,
      totalWeightG: 3000,
      amountDueGrosz: 1,
      calculationVersion: "legacy"
    });
    const result = verifyHarvestSessionAggregatesFromEntries({
      session,
      entries: [activeEntry("entry-1", 1000)],
      officialAmountPolicy: "REQUIRED"
    });

    expect(result.status).toBe("REVIEW_REQUIRED");
    expect(result).toMatchObject({
      trustedSource: "ACTIVE_ENTRIES",
      recommendedTransition: "MARK_REVIEW_REQUIRED",
      reviewReason:
        "Agregaty sesji wymagaja przegladu: totalEntryCount, totalQuantityMilli, totalWeightG, amountDueGrosz, calculationVersion.",
      recalculated: {
        activeEntryCount: 1,
        totalQuantityMilli: 1000,
        totalWeightG: 1000,
        amountDueGrosz: 1000
      }
    });
    expect(result.issues.map((issue) => issue.code)).toEqual([
      "TOTAL_ENTRY_COUNT_MISMATCH",
      "TOTAL_QUANTITY_MILLI_MISMATCH",
      "TOTAL_WEIGHT_G_MISMATCH",
      "AMOUNT_DUE_GROSZ_MISMATCH",
      "CALCULATION_VERSION_MISMATCH"
    ]);
  });

  it("requires official amount only when the caller chooses required policy", () => {
    const session = createSession(undefined, {
      totalEntryCount: 1,
      totalQuantityMilli: 1000,
      totalWeightG: 1000,
      amountDueGrosz: null
    });
    const entries = [activeEntry("entry-1", 1000)];

    expect(
      verifyHarvestSessionAggregatesFromEntries({
        session,
        entries
      })
    ).toMatchObject({
      status: "CONSISTENT"
    });
    expect(
      verifyHarvestSessionAggregatesFromEntries({
        session,
        entries,
        officialAmountPolicy: "REQUIRED"
      })
    ).toMatchObject({
      status: "REVIEW_REQUIRED",
      issues: [
        {
          code: "AMOUNT_DUE_GROSZ_MISMATCH",
          field: "amountDueGrosz",
          expected: 1000,
          actual: null
        }
      ]
    });
  });

  it("uses quantity as money basis and allows missing weight for quantity plans", () => {
    const session = createSession(seed.workers[1]);
    const result = prepareTrustedHarvestSessionCloseTotals({
      session,
      entries: [activeEntry("entry-1", 2000, null)]
    });

    expect(result).toMatchObject({
      totalEntryCount: 1,
      totalQuantityMilli: 2000,
      totalWeightG: 0,
      amountDueGrosz: 3000,
      missingWeightEntryCount: 1
    });
  });
});
