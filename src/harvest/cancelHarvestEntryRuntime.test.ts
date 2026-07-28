import { createInitialDomainSeed } from "../domain/domainConfiguration";
import type { UserProfile } from "../domain/identity";
import {
  cancelHarvestEntryOnline,
  prepareRuntimeCancelHarvestEntry
} from "./cancelHarvestEntryRuntime";
import { prepareHarvestEntryDocument } from "./harvestEntryRuntime";
import type { HarvestEntryDocument } from "./harvestSessionDashboard";
import {
  prepareOpenHarvestSession,
  type HarvestSessionDocument
} from "./openHarvestSession";

const firestoreServiceMock = vi.hoisted(() => ({
  firestore: { name: "firestore-mock" },
  getFirebaseServices: vi.fn()
}));
const firestoreLiteMock = vi.hoisted(() => ({
  batch: {
    update: vi.fn(),
    set: vi.fn(),
    commit: vi.fn()
  },
  collection: vi.fn(
    (_firestore: unknown, collectionPath: string) =>
      ({
        collectionPath
      }) as const
  ),
  doc: vi.fn(
    (_firestore: unknown, collectionPath: string, id: string) =>
      ({
        collectionPath,
        id,
        path: `${collectionPath}/${id}`
      }) as const
  ),
  getDoc: vi.fn(),
  getDocs: vi.fn(),
  orderBy: vi.fn(
    (fieldPath: string, direction?: string) =>
      ({
        fieldPath,
        direction
      }) as const
  ),
  query: vi.fn(
    (collectionRef: unknown, ...constraints: unknown[]) =>
      ({
        collectionRef,
        constraints
      }) as const
  ),
  serverTimestamp: vi.fn(() => "server-cancel-entry-time"),
  Timestamp: {
    now: vi.fn(() => "device-cancel-entry-time")
  },
  where: vi.fn(
    (fieldPath: string, opStr: string, value: unknown) =>
      ({
        fieldPath,
        opStr,
        value
      }) as const
  ),
  writeBatch: vi.fn()
}));

vi.mock("../config/firebaseServices", () => ({
  getFirebaseServices: firestoreServiceMock.getFirebaseServices
}));

vi.mock("firebase/firestore", () => firestoreLiteMock);

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

beforeEach(() => {
  firestoreServiceMock.getFirebaseServices.mockResolvedValue({
    firestore: firestoreServiceMock.firestore
  });
  firestoreLiteMock.batch.update.mockClear();
  firestoreLiteMock.batch.set.mockClear();
  firestoreLiteMock.batch.commit.mockResolvedValue(undefined);
  firestoreLiteMock.collection.mockClear();
  firestoreLiteMock.doc.mockClear();
  firestoreLiteMock.getDoc.mockReset();
  firestoreLiteMock.getDocs.mockReset();
  firestoreLiteMock.orderBy.mockClear();
  firestoreLiteMock.query.mockClear();
  firestoreLiteMock.serverTimestamp.mockClear();
  firestoreLiteMock.Timestamp.now.mockClear();
  firestoreLiteMock.where.mockClear();
  firestoreLiteMock.writeBatch.mockReturnValue(firestoreLiteMock.batch);
});

describe("cancel harvest entry runtime", () => {
  it("writes the entry cancellation and audit event in one Firestore batch", async () => {
    const session = createSession();
    const entry = createEntry(session);

    firestoreLiteMock.getDoc.mockResolvedValue(existingSnapshot(session.id, session));
    firestoreLiteMock.getDocs.mockResolvedValue({
      docs: [existingSnapshot(entry.id, entry)]
    });

    const result = await cancelHarvestEntryOnline(
      {
        VITE_APP_ENV: "development"
      },
      {
        actorProfile: adminProfile,
        sessionId: session.id,
        entryId: entry.id,
        reason: "Bledna waga",
        isOnline: true,
        deviceId: "device-admin"
      }
    );

    expect(firestoreLiteMock.where).toHaveBeenCalledWith("sessionId", "==", session.id);
    expect(firestoreLiteMock.batch.update).toHaveBeenCalledWith(
      expect.objectContaining({
        path: `harvestEntries/${entry.id}`
      }),
      {
        status: "CANCELLED",
        cancellationReason: "Bledna waga",
        cancelledBy: adminProfile.uid,
        cancelledAtServer: "server-cancel-entry-time",
        revision: 2
      }
    );
    expect(firestoreLiteMock.batch.set).toHaveBeenCalledWith(
      expect.objectContaining({
        collectionPath: "auditEvents"
      }),
      expect.objectContaining({
        action: "HARVEST_ENTRY_CANCELLED",
        entityType: "HARVEST_ENTRY",
        entityId: entry.id,
        reason: "Bledna waga"
      })
    );
    expect(firestoreLiteMock.batch.commit).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({
      selectedSessionId: session.id,
      message: "Anulowano wpis #1.",
      confirmationSummary: {
        entryId: entry.id,
        sequenceNumber: 1,
        workerName: "Anna Test",
        businessDate: "2026-07-17",
        quantityMilli: 1000,
        weightG: 1000,
        reason: "Bledna waga"
      }
    });
  });

  it("prepares a cancelled entry and audit summary", () => {
    const session = createSession();
    const entry = createEntry(session);
    const result = prepareRuntimeCancelHarvestEntry({
      actorProfile: adminProfile,
      session,
      entry,
      entries: [entry],
      reason: "  Bledna   waga  ",
      isOnline: true,
      cancelledAtDevice: "device-cancel-entry-time",
      cancelledAtServer: "server-cancel-entry-time",
      auditId: "audit-entry-cancel",
      deviceId: "device-admin"
    });

    expect(result.entry).toMatchObject({
      id: entry.id,
      status: "CANCELLED",
      cancellationReason: "Bledna waga",
      cancelledBy: adminProfile.uid,
      cancelledAtServer: "server-cancel-entry-time",
      revision: 2
    });
    expect(result.auditEvent).toMatchObject({
      id: "audit-entry-cancel",
      action: "HARVEST_ENTRY_CANCELLED",
      beforeSummary: {
        status: "ACTIVE",
        quantityMilli: 1000,
        weightG: 1000
      },
      afterSummary: {
        status: "CANCELLED",
        cancelledBy: adminProfile.uid
      }
    });
  });

  it("blocks non-admin actors, closed sessions and pending writes", () => {
    const session = createSession();
    const entry = createEntry(session);

    expect(() =>
      prepareRuntimeCancelHarvestEntry({
        actorProfile: operatorProfile,
        session,
        entry,
        entries: [entry],
        reason: "Bledna waga",
        isOnline: true,
        cancelledAtDevice: "device-cancel-entry-time",
        cancelledAtServer: "server-cancel-entry-time",
        auditId: "audit-entry-cancel",
        deviceId: "device-admin"
      })
    ).toThrow("Anulowanie wpisu wymaga aktywnego administratora.");
    expect(() =>
      prepareRuntimeCancelHarvestEntry({
        actorProfile: adminProfile,
        session: {
          ...session,
          status: "CLOSED"
        },
        entry,
        entries: [entry],
        reason: "Bledna waga",
        isOnline: true,
        cancelledAtDevice: "device-cancel-entry-time",
        cancelledAtServer: "server-cancel-entry-time",
        auditId: "audit-entry-cancel",
        deviceId: "device-admin"
      })
    ).toThrow("Wpis mozna anulowac tylko w otwartej sesji.");
    expect(() =>
      prepareRuntimeCancelHarvestEntry({
        actorProfile: adminProfile,
        session,
        entry: {
          ...entry,
          pendingSync: true
        },
        entries: [
          {
            ...entry,
            pendingSync: true
          }
        ],
        reason: "Bledna waga",
        isOnline: true,
        cancelledAtDevice: "device-cancel-entry-time",
        cancelledAtServer: "server-cancel-entry-time",
        auditId: "audit-entry-cancel",
        deviceId: "device-admin"
      })
    ).toThrow("Nie mozna anulowac wpisu oczekujacego na synchronizacje.");
  });

  it("blocks active payment and already cancelled entries", () => {
    const session = createSession();
    const entry = createEntry(session);

    expect(() =>
      prepareRuntimeCancelHarvestEntry({
        actorProfile: adminProfile,
        session: {
          ...session,
          paymentId: "payment-1"
        },
        entry,
        entries: [entry],
        reason: "Bledna waga",
        isOnline: true,
        cancelledAtDevice: "device-cancel-entry-time",
        cancelledAtServer: "server-cancel-entry-time",
        auditId: "audit-entry-cancel",
        deviceId: "device-admin"
      })
    ).toThrow("Aktywna wyplata blokuje anulowanie wpisu.");
    expect(() =>
      prepareRuntimeCancelHarvestEntry({
        actorProfile: adminProfile,
        session,
        entry: {
          ...entry,
          status: "CANCELLED"
        },
        entries: [entry],
        reason: "Bledna waga",
        isOnline: true,
        cancelledAtDevice: "device-cancel-entry-time",
        cancelledAtServer: "server-cancel-entry-time",
        auditId: "audit-entry-cancel",
        deviceId: "device-admin"
      })
    ).toThrow("Mozna anulowac tylko aktywny wpis.");
  });

  it("blocks offline, missing reason, unrelated entries and pending writes in session", () => {
    const session = createSession();
    const entry = createEntry(session);
    const pendingOtherEntry: HarvestEntryDocument = {
      ...entry,
      id: "entry-pending",
      sequenceNumber: 2,
      pendingSync: true
    };

    expect(() =>
      prepareRuntimeCancelHarvestEntry({
        actorProfile: adminProfile,
        session,
        entry,
        entries: [entry],
        reason: "Bledna waga",
        isOnline: false,
        cancelledAtDevice: "device-cancel-entry-time",
        cancelledAtServer: "server-cancel-entry-time",
        auditId: "audit-entry-cancel",
        deviceId: "device-admin"
      })
    ).toThrow("Anulowanie wpisu wymaga polaczenia online.");
    expect(() =>
      prepareRuntimeCancelHarvestEntry({
        actorProfile: adminProfile,
        session,
        entry,
        entries: [entry],
        reason: " ",
        isOnline: true,
        cancelledAtDevice: "device-cancel-entry-time",
        cancelledAtServer: "server-cancel-entry-time",
        auditId: "audit-entry-cancel",
        deviceId: "device-admin"
      })
    ).toThrow("Anulowanie wpisu wymaga powodu.");
    expect(() =>
      prepareRuntimeCancelHarvestEntry({
        actorProfile: adminProfile,
        session,
        entry: {
          ...entry,
          sessionId: "other-session"
        },
        entries: [entry],
        reason: "Bledna waga",
        isOnline: true,
        cancelledAtDevice: "device-cancel-entry-time",
        cancelledAtServer: "server-cancel-entry-time",
        auditId: "audit-entry-cancel",
        deviceId: "device-admin"
      })
    ).toThrow("Wpis nie nalezy do wybranej sesji.");
    expect(() =>
      prepareRuntimeCancelHarvestEntry({
        actorProfile: adminProfile,
        session,
        entry,
        entries: [entry, pendingOtherEntry],
        reason: "Bledna waga",
        isOnline: true,
        cancelledAtDevice: "device-cancel-entry-time",
        cancelledAtServer: "server-cancel-entry-time",
        auditId: "audit-entry-cancel",
        deviceId: "device-admin"
      })
    ).toThrow("Nie mozna anulowac wpisu przy oczekujacych zapisach sesji.");
  });
});

function createSession(): HarvestSessionDocument {
  const result = prepareOpenHarvestSession({
    actorProfile: operatorProfile,
    id: "session-1",
    season: seed.seasons[0],
    worker: seed.workers[0],
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

  return result.session;
}

function createEntry(session: HarvestSessionDocument): HarvestEntryDocument {
  const prepared = prepareHarvestEntryDocument({
    actorProfile: operatorProfile,
    session,
    entries: [],
    quantityMilli: 1000,
    weightG: 1000,
    isOnline: true,
    createdDeviceId: session.createdDeviceId,
    createdAtDevice: createdAt,
    createdAtServer: "server-entry-time",
    identity: {
      id: "entry-1",
      sequenceNumber: 1
    }
  });

  return {
    ...prepared.entry,
    pendingSync: false
  };
}

function existingSnapshot(id: string, data: unknown) {
  return {
    id,
    exists: () => true,
    data: () => data
  };
}
