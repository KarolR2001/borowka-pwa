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

const projectId = "demo-borowka-pwa-seasons";

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

type SeasonSeed = {
  id: string;
  name: string;
  startDate: string;
  endDate: string | null;
  status: "PLANNED" | "OPEN" | "CLOSED" | "ARCHIVED";
  isDefault: boolean;
  createdAt: Timestamp;
  createdBy: string;
  closedAt: Timestamp | null;
  closedBy: string | null;
  reopenedAt: Timestamp | null;
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

const season = ({
  id,
  ...overrides
}: Partial<SeasonSeed> & { id: string }): SeasonSeed => ({
  id,
  name: id,
  startDate: "2026-07-01",
  endDate: "2026-09-30",
  status: "OPEN",
  isDefault: false,
  createdAt: Timestamp.fromDate(new Date("2026-07-01T08:00:00.000Z")),
  createdBy: "admin-1",
  closedAt: null,
  closedBy: null,
  reopenedAt: null,
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

const seedSeasons = async (...seasons: SeasonSeed[]) => {
  expect(testEnv).toBeDefined();
  if (!testEnv) {
    return;
  }

  await testEnv.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    await Promise.all(
      seasons.map((seedSeason) => setDoc(doc(db, "seasons", seedSeason.id), seedSeason))
    );
  });
};

describe("Firestore season rules", () => {
  it("rejects season reads for anonymous, blocked and picker users", async () => {
    await seedProfiles(
      profile({
        uid: "blocked-1",
        active: false,
        registrationStatus: "BLOCKED"
      }),
      profile({
        uid: "picker-1",
        role: "PICKER",
        workerId: "worker-anna-test"
      })
    );
    await seedSeasons(season({ id: "season-2026", isDefault: true }));
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

    await assertFails(getDoc(doc(anonymousDb, "seasons", "season-2026")));
    await assertFails(getDocs(collection(anonymousDb, "seasons")));
    await assertFails(getDoc(doc(blockedDb, "seasons", "season-2026")));
    await assertFails(getDocs(collection(blockedDb, "seasons")));
    await assertFails(getDoc(doc(pickerDb, "seasons", "season-2026")));
    await assertFails(getDocs(collection(pickerDb, "seasons")));
  });

  it("allows admin to read seasons and operator to read only open seasons", async () => {
    await seedProfiles(
      profile({
        uid: "admin-1",
        role: "ADMIN"
      }),
      profile({ uid: "operator-1" })
    );
    await seedSeasons(
      season({ id: "season-2026", isDefault: true }),
      season({
        id: "season-closed",
        status: "CLOSED",
        closedAt: Timestamp.fromDate(new Date("2026-09-30T16:00:00.000Z")),
        closedBy: "admin-1"
      })
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

    await assertSucceeds(getDoc(doc(adminDb, "seasons", "season-2026")));
    await assertSucceeds(getDoc(doc(operatorDb, "seasons", "season-2026")));
    await assertFails(getDoc(doc(operatorDb, "seasons", "season-closed")));
    await assertFails(getDocs(collection(operatorDb, "seasons")));
    const snapshot = await assertSucceeds(
      getDocs(query(collection(operatorDb, "seasons"), where("status", "==", "OPEN")))
    );
    expect(snapshot.size).toBe(1);
  });

  it("allows admin to create planned or open seasons", async () => {
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
      setDoc(doc(db, "seasons", "season-2027"), {
        ...season({
          id: "season-2027",
          status: "PLANNED",
          createdBy: "admin-1"
        }),
        createdAt: serverTimestamp()
      })
    );
    await assertSucceeds(
      setDoc(doc(db, "seasons", "season-2028"), {
        ...season({
          id: "season-2028",
          status: "OPEN",
          isDefault: true,
          createdBy: "admin-1"
        }),
        createdAt: serverTimestamp()
      })
    );
  });

  it("rejects season writes by non-admins and malformed admin creates", async () => {
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
      setDoc(doc(operatorDb, "seasons", "season-operator"), {
        ...season({
          id: "season-operator",
          createdBy: "operator-1"
        }),
        createdAt: serverTimestamp()
      })
    );
    await assertFails(
      setDoc(doc(adminDb, "seasons", "season-closed"), {
        ...season({
          id: "season-closed",
          status: "CLOSED"
        }),
        createdAt: serverTimestamp()
      })
    );
    await assertFails(
      setDoc(doc(adminDb, "seasons", "season-forged"), {
        ...season({
          id: "season-forged",
          createdBy: "operator-1"
        }),
        createdAt: serverTimestamp()
      })
    );
    await assertFails(
      setDoc(doc(adminDb, "seasons", "season-bad-date"), {
        ...season({
          id: "season-bad-date",
          startDate: "2026-10-01",
          endDate: "2026-09-30"
        }),
        createdAt: serverTimestamp()
      })
    );
  });

  it("allows admin default, close and reopen updates", async () => {
    await seedProfiles(
      profile({
        uid: "admin-1",
        role: "ADMIN"
      })
    );
    await seedSeasons(
      season({
        id: "season-2026",
        status: "OPEN",
        isDefault: true
      }),
      season({
        id: "season-2027",
        status: "PLANNED",
        isDefault: false
      }),
      season({
        id: "season-closed",
        status: "CLOSED",
        closedAt: Timestamp.fromDate(new Date("2026-09-30T16:00:00.000Z")),
        closedBy: "admin-1"
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
      updateDoc(doc(db, "seasons", "season-2027"), {
        isDefault: true
      })
    );
    await assertSucceeds(
      updateDoc(doc(db, "seasons", "season-2026"), {
        status: "CLOSED",
        closedAt: serverTimestamp(),
        closedBy: "admin-1"
      })
    );
    await assertSucceeds(
      updateDoc(doc(db, "seasons", "season-closed"), {
        status: "OPEN",
        reopenedAt: serverTimestamp()
      })
    );
  });

  it("rejects unsafe season updates and deletion", async () => {
    await seedProfiles(
      profile({
        uid: "admin-1",
        role: "ADMIN"
      }),
      profile({ uid: "operator-1" })
    );
    await seedSeasons(
      season({
        id: "season-open",
        status: "OPEN"
      }),
      season({
        id: "season-default",
        status: "PLANNED",
        isDefault: true
      }),
      season({
        id: "season-archived",
        status: "ARCHIVED"
      })
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
      updateDoc(doc(operatorDb, "seasons", "season-open"), {
        status: "CLOSED",
        closedAt: serverTimestamp(),
        closedBy: "operator-1"
      })
    );
    await assertFails(
      updateDoc(doc(adminDb, "seasons", "season-open"), {
        status: "ARCHIVED"
      })
    );
    await assertFails(
      updateDoc(doc(adminDb, "seasons", "season-default"), {
        status: "ARCHIVED"
      })
    );
    await assertFails(
      updateDoc(doc(adminDb, "seasons", "season-archived"), {
        isDefault: true
      })
    );
    await assertFails(deleteDoc(doc(adminDb, "seasons", "season-open")));
  });
});
