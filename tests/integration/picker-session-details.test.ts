import {
  initializeTestEnvironment,
  type RulesTestEnvironment
} from "@firebase/rules-unit-testing";
import { Timestamp, doc, setDoc } from "firebase/firestore";
import { readFileSync } from "node:fs";

import type { UserProfile } from "../../src/domain/identity";
import { loadPickerSessionDetails } from "../../src/picker/pickerSessionDetails";

const projectId = "demo-borowka-pwa-picker-session-details";

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
      setDoc(doc(db, "harvestSessions", "session-paid"), sessionDocument()),
      setDoc(
        doc(db, "harvestSessions", "session-bartek"),
        sessionDocument({
          id: "session-bartek",
          paymentId: null,
          status: "CLOSED",
          workerId: "worker-bartek",
          workerNameSnapshot: "Bartek Zbieracz"
        })
      ),
      setDoc(
        doc(db, "harvestEntries", "entry-cancelled"),
        entryDocument("entry-cancelled", 1, {
          cancellationReason: "Bledna waga",
          status: "CANCELLED"
        })
      ),
      setDoc(
        doc(db, "harvestEntries", "entry-correction"),
        entryDocument("entry-correction", 2, {
          quantityMilli: 1500,
          replacesEntryId: "entry-cancelled",
          weightG: 6000
        })
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

describe("picker session details Firestore read", () => {
  it("reads only the safe own-session projection through production rules", async () => {
    const result = await loadPickerSessionDetails(
      {},
      {
        actorProfile: pickerProfile,
        isOnline: true,
        sessionId: "session-paid"
      }
    );

    expect(result).toMatchObject({
      activeEntryCount: 1,
      amountDueGrosz: 2250,
      dataSource: "SERVER",
      invalidEntryCount: 0,
      invalidPayment: false,
      payment: {
        amountGrosz: 2250,
        paidBusinessDate: "2026-07-30",
        paymentMethod: "BANK_TRANSFER"
      },
      planName: "Za ubianke",
      rateGrosz: 1500,
      status: "PAID",
      totalQuantityMilli: 1500,
      totalWeightG: 6000
    });
    expect(result.entries).toEqual([
      expect.objectContaining({
        id: "entry-cancelled",
        status: "CANCELLED"
      }),
      expect.objectContaining({
        id: "entry-correction",
        kind: "CORRECTION",
        replacesEntryId: "entry-cancelled",
        status: "ACTIVE"
      })
    ]);

    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain("Tajna notatka");
    expect(serialized).not.toContain("operator-secret");
    expect(serialized).not.toContain("device-secret");
  });

  it("rejects a foreign session id supplied through navigation", async () => {
    await expect(
      loadPickerSessionDetails(
        {},
        {
          actorProfile: pickerProfile,
          isOnline: true,
          sessionId: "session-bartek"
        }
      )
    ).rejects.toMatchObject({
      code: "permission-denied"
    });
  });
});

function sessionDocument(overrides: Record<string, unknown> = {}) {
  return {
    allowBatchQuantitySnapshot: true,
    amountDueGrosz: 2250,
    businessDate: "2026-07-29",
    calculationBasisSnapshot: "QUANTITY",
    calculationVersion: "1",
    cancellationReason: null,
    cancelledAt: null,
    cancelledBy: null,
    closedAtDevice: Timestamp.now(),
    closedAtServer: Timestamp.now(),
    closedBy: "operator-secret",
    createdAtDevice: Timestamp.now(),
    createdAtServer: Timestamp.now(),
    createdBy: "operator-secret",
    createdDeviceId: "device-secret",
    id: "session-paid",
    legacyImport: false,
    legacySourceRows: [],
    note: "Tajna notatka sesji",
    paidAt: Timestamp.now(),
    paymentId: "payment-active",
    planIdSnapshot: "plan-ubianka",
    planNameSnapshot: "Za ubianke",
    quantityPrecisionSnapshot: 1,
    rateGroszSnapshot: 1500,
    rateVersionIdSnapshot: "rate-1",
    revision: 3,
    seasonId: "season-2026",
    status: "PAID",
    totalEntryCount: 1,
    totalQuantityMilli: 1500,
    totalWeightG: 6000,
    unitLabelPluralSnapshot: "ubianki",
    unitLabelSnapshot: "ubianka",
    updatedAtServer: Timestamp.now(),
    weightRequiredSnapshot: false,
    workerId: "worker-anna",
    workerNameSnapshot: "Anna Zbieracz",
    ...overrides
  };
}

function entryDocument(
  id: string,
  sequenceNumber: number,
  overrides: Record<string, unknown> = {}
) {
  return {
    amountPreviewGrosz: 1500,
    businessDate: "2026-07-29",
    cancellationReason: null,
    cancelledAtServer: null,
    cancelledBy: null,
    createdAtDevice: Timestamp.now(),
    createdAtServer: Timestamp.now(),
    createdBy: "operator-secret",
    createdDeviceId: "device-secret",
    id,
    pendingSync: false,
    quantityMilli: 1000,
    replacesEntryId: null,
    revision: 1,
    seasonId: "season-2026",
    sequenceNumber,
    sessionId: "session-paid",
    status: "ACTIVE",
    stockWeightG: 4000,
    weightG: 4000,
    workerId: "worker-anna",
    ...overrides
  };
}

function paymentDocument() {
  return {
    amountGrosz: 2250,
    cancellationReason: null,
    cancelledAt: null,
    cancelledBy: null,
    creationAttemptId: "attempt-payment-active",
    createdAtServer: Timestamp.now(),
    createdBy: "admin-secret",
    id: "payment-active",
    legacyImport: false,
    note: "Tajna notatka wyplaty",
    paidBusinessDate: "2026-07-30",
    paymentMethod: "BANK_TRANSFER",
    seasonId: "season-2026",
    sessionId: "session-paid",
    status: "ACTIVE",
    workerId: "worker-anna",
    workerNameSnapshot: "Anna Zbieracz"
  };
}
