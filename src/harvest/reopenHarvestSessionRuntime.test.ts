import {
  createInitialDomainSeed,
  type WorkerDocument
} from "../domain/domainConfiguration";
import type { UserProfile } from "../domain/identity";
import type { CalculableHarvestEntry } from "./harvestSessionCalculation";
import type { HarvestEntryDocument } from "./harvestSessionDashboard";
import { prepareCloseHarvestSessionOnline } from "./closeHarvestSession";
import {
  prepareOpenHarvestSession,
  type HarvestSessionDocument
} from "./openHarvestSession";
import {
  prepareRuntimeReopenHarvestSession,
  reopenHarvestSessionOnline
} from "./reopenHarvestSessionRuntime";

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
  getDocFromServer: vi.fn(),
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
  serverTimestamp: vi.fn(() => "server-reopen-time"),
  setDoc: vi.fn(),
  Timestamp: {
    now: vi.fn(() => "device-reopen-time")
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
const closedAt = "2026-07-17T12:00:00.000Z";
const reopenedAt = "2026-07-17T13:00:00.000Z";
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
  firestoreLiteMock.getDocFromServer.mockReset();
  firestoreLiteMock.getDocs.mockReset();
  firestoreLiteMock.orderBy.mockClear();
  firestoreLiteMock.query.mockClear();
  firestoreLiteMock.serverTimestamp.mockClear();
  firestoreLiteMock.setDoc.mockReset();
  firestoreLiteMock.setDoc.mockResolvedValue(undefined);
  firestoreLiteMock.Timestamp.now.mockClear();
  firestoreLiteMock.where.mockClear();
  firestoreLiteMock.writeBatch.mockReturnValue(firestoreLiteMock.batch);
});

describe("reopen harvest session runtime", () => {
  it("writes the reopen update and audit event in one Firestore batch", async () => {
    const session = createClosedSession();
    const entry = createEntry(session, 1);

    firestoreLiteMock.getDoc.mockResolvedValue(existingSnapshot(session.id, session));
    firestoreLiteMock.getDocs.mockResolvedValue({
      docs: [existingSnapshot(entry.id, entry)]
    });
    firestoreLiteMock.getDocFromServer.mockImplementation((ref: { id: string }) =>
      existingSnapshot(ref.id, {
        id: ref.id,
        seasonId: session.seasonId,
        sourceId: session.id,
        sourceType: "HARVEST_SESSION",
        updatedAt: "server-reopen-time",
        updatedBy: adminProfile.uid,
        weightImpactG: 0
      })
    );

    const result = await reopenHarvestSessionOnline(
      {
        VITE_APP_ENV: "development"
      },
      {
        actorProfile: adminProfile,
        sessionId: session.id,
        reason: "Korekta wpisu po zamknieciu.",
        hasActivePayment: false,
        isOnline: true,
        deviceId: "device-admin"
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
        status: "OPEN",
        amountDueGrosz: null,
        closedAtDevice: null,
        closedAtServer: null,
        closedBy: null,
        updatedAtServer: "server-reopen-time",
        revision: 3
      })
    );
    expect(firestoreLiteMock.batch.set).toHaveBeenCalledWith(
      expect.objectContaining({
        collectionPath: "auditEvents"
      }),
      expect.objectContaining({
        action: "HARVEST_SESSION_REOPENED",
        entityType: "HARVEST_SESSION",
        entityId: session.id,
        reason: "Korekta wpisu po zamknieciu."
      })
    );
    expect(firestoreLiteMock.batch.commit).toHaveBeenCalledTimes(1);
    expect(firestoreLiteMock.setDoc).toHaveBeenCalledWith(
      expect.objectContaining({
        path: `operationalStockMovements/harvest-session-${session.id}`
      }),
      expect.objectContaining({
        sourceId: session.id,
        sourceType: "HARVEST_SESSION",
        weightImpactG: 0
      })
    );
    expect(result).toMatchObject({
      selectedSessionId: session.id,
      message: "Ponownie otwarto sesje dla Anna Test.",
      confirmationSummary: {
        previousAmountDueGrosz: 2495,
        reportsMayChange: true,
        reason: "Korekta wpisu po zamknieciu."
      }
    });
  });

  it("prepares reopen update and audit from decoded runtime documents", () => {
    const session = createClosedSession();
    const result = prepareRuntimeReopenHarvestSession({
      actorProfile: adminProfile,
      session,
      entries: [createEntry(session, 1), createEntry(session, 2)],
      reason: "  Korekta wpisu po zamknieciu.  ",
      hasActivePayment: false,
      isOnline: true,
      reopenedAtDevice: reopenedAt,
      reopenedAtServer: "server-reopen-time",
      auditId: "audit-reopen-runtime",
      deviceId: "device-admin"
    });

    expect(result.session).toMatchObject({
      status: "OPEN",
      amountDueGrosz: null,
      closedAtDevice: null,
      closedAtServer: null,
      closedBy: null,
      revision: 3
    });
    expect(result.auditEvent).toMatchObject({
      id: "audit-reopen-runtime",
      action: "HARVEST_SESSION_REOPENED",
      reason: "Korekta wpisu po zamknieciu.",
      beforeSummary: {
        status: "CLOSED",
        amountDueGrosz: 2495,
        revision: 2
      },
      afterSummary: {
        status: "OPEN",
        amountDueGrosz: null,
        revision: 3
      }
    });
  });

  it("blocks non-admin actors and pending writes", () => {
    const session = createClosedSession();

    expect(() =>
      prepareRuntimeReopenHarvestSession({
        actorProfile: operatorProfile,
        session,
        entries: [createEntry(session, 1)],
        reason: "Korekta wpisu po zamknieciu.",
        hasActivePayment: false,
        isOnline: true,
        reopenedAtDevice: reopenedAt,
        reopenedAtServer: "server-reopen-time",
        auditId: "audit-reopen-runtime",
        deviceId: "device-1"
      })
    ).toThrow("Ponowne otwarcie sesji wymaga aktywnego administratora.");
    expect(() =>
      prepareRuntimeReopenHarvestSession({
        actorProfile: adminProfile,
        session,
        entries: [createEntry(session, 1, { pendingSync: true })],
        reason: "Korekta wpisu po zamknieciu.",
        hasActivePayment: false,
        isOnline: true,
        reopenedAtDevice: reopenedAt,
        reopenedAtServer: "server-reopen-time",
        auditId: "audit-reopen-runtime",
        deviceId: "device-admin"
      })
    ).toThrow("Nie mozna ponownie otworzyc sesji z oczekujacymi zapisami.");
  });

  it("blocks active payment state", () => {
    const session = createClosedSession();

    expect(() =>
      prepareRuntimeReopenHarvestSession({
        actorProfile: adminProfile,
        session,
        entries: [createEntry(session, 1)],
        reason: "Korekta wpisu po zamknieciu.",
        hasActivePayment: true,
        isOnline: true,
        reopenedAtDevice: reopenedAt,
        reopenedAtServer: "server-reopen-time",
        auditId: "audit-reopen-runtime",
        deviceId: "device-admin"
      })
    ).toThrow("Aktywna wyplata blokuje to przejscie statusu sesji.");
  });
});

function createClosedSession(
  worker: WorkerDocument = seed.workers[0],
  overrides: Partial<HarvestSessionDocument> = {}
): HarvestSessionDocument {
  const opened = prepareOpenHarvestSession({
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

  if (opened.status !== "CREATED") {
    throw new Error("Expected created session.");
  }

  const closed = prepareCloseHarvestSessionOnline({
    actorProfile: operatorProfile,
    session: opened.session,
    entries: [activeEntry("entry-1", 1000), activeEntry("entry-2", 1495)],
    season: seed.seasons[0],
    worker,
    rateVersion: seed.workerRateVersions[0],
    isOnline: true,
    pendingWriteCount: 0,
    confirmationAccepted: true,
    closedAtDevice: closedAt,
    closedAtServer: "server-close-time",
    auditId: "audit-close-1",
    deviceId: "device-1"
  });

  return {
    ...closed.session,
    ...overrides
  };
}

function activeEntry(
  id: string,
  quantityMilli: number,
  weightG: number | null = quantityMilli
): CalculableHarvestEntry {
  return {
    id,
    status: "ACTIVE",
    quantityMilli,
    weightG
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

function existingSnapshot(id: string, data: unknown) {
  return {
    id,
    exists: () => true,
    data: () => data
  };
}
