import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment
} from "@firebase/rules-unit-testing";
import { collection, doc, getDoc, getDocs, setDoc } from "firebase/firestore";
import { readFileSync } from "node:fs";

const projectId = "demo-borowka-pwa-payments";
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

describe("payment read rules", () => {
  it("allows active admin read and denies operator read and all client writes", async () => {
    if (!testEnv) {
      throw new Error("Rules test environment was not initialized.");
    }

    await testEnv.withSecurityRulesDisabled(async (context) => {
      await Promise.all([
        setDoc(doc(context.firestore(), "users", "admin-1"), profile("admin-1", "ADMIN")),
        setDoc(
          doc(context.firestore(), "users", "operator-1"),
          profile("operator-1", "OPERATOR")
        ),
        setDoc(doc(context.firestore(), "payments", "session-1"), {
          id: "session-1",
          sessionId: "session-1",
          status: "CANCELLED"
        })
      ]);
    });

    const adminDb = testEnv.authenticatedContext("admin-1").firestore();
    const operatorDb = testEnv.authenticatedContext("operator-1").firestore();

    await assertSucceeds(getDoc(doc(adminDb, "payments", "session-1")));
    await assertSucceeds(getDocs(collection(adminDb, "payments")));
    await assertFails(getDoc(doc(operatorDb, "payments", "session-1")));
    await assertFails(getDocs(collection(operatorDb, "payments")));
    await assertFails(
      setDoc(doc(adminDb, "payments", "session-2"), {
        id: "session-2",
        sessionId: "session-2",
        status: "ACTIVE"
      })
    );
  });
});

function profile(uid: string, role: "ADMIN" | "OPERATOR") {
  return {
    uid,
    email: `${uid}@example.test`,
    displayName: uid,
    role,
    workerId: null,
    active: true,
    registrationStatus: "APPROVED",
    offlineConsent: false
  };
}
