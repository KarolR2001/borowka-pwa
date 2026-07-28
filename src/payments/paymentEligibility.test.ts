import type { SeasonDocument, WorkerDocument } from "../domain/domainConfiguration";
import type { UserProfile } from "../domain/identity";
import type { HarvestEntryDocument } from "../harvest/harvestSessionDashboard";
import type { HarvestSessionDocument } from "../harvest/openHarvestSession";
import { evaluatePaymentEligibility } from "./paymentEligibility";

const adminProfile: UserProfile = {
  uid: "admin-1",
  email: "admin@example.test",
  displayName: "Admin",
  role: "ADMIN",
  workerId: null,
  active: true,
  registrationStatus: "APPROVED",
  offlineConsent: false
};

describe("payment eligibility", () => {
  it("accepts a current closed session and does not block an archived worker", () => {
    const result = evaluatePaymentEligibility({
      actorProfile: adminProfile,
      checkedAt: new Date("2026-07-28T12:00:00.000Z"),
      entries: [entry()],
      invalidEntryCount: 0,
      isOnline: true,
      paymentState: {
        status: "VALID",
        payment: {
          id: "session-1",
          sessionId: "session-1",
          status: "CANCELLED"
        }
      },
      season: season({ status: "CLOSED" }),
      serverChecksAvailable: true,
      session: harvestSession(),
      sessionId: "session-1",
      syncDocuments: [],
      worker: worker({ active: false, archivedAt: new Date() })
    });

    expect(result).toEqual({
      amountDueGrosz: 1000,
      blockers: [],
      checkedAtIso: "2026-07-28T12:00:00.000Z",
      paymentId: "session-1--payment-r3",
      sessionId: "session-1",
      sessionRevision: 2,
      status: "ELIGIBLE"
    });
  });

  it("explains role, inactive profile and online requirements before server checks", () => {
    const result = evaluatePaymentEligibility({
      actorProfile: {
        ...adminProfile,
        active: false,
        registrationStatus: "BLOCKED",
        role: "OPERATOR"
      },
      entries: [],
      invalidEntryCount: 0,
      isOnline: false,
      paymentState: { status: "MISSING" },
      season: null,
      serverChecksAvailable: false,
      session: null,
      sessionId: "session-1",
      syncDocuments: [],
      worker: null
    });

    expect(result.blockers.map((item) => item.code)).toEqual([
      "ADMIN_REQUIRED",
      "ADMIN_PROFILE_INACTIVE",
      "ONLINE_REQUIRED"
    ]);
    expect(result.blockers.every((item) => item.nextStep.length > 0)).toBe(true);
  });

  it("blocks conflicts, pending data, missing amount, season, worker and occupied ID", () => {
    const result = evaluatePaymentEligibility({
      actorProfile: adminProfile,
      entries: [{ ...entry(), pendingSync: true }],
      invalidEntryCount: 1,
      isOnline: true,
      paymentState: {
        status: "INVALID",
        active: true,
        referencedSessionId: "different-session"
      },
      season: season({ status: "ARCHIVED" }),
      serverChecksAvailable: true,
      session: harvestSession({
        amountDueGrosz: null,
        status: "REVIEW_REQUIRED"
      }),
      sessionId: "session-1",
      syncDocuments: [
        {
          id: "audit-1",
          kind: "AUDIT_EVENT",
          pendingSync: true,
          sessionId: "session-1"
        }
      ],
      worker: null
    });

    expect(result.blockers.map((item) => item.code)).toEqual([
      "SESSION_REVIEW_REQUIRED",
      "PAYMENT_ID_OCCUPIED",
      "PENDING_SYNCHRONIZATION",
      "OFFICIAL_AMOUNT_MISSING",
      "SEASON_NOT_ELIGIBLE",
      "WORKER_NOT_FOUND"
    ]);
  });

  it("detects non-closed sessions, active payments and stale official amounts", () => {
    const result = evaluatePaymentEligibility({
      actorProfile: adminProfile,
      entries: [entry()],
      invalidEntryCount: 0,
      isOnline: true,
      paymentState: {
        status: "VALID",
        payment: {
          id: "session-1",
          sessionId: "session-1",
          status: "ACTIVE"
        }
      },
      season: null,
      serverChecksAvailable: true,
      session: harvestSession({
        amountDueGrosz: 999,
        paymentId: "session-1--payment-r3",
        status: "OPEN"
      }),
      sessionId: "session-1",
      syncDocuments: [],
      worker: worker()
    });

    expect(result.blockers.map((item) => item.code)).toEqual([
      "SESSION_NOT_CLOSED",
      "ACTIVE_PAYMENT_EXISTS",
      "OFFICIAL_AMOUNT_STALE",
      "SEASON_NOT_FOUND"
    ]);
  });

  it("blocks a missing or invalid session document", () => {
    const result = evaluatePaymentEligibility({
      actorProfile: adminProfile,
      entries: [],
      invalidEntryCount: 1,
      isOnline: true,
      paymentState: { status: "MISSING" },
      season: null,
      serverChecksAvailable: true,
      session: null,
      sessionId: "session-1",
      syncDocuments: [],
      worker: null
    });

    expect(result.blockers).toEqual([
      expect.objectContaining({ code: "SESSION_NOT_FOUND" })
    ]);
  });
});

function harvestSession(
  overrides: Partial<HarvestSessionDocument> = {}
): HarvestSessionDocument {
  return {
    id: "session-1",
    seasonId: "season-1",
    workerId: "worker-1",
    workerNameSnapshot: "Anna",
    businessDate: "2026-07-28",
    status: "CLOSED",
    planIdSnapshot: "plan-1",
    planNameSnapshot: "Za kilogram",
    calculationBasisSnapshot: "WEIGHT",
    unitLabelSnapshot: "kilogram",
    unitLabelPluralSnapshot: "kilogramy",
    rateVersionIdSnapshot: "rate-1",
    rateGroszSnapshot: 1000,
    weightRequiredSnapshot: true,
    quantityPrecisionSnapshot: 3,
    allowBatchQuantitySnapshot: true,
    totalEntryCount: 1,
    totalQuantityMilli: 1000,
    totalWeightG: 1000,
    amountDueGrosz: 1000,
    calculationVersion: "1",
    note: null,
    createdBy: "operator-1",
    createdDeviceId: "device-1",
    createdAtDevice: null,
    createdAtServer: null,
    updatedAtServer: null,
    closedAtDevice: null,
    closedAtServer: null,
    closedBy: "operator-1",
    paidAt: null,
    paymentId: null,
    cancelledAt: null,
    cancelledBy: null,
    cancellationReason: null,
    revision: 2,
    legacyImport: false,
    legacySourceRows: [],
    ...overrides
  };
}

function entry(): HarvestEntryDocument {
  return {
    id: "entry-1",
    sessionId: "session-1",
    seasonId: "season-1",
    workerId: "worker-1",
    businessDate: "2026-07-28",
    status: "ACTIVE",
    sequenceNumber: 1,
    quantityMilli: 1000,
    weightG: 1000,
    amountPreviewGrosz: 1000,
    stockWeightG: 1000,
    pendingSync: false,
    createdBy: "operator-1",
    createdDeviceId: "device-1",
    createdAtDevice: null,
    createdAtServer: null,
    replacesEntryId: null,
    cancellationReason: null,
    cancelledBy: null,
    cancelledAtServer: null,
    revision: 1
  };
}

function season(overrides: Partial<SeasonDocument> = {}): SeasonDocument {
  return {
    id: "season-1",
    name: "Sezon 2026",
    startDate: "2026-07-01",
    endDate: "2026-09-30",
    status: "OPEN",
    isDefault: true,
    createdAt: null,
    createdBy: "admin-1",
    closedAt: null,
    closedBy: null,
    reopenedAt: null,
    ...overrides
  };
}

function worker(overrides: Partial<WorkerDocument> = {}): WorkerDocument {
  return {
    id: "worker-1",
    displayName: "Anna",
    normalizedName: "anna",
    active: true,
    currentPlanId: "plan-1",
    currentRateVersionId: "rate-1",
    linkedUserUid: null,
    phone: null,
    emailContact: null,
    notes: null,
    createdAt: null,
    createdBy: "admin-1",
    updatedAt: null,
    archivedAt: null,
    legacyName: null,
    ...overrides
  };
}
