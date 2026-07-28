import {
  initializeTestEnvironment,
  type RulesTestEnvironment
} from "@firebase/rules-unit-testing";
import { Timestamp, doc, getDoc, setDoc } from "firebase/firestore";
import { readFileSync } from "node:fs";

import type { UserProfile } from "../../src/domain/identity";
import type { PreparedPaymentConfirmation } from "../../src/payments/paymentConfirmation";
import { createPayment } from "../../src/payments/paymentWrite";

const projectId = "demo-borowka-pwa-payment-write";

const firebaseServicesMock = vi.hoisted(() => ({
  getFirebaseServices: vi.fn()
}));

vi.mock("../../src/config/firebaseServices", () => ({
  getFirebaseServices: firebaseServicesMock.getFirebaseServices
}));

const adminProfile: UserProfile = {
  active: true,
  displayName: "Admin Payment",
  email: "admin-payment@example.test",
  offlineConsent: false,
  registrationStatus: "APPROVED",
  role: "ADMIN",
  uid: "admin-payment",
  workerId: null
};

const confirmation: PreparedPaymentConfirmation = {
  amountGrosz: 1000,
  expectedSessionRevision: 2,
  note: null,
  paidBusinessDate: "2026-07-28",
  paymentId: "session-1",
  paymentMethod: "CASH",
  seasonId: "season-1",
  sessionId: "session-1",
  workerId: "worker-1",
  workerNameSnapshot: "Anna"
};

let testEnvironment: RulesTestEnvironment | undefined;

beforeAll(async () => {
  testEnvironment = await initializeTestEnvironment({
    projectId,
    firestore: {
      host: "127.0.0.1",
      port: 8080,
      rules: readFileSync("firestore.rules", "utf8")
    }
  });
});

beforeEach(async () => {
  await testEnvironment?.clearFirestore();
  firebaseServicesMock.getFirebaseServices.mockReset();

  if (!testEnvironment) {
    throw new Error("Rules test environment was not initialized.");
  }

  await testEnvironment.withSecurityRulesDisabled(async (context) => {
    await Promise.all([
      setDoc(doc(context.firestore(), "users", adminProfile.uid), adminProfile),
      setDoc(
        doc(context.firestore(), "harvestSessions", confirmation.sessionId),
        closedSession()
      )
    ]);
  });

  firebaseServicesMock.getFirebaseServices.mockResolvedValue({
    firestore: testEnvironment
      .authenticatedContext(adminProfile.uid, { email: adminProfile.email })
      .firestore()
  });
});

afterAll(async () => {
  await testEnvironment?.cleanup();
});

describe("payment write Firestore transaction", () => {
  it("atomically creates payment, marks session PAID, appends audit and confirms server state", async () => {
    if (!testEnvironment) {
      throw new Error("Rules test environment was not initialized.");
    }

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
      auditId: "payment-created-session-1",
      confirmationSource: "SERVER_READ_AFTER_COMMIT",
      sessionRevision: 3,
      status: "CONFIRMED"
    });

    const db = testEnvironment
      .authenticatedContext(adminProfile.uid, { email: adminProfile.email })
      .firestore();
    const [paymentSnapshot, sessionSnapshot, auditSnapshot] = await Promise.all([
      getDoc(doc(db, "payments", "session-1")),
      getDoc(doc(db, "harvestSessions", "session-1")),
      getDoc(doc(db, "auditEvents", "payment-created-session-1"))
    ]);

    expect(paymentSnapshot.data()).toMatchObject({
      amountGrosz: 1000,
      createdBy: adminProfile.uid,
      status: "ACTIVE"
    });
    expect(sessionSnapshot.data()).toMatchObject({
      paymentId: "session-1",
      revision: 3,
      status: "PAID"
    });
    expect(auditSnapshot.data()).toMatchObject({
      action: "HARVEST_SESSION_PAID",
      entityId: "session-1"
    });
  });
});

function closedSession() {
  return {
    allowBatchQuantitySnapshot: true,
    amountDueGrosz: 1000,
    businessDate: "2026-07-20",
    calculationBasisSnapshot: "WEIGHT",
    calculationVersion: "1",
    cancellationReason: null,
    cancelledAt: null,
    cancelledBy: null,
    closedAtDevice: Timestamp.now(),
    closedAtServer: Timestamp.now(),
    closedBy: "operator-1",
    createdAtDevice: Timestamp.now(),
    createdAtServer: Timestamp.now(),
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
    revision: 2,
    seasonId: "season-1",
    status: "CLOSED",
    totalEntryCount: 1,
    totalQuantityMilli: 1000,
    totalWeightG: 1000,
    unitLabelPluralSnapshot: "kilogramy",
    unitLabelSnapshot: "kilogram",
    updatedAtServer: Timestamp.now(),
    weightRequiredSnapshot: true,
    workerId: "worker-1",
    workerNameSnapshot: "Anna"
  };
}
