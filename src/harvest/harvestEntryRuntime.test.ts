import {
  createInitialDomainSeed,
  type WorkerDocument
} from "../domain/domainConfiguration";
import type { UserProfile } from "../domain/identity";
import {
  nextHarvestEntrySequenceNumber,
  prepareHarvestEntryDocument,
  withCurrentSessionTotals
} from "./harvestEntryRuntime";
import type { HarvestEntryDocument } from "./harvestSessionDashboard";
import {
  prepareOpenHarvestSession,
  type HarvestSessionDocument
} from "./openHarvestSession";

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

const adminProfile: UserProfile = {
  ...operatorProfile,
  uid: "admin-1",
  role: "ADMIN"
};

describe("harvest entry runtime", () => {
  it("prepares an online weight entry using current totals from existing entries", () => {
    const session = createSession();
    const entries = [
      createEntry(session, 1, { quantityMilli: 1000, weightG: 1000 }),
      createEntry(session, 2, {
        id: "entry-cancelled",
        status: "CANCELLED",
        quantityMilli: 5000,
        weightG: 5000
      })
    ];
    const prepared = prepareHarvestEntryDocument({
      actorProfile: operatorProfile,
      session,
      entries,
      quantityMilli: 750,
      weightG: 750,
      isOnline: true,
      createdDeviceId: "device-1",
      createdAtDevice: createdAt,
      createdAtServer: createdAt,
      identity: {
        id: "entry-3",
        sequenceNumber: 3
      }
    });

    expect(prepared.entry).toMatchObject({
      id: "entry-3",
      sessionId: session.id,
      status: "ACTIVE",
      sequenceNumber: 3,
      quantityMilli: 750,
      weightG: 750,
      amountPreviewGrosz: 750,
      stockWeightG: 750,
      pendingSync: false,
      createdBy: operatorProfile.uid,
      createdDeviceId: "device-1",
      revision: 1
    });
    expect(prepared.validated.nextSessionTotals).toEqual({
      totalEntryCount: 2,
      totalQuantityMilli: 1750,
      totalWeightG: 1750,
      estimatedAmountGrosz: 1750
    });
  });

  it("supports quantity sessions without optional weight", () => {
    const session = createSession(seed.workers[1]);
    const prepared = prepareHarvestEntryDocument({
      actorProfile: operatorProfile,
      session,
      entries: [],
      quantityMilli: 500,
      weightG: null,
      isOnline: true,
      createdDeviceId: "device-1",
      createdAtDevice: createdAt,
      createdAtServer: createdAt,
      identity: {
        id: "entry-quantity",
        sequenceNumber: 1
      }
    });

    expect(prepared.entry).toMatchObject({
      id: "entry-quantity",
      quantityMilli: 500,
      weightG: null,
      amountPreviewGrosz: 750,
      stockWeightG: null
    });
    expect(prepared.validated.nextSessionTotals.estimatedAmountGrosz).toBe(750);
  });

  it("uses cancelled entries for sequence numbering but not for current totals", () => {
    const session = createSession();
    const entries = [
      createEntry(session, 1, { quantityMilli: 1000, weightG: 1000 }),
      createEntry(session, 5, {
        id: "entry-cancelled",
        status: "CANCELLED",
        quantityMilli: 1000,
        weightG: 1000
      })
    ];

    expect(nextHarvestEntrySequenceNumber(entries)).toBe(6);
    expect(withCurrentSessionTotals(session, entries)).toMatchObject({
      totalEntryCount: 1,
      totalQuantityMilli: 1000,
      totalWeightG: 1000
    });
  });

  it("blocks an operator from adding entries to another operator session", () => {
    const session = createSession(seed.workers[0], {
      createdBy: "operator-2"
    });

    expect(() =>
      prepareHarvestEntryDocument({
        actorProfile: operatorProfile,
        session,
        entries: [],
        quantityMilli: 1000,
        weightG: 1000,
        isOnline: true,
        createdDeviceId: "device-1",
        createdAtDevice: createdAt,
        createdAtServer: createdAt,
        identity: {
          id: "entry-denied",
          sequenceNumber: 1
        }
      })
    ).toThrow("Operator moze dodawac wpisy tylko do prowadzonej przez siebie sesji.");
  });

  it("allows admin to add an entry to another operator session", () => {
    const session = createSession(seed.workers[0], {
      createdBy: "operator-2"
    });
    const prepared = prepareHarvestEntryDocument({
      actorProfile: adminProfile,
      session,
      entries: [],
      quantityMilli: 1000,
      weightG: 1000,
      isOnline: true,
      createdDeviceId: "device-admin",
      createdAtDevice: createdAt,
      createdAtServer: createdAt,
      identity: {
        id: "entry-admin",
        sequenceNumber: 1
      }
    });

    expect(prepared.entry.createdBy).toBe(adminProfile.uid);
  });
});

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

function createEntry(
  session: HarvestSessionDocument,
  sequenceNumber: number,
  overrides: Partial<HarvestEntryDocument> = {}
): HarvestEntryDocument {
  const id = overrides.id ?? `entry-${String(sequenceNumber)}`;

  return {
    id,
    sessionId: session.id,
    seasonId: session.seasonId,
    workerId: session.workerId,
    businessDate: session.businessDate,
    status: "ACTIVE",
    sequenceNumber,
    quantityMilli: 1000,
    weightG: 1000,
    amountPreviewGrosz: 1000,
    stockWeightG: 1000,
    pendingSync: false,
    createdBy: operatorProfile.uid,
    createdDeviceId: "device-1",
    createdAtDevice: createdAt,
    createdAtServer: createdAt,
    replacesEntryId: null,
    cancellationReason: null,
    cancelledBy: null,
    cancelledAtServer: null,
    revision: 1,
    ...overrides
  };
}
