import {
  initializeTestEnvironment,
  type RulesTestEnvironment
} from "@firebase/rules-unit-testing";
import {
  Timestamp,
  disableNetwork,
  doc,
  enableNetwork,
  setDoc,
  waitForPendingWrites
} from "firebase/firestore";
import { readFileSync } from "node:fs";

import type { UserProfile } from "../../src/domain/identity";
import { createIssueReport, listPickerIssueReports } from "../../src/issues/issueReports";
import { createMemoryFirestoreSyncJournal } from "../../src/offline/firestoreSyncJournal";
import {
  createPickerDataExportCsv,
  filterPickerDataExport,
  loadPickerDataExport
} from "../../src/picker/pickerDataExport";
import { loadPickerDashboard } from "../../src/picker/pickerDashboard";
import { loadPickerHarvestList } from "../../src/picker/pickerHarvestList";
import {
  preparePickerOfflineData,
  readPickerOfflineDataStatus
} from "../../src/picker/pickerOfflineData";
import { loadPickerPaymentList } from "../../src/picker/pickerPaymentList";
import { loadPickerSessionDetails } from "../../src/picker/pickerSessionDetails";

const projectId = "demo-borowka-pwa-picker-offline-data";
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
      setDoc(doc(db, "appSettings", "domain"), domainSettingsDocument()),
      setDoc(doc(db, "workers", "worker-anna"), workerDocument()),
      setDoc(doc(db, "seasons", "season-2026"), seasonDocument()),
      setDoc(doc(db, "devices", "device-picker"), deviceDocument()),
      setDoc(doc(db, "harvestSessions", "session-paid"), sessionDocument()),
      setDoc(doc(db, "harvestEntries", "entry-1"), entryDocument()),
      setDoc(doc(db, "payments", "payment-active"), paymentDocument()),
      setDoc(doc(db, "payments", "foreign-payment"), {
        ...paymentDocument(),
        creationAttemptId: "attempt-foreign-payment",
        id: "foreign-payment",
        sessionId: "foreign-session",
        workerId: "worker-other",
        workerNameSnapshot: "Obca osoba"
      }),
      setDoc(doc(db, "issueReports", "report-1"), issueReportDocument()),
      setDoc(doc(db, "harvestSessions", "foreign-session"), {
        ...sessionDocument(),
        id: "foreign-session",
        workerId: "worker-other",
        workerNameSnapshot: "Obca osoba"
      })
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

describe("picker offline preparation", () => {
  it("caches only own views and exposes the server-confirmed sync time offline", async () => {
    if (!testEnvironment) {
      throw new Error("Rules test environment was not initialized.");
    }

    const firestore = testEnvironment
      .authenticatedContext(pickerProfile.uid, { email: pickerProfile.email })
      .firestore();
    firebaseServicesMock.getFirebaseServices.mockReturnValue({ firestore });

    const prepared = await preparePickerOfflineData(
      {},
      {
        actorProfile: pickerProfile,
        cacheMode: "PERSISTENT",
        deviceId: "device-picker",
        isOnline: true
      }
    );

    expect(prepared).toMatchObject({
      code: "READY",
      counts: {
        entries: 1,
        issueReports: 1,
        payments: 1,
        seasons: 1,
        sessions: 1
      },
      dataSource: "SERVER"
    });
    expect(prepared.lastSuccessfulSyncIso).not.toBeNull();

    const serverExport = await loadPickerDataExport(
      {},
      { actorProfile: pickerProfile, isOnline: true }
    );
    expect(serverExport.dataSource).toBe("SERVER");
    expect(serverExport.sessions.map((session) => session.sessionId)).toEqual([
      "session-paid"
    ]);
    expect(serverExport.payments.map((payment) => payment.id)).toEqual([
      "payment-active"
    ]);

    await disableNetwork(firestore);

    const [status, dashboard, harvests, payments, reports, details, cachedExport] =
      await Promise.all([
        readPickerOfflineDataStatus(
          {},
          {
            actorProfile: pickerProfile,
            cacheMode: "PERSISTENT",
            deviceId: "device-picker",
            isOnline: false
          }
        ),
        loadPickerDashboard({}, { actorProfile: pickerProfile, isOnline: false }),
        loadPickerHarvestList(
          {},
          {
            actorProfile: pickerProfile,
            isOnline: false,
            syncDocuments: []
          }
        ),
        loadPickerPaymentList({}, { actorProfile: pickerProfile, isOnline: false }),
        listPickerIssueReports({}, { actorProfile: pickerProfile, isOnline: false }),
        loadPickerSessionDetails(
          {},
          {
            actorProfile: pickerProfile,
            isOnline: false,
            sessionId: "session-paid"
          }
        ),
        loadPickerDataExport({}, { actorProfile: pickerProfile, isOnline: false })
      ]);

    expect(status).toEqual({
      code: "READY",
      dataSource: "CACHE",
      lastSuccessfulSyncIso: prepared.lastSuccessfulSyncIso
    });
    expect(dashboard).toMatchObject({
      dataSource: "CACHE",
      invalidSessionCount: 0,
      workerId: "worker-anna"
    });
    expect(harvests.items.map((item) => item.sessionId)).toEqual(["session-paid"]);
    expect(payments.payments.map((payment) => payment.id)).toEqual(["payment-active"]);
    expect(reports.reports.map((report) => report.id)).toEqual(["report-1"]);
    expect(details).toMatchObject({
      dataSource: "CACHE",
      sessionId: "session-paid"
    });
    expect(details.entries.map((entry) => entry.id)).toEqual(["entry-1"]);
    expect(JSON.stringify({ dashboard, harvests, payments, reports })).not.toContain(
      "Obca osoba"
    );
    const cachedCsv = createPickerDataExportCsv({
      exportedAtIso: "2026-07-28T18:00:00.000Z",
      filtered: filterPickerDataExport(cachedExport, {
        fromDate: "",
        seasonId: "season-2026",
        toDate: ""
      }),
      result: cachedExport
    });
    expect(cachedCsv).toContain('"Kompletnosc";"NIEPELNY - DANE Z CACHE"');
    expect(cachedCsv).not.toContain("Prywatna notatka");
    expect(cachedCsv).not.toContain("Obca osoba");

    const journal = createMemoryFirestoreSyncJournal();
    const queued = await createIssueReport(
      {},
      {
        actorProfile: pickerProfile,
        deviceId: "device-picker",
        entryId: null,
        isOnline: false,
        message: "Offline prosze sprawdzic naliczenie.",
        sessionId: "session-paid",
        subject: "AMOUNT"
      },
      { journal }
    );
    expect(queued.status).toBe("QUEUED");
    expect(
      await journal.list({
        deviceId: "device-picker",
        userUid: pickerProfile.uid
      })
    ).toEqual([
      expect.objectContaining({
        id: queued.id,
        kind: "ISSUE_REPORT",
        sessionId: "session-paid"
      })
    ]);

    const cachedReports = await listPickerIssueReports(
      {},
      { actorProfile: pickerProfile, isOnline: false }
    );
    expect(cachedReports.reports).toContainEqual(
      expect.objectContaining({
        id: queued.id,
        pendingSync: true,
        status: "OPEN"
      })
    );

    await enableNetwork(firestore);
    await waitForPendingWrites(firestore);

    const synchronizedReports = await listPickerIssueReports(
      {},
      { actorProfile: pickerProfile, isOnline: true }
    );
    expect(synchronizedReports.reports).toContainEqual(
      expect.objectContaining({
        id: queued.id,
        pendingSync: false,
        status: "OPEN"
      })
    );
    await vi.waitFor(async () => {
      expect(
        await journal.list({
          deviceId: "device-picker",
          userUid: pickerProfile.uid
        })
      ).toEqual([]);
    });
  });
});

function deviceDocument() {
  return {
    active: true,
    deviceName: "Telefon Anny",
    firstSeenAt: Timestamp.now(),
    id: "device-picker",
    lastSeenAt: Timestamp.now(),
    lastSuccessfulSyncAt: null,
    platform: "test",
    trustedOfflineStorage: true,
    userUid: pickerProfile.uid
  };
}

function domainSettingsDocument() {
  return {
    calculationRuleVersion: 1,
    defaultSeasonId: "season-2026",
    id: "domain",
    initializedAt: Timestamp.now(),
    initializedBy: "admin-1",
    pickerOwnReportExportEnabled: true,
    schemaVersion: 1,
    updatedAt: Timestamp.now()
  };
}

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

function sessionDocument() {
  return {
    allowBatchQuantitySnapshot: true,
    amountDueGrosz: 5000,
    businessDate: "2026-07-28",
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
    id: "session-paid",
    legacyImport: false,
    legacySourceRows: [],
    note: "Prywatna notatka operatora",
    paidAt: Timestamp.now(),
    paymentId: "payment-active",
    planIdSnapshot: "plan-weight",
    planNameSnapshot: "Za kilogram",
    quantityPrecisionSnapshot: 3,
    rateGroszSnapshot: 1000,
    rateVersionIdSnapshot: "rate-1",
    revision: 3,
    seasonId: "season-2026",
    status: "PAID",
    totalEntryCount: 1,
    totalQuantityMilli: 5000,
    totalWeightG: 5000,
    unitLabelPluralSnapshot: "kilogramy",
    unitLabelSnapshot: "kilogram",
    updatedAtServer: Timestamp.now(),
    weightRequiredSnapshot: true,
    workerId: "worker-anna",
    workerNameSnapshot: "Anna Zbieracz"
  };
}

function entryDocument() {
  return {
    amountPreviewGrosz: 5000,
    businessDate: "2026-07-28",
    cancellationReason: null,
    cancelledAtServer: null,
    cancelledBy: null,
    createdAtDevice: Timestamp.now(),
    createdAtServer: Timestamp.now(),
    createdBy: "operator-1",
    createdDeviceId: "device-operator",
    id: "entry-1",
    pendingSync: false,
    quantityMilli: 5000,
    replacesEntryId: null,
    revision: 1,
    seasonId: "season-2026",
    sequenceNumber: 1,
    sessionId: "session-paid",
    status: "ACTIVE",
    stockWeightG: 5000,
    weightG: 5000,
    workerId: "worker-anna"
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
    note: "Prywatna notatka administratora",
    paidBusinessDate: "2026-07-28",
    paymentMethod: "CASH",
    seasonId: "season-2026",
    sessionId: "session-paid",
    status: "ACTIVE",
    workerId: "worker-anna",
    workerNameSnapshot: "Anna Zbieracz"
  };
}

function issueReportDocument() {
  return {
    createdAt: Timestamp.now(),
    entryId: null,
    id: "report-1",
    message: "Prosze sprawdzic status wyplaty.",
    reporterUid: pickerProfile.uid,
    resolutionNote: null,
    resolvedAt: null,
    resolvedBy: null,
    seasonId: "season-2026",
    sessionId: "session-paid",
    status: "OPEN",
    subject: "PAYMENT_STATUS",
    workerId: "worker-anna"
  };
}
