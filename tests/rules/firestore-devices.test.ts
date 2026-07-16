import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment
} from "@firebase/rules-unit-testing";
import {
  Timestamp,
  collection,
  doc,
  getDoc,
  getDocs,
  serverTimestamp,
  setDoc,
  updateDoc
} from "firebase/firestore";
import { readFileSync } from "node:fs";

const projectId = "demo-borowka-pwa-devices";

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

const device = (overrides: Record<string, unknown> = {}) => ({
  id: "device-1",
  userUid: "picker-1",
  deviceName: "Urzadzenie testowe",
  platform: "Linux",
  trustedOfflineStorage: false,
  firstSeenAt: Timestamp.now(),
  lastSeenAt: Timestamp.now(),
  lastSuccessfulSyncAt: null,
  active: true,
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

const seedDevice = async (data: Record<string, unknown> = {}) => {
  expect(testEnv).toBeDefined();
  if (!testEnv) {
    return;
  }

  await testEnv.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    const deviceId = typeof data.id === "string" ? data.id : "device-1";

    await setDoc(doc(db, "devices", deviceId), device(data));
  });
};

describe("Firestore device rules", () => {
  it("allows approved active user to create and update own device", async () => {
    await seedProfiles(profile({ uid: "picker-1" }));
    expect(testEnv).toBeDefined();
    if (!testEnv) {
      return;
    }

    const db = testEnv
      .authenticatedContext("picker-1", { email: "picker-1@example.test" })
      .firestore();

    await assertSucceeds(getDoc(doc(db, "devices", "device-1")));
    await assertSucceeds(
      setDoc(doc(db, "devices", "device-1"), {
        id: "device-1",
        userUid: "picker-1",
        deviceName: "Telefon",
        platform: "Android",
        trustedOfflineStorage: false,
        firstSeenAt: serverTimestamp(),
        lastSeenAt: serverTimestamp(),
        lastSuccessfulSyncAt: null,
        active: true
      })
    );
    await assertSucceeds(
      updateDoc(doc(db, "devices", "device-1"), {
        deviceName: "Telefon Karola",
        trustedOfflineStorage: true,
        lastSeenAt: serverTimestamp()
      })
    );

    const snapshot = await assertSucceeds(getDoc(doc(db, "devices", "device-1")));
    expect(snapshot.data()?.trustedOfflineStorage).toBe(true);
  });

  it("rejects device writes for other users and blocked accounts", async () => {
    await seedProfiles(
      profile({ uid: "picker-1" }),
      profile({
        uid: "blocked-1",
        active: false,
        registrationStatus: "BLOCKED"
      })
    );
    await seedDevice();
    expect(testEnv).toBeDefined();
    if (!testEnv) {
      return;
    }

    const pickerDb = testEnv
      .authenticatedContext("picker-1", { email: "picker-1@example.test" })
      .firestore();
    const blockedDb = testEnv
      .authenticatedContext("blocked-1", { email: "blocked-1@example.test" })
      .firestore();

    await assertFails(
      setDoc(doc(pickerDb, "devices", "device-2"), {
        ...device({
          id: "device-2",
          userUid: "other-user",
          firstSeenAt: serverTimestamp(),
          lastSeenAt: serverTimestamp()
        })
      })
    );
    await assertFails(
      updateDoc(doc(pickerDb, "devices", "device-1"), {
        active: false,
        lastSeenAt: serverTimestamp()
      })
    );
    await assertFails(getDoc(doc(blockedDb, "devices", "blocked-device")));
  });

  it("allows admin to list devices and rejects listing for non-admin", async () => {
    await seedProfiles(
      profile({
        uid: "admin-1",
        role: "ADMIN",
        workerId: null
      }),
      profile({ uid: "picker-1" })
    );
    await seedDevice();
    expect(testEnv).toBeDefined();
    if (!testEnv) {
      return;
    }

    const adminDb = testEnv
      .authenticatedContext("admin-1", { email: "admin-1@example.test" })
      .firestore();
    const pickerDb = testEnv
      .authenticatedContext("picker-1", { email: "picker-1@example.test" })
      .firestore();

    const snapshot = await assertSucceeds(getDocs(collection(adminDb, "devices")));
    expect(snapshot.size).toBe(1);
    await assertFails(getDocs(collection(pickerDb, "devices")));
  });
});
