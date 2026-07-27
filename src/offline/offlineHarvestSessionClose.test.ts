import {
  createInitialDomainSeed,
  type WorkerDocument
} from "../domain/domainConfiguration";
import type { UserProfile } from "../domain/identity";
import type { HarvestEntryDocument } from "../harvest/harvestSessionDashboard";
import {
  HARVEST_SESSION_CALCULATION_VERSION,
  prepareOpenHarvestSession,
  type HarvestSessionDocument
} from "../harvest/openHarvestSession";
import {
  countOfflineClosePendingWrites,
  prepareOfflineHarvestSessionClose
} from "./offlineHarvestSessionClose";

const createdAt = "2026-07-17T10:00:00.000Z";
const closedAt = "2026-07-17T12:00:00.000Z";
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

const pickerProfile: UserProfile = {
  ...operatorProfile,
  uid: "picker-1",
  role: "PICKER",
  workerId: "worker-anna-test"
};

describe("offline harvest session close preparation", () => {
  it("closes a session locally with trusted totals pending server confirmation", () => {
    const session = createSession();
    const entries = [
      createEntry(session, 1, { quantityMilli: 1000, weightG: 1000 }),
      createEntry(session, 2, {
        quantityMilli: 1495,
        weightG: 1495,
        pendingSync: true
      }),
      createEntry(session, 3, {
        status: "CANCELLED",
        pendingSync: true
      })
    ];
    const result = prepareOfflineHarvestSessionClose({
      actorProfile: operatorProfile,
      session,
      entries,
      confirmationAccepted: true,
      closedAtDevice: closedAt,
      deviceId: "device-1"
    });

    expect(result).toMatchObject({
      status: "CLOSED_OFFLINE",
      selectedSessionId: null,
      syncState: "LOCAL_CLOSED_PENDING_SYNC",
      entriesLocked: true,
      paymentAvailable: false,
      amountOfficiality: "PENDING_SERVER_CONFIRMATION",
      conflictPolicy: "SERVER_RECHECK_REQUIRED_REVIEW_ON_CONFLICT",
      auditAction: "HARVEST_SESSION_CLOSED",
      pendingWriteCount: 3,
      message: "Zamknieto lokalnie sesje dla Anna Test."
    });
    expect(result.session).toMatchObject({
      status: "CLOSED",
      totalEntryCount: 2,
      totalQuantityMilli: 2495,
      totalWeightG: 2495,
      amountDueGrosz: 2495,
      calculationVersion: HARVEST_SESSION_CALCULATION_VERSION,
      closedAtDevice: closedAt,
      closedAtServer: null,
      closedBy: "operator-1",
      updatedAtServer: null,
      revision: 2
    });
    expect(result.sessionUpdate).toEqual({
      status: "CLOSED",
      totalEntryCount: 2,
      totalQuantityMilli: 2495,
      totalWeightG: 2495,
      amountDueGrosz: 2495,
      calculationVersion: HARVEST_SESSION_CALCULATION_VERSION,
      closedAtDevice: closedAt,
      closedAtServer: null,
      closedBy: "operator-1",
      updatedAtServer: null,
      revision: 2
    });
    expect(result.confirmationSummary).toMatchObject({
      workerName: "Anna Test",
      businessDate: "2026-07-17",
      planName: "Za kilogram",
      rateGrosz: 1000,
      calculationBasis: "WEIGHT",
      totalEntryCount: 2,
      amountDueGrosz: 2495,
      skippedCancelledEntryCount: 1,
      pendingWriteCount: 3
    });
    expect(result.beforeSummary).toMatchObject({
      status: "OPEN",
      amountDueGrosz: null,
      revision: 1
    });
    expect(result.afterSummary).toMatchObject({
      status: "CLOSED",
      amountDueGrosz: 2495,
      revision: 2
    });
  });

  it("allows an admin to close another operator session and preserves reclose audit action", () => {
    const session = createSession(seed.workers[0], {
      createdBy: "operator-2",
      revision: 3
    });
    const result = prepareOfflineHarvestSessionClose({
      actorProfile: adminProfile,
      session,
      entries: [createEntry(session, 1)],
      confirmationAccepted: true,
      closedAtDevice: closedAt,
      deviceId: "device-admin"
    });

    expect(result.auditAction).toBe("HARVEST_SESSION_RECLOSED");
    expect(result.session).toMatchObject({
      closedBy: "admin-1",
      revision: 4
    });
  });

  it("blocks missing confirmation, invalid actors and sessions outside the actor boundary", () => {
    const session = createSession();

    expect(() =>
      prepareOfflineHarvestSessionClose({
        actorProfile: operatorProfile,
        session,
        entries: [createEntry(session, 1)],
        confirmationAccepted: false,
        closedAtDevice: closedAt,
        deviceId: "device-1"
      })
    ).toThrow("Zamkniecie sesji offline wymaga potwierdzenia podsumowania.");
    expect(() =>
      prepareOfflineHarvestSessionClose({
        actorProfile: pickerProfile,
        session,
        entries: [createEntry(session, 1)],
        confirmationAccepted: true,
        closedAtDevice: closedAt,
        deviceId: "device-1"
      })
    ).toThrow("Zamkniecie sesji offline wymaga aktywnego administratora albo operatora.");
    expect(() =>
      prepareOfflineHarvestSessionClose({
        actorProfile: operatorProfile,
        session: createSession(seed.workers[0], {
          createdBy: "operator-2"
        }),
        entries: [createEntry(session, 1)],
        confirmationAccepted: true,
        closedAtDevice: closedAt,
        deviceId: "device-1"
      })
    ).toThrow("Operator moze zamknac offline tylko prowadzona przez siebie sesje.");
  });

  it("uses shared close calculations and blocks cases that cannot close offline", () => {
    const session = createSession();

    expect(() =>
      prepareOfflineHarvestSessionClose({
        actorProfile: operatorProfile,
        session,
        entries: [],
        confirmationAccepted: true,
        closedAtDevice: closedAt,
        deviceId: "device-1"
      })
    ).toThrow("Nie mozna zamknac pustej sesji.");
    expect(() =>
      prepareOfflineHarvestSessionClose({
        actorProfile: operatorProfile,
        session,
        entries: [createEntry(session, 1, { weightG: null })],
        confirmationAccepted: true,
        closedAtDevice: closedAt,
        deviceId: "device-1"
      })
    ).toThrow("Plan wagowy wymaga wagi kazdego aktywnego wpisu.");
    expect(() =>
      prepareOfflineHarvestSessionClose({
        actorProfile: operatorProfile,
        session: createSession(seed.workers[0], {
          status: "CLOSED"
        }),
        entries: [createEntry(session, 1)],
        confirmationAccepted: true,
        closedAtDevice: closedAt,
        deviceId: "device-1"
      })
    ).toThrow("Zamkniecie wymaga otwartej sesji.");
    expect(() =>
      prepareOfflineHarvestSessionClose({
        actorProfile: operatorProfile,
        session,
        entries: [createEntry(session, 1)],
        confirmationAccepted: true,
        closedAtDevice: null,
        deviceId: "device-1"
      })
    ).toThrow("Zamkniecie sesji offline wymaga czasu urzadzenia.");
    expect(() =>
      prepareOfflineHarvestSessionClose({
        actorProfile: operatorProfile,
        session,
        entries: [createEntry(session, 1)],
        confirmationAccepted: true,
        closedAtDevice: closedAt,
        deviceId: " "
      })
    ).toThrow("Zamkniecie sesji offline wymaga urzadzenia.");
  });

  it("counts the local close update plus pending entry writes", () => {
    expect(
      countOfflineClosePendingWrites([
        { pendingSync: true },
        { pendingSync: false },
        { pendingSync: true }
      ])
    ).toBe(3);
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
    createdAtServer: "created-server",
    replacesEntryId: null,
    cancellationReason: null,
    cancelledBy: null,
    cancelledAtServer: null,
    revision: 1,
    ...overrides
  };
}
