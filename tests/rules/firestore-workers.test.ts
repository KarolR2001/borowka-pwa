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
  setDoc,
  updateDoc,
  where
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

  it("rejects worker writes in list package", async () => {
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

    await assertFails(
      setDoc(
        doc(db, "workers", "worker-new"),
        worker({
          id: "worker-new",
          displayName: "Nowy"
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
