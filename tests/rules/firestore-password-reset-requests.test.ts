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
  getDoc,
  getDocs,
  setDoc,
  updateDoc
} from "firebase/firestore";
import { readFileSync } from "node:fs";

let testEnv: RulesTestEnvironment | undefined;

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    firestore: {
      host: "127.0.0.1",
      port: 8080,
      rules: readFileSync("firestore.rules", "utf8")
    },
    projectId: "demo-borowka-pwa-password-reset-rules"
  });
});

afterEach(async () => {
  await testEnv?.clearFirestore();
});

afterAll(async () => {
  await testEnv?.cleanup();
});

describe("password reset request rules", () => {
  it("allows an administrator to read requests and denies every client-side write", async () => {
    await seedProfilesAndRequest();
    const adminDb = authenticatedDb("admin-1");

    await assertSucceeds(getDoc(doc(adminDb, "passwordResetRequests", "picker-1")));
    await assertSucceeds(getDocs(collection(adminDb, "passwordResetRequests")));
    await assertFails(
      setDoc(
        doc(adminDb, "passwordResetRequests", "new-request"),
        requestDocument("new-request")
      )
    );
    await assertFails(
      updateDoc(doc(adminDb, "passwordResetRequests", "picker-1"), {
        status: "COMPLETED"
      })
    );
    await assertFails(deleteDoc(doc(adminDb, "passwordResetRequests", "picker-1")));
  });

  it("denies request reads to a picker", async () => {
    await seedProfilesAndRequest();
    const pickerDb = authenticatedDb("picker-1");

    await assertFails(getDoc(doc(pickerDb, "passwordResetRequests", "picker-1")));
    await assertFails(getDocs(collection(pickerDb, "passwordResetRequests")));
  });
});

function authenticatedDb(uid: string) {
  if (!testEnv) throw new Error("Rules test environment was not initialized.");
  return testEnv.authenticatedContext(uid, { email: `${uid}@example.test` }).firestore();
}

async function seedProfilesAndRequest() {
  if (!testEnv) throw new Error("Rules test environment was not initialized.");

  await testEnv.withSecurityRulesDisabled(async (context) => {
    const firestore = context.firestore();
    await Promise.all([
      setDoc(doc(firestore, "users", "admin-1"), profile("admin-1", "ADMIN")),
      setDoc(doc(firestore, "users", "picker-1"), profile("picker-1", "PICKER")),
      setDoc(
        doc(firestore, "passwordResetRequests", "picker-1"),
        requestDocument("picker-1")
      )
    ]);
  });
}

function profile(uid: string, role: "ADMIN" | "PICKER") {
  return {
    active: true,
    registrationStatus: "APPROVED",
    role,
    uid
  };
}

function requestDocument(id: string) {
  return {
    displayName: "Anna Zbieracz",
    email: "anna@example.test",
    id,
    status: "PENDING",
    userUid: id
  };
}
