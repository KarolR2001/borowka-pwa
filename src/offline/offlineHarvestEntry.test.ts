import {
  createInitialDomainSeed,
  type WorkerDocument
} from "../domain/domainConfiguration";
import type { UserProfile } from "../domain/identity";
import type { HarvestEntryDocument } from "../harvest/harvestSessionDashboard";
import {
  prepareOpenHarvestSession,
  type HarvestSessionDocument
} from "../harvest/openHarvestSession";
import {
  countPendingHarvestWrites,
  prepareOfflineHarvestEntry
} from "./offlineHarvestEntry";

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

describe("offline harvest entry preparation", () => {
  it("creates a pending local weight entry and updates local session totals", () => {
    const session = createSession(seed.workers[0], {
      createdAtServer: null
    });
    const entries = [
      createEntry(session, 1, { quantityMilli: 1000, weightG: 1000 }),
      createEntry(session, 5, {
        id: "entry-cancelled-pending",
        status: "CANCELLED",
        quantityMilli: 5000,
        weightG: 5000,
        pendingSync: true
      })
    ];
    const result = prepareOfflineHarvestEntry({
      actorProfile: operatorProfile,
      session,
      entries,
      quantityMilli: 750,
      weightG: 750,
      createdDeviceId: "device-1",
      createdAtDevice: createdAt,
      randomUuid: () => "entry-offline-generated"
    });

    expect(result.status).toBe("CREATED_OFFLINE");
    if (result.status !== "CREATED_OFFLINE") {
      throw new Error("Expected offline entry.");
    }

    expect(result.entry).toMatchObject({
      id: "entry-offline-generated",
      sessionId: session.id,
      status: "ACTIVE",
      sequenceNumber: 6,
      quantityMilli: 750,
      weightG: 750,
      amountPreviewGrosz: 750,
      stockWeightG: 750,
      pendingSync: true,
      createdBy: "operator-1",
      createdDeviceId: "device-1",
      createdAtDevice: createdAt,
      createdAtServer: null,
      revision: 1
    });
    expect(result.identity).toEqual({
      id: "entry-offline-generated",
      sequenceNumber: 6
    });
    expect(result.syncState).toBe("LOCAL_PENDING_SYNC");
    expect(result.sessionWithLocalTotals).toMatchObject({
      totalEntryCount: 2,
      totalQuantityMilli: 1750,
      totalWeightG: 1750
    });
    expect(result.nextSessionTotals).toEqual({
      totalEntryCount: 2,
      totalQuantityMilli: 1750,
      totalWeightG: 1750,
      estimatedAmountGrosz: 1750
    });
    expect(result.entries.map((entry) => entry.sequenceNumber)).toEqual([1, 5, 6]);
    expect(result.pendingEntryCount).toBe(2);
    expect(result.pendingWriteCount).toBe(3);
    expect(result.readyForNextEntry).toBe(true);
    expect(result.message).toBe("Zapisano lokalnie wpis #6.");
  });

  it("supports quantity sessions without optional weight", () => {
    const session = createSession(seed.workers[1]);
    const result = prepareOfflineHarvestEntry({
      actorProfile: operatorProfile,
      session,
      entries: [],
      quantityMilli: 500,
      weightG: null,
      createdDeviceId: "device-1",
      createdAtDevice: createdAt,
      identity: {
        id: "entry-quantity-offline",
        sequenceNumber: 1
      }
    });

    expect(result.status).toBe("CREATED_OFFLINE");
    if (result.status !== "CREATED_OFFLINE") {
      throw new Error("Expected quantity offline entry.");
    }

    expect(result.entry).toMatchObject({
      id: "entry-quantity-offline",
      quantityMilli: 500,
      weightG: null,
      amountPreviewGrosz: 750,
      stockWeightG: null,
      pendingSync: true
    });
    expect(result.nextSessionTotals.estimatedAmountGrosz).toBe(750);
    expect(result.pendingWriteCount).toBe(1);
  });

  it("retries an existing UUID without creating a second local document", () => {
    const session = createSession();
    const existingEntry = createEntry(session, 1, {
      id: "entry-retry",
      pendingSync: true
    });
    const result = prepareOfflineHarvestEntry({
      actorProfile: operatorProfile,
      session,
      entries: [existingEntry],
      quantityMilli: 1000,
      weightG: 1000,
      createdDeviceId: "device-1",
      createdAtDevice: createdAt,
      identity: {
        id: "entry-retry",
        sequenceNumber: 1
      }
    });

    expect(result).toMatchObject({
      status: "RETRY_EXISTING",
      entry: existingEntry,
      entries: [existingEntry],
      selectedSessionId: session.id,
      identity: {
        id: "entry-retry",
        sequenceNumber: 1
      },
      syncState: "LOCAL_PENDING_SYNC",
      nextSessionTotals: {
        totalEntryCount: 1,
        totalQuantityMilli: 1000,
        totalWeightG: 1000,
        estimatedAmountGrosz: 1000
      },
      pendingEntryCount: 1,
      pendingWriteCount: 1,
      readyForNextEntry: true,
      message: "Wpis #1 juz istnieje."
    });
  });

  it("rejects reuse of an existing UUID with a different payload", () => {
    const session = createSession();
    const existingEntry = createEntry(session, 1, {
      id: "entry-collision",
      pendingSync: true
    });

    expect(() =>
      prepareOfflineHarvestEntry({
        actorProfile: operatorProfile,
        session,
        entries: [existingEntry],
        quantityMilli: 3000,
        weightG: 3000,
        createdDeviceId: "device-1",
        createdAtDevice: createdAt,
        identity: {
          id: "entry-collision",
          sequenceNumber: 1
        }
      })
    ).toThrow(
      "Ponowienie wpisu ma ten sam UUID, ale inny payload. Wymagany jest przeglad."
    );

    expect(() =>
      prepareOfflineHarvestEntry({
        actorProfile: {
          ...operatorProfile,
          active: false,
          registrationStatus: "BLOCKED"
        },
        session,
        entries: [existingEntry],
        quantityMilli: 1000,
        weightG: 1000,
        createdDeviceId: "device-1",
        createdAtDevice: createdAt,
        identity: {
          id: "entry-collision",
          sequenceNumber: 1
        }
      })
    ).toThrow("Dodanie wpisu wymaga aktywnego administratora albo operatora.");
  });

  it("blocks invalid actors, sessions and required local metadata", () => {
    const session = createSession();

    expect(() =>
      prepareOfflineHarvestEntry({
        actorProfile: {
          ...operatorProfile,
          role: "PICKER"
        },
        session,
        entries: [],
        quantityMilli: 1000,
        weightG: 1000,
        createdDeviceId: "device-1",
        createdAtDevice: createdAt,
        identity: {
          id: "entry-picker",
          sequenceNumber: 1
        }
      })
    ).toThrow("Dodanie wpisu wymaga aktywnego administratora albo operatora.");
    expect(() =>
      prepareOfflineHarvestEntry({
        actorProfile: operatorProfile,
        session: createSession(seed.workers[0], {
          createdBy: "operator-2"
        }),
        entries: [],
        quantityMilli: 1000,
        weightG: 1000,
        createdDeviceId: "device-1",
        createdAtDevice: createdAt,
        identity: {
          id: "entry-other-operator",
          sequenceNumber: 1
        }
      })
    ).toThrow("Operator moze dodawac wpisy tylko do prowadzonej przez siebie sesji.");
    expect(() =>
      prepareOfflineHarvestEntry({
        actorProfile: adminProfile,
        session: createSession(seed.workers[0], {
          status: "CLOSED"
        }),
        entries: [],
        quantityMilli: 1000,
        weightG: 1000,
        createdDeviceId: "device-admin",
        createdAtDevice: createdAt,
        identity: {
          id: "entry-closed",
          sequenceNumber: 1
        }
      })
    ).toThrow("Wpis mozna dodac tylko do otwartej sesji.");
    expect(() =>
      prepareOfflineHarvestEntry({
        actorProfile: operatorProfile,
        session,
        entries: [],
        quantityMilli: 1000,
        weightG: 1000,
        createdDeviceId: " ",
        createdAtDevice: createdAt,
        identity: {
          id: "entry-missing-device",
          sequenceNumber: 1
        }
      })
    ).toThrow("Wpis offline wymaga urzadzenia tworzacego.");
    expect(() =>
      prepareOfflineHarvestEntry({
        actorProfile: operatorProfile,
        session,
        entries: [],
        quantityMilli: 1000,
        weightG: 1000,
        createdDeviceId: "device-1",
        createdAtDevice: null,
        identity: {
          id: "entry-missing-time",
          sequenceNumber: 1
        }
      })
    ).toThrow("Wpis offline wymaga czasu utworzenia na urzadzeniu.");
  });

  it("counts an offline-created session plus pending entries as local writes", () => {
    const offlineSession = createSession(seed.workers[0], {
      createdAtServer: null
    });
    const syncedSession = createSession();

    expect(
      countPendingHarvestWrites({
        session: offlineSession,
        entries: [
          createEntry(offlineSession, 1, { pendingSync: true }),
          createEntry(offlineSession, 2, { pendingSync: false })
        ]
      })
    ).toBe(2);
    expect(
      countPendingHarvestWrites({
        session: syncedSession,
        entries: [createEntry(syncedSession, 1, { pendingSync: true })]
      })
    ).toBe(1);
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
    createdAtServer: "created-server",
    updatedAtServer: "updated-server",
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
