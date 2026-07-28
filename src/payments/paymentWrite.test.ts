import type { UserProfile } from "../domain/identity";
import type { HarvestSessionDocument } from "../harvest/openHarvestSession";
import type { PreparedPaymentConfirmation } from "./paymentConfirmation";
import {
  createPayment,
  createPaymentAuditId,
  paymentTimestampToIso,
  preparePaymentWrite
} from "./paymentWrite";

const firestoreServiceMock = vi.hoisted(() => ({
  firestore: { name: "firestore-mock" },
  getFirebaseServices: vi.fn()
}));
const firestoreMock = vi.hoisted(() => ({
  Timestamp: {
    now: vi.fn(() => "device-time")
  },
  doc: vi.fn(
    (_firestore: unknown, collectionPath: string, id: string) =>
      ({ collectionPath, id, path: `${collectionPath}/${id}` }) as const
  ),
  getDocFromServer: vi.fn(),
  runTransaction: vi.fn(),
  serverTimestamp: vi.fn(() => "server-time"),
  transaction: {
    get: vi.fn(),
    set: vi.fn(),
    update: vi.fn()
  }
}));

vi.mock("../config/firebaseServices", () => ({
  getFirebaseServices: firestoreServiceMock.getFirebaseServices
}));

vi.mock("firebase/firestore", () => firestoreMock);

const adminProfile: UserProfile = {
  active: true,
  displayName: "Admin",
  email: "admin@example.test",
  offlineConsent: false,
  registrationStatus: "APPROVED",
  role: "ADMIN",
  uid: "admin-1",
  workerId: null
};

const confirmation: PreparedPaymentConfirmation = {
  amountGrosz: 12_500,
  expectedSessionRevision: 3,
  note: "Rozliczenie tygodnia",
  paidBusinessDate: "2026-07-28",
  paymentId: "session-1--payment-r4",
  paymentMethod: "BANK_TRANSFER",
  seasonId: "season-1",
  sessionId: "session-1",
  workerId: "worker-1",
  workerNameSnapshot: "Anna"
};
const paymentAttemptId = "00000000-0000-4000-8000-000000000001";
const randomUuidMock = vi.spyOn(globalThis.crypto, "randomUUID");

beforeEach(() => {
  randomUuidMock.mockReturnValue(paymentAttemptId);
  firestoreServiceMock.getFirebaseServices.mockClear();
  firestoreServiceMock.getFirebaseServices.mockResolvedValue({
    firestore: firestoreServiceMock.firestore
  });
  firestoreMock.doc.mockClear();
  firestoreMock.getDocFromServer.mockReset();
  firestoreMock.runTransaction.mockReset();
  firestoreMock.serverTimestamp.mockClear();
  firestoreMock.Timestamp.now.mockClear();
  firestoreMock.transaction.get.mockReset();
  firestoreMock.transaction.set.mockClear();
  firestoreMock.transaction.update.mockClear();
});

afterAll(() => {
  randomUuidMock.mockRestore();
});

describe("payment write", () => {
  it("prepares one payment, PAID session update and audit event", () => {
    const session = closedSession();
    const prepared = preparePaymentWrite({
      actorProfile: adminProfile,
      auditId: createPaymentAuditId(session.id),
      confirmation,
      creationAttemptId: paymentAttemptId,
      createdAtDevice: "device-time",
      createdAtServer: "server-time",
      deviceId: "device-admin",
      isOnline: true,
      paidAt: "server-time",
      session
    });

    expect(prepared.payment).toEqual({
      amountGrosz: 12_500,
      cancellationReason: null,
      cancelledAt: null,
      cancelledBy: null,
      creationAttemptId: paymentAttemptId,
      createdAtServer: "server-time",
      createdBy: "admin-1",
      id: "session-1--payment-r4",
      legacyImport: false,
      note: "Rozliczenie tygodnia",
      paidBusinessDate: "2026-07-28",
      paymentMethod: "BANK_TRANSFER",
      seasonId: "season-1",
      sessionId: "session-1",
      status: "ACTIVE",
      workerId: "worker-1",
      workerNameSnapshot: "Anna"
    });
    expect(prepared.sessionUpdate).toEqual({
      paidAt: "server-time",
      paymentId: "session-1--payment-r4",
      revision: 4,
      status: "PAID",
      updatedAtServer: "server-time"
    });
    expect(prepared.auditEvent).toMatchObject({
      action: "HARVEST_SESSION_PAID",
      entityId: "session-1",
      entityType: "HARVEST_SESSION",
      beforeSummary: {
        paymentId: null,
        revision: 3,
        status: "CLOSED"
      },
      afterSummary: {
        paymentId: "session-1--payment-r4",
        revision: 4,
        status: "PAID"
      }
    });
  });

  it("rejects stale, offline and mismatched payment data", () => {
    expect(() =>
      preparePaymentWrite({
        actorProfile: adminProfile,
        auditId: "payment-created-session-1--payment-r4",
        confirmation: { ...confirmation, expectedSessionRevision: 2 },
        creationAttemptId: paymentAttemptId,
        createdAtDevice: "device-time",
        createdAtServer: "server-time",
        deviceId: "device-admin",
        isOnline: true,
        paidAt: "server-time",
        session: closedSession()
      })
    ).toThrow("Sesja zmienila sie po kontroli kwalifikacji");

    expect(() =>
      preparePaymentWrite({
        actorProfile: adminProfile,
        auditId: "payment-created-session-1--payment-r4",
        confirmation,
        creationAttemptId: paymentAttemptId,
        createdAtDevice: "device-time",
        createdAtServer: "server-time",
        deviceId: "device-admin",
        isOnline: false,
        paidAt: "server-time",
        session: closedSession()
      })
    ).toThrow("wymaga aktywnego polaczenia");

    expect(() =>
      preparePaymentWrite({
        actorProfile: adminProfile,
        auditId: "payment-created-session-1--payment-r4",
        confirmation: { ...confirmation, amountGrosz: 1 },
        creationAttemptId: paymentAttemptId,
        createdAtDevice: "device-time",
        createdAtServer: "server-time",
        deviceId: "device-admin",
        isOnline: true,
        paidAt: "server-time",
        session: closedSession()
      })
    ).toThrow("nie odpowiada oficjalnej naleznosci");

    expect(() =>
      preparePaymentWrite({
        actorProfile: adminProfile,
        auditId: "payment-created-session-1--payment-r4",
        confirmation: {
          ...confirmation,
          paymentId: "random-payment-id"
        },
        creationAttemptId: paymentAttemptId,
        createdAtDevice: "device-time",
        createdAtServer: "server-time",
        deviceId: "device-admin",
        isOnline: true,
        paidAt: "server-time",
        session: closedSession()
      })
    ).toThrow("Dane potwierdzenia nie odpowiadaja aktualnej sesji");
  });

  it("confirms the transaction only after fresh server reads", async () => {
    const session = closedSession();
    configureSuccessfulTransaction(session);

    const result = await createPayment(
      {},
      {
        actorProfile: adminProfile,
        confirmation,
        deviceId: "device-admin",
        isOnline: true
      }
    );

    expect(firestoreMock.runTransaction).toHaveBeenCalledWith(
      firestoreServiceMock.firestore,
      expect.any(Function)
    );
    expect(firestoreMock.transaction.set).toHaveBeenCalledWith(
      expect.objectContaining({ path: "payments/session-1--payment-r4" }),
      expect.objectContaining({
        id: "session-1--payment-r4",
        status: "ACTIVE"
      })
    );
    expect(firestoreMock.transaction.update).toHaveBeenCalledWith(
      expect.objectContaining({ path: "harvestSessions/session-1" }),
      expect.objectContaining({
        paymentId: "session-1--payment-r4",
        revision: 4,
        status: "PAID"
      })
    );
    expect(firestoreMock.transaction.set).toHaveBeenCalledWith(
      expect.objectContaining({
        path: "auditEvents/payment-created-session-1--payment-r4"
      }),
      expect.objectContaining({ action: "HARVEST_SESSION_PAID" })
    );
    expect(firestoreMock.getDocFromServer).toHaveBeenCalledTimes(3);
    expect(result).toMatchObject({
      confirmationSource: "SERVER_READ_AFTER_COMMIT",
      sessionRevision: 4,
      status: "CONFIRMED"
    });
  });

  it("reconciles a lost transaction response from authoritative server state", async () => {
    const session = closedSession();
    configureServerConfirmation(session);
    firestoreMock.runTransaction.mockRejectedValue(new Error("unavailable"));

    await expect(
      createPayment(
        {},
        {
          actorProfile: adminProfile,
          confirmation,
          deviceId: "device-admin",
          isOnline: true
        }
      )
    ).resolves.toMatchObject({
      confirmationSource: "SERVER_RECONCILIATION",
      status: "CONFIRMED"
    });
  });

  it("returns the existing author and server time after losing a concurrent attempt", async () => {
    const session = closedSession();
    const createdAtServer = {
      toDate: () => new Date("2026-07-28T14:30:00.000Z")
    };
    configureExistingPaymentTransaction(session, {
      createdAtServer,
      createdBy: "admin-2"
    });

    const result = await createPayment(
      {},
      {
        actorProfile: adminProfile,
        confirmation,
        deviceId: "device-admin",
        isOnline: true
      }
    );

    expect(result).toMatchObject({
      confirmationSource: "SERVER_EXISTING_PAYMENT",
      existingPaymentCreatedAtIso: "2026-07-28T14:30:00.000Z",
      existingPaymentCreatedBy: "admin-2",
      status: "ALREADY_PAID"
    });
    expect(result.message).toContain("admin-2");
    expect(paymentTimestampToIso(createdAtServer)).toBe("2026-07-28T14:30:00.000Z");
  });

  it("does not start a Firestore transaction while offline", async () => {
    await expect(
      createPayment(
        {},
        {
          actorProfile: adminProfile,
          confirmation,
          deviceId: "device-admin",
          isOnline: false
        }
      )
    ).rejects.toThrow("Wyplata wymaga aktywnego polaczenia.");
    expect(firestoreServiceMock.getFirebaseServices).not.toHaveBeenCalled();
  });
});

function configureSuccessfulTransaction(session: HarvestSessionDocument): void {
  firestoreMock.transaction.get.mockImplementation((reference: { path: string }) => {
    if (reference.path === "harvestSessions/session-1") {
      return existingSnapshot("session-1", session);
    }

    return missingSnapshot("session-1");
  });
  firestoreMock.runTransaction.mockImplementation(
    async (_firestore: unknown, callback: (transaction: unknown) => Promise<void>) => {
      await callback(firestoreMock.transaction);
    }
  );
  configureServerConfirmation(session);
}

function configureExistingPaymentTransaction(
  session: HarvestSessionDocument,
  paymentOverrides: Record<string, unknown>
): void {
  const existingPayment = serverPayment(paymentOverrides);
  firestoreMock.transaction.get.mockImplementation((reference: { path: string }) => {
    if (reference.path === "harvestSessions/session-1") {
      return existingSnapshot("session-1", paidSession(session));
    }

    if (reference.path === "payments/session-1--payment-r4") {
      return existingSnapshot("session-1--payment-r4", existingPayment);
    }

    return missingSnapshot(reference.path);
  });
  firestoreMock.runTransaction.mockImplementation(
    async (_firestore: unknown, callback: (transaction: unknown) => Promise<void>) => {
      await callback(firestoreMock.transaction);
    }
  );
  configureServerConfirmation(session, paymentOverrides);
}

function configureServerConfirmation(
  session: HarvestSessionDocument,
  paymentOverrides: Record<string, unknown> = {}
): void {
  const payment = serverPayment(paymentOverrides);
  const audit = {
    action: "HARVEST_SESSION_PAID",
    actorUid: payment.createdBy,
    entityId: "session-1",
    entityType: "HARVEST_SESSION"
  };

  firestoreMock.getDocFromServer.mockImplementation((reference: { path: string }) => {
    switch (reference.path) {
      case "payments/session-1--payment-r4":
        return existingSnapshot("session-1--payment-r4", payment);
      case "harvestSessions/session-1":
        return existingSnapshot("session-1", paidSession(session));
      case "auditEvents/payment-created-session-1--payment-r4":
        return existingSnapshot("payment-created-session-1--payment-r4", audit);
      default:
        return missingSnapshot(reference.path);
    }
  });
}

function paidSession(session: HarvestSessionDocument) {
  return {
    ...session,
    paidAt: "server-time",
    paymentId: "session-1--payment-r4",
    revision: 4,
    status: "PAID",
    updatedAtServer: "server-time"
  };
}

function serverPayment(overrides: Record<string, unknown> = {}) {
  return {
    amountGrosz: confirmation.amountGrosz,
    cancellationReason: null,
    cancelledAt: null,
    cancelledBy: null,
    creationAttemptId: paymentAttemptId,
    createdAtServer: "server-time",
    createdBy: "admin-1",
    id: "session-1--payment-r4",
    legacyImport: false,
    note: confirmation.note,
    paidBusinessDate: confirmation.paidBusinessDate,
    paymentMethod: confirmation.paymentMethod,
    seasonId: confirmation.seasonId,
    sessionId: confirmation.sessionId,
    status: "ACTIVE",
    workerId: confirmation.workerId,
    workerNameSnapshot: confirmation.workerNameSnapshot,
    ...overrides
  };
}

function closedSession(): HarvestSessionDocument {
  return {
    allowBatchQuantitySnapshot: true,
    amountDueGrosz: 12_500,
    businessDate: "2026-07-20",
    calculationBasisSnapshot: "WEIGHT",
    calculationVersion: "1",
    cancellationReason: null,
    cancelledAt: null,
    cancelledBy: null,
    closedAtDevice: "closed-device-time",
    closedAtServer: "closed-server-time",
    closedBy: "operator-1",
    createdAtDevice: "created-device-time",
    createdAtServer: "created-server-time",
    createdBy: "operator-1",
    createdDeviceId: "device-operator",
    id: "session-1",
    legacyImport: false,
    legacySourceRows: [],
    note: null,
    paidAt: null,
    paymentId: null,
    planIdSnapshot: "plan-1",
    planNameSnapshot: "Za kilogram",
    quantityPrecisionSnapshot: 3,
    rateGroszSnapshot: 1000,
    rateVersionIdSnapshot: "rate-1",
    revision: 3,
    seasonId: "season-1",
    status: "CLOSED",
    totalEntryCount: 4,
    totalQuantityMilli: 4000,
    totalWeightG: 12_500,
    unitLabelPluralSnapshot: "kilogramy",
    unitLabelSnapshot: "kilogram",
    updatedAtServer: "closed-server-time",
    weightRequiredSnapshot: true,
    workerId: "worker-1",
    workerNameSnapshot: "Anna"
  };
}

function existingSnapshot(id: string, data: unknown) {
  return {
    data: () => data,
    exists: () => true,
    id
  };
}

function missingSnapshot(id: string) {
  return {
    data: () => undefined,
    exists: () => false,
    id
  };
}
