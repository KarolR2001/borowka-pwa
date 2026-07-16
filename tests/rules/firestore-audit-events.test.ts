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
  serverTimestamp,
  setDoc,
  updateDoc
} from "firebase/firestore";
import { readFileSync } from "node:fs";

const projectId = "demo-borowka-pwa-audit";

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

const auditEvent = (overrides: Record<string, unknown> = {}) => ({
  id: "audit-1",
  actorUid: "admin-1",
  actorRoleSnapshot: "ADMIN",
  action: "USER_ROLE_CHANGED",
  entityType: "USER_PROFILE",
  entityId: "operator-1",
  businessDate: null,
  beforeSummary: {
    uid: "operator-1",
    role: "OPERATOR",
    workerId: null,
    active: true,
    registrationStatus: "APPROVED"
  },
  afterSummary: {
    uid: "operator-1",
    role: "PICKER",
    workerId: "worker-1",
    active: true,
    registrationStatus: "APPROVED"
  },
  reason: "Zmiana testowa",
  createdAtDevice: Timestamp.now(),
  createdAtServer: serverTimestamp(),
  deviceId: "device-1",
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

const seedAuditEvent = async () => {
  expect(testEnv).toBeDefined();
  if (!testEnv) {
    return;
  }

  await testEnv.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    await setDoc(doc(db, "auditEvents", "audit-1"), {
      ...auditEvent({
        createdAtServer: Timestamp.now()
      })
    });
  });
};

describe("Firestore audit event rules", () => {
  it("allows active admin to create and read audit events", async () => {
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

    const db = testEnv
      .authenticatedContext("admin-1", { email: "admin-1@example.test" })
      .firestore();

    await assertSucceeds(setDoc(doc(db, "auditEvents", "audit-1"), auditEvent()));
    const snapshot = await assertSucceeds(getDoc(doc(db, "auditEvents", "audit-1")));
    expect(snapshot.data()?.action).toBe("USER_ROLE_CHANGED");

    const listSnapshot = await assertSucceeds(getDocs(collection(db, "auditEvents")));
    expect(listSnapshot.size).toBe(1);
  });

  it("rejects audit reads for non-admin users", async () => {
    await seedProfiles(
      profile({
        uid: "admin-1",
        role: "ADMIN"
      }),
      profile({ uid: "operator-1" })
    );
    await seedAuditEvent();
    expect(testEnv).toBeDefined();
    if (!testEnv) {
      return;
    }

    const db = testEnv
      .authenticatedContext("operator-1", { email: "operator-1@example.test" })
      .firestore();

    await assertFails(getDoc(doc(db, "auditEvents", "audit-1")));
    await assertFails(getDocs(collection(db, "auditEvents")));
  });

  it("rejects forged actor, role and invalid audit action", async () => {
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

    const db = testEnv
      .authenticatedContext("admin-1", { email: "admin-1@example.test" })
      .firestore();

    await assertFails(
      setDoc(
        doc(db, "auditEvents", "audit-forged-actor"),
        auditEvent({
          id: "audit-forged-actor",
          actorUid: "operator-1"
        })
      )
    );
    await assertFails(
      setDoc(
        doc(db, "auditEvents", "audit-forged-role"),
        auditEvent({
          id: "audit-forged-role",
          actorRoleSnapshot: "OPERATOR"
        })
      )
    );
    await assertFails(
      setDoc(
        doc(db, "auditEvents", "audit-invalid-action"),
        auditEvent({
          id: "audit-invalid-action",
          action: "UNKNOWN"
        })
      )
    );
  });

  it("rejects mutable or malformed audit events", async () => {
    await seedProfiles(
      profile({
        uid: "admin-1",
        role: "ADMIN"
      }),
      profile({ uid: "operator-1" })
    );
    await seedAuditEvent();
    expect(testEnv).toBeDefined();
    if (!testEnv) {
      return;
    }

    const db = testEnv
      .authenticatedContext("admin-1", { email: "admin-1@example.test" })
      .firestore();

    await assertFails(
      updateDoc(doc(db, "auditEvents", "audit-1"), {
        reason: "Zmieniony powod"
      })
    );
    await assertFails(deleteDoc(doc(db, "auditEvents", "audit-1")));
    await assertFails(
      setDoc(
        doc(db, "auditEvents", "audit-bad-summary"),
        auditEvent({
          id: "audit-bad-summary",
          beforeSummary: {
            unexpected: "field"
          }
        })
      )
    );
    await assertFails(
      setDoc(
        doc(db, "auditEvents", "audit-client-server-time"),
        auditEvent({
          id: "audit-client-server-time",
          createdAtServer: Timestamp.now()
        })
      )
    );
  });
});
