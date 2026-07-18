import {
  createInitialDomainSeed,
  type WorkerDocument
} from "../domain/domainConfiguration";
import type { UserProfile } from "../domain/identity";
import {
  canActorEditLocalHarvestEntry,
  prepareHarvestEntryCorrection,
  type CorrectableHarvestEntry
} from "./harvestEntryCorrection";
import {
  prepareOpenHarvestSession,
  type HarvestSessionDocument
} from "./openHarvestSession";

const createdAt = "2026-07-17T10:00:00.000Z";
const seed = createInitialDomainSeed({ createdAt });

const adminProfile: UserProfile = {
  uid: "admin-1",
  email: "admin@example.test",
  displayName: "Admin",
  role: "ADMIN",
  active: true,
  registrationStatus: "APPROVED",
  offlineConsent: true
};

const operatorProfile: UserProfile = {
  ...adminProfile,
  uid: "operator-1",
  role: "OPERATOR"
};

const otherOperatorProfile: UserProfile = {
  ...adminProfile,
  uid: "operator-2",
  role: "OPERATOR"
};

const pickerProfile: UserProfile = {
  ...adminProfile,
  uid: "picker-1",
  role: "PICKER",
  workerId: "worker-anna-test"
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

function entryFor(
  session: HarvestSessionDocument,
  overrides: Partial<CorrectableHarvestEntry> = {}
): CorrectableHarvestEntry {
  return {
    id: "entry-1",
    sequenceNumber: 1,
    sessionId: session.id,
    seasonId: session.seasonId,
    workerId: session.workerId,
    businessDate: session.businessDate,
    status: "ACTIVE",
    pendingSync: true,
    createdBy: operatorProfile.uid,
    createdDeviceId: "device-1",
    quantityMilli: 1000,
    weightG: 1000,
    ...overrides
  };
}

describe("harvest entry correction", () => {
  it("updates an own local pending entry in place and preserves identity", () => {
    const session = createSession();
    const entry = entryFor(session);

    const result = prepareHarvestEntryCorrection({
      actorProfile: operatorProfile,
      session,
      entry,
      currentDeviceId: "device-1",
      correctedValues: {
        quantityMilli: 1250,
        weightG: 1250
      }
    });

    expect(result).toEqual({
      type: "UPDATE_LOCAL_ENTRY",
      entryId: "entry-1",
      updatedEntry: {
        ...entry,
        quantityMilli: 1250,
        weightG: 1250,
        pendingSync: true,
        correctionLabel: "Poprawiono lokalnie"
      }
    });
  });

  it("allows admin to edit a pending local entry on the session device", () => {
    const session = createSession();
    const entry = entryFor(session, {
      createdBy: otherOperatorProfile.uid
    });

    expect(
      canActorEditLocalHarvestEntry({
        actorProfile: adminProfile,
        session,
        entry,
        currentDeviceId: "device-1"
      })
    ).toBe(true);
    expect(() =>
      prepareHarvestEntryCorrection({
        actorProfile: adminProfile,
        session,
        entry,
        currentDeviceId: "device-1",
        correctedValues: {
          quantityMilli: 2000,
          weightG: 2000
        }
      })
    ).not.toThrow();
  });

  it("blocks operator and picker from editing someone else's pending entry", () => {
    const session = createSession();
    const entry = entryFor(session, {
      createdBy: otherOperatorProfile.uid
    });

    expect(
      canActorEditLocalHarvestEntry({
        actorProfile: operatorProfile,
        session,
        entry,
        currentDeviceId: "device-1"
      })
    ).toBe(false);
    expect(() =>
      prepareHarvestEntryCorrection({
        actorProfile: operatorProfile,
        session,
        entry,
        currentDeviceId: "device-1",
        correctedValues: {
          quantityMilli: 1000,
          weightG: 1000
        }
      })
    ).toThrow("Operator moze poprawiac tylko wlasny niezsynchronizowany wpis.");
    expect(() =>
      prepareHarvestEntryCorrection({
        actorProfile: pickerProfile,
        session,
        entry,
        currentDeviceId: "device-1",
        correctedValues: {
          quantityMilli: 1000,
          weightG: 1000
        }
      })
    ).toThrow("Operator moze poprawiac tylko wlasny niezsynchronizowany wpis.");
  });

  it("replaces a confirmed entry only through admin cancellation and a new UUID", () => {
    const session = createSession();
    const entry = entryFor(session, {
      pendingSync: false
    });

    const result = prepareHarvestEntryCorrection({
      actorProfile: adminProfile,
      session,
      entry,
      currentDeviceId: "device-1",
      correctedValues: {
        quantityMilli: 1750,
        weightG: 1750
      },
      replacementIdentity: {
        id: "entry-2",
        sequenceNumber: 2
      },
      cancellationReason: "Bledna waga."
    });

    expect(result).toMatchObject({
      type: "CANCEL_AND_REPLACE_CONFIRMED_ENTRY",
      cancelledEntry: {
        id: "entry-1",
        status: "CANCELLED",
        cancellationReason: "Bledna waga.",
        cancelledBy: "admin-1"
      },
      replacementEntry: {
        id: "entry-2",
        sequenceNumber: 2,
        status: "ACTIVE",
        pendingSync: true,
        createdBy: "admin-1",
        createdDeviceId: "device-1",
        quantityMilli: 1750,
        weightG: 1750,
        replacesEntryId: "entry-1",
        correctionLabel: "Korekta wpisu #1"
      }
    });
  });

  it("blocks operator correction of a confirmed entry", () => {
    const session = createSession();
    const entry = entryFor(session, {
      pendingSync: false
    });

    expect(
      canActorEditLocalHarvestEntry({
        actorProfile: operatorProfile,
        session,
        entry,
        currentDeviceId: "device-1"
      })
    ).toBe(false);
    expect(() =>
      prepareHarvestEntryCorrection({
        actorProfile: operatorProfile,
        session,
        entry,
        currentDeviceId: "device-1",
        correctedValues: {
          quantityMilli: 1000,
          weightG: 1000
        }
      })
    ).toThrow(
      "Zsynchronizowany wpis moze skorygowac tylko administrator przez anulowanie i nowy wpis."
    );
  });

  it("requires cancellation reason and a different replacement UUID for confirmed entries", () => {
    const session = createSession();
    const entry = entryFor(session, {
      pendingSync: false
    });

    expect(() =>
      prepareHarvestEntryCorrection({
        actorProfile: adminProfile,
        session,
        entry,
        currentDeviceId: "device-1",
        correctedValues: {
          quantityMilli: 1000,
          weightG: 1000
        },
        replacementIdentity: {
          id: "entry-1",
          sequenceNumber: 2
        },
        cancellationReason: "Bledny wpis."
      })
    ).toThrow("Korekta zsynchronizowanego wpisu wymaga innego UUID.");
    expect(() =>
      prepareHarvestEntryCorrection({
        actorProfile: adminProfile,
        session,
        entry,
        currentDeviceId: "device-1",
        correctedValues: {
          quantityMilli: 1000,
          weightG: 1000
        },
        replacementIdentity: {
          id: "entry-2",
          sequenceNumber: 2
        },
        cancellationReason: "   "
      })
    ).toThrow("Anulowanie zsynchronizowanego wpisu wymaga powodu.");
  });

  it("blocks corrections outside an open session, active entry and session device", () => {
    const session = createSession();
    const entry = entryFor(session);

    expect(() =>
      prepareHarvestEntryCorrection({
        actorProfile: operatorProfile,
        session: {
          ...session,
          status: "CLOSED"
        },
        entry,
        currentDeviceId: "device-1",
        correctedValues: {
          quantityMilli: 1000,
          weightG: 1000
        }
      })
    ).toThrow("Wpis mozna poprawic tylko w otwartej sesji.");
    expect(() =>
      prepareHarvestEntryCorrection({
        actorProfile: operatorProfile,
        session,
        entry: {
          ...entry,
          status: "CANCELLED"
        },
        currentDeviceId: "device-1",
        correctedValues: {
          quantityMilli: 1000,
          weightG: 1000
        }
      })
    ).toThrow("Anulowanego wpisu nie mozna poprawic.");
    expect(() =>
      prepareHarvestEntryCorrection({
        actorProfile: operatorProfile,
        session,
        entry,
        currentDeviceId: "device-2",
        correctedValues: {
          quantityMilli: 1000,
          weightG: 1000
        }
      })
    ).toThrow("Wpis mozna poprawic tylko na urzadzeniu prowadzacym sesje.");
  });

  it("validates corrected values against session plan snapshots", () => {
    const weightSession = createSession();
    const quantitySession = createSession(seed.workers[1]);

    expect(() =>
      prepareHarvestEntryCorrection({
        actorProfile: operatorProfile,
        session: weightSession,
        entry: entryFor(weightSession),
        currentDeviceId: "device-1",
        correctedValues: {
          quantityMilli: 1000,
          weightG: null
        }
      })
    ).toThrow("Poprawiona waga musi byc wieksza od zera.");
    expect(() =>
      prepareHarvestEntryCorrection({
        actorProfile: operatorProfile,
        session: weightSession,
        entry: entryFor(weightSession),
        currentDeviceId: "device-1",
        correctedValues: {
          quantityMilli: 1000,
          weightG: 1250
        }
      })
    ).toThrow("Plan wagowy wymaga zgodnosci poprawionej ilosci i wagi.");
    expect(() =>
      prepareHarvestEntryCorrection({
        actorProfile: operatorProfile,
        session: quantitySession,
        entry: entryFor(quantitySession, {
          weightG: null
        }),
        currentDeviceId: "device-1",
        correctedValues: {
          quantityMilli: 1250,
          weightG: null
        }
      })
    ).toThrow("Poprawiona ilosc nie miesci sie w precyzji planu.");
  });
});
