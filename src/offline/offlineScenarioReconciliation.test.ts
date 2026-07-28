import { createInitialDomainSeed } from "../domain/domainConfiguration";
import type { UserProfile } from "../domain/identity";
import type { HarvestEntryDocument } from "../harvest/harvestSessionDashboard";
import {
  prepareOpenHarvestSession,
  type HarvestSessionDocument
} from "../harvest/openHarvestSession";
import { buildSyncCenterModel } from "./syncCenter";
import { evaluateOfflineScenarioReconciliation } from "./offlineScenarioReconciliation";

const createdAt = new Date("2026-07-17T08:00:00.000Z");
const seed = createInitialDomainSeed({ createdAt });
const profile: UserProfile = {
  uid: "operator-offline-scenarios",
  email: "operator-offline-scenarios@example.test",
  displayName: "Operator Offline",
  role: "OPERATOR",
  workerId: null,
  active: true,
  registrationStatus: "APPROVED",
  offlineConsent: true
};

describe("offline scenario reconciliation", () => {
  it("marks OFF-T03 for review without silently recalculating the local amount", () => {
    const session = createSession();
    const changedRates = seed.workerRateVersions.map((rate) =>
      rate.id === session.rateVersionIdSnapshot
        ? {
            ...rate,
            active: false,
            validTo: "2026-07-16"
          }
        : rate
    );

    changedRates.push({
      ...seed.workerRateVersions[0],
      id: "rate-off-t03-current",
      active: true,
      rateGroszPerUnit: session.rateGroszSnapshot + 250,
      validFrom: "2026-07-17",
      validTo: null,
      supersedesRateId: session.rateVersionIdSnapshot
    });

    const result = evaluateOfflineScenarioReconciliation({
      currentDeviceId: "device-a",
      currentRateVersions: changedRates,
      entries: [createEntry(session)],
      localSession: {
        ...session,
        status: "CLOSED",
        amountDueGrosz: 1000
      },
      model: createPendingModel(session),
      profile
    });

    expect(result).toMatchObject({
      status: "REVIEW_REQUIRED",
      reviewRequired: true,
      paymentBlocked: true,
      recommendedSessionStatus: "REVIEW_REQUIRED",
      rate: {
        status: "RATE_REVIEW_REQUIRED",
        preservedAmountDueGrosz: 1000
      }
    });
    expect(result.findingCodes).toContain("RATE_REVIEW_REQUIRED");
  });

  it("stops OFF-T04 automatic retry and requires emergency export for a blocked account", () => {
    const session = createSession();
    const result = evaluateOfflineScenarioReconciliation({
      currentDeviceId: "device-a",
      currentRateVersions: seed.workerRateVersions,
      entries: [createEntry(session)],
      localSession: session,
      model: createPendingModel(session),
      profile: {
        ...profile,
        active: false,
        registrationStatus: "BLOCKED"
      }
    });

    expect(result).toMatchObject({
      status: "BLOCKED_ACCOUNT",
      automaticRetryAllowed: false,
      emergencyExportRequired: true,
      localDataPreserved: true,
      paymentBlocked: true,
      account: {
        status: "BLOCKED_ACCOUNT_PENDING_DATA",
        localDataPreserved: true
      }
    });
    expect(result.findingCodes).toContain("BLOCKED_ACCOUNT_PENDING_DATA");
  });

  it("preserves both OFF-T06 sessions and warns about a business duplicate", () => {
    const localSession = createSession();
    const remoteSession = {
      ...createSession(),
      id: "session-device-b",
      createdDeviceId: "device-b"
    };
    const result = evaluateOfflineScenarioReconciliation({
      currentDeviceId: "device-a",
      currentRateVersions: seed.workerRateVersions,
      entries: [createEntry(localSession)],
      localSession,
      model: createPendingModel(localSession),
      otherSessionsSameBusinessKey: [remoteSession],
      profile
    });

    expect(result).toMatchObject({
      status: "REVIEW_REQUIRED",
      reviewRequired: true,
      paymentBlocked: true,
      localDataPreserved: true,
      device: {
        status: "DEVICE_REVIEW_REQUIRED",
        sessionsPreserved: true,
        entriesPreserved: true,
        automaticMergeAllowed: false
      }
    });
    expect(result.findingCodes).toContain("POSSIBLE_BUSINESS_DUPLICATE");
  });
});

function createSession(): HarvestSessionDocument {
  const result = prepareOpenHarvestSession({
    actorProfile: profile,
    id: "session-device-a",
    season: seed.seasons[0],
    worker: seed.workers[0],
    plans: seed.settlementPlans,
    rateVersions: seed.workerRateVersions,
    businessDate: "2026-07-17",
    existingSessions: [],
    isOnline: true,
    createdDeviceId: "device-a",
    createdAtDevice: createdAt
  });

  if (result.status !== "CREATED") {
    throw new Error("Expected offline session.");
  }

  return result.session;
}

function createEntry(session: HarvestSessionDocument): HarvestEntryDocument {
  return {
    id: "entry-device-a",
    sessionId: session.id,
    seasonId: session.seasonId,
    workerId: session.workerId,
    businessDate: session.businessDate,
    status: "ACTIVE",
    sequenceNumber: 1,
    quantityMilli: 1000,
    weightG: 1000,
    amountPreviewGrosz: 1000,
    stockWeightG: 1000,
    pendingSync: true,
    createdBy: profile.uid,
    createdDeviceId: "device-a",
    createdAtDevice: createdAt,
    createdAtServer: null,
    replacesEntryId: null,
    cancellationReason: null,
    cancelledBy: null,
    cancelledAtServer: null,
    revision: 1
  };
}

function createPendingModel(session: HarvestSessionDocument) {
  return buildSyncCenterModel([
    {
      id: session.id,
      kind: "HARVEST_SESSION",
      localSnapshot: session,
      sessionId: session.id,
      workerName: session.workerNameSnapshot,
      businessDate: session.businessDate,
      businessStatus: session.status,
      pendingSync: true,
      savedLocally: true,
      currentDeviceId: session.createdDeviceId
    }
  ]);
}
