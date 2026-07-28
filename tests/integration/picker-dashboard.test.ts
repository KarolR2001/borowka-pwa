import {
  initializeTestEnvironment,
  type RulesTestEnvironment
} from "@firebase/rules-unit-testing";
import { Timestamp, doc, setDoc } from "firebase/firestore";
import { readFileSync } from "node:fs";

import type { UserProfile } from "../../src/domain/identity";
import { loadPickerDashboard } from "../../src/picker/pickerDashboard";

const projectId = "demo-borowka-pwa-picker-dashboard-integration";

const firebaseServicesMock = vi.hoisted(() => ({
  getFirebaseServices: vi.fn()
}));

vi.mock("../../src/config/firebaseServices", () => ({
  getFirebaseServices: firebaseServicesMock.getFirebaseServices
}));

const pickerProfile: UserProfile = {
  active: true,
  displayName: "Anna Konto",
  email: "anna@example.test",
  offlineConsent: true,
  registrationStatus: "APPROVED",
  role: "PICKER",
  uid: "picker-anna",
  workerId: "worker-anna"
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
      setDoc(doc(db, "users", pickerProfile.uid), pickerProfile),
      setDoc(doc(db, "workers", "worker-anna"), workerDocument()),
      setDoc(doc(db, "seasons", "season-2026"), seasonDocument()),
      setDoc(
        doc(db, "harvestSessions", "session-closed"),
        sessionDocument("session-closed", "CLOSED", 7500)
      ),
      setDoc(
        doc(db, "harvestSessions", "session-paid"),
        sessionDocument("session-paid", "PAID", 5000)
      ),
      setDoc(doc(db, "payments", "payment-active"), paymentDocument())
    ]);
  });

  firebaseServicesMock.getFirebaseServices.mockReturnValue({
    firestore: testEnvironment
      .authenticatedContext(pickerProfile.uid, { email: pickerProfile.email })
      .firestore()
  });
});

afterAll(async () => {
  await testEnvironment?.cleanup();
});

describe("picker dashboard Firestore read", () => {
  it("reads the private dashboard through production rules", async () => {
    const result = await loadPickerDashboard(
      {},
      {
        actorProfile: pickerProfile,
        isOnline: true
      }
    );

    expect(result).toMatchObject({
      accruedAmountGrosz: 12_500,
      dataSource: "SERVER",
      invalidPaymentCount: 0,
      invalidSeasonCount: 0,
      invalidSessionCount: 0,
      invalidWorker: false,
      paidAmountGrosz: 5000,
      remainingAmountGrosz: 7500,
      selectedSeasonId: "season-2026",
      sessionCounts: {
        closed: 1,
        open: 0,
        paid: 1
      },
      totalWeightG: 12_500,
      workerName: "Anna Zbieracz"
    });
  });
});

function workerDocument() {
  return {
    active: true,
    archivedAt: null,
    createdAt: Timestamp.now(),
    createdBy: "admin-1",
    currentPlanId: "plan-weight",
    currentRateVersionId: "rate-1",
    displayName: "Anna Zbieracz",
    emailContact: null,
    id: "worker-anna",
    legacyName: null,
    linkedUserUid: pickerProfile.uid,
    normalizedName: "anna zbieracz",
    notes: null,
    phone: null,
    updatedAt: Timestamp.now()
  };
}

function seasonDocument() {
  return {
    closedAt: null,
    closedBy: null,
    createdAt: Timestamp.now(),
    createdBy: "admin-1",
    endDate: "2026-09-30",
    id: "season-2026",
    isDefault: true,
    name: "Sezon 2026",
    reopenedAt: null,
    startDate: "2026-07-01",
    status: "OPEN"
  };
}

function sessionDocument(id: string, status: "CLOSED" | "PAID", amount: number) {
  return {
    allowBatchQuantitySnapshot: true,
    amountDueGrosz: amount,
    businessDate: id === "session-paid" ? "2026-07-28" : "2026-07-27",
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
    id,
    legacyImport: false,
    legacySourceRows: [],
    note: null,
    paidAt: status === "PAID" ? Timestamp.now() : null,
    paymentId: status === "PAID" ? "payment-active" : null,
    planIdSnapshot: "plan-weight",
    planNameSnapshot: "Za kilogram",
    quantityPrecisionSnapshot: 3,
    rateGroszSnapshot: 1000,
    rateVersionIdSnapshot: "rate-1",
    revision: status === "PAID" ? 3 : 2,
    seasonId: "season-2026",
    status,
    totalEntryCount: 2,
    totalQuantityMilli: status === "PAID" ? 5000 : 7500,
    totalWeightG: status === "PAID" ? 5000 : 7500,
    unitLabelPluralSnapshot: "kilogramy",
    unitLabelSnapshot: "kilogram",
    updatedAtServer: Timestamp.now(),
    weightRequiredSnapshot: true,
    workerId: "worker-anna",
    workerNameSnapshot: "Anna Zbieracz"
  };
}

function paymentDocument() {
  return {
    amountGrosz: 5000,
    cancellationReason: null,
    cancelledAt: null,
    cancelledBy: null,
    creationAttemptId: "attempt-payment-active",
    createdAtServer: Timestamp.now(),
    createdBy: "admin-1",
    id: "payment-active",
    legacyImport: false,
    note: null,
    paidBusinessDate: "2026-07-28",
    paymentMethod: "CASH",
    seasonId: "season-2026",
    sessionId: "session-paid",
    status: "ACTIVE",
    workerId: "worker-anna",
    workerNameSnapshot: "Anna Zbieracz"
  };
}
