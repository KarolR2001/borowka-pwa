import type {
  SettlementPlanDocument,
  WorkerDocument
} from "../domain/domainConfiguration";
import {
  evaluateArchivedConfigurationConflict,
  type ArchivedConfigurationSessionSnapshot
} from "./archivedConfigurationConflict";

describe("archived configuration offline conflict", () => {
  it("accepts existing and new sessions when worker and plan remain active", () => {
    const result = evaluateArchivedConfigurationConflict({
      currentPlan: plan(),
      currentWorker: worker(),
      mode: "NEW_SESSION_ATTEMPT",
      session: sessionSnapshot()
    });

    expect(result).toEqual({
      adminResolutionOptions: [],
      auditRequired: false,
      conflicts: [],
      entriesPreserved: true,
      localSessionPreserved: true,
      message: "Konfiguracja nadal przyjmuje sesje.",
      newSessionAllowed: true,
      paymentBlocked: false,
      plan: {
        active: true,
        id: "plan-kg",
        label: "Za kilogram",
        missing: false
      },
      recommendedSessionStatus: "CLOSED",
      reviewRequired: false,
      status: "CONFIGURATION_ACCEPTS_SESSION",
      worker: {
        active: true,
        id: "worker-1",
        label: "Anna Test",
        missing: false
      }
    });
  });

  it("preserves existing offline session and entries when worker or plan was archived", () => {
    const result = evaluateArchivedConfigurationConflict({
      currentPlan: plan({
        active: false,
        archivedAt: "2026-07-18T08:00:00.000Z"
      }),
      currentWorker: worker({
        active: false,
        archivedAt: "2026-07-18T08:00:00.000Z"
      }),
      mode: "EXISTING_OFFLINE_SESSION",
      session: sessionSnapshot({
        amountDueGrosz: 4500,
        totalEntryCount: 3
      })
    });

    expect(result).toMatchObject({
      adminResolutionOptions: [
        "ACCEPT_HISTORICALLY",
        "REACTIVATE_WORKER",
        "REACTIVATE_PLAN",
        "CANCEL_SESSION"
      ],
      auditRequired: true,
      entriesPreserved: true,
      localSessionPreserved: true,
      newSessionAllowed: false,
      paymentBlocked: true,
      recommendedSessionStatus: "REVIEW_REQUIRED",
      reviewRequired: true,
      status: "ARCHIVED_CONFIGURATION_REVIEW_REQUIRED"
    });
    expect(result.conflicts.map((conflict) => conflict.code)).toEqual([
      "WORKER_ARCHIVED",
      "PLAN_ARCHIVED"
    ]);
  });

  it("blocks a new session attempt with archived configuration", () => {
    const result = evaluateArchivedConfigurationConflict({
      currentPlan: plan({
        active: false
      }),
      currentWorker: worker(),
      mode: "NEW_SESSION_ATTEMPT",
      session: sessionSnapshot()
    });

    expect(result).toMatchObject({
      adminResolutionOptions: [],
      auditRequired: false,
      entriesPreserved: false,
      localSessionPreserved: false,
      message: "Nie mozna otworzyc nowej sesji z archiwalna konfiguracja.",
      newSessionAllowed: false,
      paymentBlocked: true,
      recommendedSessionStatus: null,
      reviewRequired: false,
      status: "NEW_SESSION_BLOCKED"
    });
  });

  it("allows historical acceptance for an existing session without changing the snapshot", () => {
    const result = evaluateArchivedConfigurationConflict({
      currentPlan: plan({
        active: false
      }),
      currentWorker: worker(),
      historicalAcceptanceApproved: true,
      mode: "EXISTING_OFFLINE_SESSION",
      session: sessionSnapshot({
        planIdSnapshot: "plan-kg",
        planNameSnapshot: "Za kilogram",
        status: "CLOSED"
      })
    });

    expect(result).toMatchObject({
      adminResolutionOptions: ["ACCEPT_HISTORICALLY"],
      auditRequired: true,
      entriesPreserved: true,
      localSessionPreserved: true,
      newSessionAllowed: false,
      paymentBlocked: false,
      recommendedSessionStatus: "CLOSED",
      reviewRequired: false,
      status: "HISTORICAL_CONFIGURATION_ACCEPTED"
    });
    expect(result.plan).toMatchObject({
      id: "plan-kg",
      label: "Za kilogram"
    });
  });

  it("requires review when archived references disappeared from configuration", () => {
    const result = evaluateArchivedConfigurationConflict({
      currentPlan: null,
      currentWorker: null,
      mode: "EXISTING_OFFLINE_SESSION",
      session: sessionSnapshot()
    });

    expect(result.conflicts.map((conflict) => conflict.code)).toEqual([
      "WORKER_MISSING",
      "PLAN_MISSING"
    ]);
    expect(result.adminResolutionOptions).toEqual([
      "ACCEPT_HISTORICALLY",
      "CANCEL_SESSION"
    ]);
    expect(result.localSessionPreserved).toBe(true);
    expect(result.entriesPreserved).toBe(true);
  });

  it("validates that current configuration matches the offline session snapshot", () => {
    expect(() =>
      evaluateArchivedConfigurationConflict({
        currentPlan: plan({
          id: "plan-other"
        }),
        currentWorker: worker(),
        mode: "EXISTING_OFFLINE_SESSION",
        session: sessionSnapshot()
      })
    ).toThrow("Plan konfliktu konfiguracji nie pasuje do snapshotu sesji.");
  });
});

function sessionSnapshot(
  overrides: Partial<ArchivedConfigurationSessionSnapshot> = {}
): ArchivedConfigurationSessionSnapshot {
  return {
    amountDueGrosz: 4500,
    businessDate: "2026-07-17",
    id: "session-1",
    planIdSnapshot: "plan-kg",
    planNameSnapshot: "Za kilogram",
    status: "CLOSED",
    totalEntryCount: 3,
    workerId: "worker-1",
    workerNameSnapshot: "Anna Test",
    ...overrides
  };
}

function worker(overrides: Partial<WorkerDocument> = {}): WorkerDocument {
  return {
    active: true,
    archivedAt: null,
    createdAt: null,
    createdBy: "admin-1",
    currentPlanId: "plan-kg",
    currentRateVersionId: "rate-worker-1",
    displayName: "Anna Test",
    emailContact: null,
    id: "worker-1",
    legacyName: null,
    linkedUserUid: null,
    normalizedName: "anna test",
    notes: null,
    phone: null,
    updatedAt: null,
    ...overrides
  };
}

function plan(overrides: Partial<SettlementPlanDocument> = {}): SettlementPlanDocument {
  return {
    active: true,
    allowBatchQuantity: true,
    archivedAt: null,
    calculationBasis: "WEIGHT",
    code: "WEIGHT_KG",
    createdAt: null,
    createdBy: "admin-1",
    description: null,
    id: "plan-kg",
    name: "Za kilogram",
    quantityPrecision: 3,
    systemDefault: false,
    unitLabelPlural: "kilogramy",
    unitLabelSingular: "kilogram",
    unitSymbol: "kg",
    weightRequired: true,
    ...overrides
  };
}
