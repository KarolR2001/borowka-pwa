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

const projectId = "demo-borowka-pwa-app-settings";
let testEnv: RulesTestEnvironment | undefined;

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    firestore: {
      host: "127.0.0.1",
      port: 8080,
      rules: readFileSync("firestore.rules", "utf8")
    },
    projectId
  });
});

beforeEach(async () => {
  await testEnv?.clearFirestore();

  if (!testEnv) {
    throw new Error("Rules test environment was not initialized.");
  }

  await testEnv.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    await Promise.all([
      setDoc(doc(db, "users", "admin-1"), profile("admin-1", "ADMIN")),
      setDoc(doc(db, "users", "picker-1"), profile("picker-1", "PICKER")),
      setDoc(doc(db, "users", "operator-1"), profile("operator-1", "OPERATOR")),
      setDoc(doc(db, "users", "blocked-1"), {
        ...profile("blocked-1", "PICKER"),
        active: false,
        registrationStatus: "BLOCKED"
      }),
      setDoc(doc(db, "appSettings", "domain"), domainSettings())
    ]);
  });
});

afterAll(async () => {
  await testEnv?.cleanup();
});

describe("app settings rules", () => {
  it("allows admin export listing and denies listing to other roles", async () => {
    if (!testEnv) {
      throw new Error("Rules test environment was not initialized.");
    }

    const pickerDb = authenticatedDb("picker-1");
    const operatorDb = authenticatedDb("operator-1");
    const adminDb = authenticatedDb("admin-1");

    await assertSucceeds(getDoc(doc(pickerDb, "appSettings", "domain")));
    await assertFails(getDoc(doc(operatorDb, "appSettings", "domain")));
    await assertSucceeds(getDoc(doc(adminDb, "appSettings", "domain")));
    await assertSucceeds(getDocs(collection(adminDb, "appSettings")));
    await assertFails(getDocs(collection(pickerDb, "appSettings")));
    await assertFails(getDocs(collection(operatorDb, "appSettings")));
    await assertFails(
      getDoc(doc(testEnv.unauthenticatedContext().firestore(), "appSettings", "domain"))
    );
    await assertFails(getDoc(doc(authenticatedDb("blocked-1"), "appSettings", "domain")));
  });

  it("allows only admin to change the picker export flag with server time", async () => {
    const adminDb = authenticatedDb("admin-1");
    const pickerDb = authenticatedDb("picker-1");

    await assertSucceeds(
      updateDoc(doc(adminDb, "appSettings", "domain"), {
        pickerOwnReportExportEnabled: true,
        updatedAt: serverTimestamp()
      })
    );
    await assertFails(
      updateDoc(doc(pickerDb, "appSettings", "domain"), {
        pickerOwnReportExportEnabled: false,
        updatedAt: serverTimestamp()
      })
    );

    const snapshot = await getDoc(doc(adminDb, "appSettings", "domain"));
    expect(snapshot.data()?.pickerOwnReportExportEnabled).toBe(true);
  });

  it("rejects schema mutation, arbitrary timestamps, creation and deletion", async () => {
    const adminDb = authenticatedDb("admin-1");

    await assertFails(
      updateDoc(doc(adminDb, "appSettings", "domain"), {
        schemaVersion: 2,
        updatedAt: serverTimestamp()
      })
    );
    await assertFails(
      updateDoc(doc(adminDb, "appSettings", "domain"), {
        pickerOwnReportExportEnabled: true,
        updatedAt: Timestamp.fromDate(new Date("2026-07-28T10:00:00.000Z"))
      })
    );
    await assertFails(
      setDoc(doc(adminDb, "appSettings", "other"), {
        ...domainSettings(),
        id: "other"
      })
    );
    await assertFails(deleteDoc(doc(adminDb, "appSettings", "domain")));
  });
});

function authenticatedDb(uid: string) {
  if (!testEnv) {
    throw new Error("Rules test environment was not initialized.");
  }

  return testEnv.authenticatedContext(uid, { email: `${uid}@example.test` }).firestore();
}

function profile(uid: string, role: "ADMIN" | "OPERATOR" | "PICKER") {
  return {
    active: true,
    displayName: uid,
    email: `${uid}@example.test`,
    offlineConsent: false,
    registrationStatus: "APPROVED",
    role,
    uid,
    workerId: role === "PICKER" ? `worker-${uid}` : null
  };
}

function domainSettings() {
  return {
    calculationRuleVersion: 1,
    defaultSeasonId: "season-2026",
    id: "domain",
    initializedAt: Timestamp.now(),
    initializedBy: "admin-1",
    pickerOwnReportExportEnabled: false,
    schemaVersion: 1,
    updatedAt: Timestamp.now()
  };
}
