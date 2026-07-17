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
  updateDoc,
  where,
  writeBatch
} from "firebase/firestore";
import { readFileSync } from "node:fs";

const projectId = "demo-borowka-pwa-workers";

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

const worker = (overrides: Record<string, unknown> = {}) => ({
  id: "worker-1",
  displayName: "Anna Test",
  normalizedName: "anna test",
  active: true,
  currentPlanId: "plan-weight-kg",
  currentRateVersionId: "rate-worker-1",
  linkedUserUid: null,
  phone: null,
  emailContact: null,
  notes: null,
  createdAt: Timestamp.fromDate(new Date("2026-07-01T08:00:00.000Z")),
  createdBy: "admin-1",
  updatedAt: Timestamp.fromDate(new Date("2026-07-01T08:00:00.000Z")),
  archivedAt: null,
  legacyName: null,
  ...overrides
});

const settlementPlan = (overrides: Record<string, unknown> = {}) => ({
  id: "plan-weight-kg",
  name: "Za kilogram",
  code: "WEIGHT_KG",
  calculationBasis: "WEIGHT",
  unitLabelSingular: "kilogram",
  unitLabelPlural: "kilogramy",
  unitSymbol: "kg",
  quantityPrecision: 3,
  weightRequired: true,
  allowBatchQuantity: true,
  description: "Rozliczenie wedlug kg.",
  active: true,
  systemDefault: true,
  createdAt: Timestamp.fromDate(new Date("2026-07-01T08:00:00.000Z")),
  createdBy: "admin-1",
  archivedAt: null,
  ...overrides
});

const rateVersion = (overrides: Record<string, unknown> = {}) => ({
  id: "rate-worker-new-1234-2026-07-15",
  workerId: "worker-new-1234",
  planId: "plan-weight-kg",
  rateGroszPerUnit: 1250,
  validFrom: "2026-07-15",
  validTo: null,
  active: true,
  note: "Pierwsza stawka zbieracza.",
  createdAt: serverTimestamp(),
  createdBy: "admin-1",
  supersedesRateId: null,
  ...overrides
});

const seedProfiles = async (...profiles: ProfileSeed[]) => {
  expect(testEnv).toBeDefined();
  if (!testEnv) {
    return;
  }

  await testEnv.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    await Promise.all(
      profiles.map((seedProfile) =>
        setDoc(doc(db, "users", seedProfile.uid), seedProfile)
      )
    );
  });
};

const seedWorkers = async () => {
  expect(testEnv).toBeDefined();
  if (!testEnv) {
    return;
  }

  await testEnv.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    await Promise.all([
      setDoc(doc(db, "workers", "worker-1"), worker()),
      setDoc(
        doc(db, "workers", "worker-archived"),
        worker({
          id: "worker-archived",
          displayName: "Archiwalny",
          normalizedName: "archiwalny",
          active: false,
          archivedAt: Timestamp.fromDate(new Date("2026-10-01T08:00:00.000Z"))
        })
      )
    ]);
  });
};

const seedPlans = async () => {
  expect(testEnv).toBeDefined();
  if (!testEnv) {
    return;
  }

  await testEnv.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    await Promise.all([
      setDoc(doc(db, "settlementPlans", "plan-weight-kg"), settlementPlan()),
      setDoc(
        doc(db, "settlementPlans", "plan-archived"),
        settlementPlan({
          id: "plan-archived",
          code: "ARCHIVED",
          active: false,
          archivedAt: Timestamp.fromDate(new Date("2026-10-01T08:00:00.000Z"))
        })
      )
    ]);
  });
};

const seedWorkerRateChangeState = async () => {
  expect(testEnv).toBeDefined();
  if (!testEnv) {
    return;
  }

  await testEnv.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    await Promise.all([
      setDoc(
        doc(db, "workers", "worker-anna-test"),
        worker({
          id: "worker-anna-test",
          displayName: "Anna Test",
          normalizedName: "anna test",
          currentPlanId: "plan-weight-kg",
          currentRateVersionId: "rate-worker-anna-test-2026-07-01"
        })
      ),
      setDoc(
        doc(db, "workerRateVersions", "rate-worker-anna-test-2026-07-01"),
        rateVersion({
          id: "rate-worker-anna-test-2026-07-01",
          workerId: "worker-anna-test",
          planId: "plan-weight-kg",
          rateGroszPerUnit: 1000,
          validFrom: "2026-07-01",
          validTo: null,
          active: true,
          note: "Aktualna stawka.",
          createdAt: Timestamp.fromDate(new Date("2026-07-01T08:00:00.000Z")),
          createdBy: "admin-1",
          supersedesRateId: null
        })
      )
    ]);
  });
};

describe("Firestore worker rules", () => {
  it("rejects worker reads for anonymous, blocked and picker users", async () => {
    await seedProfiles(
      profile({
        uid: "blocked-1",
        active: false,
        registrationStatus: "BLOCKED"
      }),
      profile({
        uid: "picker-1",
        role: "PICKER",
        workerId: "worker-1"
      })
    );
    await seedWorkers();
    expect(testEnv).toBeDefined();
    if (!testEnv) {
      return;
    }

    const anonymousDb = testEnv.unauthenticatedContext().firestore();
    const blockedDb = testEnv
      .authenticatedContext("blocked-1", { email: "blocked-1@example.test" })
      .firestore();
    const pickerDb = testEnv
      .authenticatedContext("picker-1", { email: "picker-1@example.test" })
      .firestore();

    await assertFails(getDoc(doc(anonymousDb, "workers", "worker-1")));
    await assertFails(getDoc(doc(blockedDb, "workers", "worker-1")));
    await assertFails(getDoc(doc(pickerDb, "workers", "worker-1")));
  });

  it("allows admin to read all workers", async () => {
    await seedProfiles(
      profile({
        uid: "admin-1",
        role: "ADMIN"
      })
    );
    await seedWorkers();
    expect(testEnv).toBeDefined();
    if (!testEnv) {
      return;
    }

    const db = testEnv
      .authenticatedContext("admin-1", { email: "admin-1@example.test" })
      .firestore();

    const snapshot = await assertSucceeds(getDocs(collection(db, "workers")));

    expect(snapshot.size).toBe(2);
  });

  it("allows operator to query active workers only", async () => {
    await seedProfiles(profile({ uid: "operator-1" }));
    await seedWorkers();
    expect(testEnv).toBeDefined();
    if (!testEnv) {
      return;
    }

    const db = testEnv
      .authenticatedContext("operator-1", { email: "operator-1@example.test" })
      .firestore();

    await assertSucceeds(getDoc(doc(db, "workers", "worker-1")));
    await assertFails(getDoc(doc(db, "workers", "worker-archived")));
    await assertFails(getDocs(collection(db, "workers")));

    const snapshot = await assertSucceeds(
      getDocs(query(collection(db, "workers"), where("active", "==", true)))
    );

    expect(snapshot.size).toBe(1);
  });

  it("allows admin to create worker with initial rate in one batch", async () => {
    await seedProfiles(
      profile({
        uid: "admin-1",
        role: "ADMIN"
      })
    );
    await seedPlans();
    expect(testEnv).toBeDefined();
    if (!testEnv) {
      return;
    }

    const db = testEnv
      .authenticatedContext("admin-1", { email: "admin-1@example.test" })
      .firestore();
    const batch = writeBatch(db);

    batch.set(
      doc(db, "workers", "worker-new-1234"),
      worker({
        id: "worker-new-1234",
        displayName: "Nowy",
        normalizedName: "nowy",
        currentRateVersionId: "rate-worker-new-1234-2026-07-15",
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        createdBy: "admin-1"
      })
    );
    batch.set(
      doc(db, "workerRateVersions", "rate-worker-new-1234-2026-07-15"),
      rateVersion()
    );

    await assertSucceeds(batch.commit());
  });

  it("rejects partial or unsafe worker creates", async () => {
    await seedProfiles(
      profile({
        uid: "admin-1",
        role: "ADMIN"
      }),
      profile({ uid: "operator-1" })
    );
    await seedPlans();
    expect(testEnv).toBeDefined();
    if (!testEnv) {
      return;
    }

    const adminDb = testEnv
      .authenticatedContext("admin-1", { email: "admin-1@example.test" })
      .firestore();
    const operatorDb = testEnv
      .authenticatedContext("operator-1", { email: "operator-1@example.test" })
      .firestore();

    await assertFails(
      setDoc(
        doc(adminDb, "workers", "worker-new-1234"),
        worker({
          id: "worker-new-1234",
          currentRateVersionId: "rate-worker-new-1234-2026-07-15",
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
          createdBy: "admin-1"
        })
      )
    );

    const archivedPlanBatch = writeBatch(adminDb);
    archivedPlanBatch.set(
      doc(adminDb, "workers", "worker-arch-plan"),
      worker({
        id: "worker-arch-plan",
        displayName: "Archiwalny plan",
        normalizedName: "archiwalny plan",
        currentPlanId: "plan-archived",
        currentRateVersionId: "rate-worker-arch-plan-2026-07-15",
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        createdBy: "admin-1"
      })
    );
    archivedPlanBatch.set(
      doc(adminDb, "workerRateVersions", "rate-worker-arch-plan-2026-07-15"),
      rateVersion({
        id: "rate-worker-arch-plan-2026-07-15",
        workerId: "worker-arch-plan",
        planId: "plan-archived"
      })
    );
    await assertFails(archivedPlanBatch.commit());

    const operatorBatch = writeBatch(operatorDb);
    operatorBatch.set(
      doc(operatorDb, "workers", "worker-operator"),
      worker({
        id: "worker-operator",
        displayName: "Operator",
        normalizedName: "operator",
        currentRateVersionId: "rate-worker-operator-2026-07-15",
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        createdBy: "operator-1"
      })
    );
    operatorBatch.set(
      doc(operatorDb, "workerRateVersions", "rate-worker-operator-2026-07-15"),
      rateVersion({
        id: "rate-worker-operator-2026-07-15",
        workerId: "worker-operator",
        createdBy: "operator-1"
      })
    );
    await assertFails(operatorBatch.commit());
  });

  it("allows admin to add a worker rate version in one batch", async () => {
    await seedProfiles(
      profile({
        uid: "admin-1",
        role: "ADMIN"
      })
    );
    await seedPlans();
    await seedWorkerRateChangeState();
    expect(testEnv).toBeDefined();
    if (!testEnv) {
      return;
    }

    const db = testEnv
      .authenticatedContext("admin-1", { email: "admin-1@example.test" })
      .firestore();
    const batch = writeBatch(db);

    batch.set(
      doc(db, "workers", "worker-anna-test"),
      worker({
        id: "worker-anna-test",
        displayName: "Anna Test",
        normalizedName: "anna test",
        currentPlanId: "plan-weight-kg",
        currentRateVersionId: "rate-worker-anna-test-2026-07-15",
        updatedAt: serverTimestamp()
      })
    );
    batch.set(
      doc(db, "workerRateVersions", "rate-worker-anna-test-2026-07-01"),
      rateVersion({
        id: "rate-worker-anna-test-2026-07-01",
        workerId: "worker-anna-test",
        planId: "plan-weight-kg",
        rateGroszPerUnit: 1000,
        validFrom: "2026-07-01",
        validTo: "2026-07-14",
        active: false,
        note: "Aktualna stawka.",
        createdAt: Timestamp.fromDate(new Date("2026-07-01T08:00:00.000Z")),
        createdBy: "admin-1",
        supersedesRateId: null
      })
    );
    batch.set(
      doc(db, "workerRateVersions", "rate-worker-anna-test-2026-07-15"),
      rateVersion({
        id: "rate-worker-anna-test-2026-07-15",
        workerId: "worker-anna-test",
        planId: "plan-weight-kg",
        rateGroszPerUnit: 1400,
        validFrom: "2026-07-15",
        validTo: null,
        active: true,
        note: "Nowa stawka.",
        createdAt: serverTimestamp(),
        createdBy: "admin-1",
        supersedesRateId: "rate-worker-anna-test-2026-07-01"
      })
    );

    await assertSucceeds(batch.commit());
  });

  it("rejects stale parallel worker rate changes", async () => {
    await seedProfiles(
      profile({
        uid: "admin-1",
        role: "ADMIN"
      })
    );
    await seedPlans();
    await seedWorkerRateChangeState();
    expect(testEnv).toBeDefined();
    if (!testEnv) {
      return;
    }

    const db = testEnv
      .authenticatedContext("admin-1", { email: "admin-1@example.test" })
      .firestore();
    const firstBatch = writeBatch(db);

    firstBatch.set(
      doc(db, "workers", "worker-anna-test"),
      worker({
        id: "worker-anna-test",
        displayName: "Anna Test",
        normalizedName: "anna test",
        currentPlanId: "plan-weight-kg",
        currentRateVersionId: "rate-worker-anna-test-2026-07-15",
        updatedAt: serverTimestamp()
      })
    );
    firstBatch.set(
      doc(db, "workerRateVersions", "rate-worker-anna-test-2026-07-01"),
      rateVersion({
        id: "rate-worker-anna-test-2026-07-01",
        workerId: "worker-anna-test",
        planId: "plan-weight-kg",
        rateGroszPerUnit: 1000,
        validFrom: "2026-07-01",
        validTo: "2026-07-14",
        active: false,
        note: "Aktualna stawka.",
        createdAt: Timestamp.fromDate(new Date("2026-07-01T08:00:00.000Z")),
        createdBy: "admin-1",
        supersedesRateId: null
      })
    );
    firstBatch.set(
      doc(db, "workerRateVersions", "rate-worker-anna-test-2026-07-15"),
      rateVersion({
        id: "rate-worker-anna-test-2026-07-15",
        workerId: "worker-anna-test",
        planId: "plan-weight-kg",
        rateGroszPerUnit: 1400,
        validFrom: "2026-07-15",
        validTo: null,
        active: true,
        createdAt: serverTimestamp(),
        createdBy: "admin-1",
        supersedesRateId: "rate-worker-anna-test-2026-07-01"
      })
    );
    await assertSucceeds(firstBatch.commit());

    const staleBatch = writeBatch(db);
    staleBatch.set(
      doc(db, "workers", "worker-anna-test"),
      worker({
        id: "worker-anna-test",
        displayName: "Anna Test",
        normalizedName: "anna test",
        currentPlanId: "plan-weight-kg",
        currentRateVersionId: "rate-worker-anna-test-2026-07-16",
        updatedAt: serverTimestamp()
      })
    );
    staleBatch.set(
      doc(db, "workerRateVersions", "rate-worker-anna-test-2026-07-01"),
      rateVersion({
        id: "rate-worker-anna-test-2026-07-01",
        workerId: "worker-anna-test",
        planId: "plan-weight-kg",
        rateGroszPerUnit: 1000,
        validFrom: "2026-07-01",
        validTo: "2026-07-15",
        active: false,
        note: "Aktualna stawka.",
        createdAt: Timestamp.fromDate(new Date("2026-07-01T08:00:00.000Z")),
        createdBy: "admin-1",
        supersedesRateId: null
      })
    );
    staleBatch.set(
      doc(db, "workerRateVersions", "rate-worker-anna-test-2026-07-16"),
      rateVersion({
        id: "rate-worker-anna-test-2026-07-16",
        workerId: "worker-anna-test",
        planId: "plan-weight-kg",
        rateGroszPerUnit: 1600,
        validFrom: "2026-07-16",
        validTo: null,
        active: true,
        createdAt: serverTimestamp(),
        createdBy: "admin-1",
        supersedesRateId: "rate-worker-anna-test-2026-07-01"
      })
    );

    await assertFails(staleBatch.commit());
  });

  it("rejects partial or unsafe worker rate changes", async () => {
    await seedProfiles(
      profile({
        uid: "admin-1",
        role: "ADMIN"
      }),
      profile({ uid: "operator-1" })
    );
    await seedPlans();
    await seedWorkerRateChangeState();
    expect(testEnv).toBeDefined();
    if (!testEnv) {
      return;
    }

    const adminDb = testEnv
      .authenticatedContext("admin-1", { email: "admin-1@example.test" })
      .firestore();
    const operatorDb = testEnv
      .authenticatedContext("operator-1", { email: "operator-1@example.test" })
      .firestore();

    await assertFails(
      setDoc(
        doc(adminDb, "workerRateVersions", "rate-worker-anna-test-2026-07-15"),
        rateVersion({
          id: "rate-worker-anna-test-2026-07-15",
          workerId: "worker-anna-test",
          planId: "plan-weight-kg",
          rateGroszPerUnit: 1400,
          validFrom: "2026-07-15",
          supersedesRateId: "rate-worker-anna-test-2026-07-01"
        })
      )
    );

    const missingPreviousCloseBatch = writeBatch(adminDb);
    missingPreviousCloseBatch.set(
      doc(adminDb, "workers", "worker-anna-test"),
      worker({
        id: "worker-anna-test",
        displayName: "Anna Test",
        normalizedName: "anna test",
        currentPlanId: "plan-weight-kg",
        currentRateVersionId: "rate-worker-anna-test-2026-07-15",
        updatedAt: serverTimestamp()
      })
    );
    missingPreviousCloseBatch.set(
      doc(adminDb, "workerRateVersions", "rate-worker-anna-test-2026-07-15"),
      rateVersion({
        id: "rate-worker-anna-test-2026-07-15",
        workerId: "worker-anna-test",
        planId: "plan-weight-kg",
        rateGroszPerUnit: 1400,
        validFrom: "2026-07-15",
        supersedesRateId: "rate-worker-anna-test-2026-07-01"
      })
    );
    await assertFails(missingPreviousCloseBatch.commit());

    const operatorBatch = writeBatch(operatorDb);
    operatorBatch.set(
      doc(operatorDb, "workers", "worker-anna-test"),
      worker({
        id: "worker-anna-test",
        displayName: "Anna Test",
        normalizedName: "anna test",
        currentPlanId: "plan-weight-kg",
        currentRateVersionId: "rate-worker-anna-test-2026-07-15",
        updatedAt: serverTimestamp()
      })
    );
    operatorBatch.set(
      doc(operatorDb, "workerRateVersions", "rate-worker-anna-test-2026-07-01"),
      rateVersion({
        id: "rate-worker-anna-test-2026-07-01",
        workerId: "worker-anna-test",
        planId: "plan-weight-kg",
        rateGroszPerUnit: 1000,
        validFrom: "2026-07-01",
        validTo: "2026-07-14",
        active: false
      })
    );
    operatorBatch.set(
      doc(operatorDb, "workerRateVersions", "rate-worker-anna-test-2026-07-15"),
      rateVersion({
        id: "rate-worker-anna-test-2026-07-15",
        workerId: "worker-anna-test",
        planId: "plan-weight-kg",
        rateGroszPerUnit: 1400,
        validFrom: "2026-07-15",
        createdBy: "operator-1",
        supersedesRateId: "rate-worker-anna-test-2026-07-01"
      })
    );
    await assertFails(operatorBatch.commit());
  });

  it("allows admin to link worker account only with a matching user update", async () => {
    await seedProfiles(
      profile({
        uid: "admin-1",
        role: "ADMIN"
      }),
      profile({
        uid: "operator-anna",
        role: "OPERATOR",
        workerId: null
      })
    );
    await seedWorkers();
    expect(testEnv).toBeDefined();
    if (!testEnv) {
      return;
    }

    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(
        doc(context.firestore(), "workers", "worker-anna-test"),
        worker({
          id: "worker-anna-test",
          currentRateVersionId: "rate-worker-anna-test-2026-07-01"
        })
      );
    });

    const db = testEnv
      .authenticatedContext("admin-1", { email: "admin-1@example.test" })
      .firestore();
    const batch = writeBatch(db);

    batch.set(
      doc(db, "workers", "worker-anna-test"),
      worker({
        id: "worker-anna-test",
        currentRateVersionId: "rate-worker-anna-test-2026-07-01",
        linkedUserUid: "operator-anna",
        updatedAt: serverTimestamp()
      })
    );
    batch.set(
      doc(db, "users", "operator-anna"),
      profile({
        uid: "operator-anna",
        role: "OPERATOR",
        workerId: "worker-anna-test"
      })
    );

    await assertSucceeds(batch.commit());

    const workerSnapshot = await assertSucceeds(
      getDoc(doc(db, "workers", "worker-anna-test"))
    );
    const userSnapshot = await assertSucceeds(getDoc(doc(db, "users", "operator-anna")));
    expect(workerSnapshot.data()?.linkedUserUid).toBe("operator-anna");
    expect(userSnapshot.data()?.workerId).toBe("worker-anna-test");
  });

  it("rejects worker account link writes for operator", async () => {
    await seedProfiles(
      profile({
        uid: "admin-1",
        role: "ADMIN"
      }),
      profile({
        uid: "operator-1",
        role: "OPERATOR",
        workerId: null
      })
    );
    await seedWorkers();
    expect(testEnv).toBeDefined();
    if (!testEnv) {
      return;
    }

    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(
        doc(context.firestore(), "workers", "worker-anna-test"),
        worker({
          id: "worker-anna-test",
          currentRateVersionId: "rate-worker-anna-test-2026-07-01"
        })
      );
    });

    const db = testEnv
      .authenticatedContext("operator-1", { email: "operator-1@example.test" })
      .firestore();

    await assertFails(
      updateDoc(doc(db, "workers", "worker-anna-test"), {
        linkedUserUid: "operator-1",
        updatedAt: serverTimestamp()
      })
    );
  });

  it("allows admin to archive worker without changing history fields", async () => {
    await seedProfiles(
      profile({
        uid: "admin-1",
        role: "ADMIN"
      })
    );
    expect(testEnv).toBeDefined();
    if (!testEnv) {
      return;
    }

    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(
        doc(context.firestore(), "workers", "worker-anna-test"),
        worker({
          id: "worker-anna-test",
          currentRateVersionId: "rate-worker-anna-test-2026-07-01"
        })
      );
    });

    const db = testEnv
      .authenticatedContext("admin-1", { email: "admin-1@example.test" })
      .firestore();

    await assertSucceeds(
      updateDoc(doc(db, "workers", "worker-anna-test"), {
        active: false,
        updatedAt: serverTimestamp(),
        archivedAt: serverTimestamp()
      })
    );

    const snapshot = await assertSucceeds(getDoc(doc(db, "workers", "worker-anna-test")));
    expect(snapshot.data()?.active).toBe(false);
    expect(snapshot.data()?.currentRateVersionId).toBe(
      "rate-worker-anna-test-2026-07-01"
    );
  });

  it("rejects unsafe worker archive writes", async () => {
    await seedProfiles(
      profile({
        uid: "admin-1",
        role: "ADMIN"
      }),
      profile({
        uid: "operator-1",
        role: "OPERATOR"
      })
    );
    expect(testEnv).toBeDefined();
    if (!testEnv) {
      return;
    }

    await testEnv.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore();
      await Promise.all([
        setDoc(
          doc(db, "workers", "worker-anna-test"),
          worker({
            id: "worker-anna-test",
            currentRateVersionId: "rate-worker-anna-test-2026-07-01",
            linkedUserUid: "picker-anna"
          })
        ),
        setDoc(
          doc(db, "workers", "worker-bartek-test"),
          worker({
            id: "worker-bartek-test",
            displayName: "Bartek Test",
            normalizedName: "bartek test",
            currentRateVersionId: "rate-worker-bartek-test-2026-07-01",
            active: false,
            archivedAt: Timestamp.fromDate(new Date("2026-07-16T08:00:00.000Z"))
          })
        )
      ]);
    });

    const adminDb = testEnv
      .authenticatedContext("admin-1", { email: "admin-1@example.test" })
      .firestore();
    const operatorDb = testEnv
      .authenticatedContext("operator-1", { email: "operator-1@example.test" })
      .firestore();

    await assertFails(
      updateDoc(doc(operatorDb, "workers", "worker-anna-test"), {
        active: false,
        updatedAt: serverTimestamp(),
        archivedAt: serverTimestamp()
      })
    );
    await assertFails(
      updateDoc(doc(adminDb, "workers", "worker-anna-test"), {
        active: false,
        linkedUserUid: null,
        updatedAt: serverTimestamp(),
        archivedAt: serverTimestamp()
      })
    );
    await assertFails(
      updateDoc(doc(adminDb, "workers", "worker-bartek-test"), {
        active: false,
        updatedAt: serverTimestamp(),
        archivedAt: serverTimestamp()
      })
    );
  });

  it("rejects worker updates, deletes and standalone rate creates", async () => {
    await seedProfiles(
      profile({
        uid: "admin-1",
        role: "ADMIN"
      })
    );
    await seedPlans();
    await seedWorkers();
    expect(testEnv).toBeDefined();
    if (!testEnv) {
      return;
    }

    const db = testEnv
      .authenticatedContext("admin-1", { email: "admin-1@example.test" })
      .firestore();

    await assertFails(
      setDoc(
        doc(db, "workerRateVersions", "rate-worker-new-1234-2026-07-15"),
        rateVersion()
      )
    );
    await assertFails(
      setDoc(
        doc(db, "workerRateVersions", "rate-worker-free-2026-07-15"),
        rateVersion({
          id: "rate-worker-free-2026-07-15",
          workerId: "worker-free",
          rateGroszPerUnit: 0
        })
      )
    );
    await assertFails(
      updateDoc(doc(db, "workers", "worker-1"), {
        displayName: "Zmieniona nazwa"
      })
    );
    await assertFails(deleteDoc(doc(db, "workers", "worker-1")));
  });
});
