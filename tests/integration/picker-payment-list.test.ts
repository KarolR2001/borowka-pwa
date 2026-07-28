import {
  initializeTestEnvironment,
  type RulesTestEnvironment
} from "@firebase/rules-unit-testing";
import { Timestamp, doc, setDoc } from "firebase/firestore";
import { readFileSync } from "node:fs";

import type { UserProfile } from "../../src/domain/identity";
import {
  defaultPickerPaymentFilters,
  loadPickerPaymentList,
  summarizePickerPaymentPeriod
} from "../../src/picker/pickerPaymentList";

const projectId = "demo-borowka-pwa-picker-payment-list";

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
      setDoc(doc(db, "seasons", "season-2026"), seasonDocument()),
      setDoc(
        doc(db, "harvestSessions", "session-paid"),
        sessionDocument("session-paid", "PAID", 5000, "2026-07-28")
      ),
      setDoc(
        doc(db, "harvestSessions", "session-closed"),
        sessionDocument("session-closed", "CLOSED", 7500, "2026-07-27")
      ),
      setDoc(
        doc(db, "payments", "payment-active"),
        paymentDocument("payment-active", "session-paid", "ACTIVE", 5000)
      ),
      setDoc(
        doc(db, "payments", "payment-cancelled"),
        paymentDocument("payment-cancelled", "session-closed", "CANCELLED", 7500)
      )
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

describe("picker payment list Firestore read", () => {
  it("reads active and cancelled own payments through production rules", async () => {
    const result = await loadPickerPaymentList(
      {},
      {
        actorProfile: pickerProfile,
        isOnline: true
      }
    );

    expect(result).toMatchObject({
      dataSource: "SERVER",
      invalidPaymentCount: 0,
      invalidSeasonCount: 0,
      invalidSessionCount: 0,
      missingSourceSessionCount: 0
    });
    expect(result.payments).toEqual([
      expect.objectContaining({
        id: "payment-cancelled",
        sessionId: "session-closed",
        status: "CANCELLED"
      }),
      expect.objectContaining({
        id: "payment-active",
        sessionId: "session-paid",
        status: "ACTIVE"
      })
    ]);
    expect(summarizePickerPaymentPeriod(result, defaultPickerPaymentFilters)).toEqual({
      accruedAmountGrosz: 12_500,
      activePaymentCount: 1,
      cancelledAmountGrosz: 7500,
      cancelledPaymentCount: 1,
      paidAmountGrosz: 5000,
      remainingAmountGrosz: 7500
    });

    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain("Tajna notatka");
    expect(serialized).not.toContain("admin-secret");
  });
});

function seasonDocument() {
  return {
    closedAt: null,
    closedBy: null,
    createdAt: Timestamp.now(),
    createdBy: "admin-secret",
    endDate: "2026-09-30",
    id: "season-2026",
    isDefault: true,
    name: "Sezon 2026",
    reopenedAt: null,
    startDate: "2026-07-01",
    status: "OPEN"
  };
}

function sessionDocument(
  id: string,
  status: "CLOSED" | "PAID",
  amountDueGrosz: number,
  businessDate: string
) {
  return {
    allowBatchQuantitySnapshot: true,
    amountDueGrosz,
    businessDate,
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
    id,
    legacyImport: false,
    legacySourceRows: [],
    note: "Tajna notatka sesji",
    paidAt: status === "PAID" ? Timestamp.now() : null,
    paymentId: status === "PAID" ? "payment-active" : null,
    planIdSnapshot: "plan-ubianka",
    planNameSnapshot: "Za ubianke",
    quantityPrecisionSnapshot: 1,
    rateGroszSnapshot: 1500,
    rateVersionIdSnapshot: "rate-1",
    revision: 3,
    seasonId: "season-2026",
    status,
    totalEntryCount: 1,
    totalQuantityMilli: amountDueGrosz === 5000 ? 3000 : 5000,
    totalWeightG: amountDueGrosz === 5000 ? 12_000 : 20_000,
    unitLabelPluralSnapshot: "ubianki",
    unitLabelSnapshot: "ubianka",
    updatedAtServer: Timestamp.now(),
    weightRequiredSnapshot: false,
    workerId: "worker-anna",
    workerNameSnapshot: "Anna Zbieracz"
  };
}

function paymentDocument(
  id: string,
  sessionId: string,
  status: "ACTIVE" | "CANCELLED",
  amountGrosz: number
) {
  return {
    amountGrosz,
    cancellationReason: status === "CANCELLED" ? "Korekta administracyjna" : null,
    cancelledAt: status === "CANCELLED" ? Timestamp.now() : null,
    cancelledBy: status === "CANCELLED" ? "admin-secret" : null,
    creationAttemptId: `attempt-${id}`,
    createdAtServer: Timestamp.now(),
    createdBy: "admin-secret",
    id,
    legacyImport: false,
    note: "Tajna notatka wyplaty",
    paidBusinessDate: status === "CANCELLED" ? "2026-07-30" : "2026-07-29",
    paymentMethod: status === "CANCELLED" ? "CASH" : "BANK_TRANSFER",
    seasonId: "season-2026",
    sessionId,
    status,
    workerId: "worker-anna",
    workerNameSnapshot: "Anna Zbieracz"
  };
}
