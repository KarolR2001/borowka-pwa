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
  where
} from "firebase/firestore";
import { readFileSync } from "node:fs";

const projectId = "demo-borowka-pwa-settlement-plans";

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
  id: "rate-worker-1",
  workerId: "worker-1",
  planId: "plan-weight-kg",
  rateGroszPerUnit: 1000,
  validFrom: "2026-07-01",
  validTo: null,
  active: true,
  note: null,
  createdAt: Timestamp.fromDate(new Date("2026-07-01T08:00:00.000Z")),
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

const seedConfiguration = async () => {
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
      ),
      setDoc(doc(db, "workerRateVersions", "rate-worker-1"), rateVersion()),
      setDoc(
        doc(db, "workerRateVersions", "rate-archived"),
        rateVersion({
          id: "rate-archived",
          active: false
        })
      )
    ]);
  });
};

describe("Firestore settlement plan rules", () => {
  it("rejects configuration reads for anonymous, blocked and picker users", async () => {
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
    await seedConfiguration();
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

    await assertFails(getDoc(doc(anonymousDb, "settlementPlans", "plan-weight-kg")));
    await assertFails(getDoc(doc(blockedDb, "settlementPlans", "plan-weight-kg")));
    await assertFails(getDoc(doc(pickerDb, "settlementPlans", "plan-weight-kg")));
  });

  it("allows admin to read all plans and rate versions", async () => {
    await seedProfiles(
      profile({
        uid: "admin-1",
        role: "ADMIN"
      })
    );
    await seedConfiguration();
    expect(testEnv).toBeDefined();
    if (!testEnv) {
      return;
    }

    const db = testEnv
      .authenticatedContext("admin-1", { email: "admin-1@example.test" })
      .firestore();

    const plansSnapshot = await assertSucceeds(
      getDocs(collection(db, "settlementPlans"))
    );
    const ratesSnapshot = await assertSucceeds(
      getDocs(collection(db, "workerRateVersions"))
    );

    expect(plansSnapshot.size).toBe(2);
    expect(ratesSnapshot.size).toBe(2);
  });

  it("allows operator to query active configuration only", async () => {
    await seedProfiles(profile({ uid: "operator-1" }));
    await seedConfiguration();
    expect(testEnv).toBeDefined();
    if (!testEnv) {
      return;
    }

    const db = testEnv
      .authenticatedContext("operator-1", { email: "operator-1@example.test" })
      .firestore();

    await assertSucceeds(getDoc(doc(db, "settlementPlans", "plan-weight-kg")));
    await assertFails(getDoc(doc(db, "settlementPlans", "plan-archived")));
    await assertFails(getDocs(collection(db, "settlementPlans")));

    const plansSnapshot = await assertSucceeds(
      getDocs(query(collection(db, "settlementPlans"), where("active", "==", true)))
    );
    const ratesSnapshot = await assertSucceeds(
      getDocs(query(collection(db, "workerRateVersions"), where("active", "==", true)))
    );

    expect(plansSnapshot.size).toBe(1);
    expect(ratesSnapshot.size).toBe(1);
  });

  it("allows admin to create custom settlement plans", async () => {
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

    const db = testEnv
      .authenticatedContext("admin-1", { email: "admin-1@example.test" })
      .firestore();

    await assertSucceeds(
      setDoc(
        doc(db, "settlementPlans", "plan-skrzynka"),
        settlementPlan({
          id: "plan-skrzynka",
          name: "Za skrzynke",
          code: "SKRZYNKA",
          calculationBasis: "QUANTITY",
          unitLabelSingular: "skrzynka",
          unitLabelPlural: "skrzynki",
          unitSymbol: "skrz.",
          quantityPrecision: 0,
          weightRequired: false,
          allowBatchQuantity: true,
          description: "Rozliczenie za skrzynke.",
          active: true,
          systemDefault: false,
          createdAt: serverTimestamp(),
          createdBy: "admin-1",
          archivedAt: null
        })
      )
    );
  });

  it("rejects malformed custom settlement plan creates and non-admin creates", async () => {
    await seedProfiles(
      profile({
        uid: "admin-1",
        role: "ADMIN"
      }),
      profile({ uid: "operator-1" })
    );
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
        doc(operatorDb, "settlementPlans", "plan-operator"),
        settlementPlan({
          id: "plan-operator",
          code: "OPERATOR",
          systemDefault: false,
          createdAt: serverTimestamp(),
          createdBy: "operator-1"
        })
      )
    );
    await assertFails(
      setDoc(
        doc(adminDb, "settlementPlans", "plan-bad-precision"),
        settlementPlan({
          id: "plan-bad-precision",
          code: "BAD_PRECISION",
          quantityPrecision: 4,
          systemDefault: false,
          createdAt: serverTimestamp()
        })
      )
    );
    await assertFails(
      setDoc(
        doc(adminDb, "settlementPlans", "plan-weight-no-weight"),
        settlementPlan({
          id: "plan-weight-no-weight",
          code: "WEIGHT_NO_WEIGHT",
          calculationBasis: "WEIGHT",
          weightRequired: false,
          systemDefault: false,
          createdAt: serverTimestamp()
        })
      )
    );
  });

  it("allows admin to update presentation fields and archive plans", async () => {
    await seedProfiles(
      profile({
        uid: "admin-1",
        role: "ADMIN"
      })
    );
    await seedConfiguration();
    expect(testEnv).toBeDefined();
    if (!testEnv) {
      return;
    }

    const db = testEnv
      .authenticatedContext("admin-1", { email: "admin-1@example.test" })
      .firestore();

    await assertSucceeds(
      updateDoc(doc(db, "settlementPlans", "plan-weight-kg"), {
        name: "Za potwierdzony kilogram",
        unitLabelPlural: "kilogramy potwierdzone",
        description: "Zmieniony opis prezentacyjny."
      })
    );
    await assertSucceeds(
      updateDoc(doc(db, "settlementPlans", "plan-weight-kg"), {
        active: false,
        archivedAt: serverTimestamp()
      })
    );
    await assertFails(deleteDoc(doc(db, "settlementPlans", "plan-weight-kg")));
  });

  it("rejects unsafe plan updates, non-admin updates and rate version writes", async () => {
    await seedProfiles(
      profile({
        uid: "admin-1",
        role: "ADMIN"
      }),
      profile({ uid: "operator-1" })
    );
    await seedConfiguration();
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
      updateDoc(doc(adminDb, "settlementPlans", "plan-weight-kg"), {
        calculationBasis: "QUANTITY",
        quantityPrecision: 1
      })
    );
    await assertFails(
      updateDoc(doc(operatorDb, "settlementPlans", "plan-weight-kg"), {
        name: "Operator nie powinien zmieniac planu"
      })
    );
    await assertFails(
      setDoc(
        doc(adminDb, "workerRateVersions", "rate-new"),
        rateVersion({
          id: "rate-new"
        })
      )
    );
    await assertFails(deleteDoc(doc(adminDb, "workerRateVersions", "rate-worker-1")));
  });
});
