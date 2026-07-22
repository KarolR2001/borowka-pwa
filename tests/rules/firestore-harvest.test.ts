import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment
} from "@firebase/rules-unit-testing";
import {
  Timestamp,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  where
} from "firebase/firestore";
import { readFileSync } from "node:fs";

const projectId = "demo-borowka-pwa-harvest";

type ProfileSeed = {
  uid: string;
  email: string;
  displayName: string;
  role: "ADMIN" | "OPERATOR" | "PICKER";
  workerId: string | null;
  active: boolean;
  registrationStatus: "APPROVED" | "REJECTED" | "BLOCKED";
  offlineConsent: boolean;
};

let testEnv: RulesTestEnvironment | undefined;

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    projectId,
    firestore: {
      host: "127.0.0.1",
      port: 8080,
      rules: readFileSync("firestore.rules", "utf8")
    }
  });
});

afterEach(async () => {
  await testEnv?.clearFirestore();
});

afterAll(async () => {
  await testEnv?.cleanup();
});

const profile = ({
  uid,
  ...overrides
}: Partial<ProfileSeed> & { uid: string }): ProfileSeed => ({
  uid,
  email: `${uid}@example.test`,
  displayName: uid,
  role: "OPERATOR",
  workerId: null,
  active: true,
  registrationStatus: "APPROVED",
  offlineConsent: false,
  ...overrides
});

const season = (overrides: Record<string, unknown> = {}) => ({
  id: "season-2026-test",
  name: "Sezon 2026",
  startDate: "2026-07-01",
  endDate: "2026-09-30",
  status: "OPEN",
  isDefault: true,
  createdAt: Timestamp.now(),
  createdBy: "admin-1",
  closedAt: null,
  closedBy: null,
  reopenedAt: null,
  ...overrides
});

const worker = (overrides: Record<string, unknown> = {}) => ({
  id: "worker-anna-test",
  displayName: "Anna Test",
  normalizedName: "anna test",
  active: true,
  currentPlanId: "plan-weight-kg",
  currentRateVersionId: "rate-worker-anna-test-2026-07-01",
  linkedUserUid: null,
  phone: null,
  emailContact: null,
  notes: null,
  createdAt: Timestamp.now(),
  createdBy: "admin-1",
  updatedAt: Timestamp.now(),
  archivedAt: null,
  legacyName: null,
  ...overrides
});

const harvestSession = (overrides: Record<string, unknown> = {}) => ({
  id: "session-1",
  seasonId: "season-2026-test",
  workerId: "worker-anna-test",
  workerNameSnapshot: "Anna Test",
  businessDate: "2026-07-17",
  status: "OPEN",
  planIdSnapshot: "plan-weight-kg",
  planNameSnapshot: "Za kilogram",
  calculationBasisSnapshot: "WEIGHT",
  unitLabelSnapshot: "kilogram",
  unitLabelPluralSnapshot: "kilogramy",
  rateVersionIdSnapshot: "rate-worker-anna-test-2026-07-01",
  rateGroszSnapshot: 1000,
  weightRequiredSnapshot: true,
  quantityPrecisionSnapshot: 3,
  allowBatchQuantitySnapshot: true,
  totalEntryCount: 0,
  totalQuantityMilli: 0,
  totalWeightG: 0,
  amountDueGrosz: null,
  calculationVersion: "1",
  note: null,
  createdBy: "operator-1",
  createdDeviceId: "device-1",
  createdAtDevice: Timestamp.now(),
  createdAtServer: Timestamp.now(),
  updatedAtServer: null,
  closedAtDevice: null,
  closedAtServer: null,
  closedBy: null,
  paidAt: null,
  paymentId: null,
  cancelledAt: null,
  cancelledBy: null,
  cancellationReason: null,
  revision: 1,
  legacyImport: false,
  legacySourceRows: [],
  ...overrides
});

const harvestEntry = (overrides: Record<string, unknown> = {}) => ({
  id: "entry-1",
  sessionId: "session-1",
  seasonId: "season-2026-test",
  workerId: "worker-anna-test",
  businessDate: "2026-07-17",
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
  revision: 1,
  ...overrides
});

const seedBase = async () => {
  expect(testEnv).toBeDefined();
  if (!testEnv) {
    return;
  }

  await testEnv.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    await Promise.all([
      setDoc(doc(db, "users", "admin-1"), profile({ uid: "admin-1", role: "ADMIN" })),
      setDoc(doc(db, "users", "operator-1"), profile({ uid: "operator-1" })),
      setDoc(
        doc(db, "users", "picker-anna"),
        profile({
          uid: "picker-anna",
          role: "PICKER",
          workerId: "worker-anna-test"
        })
      ),
      setDoc(
        doc(db, "users", "blocked-operator"),
        profile({
          uid: "blocked-operator",
          active: false,
          registrationStatus: "BLOCKED"
        })
      ),
      setDoc(doc(db, "seasons", "season-2026-test"), season()),
      setDoc(doc(db, "workers", "worker-anna-test"), worker()),
      setDoc(
        doc(db, "workers", "worker-archived-test"),
        worker({
          id: "worker-archived-test",
          displayName: "Archived Worker",
          active: false
        })
      )
    ]);
  });
};

const seedHarvestSession = async (
  id = "session-1",
  overrides: Record<string, unknown> = {}
) => {
  expect(testEnv).toBeDefined();
  if (!testEnv) {
    return;
  }

  await testEnv.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    await setDoc(doc(db, "harvestSessions", id), harvestSession({ id, ...overrides }));
  });
};

const seedHarvestEntry = async (
  id = "entry-1",
  overrides: Record<string, unknown> = {}
) => {
  expect(testEnv).toBeDefined();
  if (!testEnv) {
    return;
  }

  await testEnv.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    await setDoc(doc(db, "harvestEntries", id), harvestEntry({ id, ...overrides }));
  });
};

describe("Firestore harvest session and entry rules", () => {
  it("allows admin and operator to create sessions for active workers", async () => {
    await seedBase();
    expect(testEnv).toBeDefined();
    if (!testEnv) {
      return;
    }

    const operatorDb = testEnv
      .authenticatedContext("operator-1", { email: "operator-1@example.test" })
      .firestore();
    const adminDb = testEnv
      .authenticatedContext("admin-1", { email: "admin-1@example.test" })
      .firestore();
    const pickerDb = testEnv
      .authenticatedContext("picker-anna", { email: "picker-anna@example.test" })
      .firestore();
    const blockedDb = testEnv
      .authenticatedContext("blocked-operator", {
        email: "blocked-operator@example.test"
      })
      .firestore();

    await assertSucceeds(
      setDoc(
        doc(operatorDb, "harvestSessions", "session-operator"),
        harvestSession({
          id: "session-operator",
          createdAtServer: serverTimestamp()
        })
      )
    );
    await assertSucceeds(
      setDoc(
        doc(adminDb, "harvestSessions", "session-admin"),
        harvestSession({
          id: "session-admin",
          createdBy: "admin-1",
          createdAtServer: serverTimestamp()
        })
      )
    );
    await assertFails(
      setDoc(
        doc(pickerDb, "harvestSessions", "session-picker"),
        harvestSession({
          id: "session-picker",
          createdBy: "picker-anna",
          createdAtServer: serverTimestamp()
        })
      )
    );
    await assertFails(
      setDoc(
        doc(blockedDb, "harvestSessions", "session-blocked"),
        harvestSession({
          id: "session-blocked",
          createdBy: "blocked-operator",
          createdAtServer: serverTimestamp()
        })
      )
    );
    await assertFails(
      setDoc(
        doc(adminDb, "harvestSessions", "session-archived-worker"),
        harvestSession({
          id: "session-archived-worker",
          workerId: "worker-archived-test",
          workerNameSnapshot: "Archived Worker",
          createdBy: "admin-1",
          createdAtServer: serverTimestamp()
        })
      )
    );
  });

  it("allows operator to add valid entries only to their open session", async () => {
    await seedBase();
    await seedHarvestSession();
    await seedHarvestSession("session-other-operator", {
      id: "session-other-operator",
      createdBy: "operator-2"
    });
    await seedHarvestSession("session-closed", {
      id: "session-closed",
      status: "CLOSED",
      totalEntryCount: 1,
      totalQuantityMilli: 1000,
      totalWeightG: 1000,
      amountDueGrosz: 1000,
      closedAtDevice: Timestamp.now(),
      closedAtServer: Timestamp.now(),
      closedBy: "operator-1",
      updatedAtServer: Timestamp.now(),
      revision: 2
    });
    expect(testEnv).toBeDefined();
    if (!testEnv) {
      return;
    }

    const db = testEnv
      .authenticatedContext("operator-1", { email: "operator-1@example.test" })
      .firestore();

    await assertSucceeds(
      setDoc(
        doc(db, "harvestEntries", "entry-ok"),
        harvestEntry({
          id: "entry-ok",
          createdAtServer: serverTimestamp()
        })
      )
    );
    await assertFails(
      setDoc(
        doc(db, "harvestEntries", "entry-forged-author"),
        harvestEntry({
          id: "entry-forged-author",
          createdBy: "admin-1",
          createdAtServer: serverTimestamp()
        })
      )
    );
    await assertFails(
      setDoc(
        doc(db, "harvestEntries", "entry-wrong-session"),
        harvestEntry({
          id: "entry-wrong-session",
          sessionId: "session-other-operator",
          createdAtServer: serverTimestamp()
        })
      )
    );
    await assertFails(
      setDoc(
        doc(db, "harvestEntries", "entry-closed-session"),
        harvestEntry({
          id: "entry-closed-session",
          sessionId: "session-closed",
          createdAtServer: serverTimestamp()
        })
      )
    );
    await assertFails(
      setDoc(
        doc(db, "harvestEntries", "entry-negative"),
        harvestEntry({
          id: "entry-negative",
          quantityMilli: 0,
          createdAtServer: serverTimestamp()
        })
      )
    );
  });

  it("allows only controlled session status updates", async () => {
    await seedBase();
    const baseSession = harvestSession({
      createdAtDevice: Timestamp.fromMillis(1000),
      createdAtServer: Timestamp.fromMillis(2000)
    });
    await seedHarvestSession("session-1", baseSession);
    expect(testEnv).toBeDefined();
    if (!testEnv) {
      return;
    }

    const operatorDb = testEnv
      .authenticatedContext("operator-1", { email: "operator-1@example.test" })
      .firestore();
    const adminDb = testEnv
      .authenticatedContext("admin-1", { email: "admin-1@example.test" })
      .firestore();
    const closedSession = {
      ...baseSession,
      status: "CLOSED",
      totalEntryCount: 1,
      totalQuantityMilli: 1000,
      totalWeightG: 1000,
      amountDueGrosz: 1000,
      closedAtDevice: Timestamp.now(),
      closedAtServer: serverTimestamp(),
      closedBy: "operator-1",
      updatedAtServer: serverTimestamp(),
      revision: 2
    };

    await assertSucceeds(
      setDoc(doc(operatorDb, "harvestSessions", "session-1"), closedSession)
    );
    await assertFails(
      setDoc(doc(operatorDb, "harvestSessions", "session-1"), {
        ...closedSession,
        status: "OPEN",
        amountDueGrosz: null,
        closedAtDevice: null,
        closedAtServer: null,
        closedBy: null,
        updatedAtServer: serverTimestamp(),
        revision: 3
      })
    );
    await assertSucceeds(
      setDoc(doc(adminDb, "harvestSessions", "session-1"), {
        ...closedSession,
        status: "OPEN",
        amountDueGrosz: null,
        closedAtDevice: null,
        closedAtServer: null,
        closedBy: null,
        totalEntryCount: 1,
        totalQuantityMilli: 1000,
        totalWeightG: 1000,
        updatedAtServer: serverTimestamp(),
        revision: 3
      })
    );
    await assertSucceeds(
      setDoc(doc(adminDb, "harvestSessions", "session-1"), {
        ...baseSession,
        totalEntryCount: 1,
        totalQuantityMilli: 1000,
        totalWeightG: 1000,
        status: "CANCELLED",
        cancelledAt: serverTimestamp(),
        cancelledBy: "admin-1",
        cancellationReason: "Duplikat sesji",
        updatedAtServer: serverTimestamp(),
        revision: 4
      })
    );
    await assertFails(deleteDoc(doc(adminDb, "harvestSessions", "session-1")));
  });

  it("allows admin to cancel active entries and forbids hard delete", async () => {
    await seedBase();
    await seedHarvestSession();
    const baseEntry = harvestEntry({
      createdAtDevice: Timestamp.fromMillis(3000),
      createdAtServer: Timestamp.fromMillis(4000)
    });
    await seedHarvestEntry("entry-1", baseEntry);
    expect(testEnv).toBeDefined();
    if (!testEnv) {
      return;
    }

    const operatorDb = testEnv
      .authenticatedContext("operator-1", { email: "operator-1@example.test" })
      .firestore();
    const adminDb = testEnv
      .authenticatedContext("admin-1", { email: "admin-1@example.test" })
      .firestore();
    const cancelledEntry = {
      ...baseEntry,
      status: "CANCELLED",
      cancellationReason: "Bledna waga",
      cancelledBy: "admin-1",
      cancelledAtServer: serverTimestamp(),
      revision: 2
    };

    await assertFails(
      setDoc(doc(operatorDb, "harvestEntries", "entry-1"), cancelledEntry)
    );
    await assertSucceeds(
      setDoc(doc(adminDb, "harvestEntries", "entry-1"), cancelledEntry)
    );
    await assertFails(deleteDoc(doc(adminDb, "harvestEntries", "entry-1")));
  });

  it("limits picker reads to their own worker documents and filtered queries", async () => {
    await seedBase();
    await seedHarvestSession("session-own");
    await seedHarvestSession("session-other", {
      id: "session-other",
      workerId: "worker-other-test",
      workerNameSnapshot: "Other Worker"
    });
    await seedHarvestEntry("entry-own", {
      id: "entry-own",
      sessionId: "session-own"
    });
    await seedHarvestEntry("entry-other", {
      id: "entry-other",
      sessionId: "session-other",
      workerId: "worker-other-test"
    });
    expect(testEnv).toBeDefined();
    if (!testEnv) {
      return;
    }

    const db = testEnv
      .authenticatedContext("picker-anna", { email: "picker-anna@example.test" })
      .firestore();

    await assertSucceeds(getDoc(doc(db, "harvestSessions", "session-own")));
    await assertFails(getDoc(doc(db, "harvestSessions", "session-other")));
    await assertSucceeds(getDoc(doc(db, "harvestEntries", "entry-own")));
    await assertFails(getDoc(doc(db, "harvestEntries", "entry-other")));
    await assertSucceeds(
      getDocs(
        query(
          collection(db, "harvestSessions"),
          where("workerId", "==", "worker-anna-test")
        )
      )
    );
    await assertFails(getDocs(collection(db, "harvestSessions")));
  });
});
