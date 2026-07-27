import type { WorkerRateVersionDocument } from "../domain/domainConfiguration";
import type { RateConflictSessionSnapshot } from "./rateConflict";
import { evaluateOfflineRateConflict } from "./rateConflict";

describe("offline rate conflict", () => {
  it("accepts the local snapshot when the cached rate is still effective", () => {
    const result = evaluateOfflineRateConflict({
      currentRateVersions: [
        rateVersion({
          id: "rate-15",
          rateGroszPerUnit: 1500,
          validFrom: "2026-07-01",
          validTo: null
        }),
        rateVersion({
          id: "rate-future-17",
          rateGroszPerUnit: 1700,
          validFrom: "2026-08-01",
          validTo: null
        })
      ],
      session: sessionSnapshot({
        amountDueGrosz: 4500,
        businessDate: "2026-07-17",
        rateGroszSnapshot: 1500,
        rateVersionIdSnapshot: "rate-15"
      })
    });

    expect(result).toEqual({
      adminResolutionOptions: ["KEEP_LOCAL_SNAPSHOT"],
      currentEffectiveRate: {
        planId: "plan-kg",
        rateGroszPerUnit: 1500,
        rateVersionId: "rate-15",
        validFrom: "2026-07-01",
        validTo: null,
        workerId: "worker-1"
      },
      localSnapshot: {
        planId: "plan-kg",
        rateGroszPerUnit: 1500,
        rateVersionId: "rate-15",
        validFrom: "2026-07-01",
        validTo: null,
        workerId: "worker-1"
      },
      message: "Snapshot stawki pozostaje zgodny z data biznesowa sesji.",
      paymentBlocked: false,
      preservedAmountDueGrosz: 4500,
      recommendedSessionStatus: "CLOSED",
      reviewRequired: false,
      status: "SNAPSHOT_STILL_VALID"
    });
  });

  it("marks review required when a backdated server rate invalidates the snapshot", () => {
    const result = evaluateOfflineRateConflict({
      currentRateVersions: [
        rateVersion({
          active: false,
          id: "rate-15",
          rateGroszPerUnit: 1500,
          validFrom: "2026-07-01",
          validTo: "2026-07-10"
        }),
        rateVersion({
          id: "rate-17",
          rateGroszPerUnit: 1700,
          validFrom: "2026-07-11",
          validTo: null
        })
      ],
      session: sessionSnapshot({
        amountDueGrosz: 4500,
        businessDate: "2026-07-17",
        rateGroszSnapshot: 1500,
        rateVersionIdSnapshot: "rate-15"
      })
    });

    expect(result).toMatchObject({
      adminResolutionOptions: [
        "KEEP_LOCAL_SNAPSHOT",
        "APPLY_CURRENT_RATE_BEFORE_CLOSE",
        "CANCEL_SESSION"
      ],
      currentEffectiveRate: {
        rateGroszPerUnit: 1700,
        rateVersionId: "rate-17"
      },
      localSnapshot: {
        rateGroszPerUnit: 1500,
        rateVersionId: "rate-15"
      },
      paymentBlocked: true,
      preservedAmountDueGrosz: 4500,
      recommendedSessionStatus: "REVIEW_REQUIRED",
      reviewRequired: true,
      status: "RATE_REVIEW_REQUIRED"
    });
  });

  it("does not silently recalculate when the same rate id has different server amount", () => {
    const result = evaluateOfflineRateConflict({
      currentRateVersions: [
        rateVersion({
          id: "rate-15",
          rateGroszPerUnit: 1700,
          validFrom: "2026-07-01",
          validTo: null
        })
      ],
      session: sessionSnapshot({
        amountDueGrosz: 4500,
        businessDate: "2026-07-17",
        rateGroszSnapshot: 1500,
        rateVersionIdSnapshot: "rate-15"
      })
    });

    expect(result.reviewRequired).toBe(true);
    expect(result.paymentBlocked).toBe(true);
    expect(result.preservedAmountDueGrosz).toBe(4500);
    expect(result.localSnapshot.rateGroszPerUnit).toBe(1500);
    expect(result.currentEffectiveRate?.rateGroszPerUnit).toBe(1700);
  });

  it("requires review when the local snapshot rate version no longer exists", () => {
    const result = evaluateOfflineRateConflict({
      currentRateVersions: [
        rateVersion({
          id: "rate-17",
          rateGroszPerUnit: 1700,
          validFrom: "2026-07-01",
          validTo: null
        })
      ],
      session: sessionSnapshot({
        businessDate: "2026-07-17",
        rateGroszSnapshot: 1500,
        rateVersionIdSnapshot: "rate-missing"
      })
    });

    expect(result).toMatchObject({
      message: "Nie znaleziono wersji stawki zapisanej w lokalnym snapshocie.",
      paymentBlocked: true,
      recommendedSessionStatus: "REVIEW_REQUIRED",
      status: "RATE_REVIEW_REQUIRED"
    });
    expect(result.localSnapshot).toEqual({
      planId: "plan-kg",
      rateGroszPerUnit: 1500,
      rateVersionId: "rate-missing",
      validFrom: "nieznany",
      validTo: null,
      workerId: "worker-1"
    });
  });

  it("offers only keep or cancel when there is no current replacement rate", () => {
    const result = evaluateOfflineRateConflict({
      currentRateVersions: [
        rateVersion({
          active: false,
          id: "rate-15",
          rateGroszPerUnit: 1500,
          validFrom: "2026-07-01",
          validTo: "2026-07-10"
        })
      ],
      session: sessionSnapshot({
        businessDate: "2026-07-17",
        rateGroszSnapshot: 1500,
        rateVersionIdSnapshot: "rate-15"
      })
    });

    expect(result.adminResolutionOptions).toEqual([
      "KEEP_LOCAL_SNAPSHOT",
      "CANCEL_SESSION"
    ]);
    expect(result.currentEffectiveRate).toBeNull();
  });
});

function sessionSnapshot(
  overrides: Partial<RateConflictSessionSnapshot> = {}
): RateConflictSessionSnapshot {
  return {
    amountDueGrosz: 4500,
    businessDate: "2026-07-17",
    id: "session-1",
    planIdSnapshot: "plan-kg",
    rateGroszSnapshot: 1500,
    rateVersionIdSnapshot: "rate-15",
    status: "CLOSED",
    workerId: "worker-1",
    workerNameSnapshot: "Anna Test",
    ...overrides
  };
}

function rateVersion(
  overrides: Partial<WorkerRateVersionDocument> = {}
): WorkerRateVersionDocument {
  return {
    active: true,
    createdAt: null,
    createdBy: "admin-1",
    id: "rate-15",
    note: null,
    planId: "plan-kg",
    rateGroszPerUnit: 1500,
    supersedesRateId: null,
    validFrom: "2026-07-01",
    validTo: null,
    workerId: "worker-1",
    ...overrides
  };
}
