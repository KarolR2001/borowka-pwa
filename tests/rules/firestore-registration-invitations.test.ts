import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment
} from "@firebase/rules-unit-testing";
import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  setDoc,
  Timestamp,
  updateDoc
} from "firebase/firestore";
import { readFileSync } from "node:fs";

const projectId = "demo-borowka-pwa-invitations";

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

type InvitationSeed = {
  id: string;
  emailNormalized: string;
  displayName: string;
  targetRole: "ADMIN" | "OPERATOR" | "PICKER";
  workerId: string | null;
  status: "PENDING" | "USED" | "CANCELLED" | "EXPIRED";
  createdBy: string;
  createdAt: Timestamp;
  usedBy: string | null;
  usedAt: Timestamp | null;
  expiresAt: Timestamp | null;
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

const invitation = ({
  id,
  ...overrides
}: Partial<InvitationSeed> & { id: string }): InvitationSeed => ({
  id,
  emailNormalized: `${id}@example.test`,
  displayName: id,
  targetRole: "OPERATOR",
  workerId: null,
  status: "PENDING",
  createdBy: "admin-1",
  createdAt: Timestamp.fromDate(new Date("2026-07-16T08:00:00.000Z")),
  usedBy: null,
  usedAt: null,
  expiresAt: null,
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

const seedInvitations = async (...invitations: InvitationSeed[]) => {
  expect(testEnv).toBeDefined();
  if (!testEnv) {
    return;
  }

  await testEnv.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    await Promise.all(
      invitations.map((seedInvitation) =>
        setDoc(doc(db, "registrationInvitations", seedInvitation.id), seedInvitation)
      )
    );
  });
};

describe("Firestore registration invitation rules", () => {
  it("rejects anonymous invitation listing", async () => {
    await seedInvitations(invitation({ id: "invite-1" }));
    expect(testEnv).toBeDefined();
    if (!testEnv) {
      return;
    }

    const db = testEnv.unauthenticatedContext().firestore();

    await assertFails(getDocs(collection(db, "registrationInvitations")));
  });

  it("allows admin to list and create pending invitations", async () => {
    await seedProfiles(
      profile({
        uid: "admin-1",
        role: "ADMIN",
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
    const invite = invitation({ id: "invite-1" });

    await assertSucceeds(setDoc(doc(db, "registrationInvitations", invite.id), invite));
    const snapshot = await assertSucceeds(
      getDocs(collection(db, "registrationInvitations"))
    );
    expect(snapshot.size).toBe(1);
  });

  it("rejects invitation listing and creation for operator", async () => {
    await seedProfiles(
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
      .authenticatedContext("operator-1", { email: "operator-1@example.test" })
      .firestore();

    await assertFails(getDocs(collection(db, "registrationInvitations")));
    await assertFails(
      setDoc(
        doc(db, "registrationInvitations", "invite-1"),
        invitation({
          id: "invite-1",
          createdBy: "operator-1"
        })
      )
    );
  });

  it("rejects malformed picker invitations", async () => {
    await seedProfiles(
      profile({
        uid: "admin-1",
        role: "ADMIN",
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

    await assertFails(
      setDoc(
        doc(db, "registrationInvitations", "invite-picker"),
        invitation({
          id: "invite-picker",
          targetRole: "PICKER",
          workerId: null
        })
      )
    );
  });

  it("allows admin to cancel pending invitation without changing assignment", async () => {
    await seedProfiles(
      profile({
        uid: "admin-1",
        role: "ADMIN",
        workerId: null
      })
    );
    await seedInvitations(invitation({ id: "invite-1" }));
    expect(testEnv).toBeDefined();
    if (!testEnv) {
      return;
    }

    const db = testEnv
      .authenticatedContext("admin-1", { email: "admin-1@example.test" })
      .firestore();

    await assertSucceeds(
      updateDoc(doc(db, "registrationInvitations", "invite-1"), {
        status: "CANCELLED"
      })
    );
  });

  it("rejects assignment changes and deletion", async () => {
    await seedProfiles(
      profile({
        uid: "admin-1",
        role: "ADMIN",
        workerId: null
      })
    );
    await seedInvitations(invitation({ id: "invite-1" }));
    expect(testEnv).toBeDefined();
    if (!testEnv) {
      return;
    }

    const db = testEnv
      .authenticatedContext("admin-1", { email: "admin-1@example.test" })
      .firestore();
    const invitationRef = doc(db, "registrationInvitations", "invite-1");

    await assertFails(
      updateDoc(invitationRef, {
        targetRole: "ADMIN"
      })
    );
    await assertFails(deleteDoc(invitationRef));
  });
});
