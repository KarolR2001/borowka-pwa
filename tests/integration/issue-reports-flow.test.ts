import {
  initializeTestEnvironment,
  type RulesTestEnvironment
} from "@firebase/rules-unit-testing";
import { Timestamp, doc, setDoc } from "firebase/firestore";
import { readFileSync } from "node:fs";

import type { UserProfile } from "../../src/domain/identity";
import {
  createIssueReport,
  listAdminIssueReports,
  listPickerIssueReports,
  loadIssueReportSource,
  resolveIssueReport
} from "../../src/issues/issueReports";

const projectId = "demo-borowka-pwa-issue-reports-flow";
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
const adminProfile: UserProfile = {
  active: true,
  displayName: "Administrator",
  email: "admin@example.test",
  offlineConsent: false,
  registrationStatus: "APPROVED",
  role: "ADMIN",
  uid: "admin-1",
  workerId: null
};

let currentFirestore: unknown;
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
      setDoc(doc(db, "users", adminProfile.uid), adminProfile),
      setDoc(doc(db, "harvestSessions", "session-paid"), sessionDocument()),
      setDoc(doc(db, "harvestEntries", "entry-1"), entryDocument())
    ]);
  });

  currentFirestore = testEnvironment
    .authenticatedContext(pickerProfile.uid, { email: pickerProfile.email })
    .firestore();
  firebaseServicesMock.getFirebaseServices.mockImplementation(() =>
    Promise.resolve({ firestore: currentFirestore })
  );
});

afterAll(async () => {
  await testEnvironment?.cleanup();
});

describe("issue report Firestore flow", () => {
  it("creates an own entry report, exposes its source to admin and returns resolution", async () => {
    if (!testEnvironment) {
      throw new Error("Rules test environment was not initialized.");
    }

    const created = await createIssueReport(
      {},
      {
        actorProfile: pickerProfile,
        deviceId: "device-picker",
        entryId: "entry-1",
        isOnline: true,
        message: "Waga tego wpisu powinna byc nizsza.",
        sessionId: "session-paid",
        subject: "ENTRY"
      }
    );

    const pickerOpen = await listPickerIssueReports(
      {},
      { actorProfile: pickerProfile, isOnline: true }
    );
    expect(pickerOpen.reports).toEqual([
      expect.objectContaining({
        entryId: "entry-1",
        id: created.id,
        status: "OPEN",
        subject: "ENTRY"
      })
    ]);
    expect(JSON.stringify(pickerOpen)).not.toContain("reporterUid");
    expect(JSON.stringify(pickerOpen)).not.toContain("resolvedBy");

    currentFirestore = testEnvironment
      .authenticatedContext(adminProfile.uid, { email: adminProfile.email })
      .firestore();
    const adminList = await listAdminIssueReports({}, { actorProfile: adminProfile });
    expect(adminList.reports[0]).toMatchObject({
      id: created.id,
      reporterUid: pickerProfile.uid,
      workerId: pickerProfile.workerId
    });

    const source = await loadIssueReportSource(
      {},
      { actorProfile: adminProfile, reportId: created.id }
    );
    expect(source).toMatchObject({
      entry: { id: "entry-1", sequenceNumber: 1 },
      session: {
        id: "session-paid",
        workerId: "worker-anna",
        workerName: "Anna Zbieracz"
      }
    });

    await resolveIssueReport(
      {},
      {
        actorProfile: adminProfile,
        reportId: created.id,
        resolutionNote: "Potwierdzono. Korekta zostanie wykonana osobnym procesem.",
        status: "RESOLVED"
      }
    );

    currentFirestore = testEnvironment
      .authenticatedContext(pickerProfile.uid, { email: pickerProfile.email })
      .firestore();
    const pickerResolved = await listPickerIssueReports(
      {},
      { actorProfile: pickerProfile, isOnline: true }
    );
    expect(pickerResolved.reports[0]).toMatchObject({
      resolutionNote: "Potwierdzono. Korekta zostanie wykonana osobnym procesem.",
      status: "RESOLVED"
    });
  });
});

function sessionDocument() {
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
    closedBy: "operator-1",
    createdAtDevice: Timestamp.now(),
    createdAtServer: Timestamp.now(),
    createdBy: "operator-1",
    createdDeviceId: "device-1",
    id: "session-paid",
    legacyImport: false,
    legacySourceRows: [],
    note: null,
    paidAt: Timestamp.now(),
    paymentId: "payment-1",
    planIdSnapshot: "plan-1",
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
    workerNameSnapshot: "Anna Zbieracz"
  };
}

function entryDocument() {
  return {
    amountPreviewGrosz: 2250,
    businessDate: "2026-07-29",
    cancellationReason: null,
    cancelledAtServer: null,
    cancelledBy: null,
    createdAtDevice: Timestamp.now(),
    createdAtServer: Timestamp.now(),
    createdBy: "operator-1",
    createdDeviceId: "device-1",
    id: "entry-1",
    pendingSync: false,
    quantityMilli: 1500,
    replacesEntryId: null,
    revision: 1,
    seasonId: "season-2026",
    sequenceNumber: 1,
    sessionId: "session-paid",
    status: "ACTIVE",
    stockWeightG: 6000,
    weightG: 6000,
    workerId: "worker-anna"
  };
}
