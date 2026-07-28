import {
  initializeTestEnvironment,
  type RulesTestEnvironment
} from "@firebase/rules-unit-testing";
import { Timestamp, doc, setDoc } from "firebase/firestore";
import { readFileSync } from "node:fs";

import type { UserProfile } from "../../src/domain/identity";
import { HARVEST_SESSION_CALCULATION_VERSION } from "../../src/harvest/openHarvestSession";
import { checkPaymentEligibility } from "../../src/payments/paymentEligibility";

const projectId = "demo-borowka-pwa-payment-eligibility";

const firebaseServicesMock = vi.hoisted(() => ({
  getFirebaseServices: vi.fn()
}));

vi.mock("../../src/config/firebaseServices", () => ({
  getFirebaseServices: firebaseServicesMock.getFirebaseServices
}));

const adminProfile: UserProfile = {
  uid: "admin-payment-1",
  email: "admin-payment-1@example.test",
  displayName: "Admin Payment",
  role: "ADMIN",
  workerId: null,
  active: true,
  registrationStatus: "APPROVED",
  offlineConsent: false
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
    const firestore = context.firestore();

    await Promise.all([
      setDoc(doc(firestore, "users", adminProfile.uid), adminProfile),
      setDoc(doc(firestore, "seasons", "season-1"), season()),
      setDoc(doc(firestore, "workers", "worker-1"), worker()),
      setDoc(doc(firestore, "harvestSessions", "session-1"), harvestSession()),
      setDoc(doc(firestore, "harvestEntries", "entry-1"), harvestEntry())
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

describe("payment eligibility Firestore preflight", () => {
  it("accepts a fresh consistent session and then detects an active payment", async () => {
    if (!testEnvironment) {
      throw new Error("Rules test environment was not initialized.");
    }

    const eligible = await checkPaymentEligibility(
      {},
      {
        actorProfile: adminProfile,
        isOnline: true,
        sessionId: "session-1",
        syncDocuments: []
      }
    );

    expect(eligible).toMatchObject({
      amountDueGrosz: 1000,
      blockers: [],
      paymentId: "session-1--payment-r3",
      sessionRevision: 2,
      status: "ELIGIBLE"
    });

    await testEnvironment.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), "payments", "session-1"), {
        id: "session-1",
        sessionId: "session-1",
        status: "ACTIVE"
      });
    });

    const blocked = await checkPaymentEligibility(
      {},
      {
        actorProfile: adminProfile,
        isOnline: true,
        sessionId: "session-1",
        syncDocuments: []
      }
    );

    expect(blocked.status).toBe("BLOCKED");
    expect(blocked.blockers).toEqual([
      expect.objectContaining({ code: "ACTIVE_PAYMENT_EXISTS" })
    ]);
  });
});

function season() {
  return {
    id: "season-1",
    name: "Sezon 2026",
    startDate: "2026-07-01",
    endDate: "2026-09-30",
    status: "CLOSED",
    isDefault: true,
    createdAt: Timestamp.now(),
    createdBy: adminProfile.uid,
    closedAt: Timestamp.now(),
    closedBy: adminProfile.uid,
    reopenedAt: null
  };
}

function worker() {
  return {
    id: "worker-1",
    displayName: "Anna",
    normalizedName: "anna",
    active: false,
    currentPlanId: "plan-1",
    currentRateVersionId: "rate-1",
    linkedUserUid: null,
    phone: null,
    emailContact: null,
    notes: null,
    createdAt: Timestamp.now(),
    createdBy: adminProfile.uid,
    updatedAt: Timestamp.now(),
    archivedAt: Timestamp.now(),
    legacyName: null
  };
}

function harvestSession() {
  return {
    id: "session-1",
    seasonId: "season-1",
    workerId: "worker-1",
    workerNameSnapshot: "Anna",
    businessDate: "2026-07-28",
    status: "CLOSED",
    planIdSnapshot: "plan-1",
    planNameSnapshot: "Za kilogram",
    calculationBasisSnapshot: "WEIGHT",
    unitLabelSnapshot: "kilogram",
    unitLabelPluralSnapshot: "kilogramy",
    rateVersionIdSnapshot: "rate-1",
    rateGroszSnapshot: 1000,
    weightRequiredSnapshot: true,
    quantityPrecisionSnapshot: 3,
    allowBatchQuantitySnapshot: true,
    totalEntryCount: 1,
    totalQuantityMilli: 1000,
    totalWeightG: 1000,
    amountDueGrosz: 1000,
    calculationVersion: HARVEST_SESSION_CALCULATION_VERSION,
    note: null,
    createdBy: "operator-1",
    createdDeviceId: "device-1",
    createdAtDevice: Timestamp.now(),
    createdAtServer: Timestamp.now(),
    updatedAtServer: Timestamp.now(),
    closedAtDevice: Timestamp.now(),
    closedAtServer: Timestamp.now(),
    closedBy: "operator-1",
    paidAt: null,
    paymentId: null,
    cancelledAt: null,
    cancelledBy: null,
    cancellationReason: null,
    revision: 2,
    legacyImport: false,
    legacySourceRows: []
  };
}

function harvestEntry() {
  return {
    id: "entry-1",
    sessionId: "session-1",
    seasonId: "season-1",
    workerId: "worker-1",
    businessDate: "2026-07-28",
    status: "ACTIVE",
    sequenceNumber: 1,
    quantityMilli: 1000,
    weightG: 1000,
    amountPreviewGrosz: 1000,
    stockWeightG: 1000,
    pendingSync: false,
    createdBy: "operator-1",
    createdDeviceId: "device-1",
    createdAtDevice: Timestamp.now(),
    createdAtServer: Timestamp.now(),
    replacesEntryId: null,
    cancellationReason: null,
    cancelledBy: null,
    cancelledAtServer: null,
    revision: 1
  };
}
