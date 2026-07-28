import {
  initializeTestEnvironment,
  type RulesTestEnvironment
} from "@firebase/rules-unit-testing";
import { Timestamp, collection, doc, getDoc, getDocs, setDoc } from "firebase/firestore";
import { readFileSync } from "node:fs";

import type { UserProfile } from "../../src/domain/identity";
import { cancelPayment } from "../../src/payments/paymentCancellation";
import type { PreparedPaymentConfirmation } from "../../src/payments/paymentConfirmation";
import { createPayment } from "../../src/payments/paymentWrite";
import { buildPickerDashboard } from "../../src/picker/pickerDashboard";

const projectId = "demo-borowka-pwa-payment-write";
type FirebaseEnv = Record<string, string | boolean | undefined>;

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

const secondAdminProfile: UserProfile = {
  ...adminProfile,
  displayName: "Second Admin Payment",
  email: "admin-payment-2@example.test",
  uid: "admin-payment-2"
};

const pickerProfile: UserProfile = {
  active: true,
  displayName: "Anna Konto",
  email: "anna@example.test",
  offlineConsent: false,
  registrationStatus: "APPROVED",
  role: "PICKER",
  uid: "picker-anna",
  workerId: "worker-1"
};

const confirmation: PreparedPaymentConfirmation = {
  amountGrosz: 1000,
  expectedSessionRevision: 2,
  note: null,
  paidBusinessDate: "2026-07-28",
  paymentId: "session-1--payment-r3",
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
        doc(context.firestore(), "users", secondAdminProfile.uid),
        secondAdminProfile
      ),
      setDoc(
        doc(context.firestore(), "harvestSessions", confirmation.sessionId),
        closedSession()
      )
    ]);
  });

  firebaseServicesMock.getFirebaseServices.mockImplementation((env: FirebaseEnv) => {
    const profile =
      env.VITE_TEST_PAYMENT_ACTOR === secondAdminProfile.uid
        ? secondAdminProfile
        : adminProfile;

    return {
      firestore: testEnvironment
        ?.authenticatedContext(profile.uid, { email: profile.email })
        .firestore()
    };
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
      auditId: "payment-created-session-1--payment-r3",
      confirmationSource: "SERVER_READ_AFTER_COMMIT",
      sessionRevision: 3,
      status: "CONFIRMED"
    });

    const db = testEnvironment
      .authenticatedContext(adminProfile.uid, { email: adminProfile.email })
      .firestore();
    const [paymentSnapshot, sessionSnapshot, auditSnapshot] = await Promise.all([
      getDoc(doc(db, "payments", confirmation.paymentId)),
      getDoc(doc(db, "harvestSessions", "session-1")),
      getDoc(doc(db, "auditEvents", "payment-created-session-1--payment-r3"))
    ]);

    expect(paymentSnapshot.data()).toMatchObject({
      amountGrosz: 1000,
      createdBy: adminProfile.uid,
      status: "ACTIVE"
    });
    expect(sessionSnapshot.data()).toMatchObject({
      paymentId: "session-1--payment-r3",
      revision: 3,
      status: "PAID"
    });
    expect(auditSnapshot.data()).toMatchObject({
      action: "HARVEST_SESSION_PAID",
      entityId: "session-1"
    });
  });

  it("lets only one of two browser tabs pay the same session", async () => {
    const results = await Promise.all([
      createPaymentAs(adminProfile, "device-tab-1"),
      createPaymentAs(adminProfile, "device-tab-2")
    ]);

    expect(results.map((result) => result.status).sort()).toEqual([
      "ALREADY_PAID",
      "CONFIRMED"
    ]);
    expect(results.find((result) => result.status === "ALREADY_PAID")).toMatchObject({
      confirmationSource: "SERVER_EXISTING_PAYMENT",
      existingPaymentCreatedBy: adminProfile.uid
    });
    await expectSinglePaymentEvidence(adminProfile.uid);
  });

  it("lets only one of two administrators pay the same session", async () => {
    const results = await Promise.all([
      createPaymentAs(adminProfile, "device-admin-1"),
      createPaymentAs(secondAdminProfile, "device-admin-2", {
        ...confirmation,
        note: "Druga rownolegla proba"
      })
    ]);
    const confirmed = results.find((result) => result.status === "CONFIRMED");
    const rejected = results.find((result) => result.status === "ALREADY_PAID");

    if (!confirmed || !rejected) {
      throw new Error("Expected one confirmed and one rejected payment.");
    }

    expect(rejected).toMatchObject({
      confirmationSource: "SERVER_EXISTING_PAYMENT",
      existingPaymentCreatedBy: confirmed.payment.createdBy
    });
    expect(typeof rejected.existingPaymentCreatedAtIso).toBe("string");
    await expectSinglePaymentEvidence(confirmed.payment.createdBy);
  });

  it("reconciles a stale client after another device already paid", async () => {
    await expect(createPaymentAs(adminProfile, "device-current")).resolves.toMatchObject({
      status: "CONFIRMED"
    });

    const staleResult = await createPaymentAs(secondAdminProfile, "device-stale");

    expect(staleResult).toMatchObject({
      confirmationSource: "SERVER_EXISTING_PAYMENT",
      existingPaymentCreatedBy: adminProfile.uid,
      status: "ALREADY_PAID"
    });
    expect(
      staleResult.status === "ALREADY_PAID"
        ? typeof staleResult.existingPaymentCreatedAtIso
        : null
    ).toBe("string");
    await expectSinglePaymentEvidence(adminProfile.uid);
  });

  it("cancels a payment and creates a new historical payment for the next revision", async () => {
    await createPaymentAs(adminProfile, "device-first-payment");

    await expect(
      cancelPayment(
        {},
        {
          actorProfile: adminProfile,
          confirmed: true,
          deviceId: "device-cancellation",
          expectedSessionRevision: 3,
          isOnline: true,
          paymentId: confirmation.paymentId,
          reason: "Bledna metoda"
        }
      )
    ).resolves.toMatchObject({
      sessionRevision: 4,
      status: "CANCELLED"
    });

    const nextConfirmation: PreparedPaymentConfirmation = {
      ...confirmation,
      expectedSessionRevision: 4,
      paidBusinessDate: "2026-07-29",
      paymentId: "session-1--payment-r5"
    };
    await expect(
      createPaymentAs(adminProfile, "device-second-payment", nextConfirmation)
    ).resolves.toMatchObject({
      sessionRevision: 5,
      status: "CONFIRMED"
    });

    if (!testEnvironment) {
      throw new Error("Rules test environment was not initialized.");
    }

    await testEnvironment.withSecurityRulesDisabled(async (context) => {
      const payments = await getDocs(collection(context.firestore(), "payments"));
      expect(
        payments.docs
          .map((snapshot) => String((snapshot.data() as Record<string, unknown>).status))
          .sort()
      ).toEqual(["ACTIVE", "CANCELLED"]);
    });
  });
});

function createPaymentAs(
  profile: UserProfile,
  deviceId: string,
  paymentConfirmation: PreparedPaymentConfirmation = confirmation
) {
  return createPayment(
    {
      VITE_TEST_PAYMENT_ACTOR: profile.uid
    },
    {
      actorProfile: profile,
      confirmation: paymentConfirmation,
      deviceId,
      isOnline: true
    }
  );
}

async function expectSinglePaymentEvidence(
  expectedCreatedBy: string | undefined
): Promise<void> {
  if (!testEnvironment || !expectedCreatedBy) {
    throw new Error("Expected payment evidence is unavailable.");
  }

  await testEnvironment.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    const [payments, audits, session] = await Promise.all([
      getDocs(collection(db, "payments")),
      getDocs(collection(db, "auditEvents")),
      getDoc(doc(db, "harvestSessions", confirmation.sessionId))
    ]);

    expect(payments.docs.map((snapshot) => snapshot.id)).toEqual([
      confirmation.paymentId
    ]);
    expect(payments.docs[0]?.data()).toMatchObject({
      createdBy: expectedCreatedBy,
      id: confirmation.paymentId,
      sessionId: "session-1",
      status: "ACTIVE"
    });
    expect(audits.docs.map((snapshot) => snapshot.id)).toEqual([
      "payment-created-session-1--payment-r3"
    ]);
    expect(session.data()).toMatchObject({
      paymentId: "session-1--payment-r3",
      revision: 3,
      status: "PAID"
    });

    const dashboard = buildPickerDashboard({
      actorProfile: pickerProfile,
      dataSource: "SERVER",
      paymentDocuments: payments.docs.map((snapshot) => ({
        data: snapshot.data(),
        id: snapshot.id
      })),
      refreshedAtIso: "2026-07-28T20:00:00.000Z",
      seasonDocuments: [seasonDocument()],
      selectedSeasonId: "season-1",
      sessionDocuments: [
        {
          data: session.data(),
          id: session.id
        }
      ],
      workerDocument: workerDocument()
    });
    expect(dashboard).toMatchObject({
      accruedAmountGrosz: 1000,
      paidAmountGrosz: 1000,
      remainingAmountGrosz: 0,
      sessionCounts: {
        closed: 0,
        open: 0,
        paid: 1
      }
    });
  });
}

function seasonDocument() {
  return {
    id: "season-1",
    data: {
      closedAt: null,
      closedBy: null,
      createdAt: "2026-06-01T00:00:00.000Z",
      createdBy: "admin-payment",
      endDate: "2026-09-30",
      id: "season-1",
      isDefault: true,
      name: "Sezon 2026",
      reopenedAt: null,
      startDate: "2026-07-01",
      status: "OPEN"
    }
  };
}

function workerDocument() {
  return {
    id: "worker-1",
    data: {
      active: true,
      archivedAt: null,
      createdAt: "2026-06-01T00:00:00.000Z",
      createdBy: "admin-payment",
      currentPlanId: "plan-1",
      currentRateVersionId: "rate-1",
      displayName: "Anna",
      emailContact: null,
      id: "worker-1",
      legacyName: null,
      linkedUserUid: pickerProfile.uid,
      normalizedName: "anna",
      notes: null,
      phone: null,
      updatedAt: "2026-06-01T00:00:00.000Z"
    }
  };
}

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
