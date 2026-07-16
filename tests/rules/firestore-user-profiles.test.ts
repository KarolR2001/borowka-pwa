import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment
} from "@firebase/rules-unit-testing";
import { collection, doc, getDoc, getDocs, setDoc, updateDoc } from "firebase/firestore";
import { readFileSync } from "node:fs";

const projectId = "demo-borowka-pwa-users";

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
  role: "PICKER",
  workerId: "worker-1",
  active: true,
  registrationStatus: "APPROVED",
  offlineConsent: false,
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

describe("Firestore user profile rules", () => {
  it("reject anonymous profile reads", async () => {
    await seedProfiles(profile({ uid: "picker-1" }));
    expect(testEnv).toBeDefined();
    if (!testEnv) {
      return;
    }

    const db = testEnv.unauthenticatedContext().firestore();

    await assertFails(getDoc(doc(db, "users", "picker-1")));
  });

  it("allows approved active user to read own profile", async () => {
    await seedProfiles(profile({ uid: "picker-1" }));
    expect(testEnv).toBeDefined();
    if (!testEnv) {
      return;
    }

    const db = testEnv
      .authenticatedContext("picker-1", { email: "picker-1@example.test" })
      .firestore();

    const snapshot = await assertSucceeds(getDoc(doc(db, "users", "picker-1")));
    expect(snapshot.data()?.role).toBe("PICKER");
  });

  it("allows signed-in user to detect missing own profile", async () => {
    expect(testEnv).toBeDefined();
    if (!testEnv) {
      return;
    }

    const db = testEnv
      .authenticatedContext("new-user", { email: "new-user@example.test" })
      .firestore();

    const snapshot = await assertSucceeds(getDoc(doc(db, "users", "new-user")));
    expect(snapshot.exists()).toBe(false);
  });

  it("rejects reading another non-admin profile", async () => {
    await seedProfiles(profile({ uid: "picker-1" }), profile({ uid: "picker-2" }));
    expect(testEnv).toBeDefined();
    if (!testEnv) {
      return;
    }

    const db = testEnv
      .authenticatedContext("picker-1", { email: "picker-1@example.test" })
      .firestore();

    await assertFails(getDoc(doc(db, "users", "picker-2")));
  });

  it("allows blocked user to read own profile status only", async () => {
    await seedProfiles(
      profile({
        uid: "blocked-1",
        active: false,
        registrationStatus: "BLOCKED"
      })
    );
    expect(testEnv).toBeDefined();
    if (!testEnv) {
      return;
    }

    const db = testEnv
      .authenticatedContext("blocked-1", { email: "blocked-1@example.test" })
      .firestore();

    const snapshot = await assertSucceeds(getDoc(doc(db, "users", "blocked-1")));
    expect(snapshot.data()?.registrationStatus).toBe("BLOCKED");
  });

  it("allows admin to list user profiles", async () => {
    await seedProfiles(
      profile({
        uid: "admin-1",
        role: "ADMIN",
        workerId: null
      }),
      profile({ uid: "picker-1" })
    );
    expect(testEnv).toBeDefined();
    if (!testEnv) {
      return;
    }

    const db = testEnv
      .authenticatedContext("admin-1", { email: "admin-1@example.test" })
      .firestore();

    const snapshot = await assertSucceeds(getDocs(collection(db, "users")));
    expect(snapshot.size).toBe(2);
  });

  it("rejects user profile listing for operator", async () => {
    await seedProfiles(
      profile({
        uid: "operator-1",
        role: "OPERATOR",
        workerId: null
      }),
      profile({ uid: "picker-1" })
    );
    expect(testEnv).toBeDefined();
    if (!testEnv) {
      return;
    }

    const db = testEnv
      .authenticatedContext("operator-1", { email: "operator-1@example.test" })
      .firestore();

    await assertFails(getDocs(collection(db, "users")));
  });

  it("rejects user profile listing for blocked account", async () => {
    await seedProfiles(
      profile({
        uid: "blocked-1",
        active: false,
        registrationStatus: "BLOCKED"
      }),
      profile({ uid: "picker-1" })
    );
    expect(testEnv).toBeDefined();
    if (!testEnv) {
      return;
    }

    const db = testEnv
      .authenticatedContext("blocked-1", { email: "blocked-1@example.test" })
      .firestore();

    await assertFails(getDocs(collection(db, "users")));
  });

  it("allows signed-in user to update own offline consent", async () => {
    await seedProfiles(profile({ uid: "picker-1" }));
    expect(testEnv).toBeDefined();
    if (!testEnv) {
      return;
    }

    const db = testEnv
      .authenticatedContext("picker-1", { email: "picker-1@example.test" })
      .firestore();

    await assertSucceeds(
      updateDoc(doc(db, "users", "picker-1"), {
        offlineConsent: true
      })
    );

    const snapshot = await assertSucceeds(getDoc(doc(db, "users", "picker-1")));
    expect(snapshot.data()?.offlineConsent).toBe(true);
  });

  it("rejects protected self profile updates", async () => {
    await seedProfiles(profile({ uid: "picker-1" }));
    expect(testEnv).toBeDefined();
    if (!testEnv) {
      return;
    }

    const db = testEnv
      .authenticatedContext("picker-1", { email: "picker-1@example.test" })
      .firestore();

    await assertFails(updateDoc(doc(db, "users", "picker-1"), { role: "ADMIN" }));
    await assertFails(updateDoc(doc(db, "users", "picker-1"), { active: false }));
    await assertFails(
      updateDoc(doc(db, "users", "picker-1"), {
        workerId: "worker-2"
      })
    );
  });

  it("rejects updating another user's offline consent", async () => {
    await seedProfiles(profile({ uid: "picker-1" }), profile({ uid: "picker-2" }));
    expect(testEnv).toBeDefined();
    if (!testEnv) {
      return;
    }

    const db = testEnv
      .authenticatedContext("picker-1", { email: "picker-1@example.test" })
      .firestore();

    await assertFails(
      updateDoc(doc(db, "users", "picker-2"), {
        offlineConsent: true
      })
    );
  });

  it("allows admin to update another active user's role and worker link", async () => {
    await seedProfiles(
      profile({
        uid: "admin-1",
        role: "ADMIN",
        workerId: null
      }),
      profile({
        uid: "operator-1",
        role: "OPERATOR",
        workerId: null
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
      updateDoc(doc(db, "users", "operator-1"), {
        role: "PICKER",
        workerId: "worker-2"
      })
    );

    const snapshot = await assertSucceeds(getDoc(doc(db, "users", "operator-1")));
    expect(snapshot.data()?.role).toBe("PICKER");
    expect(snapshot.data()?.workerId).toBe("worker-2");
  });

  it("rejects unsafe admin role and worker updates", async () => {
    await seedProfiles(
      profile({
        uid: "admin-1",
        role: "ADMIN",
        workerId: null
      }),
      profile({
        uid: "operator-1",
        role: "OPERATOR",
        workerId: null
      }),
      profile({
        uid: "blocked-1",
        active: false,
        registrationStatus: "BLOCKED"
      })
    );
    expect(testEnv).toBeDefined();
    if (!testEnv) {
      return;
    }

    const db = testEnv
      .authenticatedContext("admin-1", { email: "admin-1@example.test" })
      .firestore();

    await assertFails(updateDoc(doc(db, "users", "admin-1"), { role: "OPERATOR" }));
    await assertFails(updateDoc(doc(db, "users", "operator-1"), { role: "PICKER" }));
    await assertFails(updateDoc(doc(db, "users", "blocked-1"), { role: "ADMIN" }));
    await assertFails(
      updateDoc(doc(db, "users", "operator-1"), {
        role: "ADMIN",
        active: false
      })
    );
  });

  it("allows admin to block another active user profile", async () => {
    await seedProfiles(
      profile({
        uid: "admin-1",
        role: "ADMIN",
        workerId: null
      }),
      profile({
        uid: "operator-1",
        role: "OPERATOR",
        workerId: null
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
      updateDoc(doc(db, "users", "operator-1"), {
        active: false,
        registrationStatus: "BLOCKED"
      })
    );

    const snapshot = await assertSucceeds(getDoc(doc(db, "users", "operator-1")));
    expect(snapshot.data()?.active).toBe(false);
    expect(snapshot.data()?.registrationStatus).toBe("BLOCKED");
  });

  it("allows admin to reactivate blocked profile with valid role and worker link", async () => {
    await seedProfiles(
      profile({
        uid: "admin-1",
        role: "ADMIN",
        workerId: null
      }),
      profile({
        uid: "blocked-1",
        role: "OPERATOR",
        workerId: null,
        active: false,
        registrationStatus: "BLOCKED"
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
      updateDoc(doc(db, "users", "blocked-1"), {
        active: true,
        registrationStatus: "APPROVED",
        role: "PICKER",
        workerId: "worker-2"
      })
    );

    const snapshot = await assertSucceeds(getDoc(doc(db, "users", "blocked-1")));
    expect(snapshot.data()?.active).toBe(true);
    expect(snapshot.data()?.registrationStatus).toBe("APPROVED");
    expect(snapshot.data()?.role).toBe("PICKER");
    expect(snapshot.data()?.workerId).toBe("worker-2");
  });

  it("rejects unsafe admin activation updates", async () => {
    await seedProfiles(
      profile({
        uid: "admin-1",
        role: "ADMIN",
        workerId: null
      }),
      profile({
        uid: "operator-1",
        role: "OPERATOR",
        workerId: null
      }),
      profile({
        uid: "blocked-1",
        role: "PICKER",
        workerId: null,
        active: false,
        registrationStatus: "BLOCKED"
      })
    );
    expect(testEnv).toBeDefined();
    if (!testEnv) {
      return;
    }

    const db = testEnv
      .authenticatedContext("admin-1", { email: "admin-1@example.test" })
      .firestore();

    await assertFails(
      updateDoc(doc(db, "users", "admin-1"), {
        active: false,
        registrationStatus: "BLOCKED"
      })
    );
    await assertFails(
      updateDoc(doc(db, "users", "operator-1"), {
        active: false,
        registrationStatus: "APPROVED"
      })
    );
    await assertFails(
      updateDoc(doc(db, "users", "operator-1"), {
        active: false,
        registrationStatus: "BLOCKED",
        role: "ADMIN"
      })
    );
    await assertFails(
      updateDoc(doc(db, "users", "blocked-1"), {
        active: true,
        registrationStatus: "APPROVED",
        role: "PICKER",
        workerId: null
      })
    );
  });
});
