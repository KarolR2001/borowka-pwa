import {
  initializeTestEnvironment,
  type RulesTestEnvironment
} from "@firebase/rules-unit-testing";
import { Timestamp, doc, setDoc } from "firebase/firestore";
import { readFileSync } from "node:fs";

import type { UserProfile } from "../../src/domain/identity";
import {
  listAdminPayments,
  summarizeAdminPayments
} from "../../src/payments/paymentDirectory";

const projectId = "demo-borowka-pwa-payment-directory";

const firebaseServicesMock = vi.hoisted(() => ({
  getFirebaseServices: vi.fn()
}));

vi.mock("../../src/config/firebaseServices", () => ({
  getFirebaseServices: firebaseServicesMock.getFirebaseServices
}));

const adminProfile: UserProfile = {
  active: true,
  displayName: "Admin Payment Directory",
  email: "admin-payment-directory@example.test",
  offlineConsent: false,
  registrationStatus: "APPROVED",
  role: "ADMIN",
  uid: "admin-payment-directory",
  workerId: null
};

let testEnvironment: RulesTestEnvironment | undefined;

beforeAll(async () => {
  testEnvironment = await initializeTestEnvironment({
    firestore: {
      host: "127.0.0.1",
      port: 8080,
      rules: readFileSync("firestore.rules", "utf8")
    },
    projectId
  });
});

beforeEach(async () => {
  await testEnvironment?.clearFirestore();
  firebaseServicesMock.getFirebaseServices.mockReset();

  if (!testEnvironment) {
    throw new Error("Rules test environment was not initialized.");
  }

  await testEnvironment.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();

    await Promise.all([
      setDoc(doc(db, "users", adminProfile.uid), adminProfile),
      setDoc(doc(db, "seasons", "season-2026"), seasonDocument()),
      setDoc(
        doc(db, "harvestSessions", "session-active"),
        sessionDocument("session-active", "PAID")
      ),
      setDoc(
        doc(db, "harvestSessions", "session-cancelled"),
        sessionDocument("session-cancelled", "CLOSED")
      ),
      setDoc(
        doc(db, "harvestSessions", "session-imported"),
        sessionDocument("session-imported", "PAID")
      ),
      setDoc(
        doc(db, "payments", "session-active"),
        paymentDocument("session-active", {
          amountGrosz: 5000,
          paidBusinessDate: "2026-07-20"
        })
      ),
      setDoc(
        doc(db, "payments", "session-cancelled"),
        paymentDocument("session-cancelled", {
          amountGrosz: 7500,
          cancellationReason: "Bledna metoda",
          cancelledAt: Timestamp.fromDate(new Date("2026-07-22T10:00:00.000Z")),
          cancelledBy: "admin-2",
          paidBusinessDate: "2026-07-21",
          status: "CANCELLED",
          workerId: "worker-b",
          workerNameSnapshot: "Barbara"
        })
      ),
      setDoc(
        doc(db, "payments", "session-imported"),
        paymentDocument("session-imported", {
          amountGrosz: 12_500,
          legacyImport: true,
          paidBusinessDate: "2026-07-22",
          workerId: "worker-c",
          workerNameSnapshot: "Celina"
        })
      )
    ]);
  });

  firebaseServicesMock.getFirebaseServices.mockReturnValue({
    firestore: testEnvironment
      .authenticatedContext(adminProfile.uid, { email: adminProfile.email })
      .firestore()
  });
});

afterAll(async () => {
  await testEnvironment?.cleanup();
});

describe("admin payment directory Firestore read", () => {
  it("reads all payment states and sums only active documents", async () => {
    const result = await listAdminPayments({}, adminProfile);

    expect(result).toMatchObject({
      invalidPaymentCount: 0,
      invalidSeasonCount: 0,
      invalidSessionCount: 0,
      missingSourceSessionCount: 0
    });
    expect(result.payments.map((payment) => payment.id)).toEqual([
      "session-imported",
      "session-cancelled",
      "session-active"
    ]);
    expect(result.payments[1]).toMatchObject({
      cancellationReason: "Bledna metoda",
      cancelledBy: "admin-2",
      seasonName: "Sezon 2026",
      sourceSession: {
        status: "CLOSED"
      },
      status: "CANCELLED",
      workerName: "Barbara"
    });
    expect(summarizeAdminPayments(result.payments)).toEqual({
      activeAmountGrosz: 17_500,
      activeCount: 2,
      cancelledCount: 1,
      importedCount: 1,
      totalCount: 3
    });
  });
});

function paymentDocument(id: string, overrides: Record<string, unknown> = {}) {
  return {
    amountGrosz: 5000,
    cancellationReason: null,
    cancelledAt: null,
    cancelledBy: null,
    creationAttemptId: `attempt-${id}`,
    createdAtServer: Timestamp.fromDate(new Date("2026-07-20T12:00:00.000Z")),
    createdBy: adminProfile.uid,
    id,
    legacyImport: false,
    note: null,
    paidBusinessDate: "2026-07-20",
    paymentMethod: "CASH",
    seasonId: "season-2026",
    sessionId: id,
    status: "ACTIVE",
    workerId: "worker-a",
    workerNameSnapshot: "Anna",
    ...overrides
  };
}

function sessionDocument(id: string, status: "CLOSED" | "PAID") {
  return {
    allowBatchQuantitySnapshot: true,
    amountDueGrosz: 5000,
    businessDate: id === "session-active" ? "2026-07-18" : "2026-07-19",
    calculationBasisSnapshot: "WEIGHT",
    calculationVersion: "1",
    cancellationReason: null,
    cancelledAt: null,
    cancelledBy: null,
    closedAtDevice: Timestamp.fromDate(new Date("2026-07-19T10:00:00.000Z")),
    closedAtServer: Timestamp.fromDate(new Date("2026-07-19T10:01:00.000Z")),
    closedBy: "operator-1",
    createdAtDevice: Timestamp.fromDate(new Date("2026-07-19T08:00:00.000Z")),
    createdAtServer: Timestamp.fromDate(new Date("2026-07-19T08:01:00.000Z")),
    createdBy: "operator-1",
    createdDeviceId: "device-operator",
    id,
    legacyImport: false,
    legacySourceRows: [],
    note: null,
    paidAt:
      status === "PAID" ? Timestamp.fromDate(new Date("2026-07-20T12:00:00.000Z")) : null,
    paymentId: status === "PAID" ? id : null,
    planIdSnapshot: "plan-weight",
    planNameSnapshot: "Za kilogram",
    quantityPrecisionSnapshot: 3,
    rateGroszSnapshot: 1000,
    rateVersionIdSnapshot: "rate-1",
    revision: status === "PAID" ? 3 : 4,
    seasonId: "season-2026",
    status,
    totalEntryCount: 2,
    totalQuantityMilli: 2000,
    totalWeightG: 5000,
    unitLabelPluralSnapshot: "kilogramy",
    unitLabelSnapshot: "kilogram",
    updatedAtServer: Timestamp.fromDate(new Date("2026-07-20T12:00:00.000Z")),
    weightRequiredSnapshot: true,
    workerId: id === "session-cancelled" ? "worker-b" : "worker-a",
    workerNameSnapshot: id === "session-cancelled" ? "Barbara" : "Anna"
  };
}

function seasonDocument() {
  return {
    closedAt: null,
    closedBy: null,
    createdAt: Timestamp.now(),
    createdBy: adminProfile.uid,
    endDate: "2026-09-30",
    id: "season-2026",
    isDefault: true,
    name: "Sezon 2026",
    reopenedAt: null,
    startDate: "2026-07-01",
    status: "OPEN"
  };
}
