import {
  createInitialDomainSeed,
  type WorkerDocument
} from "../domain/domainConfiguration";
import type { UserProfile } from "../domain/identity";
import {
  closeHarvestSessionOnline,
  prepareRuntimeCloseHarvestSession
} from "./closeHarvestSessionRuntime";
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
  serverTimestamp: vi.fn(() => "server-time"),
  Timestamp: {
    now: vi.fn(() => "device-time")
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

vi.mock("firebase/firestore/lite", () => firestoreLiteMock);

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

describe("close harvest session runtime", () => {
  it("writes the close update and audit event in one Firestore batch", async () => {
    const session = createSession();
    const entry = createEntry(session, 1);

    firestoreLiteMock.getDoc.mockImplementation((ref: { path: string }) => {
      switch (ref.path) {
        case `harvestSessions/${session.id}`:
          return existingSnapshot(session.id, session);
        case `seasons/${seed.seasons[0].id}`:
          return existingSnapshot(seed.seasons[0].id, seed.seasons[0]);
        case `workers/${seed.workers[0].id}`:
          return existingSnapshot(seed.workers[0].id, seed.workers[0]);
        case `workerRateVersions/${seed.workerRateVersions[0].id}`:
          return existingSnapshot(
            seed.workerRateVersions[0].id,
            seed.workerRateVersions[0]
          );
        default:
          return missingSnapshot(ref.path);
      }
    });
    firestoreLiteMock.getDocs.mockResolvedValue({
      docs: [existingSnapshot(entry.id, entry)]
    });

    const result = await closeHarvestSessionOnline(
      {
        VITE_APP_ENV: "development"
      },
      {
        actorProfile: operatorProfile,
        sessionId: session.id,
        confirmationAccepted: true,
        isOnline: true,
        deviceId: "device-1"
      }
    );

    expect(firestoreLiteMock.where).toHaveBeenCalledWith("sessionId", "==", session.id);
    expect(firestoreLiteMock.orderBy).toHaveBeenCalledWith("sequenceNumber", "asc");
    expect(firestoreLiteMock.writeBatch).toHaveBeenCalledWith(
      firestoreServiceMock.firestore
    );
    expect(firestoreLiteMock.batch.update).toHaveBeenCalledWith(
      expect.objectContaining({
        path: `harvestSessions/${session.id}`
      }),
      expect.objectContaining({
        status: "CLOSED",
        totalEntryCount: 1,
        amountDueGrosz: 1000,
        closedAtDevice: "device-time",
        closedAtServer: "server-time",
        closedBy: operatorProfile.uid,
        revision: 2
      })
    );
    expect(firestoreLiteMock.batch.set).toHaveBeenCalledWith(
      expect.objectContaining({
        collectionPath: "auditEvents"
      }),
      expect.objectContaining({
        action: "HARVEST_SESSION_CLOSED",
        entityType: "HARVEST_SESSION",
        entityId: session.id
      })
    );
    expect(firestoreLiteMock.batch.commit).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({
      selectedSessionId: null,
      message: "Zamknieto sesje dla Anna Test.",
      confirmationSummary: {
        totalEntryCount: 1,
        amountDueGrosz: 1000
      }
    });
  });

  it("prepares close update and audit from decoded runtime documents", () => {
    const session = createSession();
    const result = prepareRuntimeCloseHarvestSession({
      actorProfile: operatorProfile,
      session,
      entries: [
        createEntry(session, 1, { quantityMilli: 1000, weightG: 1000 }),
        createEntry(session, 2, { quantityMilli: 750, weightG: 750 }),
        createEntry(session, 3, {
          id: "entry-cancelled",
          status: "CANCELLED",
          quantityMilli: 5000,
          weightG: 5000
        })
      ],
      season: seed.seasons[0],
      worker: seed.workers[0],
      rateVersion: seed.workerRateVersions[0],
      confirmationAccepted: true,
      isOnline: true,
      closedAtDevice: closedAt,
      closedAtServer: "server-time",
      auditId: "audit-close-runtime",
      deviceId: "device-1"
    });

    expect(result.session).toMatchObject({
      status: "CLOSED",
      totalEntryCount: 2,
      totalQuantityMilli: 1750,
      totalWeightG: 1750,
      amountDueGrosz: 1750,
      closedBy: operatorProfile.uid,
      revision: 2
    });
    expect(result.sessionUpdate).toMatchObject({
      status: "CLOSED",
      totalEntryCount: 2,
      amountDueGrosz: 1750,
      closedAtServer: "server-time",
      updatedAtServer: "server-time"
    });
    expect(result.auditEvent).toMatchObject({
      id: "audit-close-runtime",
      action: "HARVEST_SESSION_CLOSED",
      entityType: "HARVEST_SESSION",
      entityId: session.id,
      afterSummary: {
        status: "CLOSED",
        totalEntryCount: 2,
        amountDueGrosz: 1750,
        revision: 2
      }
    });
  });

  it("blocks close while runtime entries include pending writes", () => {
    const session = createSession();

    expect(() =>
      prepareRuntimeCloseHarvestSession({
        actorProfile: operatorProfile,
        session,
        entries: [createEntry(session, 1, { pendingSync: true })],
        season: seed.seasons[0],
        worker: seed.workers[0],
        rateVersion: seed.workerRateVersions[0],
        confirmationAccepted: true,
        isOnline: true,
        closedAtDevice: closedAt,
        closedAtServer: "server-time",
        auditId: "audit-close-runtime",
        deviceId: "device-1"
      })
    ).toThrow("Nie mozna zamknac sesji z oczekujacymi zapisami.");
  });

  it("blocks an operator from closing another operator session", () => {
    const session = createSession(seed.workers[0], {
      createdBy: "operator-2"
    });

    expect(() =>
      prepareRuntimeCloseHarvestSession({
        actorProfile: operatorProfile,
        session,
        entries: [createEntry(session, 1)],
        season: seed.seasons[0],
        worker: seed.workers[0],
        rateVersion: seed.workerRateVersions[0],
        confirmationAccepted: true,
        isOnline: true,
        closedAtDevice: closedAt,
        closedAtServer: "server-time",
        auditId: "audit-close-runtime",
        deviceId: "device-1"
      })
    ).toThrow("Operator moze zamknac tylko prowadzona przez siebie sesje.");
  });

  it("allows admin to close another operator session", () => {
    const session = createSession(seed.workers[0], {
      createdBy: "operator-2"
    });
    const result = prepareRuntimeCloseHarvestSession({
      actorProfile: adminProfile,
      session,
      entries: [createEntry(session, 1)],
      season: seed.seasons[0],
      worker: seed.workers[0],
      rateVersion: seed.workerRateVersions[0],
      confirmationAccepted: true,
      isOnline: true,
      closedAtDevice: closedAt,
      closedAtServer: "server-time",
      auditId: "audit-close-runtime",
      deviceId: "device-admin"
    });

    expect(result.session.closedBy).toBe(adminProfile.uid);
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

function existingSnapshot(id: string, data: unknown) {
  return {
    id,
    exists: () => true,
    data: () => data
  };
}

function missingSnapshot(id: string) {
  return {
    id,
    exists: () => false,
    data: () => undefined
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
