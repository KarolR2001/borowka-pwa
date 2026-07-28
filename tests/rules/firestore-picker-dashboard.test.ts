import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment
} from "@firebase/rules-unit-testing";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  orderBy,
  query,
  setDoc,
  updateDoc,
  where
} from "firebase/firestore";
import { readFileSync } from "node:fs";

const projectId = "demo-borowka-pwa-picker-dashboard";
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

describe("picker dashboard rules", () => {
  it("allows a picker to query only own sessions and payments", async () => {
    await seedDashboard();
    const pickerDb = authenticatedDb("picker-anna");

    await assertSucceeds(
      getDocs(
        query(
          collection(pickerDb, "harvestSessions"),
          where("workerId", "==", "worker-anna")
        )
      )
    );
    await assertSucceeds(
      getDocs(
        query(collection(pickerDb, "payments"), where("workerId", "==", "worker-anna"))
      )
    );

    await assertFails(getDocs(collection(pickerDb, "harvestSessions")));
    await assertFails(
      getDocs(
        query(
          collection(pickerDb, "harvestSessions"),
          where("workerId", "==", "worker-bartek")
        )
      )
    );
    await assertFails(getDocs(collection(pickerDb, "payments")));
    await assertFails(
      getDocs(
        query(collection(pickerDb, "payments"), where("workerId", "==", "worker-bartek"))
      )
    );
  });

  it("allows only the linked worker document and season metadata", async () => {
    await seedDashboard();
    const pickerDb = authenticatedDb("picker-anna");

    await assertSucceeds(getDoc(doc(pickerDb, "workers", "worker-anna")));
    await assertFails(getDoc(doc(pickerDb, "workers", "worker-bartek")));
    await assertSucceeds(getDocs(collection(pickerDb, "seasons")));
  });

  it("allows picker session details only for own worker and selected session", async () => {
    await seedDashboard();
    const pickerDb = authenticatedDb("picker-anna");

    await assertSucceeds(getDoc(doc(pickerDb, "harvestSessions", "session-anna")));
    await assertSucceeds(getDoc(doc(pickerDb, "payments", "payment-anna")));
    await assertSucceeds(
      getDocs(
        query(
          collection(pickerDb, "harvestEntries"),
          where("workerId", "==", "worker-anna"),
          where("sessionId", "==", "session-anna"),
          orderBy("sequenceNumber", "asc")
        )
      )
    );

    await assertFails(
      getDocs(
        query(
          collection(pickerDb, "harvestEntries"),
          where("sessionId", "==", "session-anna"),
          orderBy("sequenceNumber", "asc")
        )
      )
    );
    await assertFails(
      getDocs(
        query(
          collection(pickerDb, "harvestEntries"),
          where("workerId", "==", "worker-bartek"),
          where("sessionId", "==", "session-bartek"),
          orderBy("sequenceNumber", "asc")
        )
      )
    );
    await assertFails(getDoc(doc(pickerDb, "harvestSessions", "session-bartek")));
    await assertFails(getDoc(doc(pickerDb, "payments", "payment-bartek")));
  });

  it("does not grant picker writes and preserves admin access", async () => {
    await seedDashboard();
    const pickerDb = authenticatedDb("picker-anna");
    const adminDb = authenticatedDb("admin-1");

    await assertFails(
      updateDoc(doc(pickerDb, "harvestSessions", "session-anna"), {
        totalWeightG: 9999
      })
    );
    await assertFails(
      setDoc(doc(pickerDb, "payments", "payment-picker"), {
        workerId: "worker-anna"
      })
    );
    await assertSucceeds(getDocs(collection(adminDb, "harvestSessions")));
    await assertSucceeds(getDocs(collection(adminDb, "payments")));
    await assertSucceeds(getDocs(collection(adminDb, "workers")));
  });

  it("denies another role and a picker without workerId from payment data", async () => {
    await seedDashboard();

    await assertFails(getDocs(collection(authenticatedDb("operator-1"), "payments")));
    await assertFails(
      getDocs(collection(authenticatedDb("picker-unlinked"), "payments"))
    );
  });
});

async function seedDashboard(): Promise<void> {
  if (!testEnv) {
    throw new Error("Rules test environment is not initialized.");
  }

  await testEnv.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();

    await Promise.all([
      setDoc(doc(db, "users", "admin-1"), profile("ADMIN", null)),
      setDoc(doc(db, "users", "operator-1"), profile("OPERATOR", null)),
      setDoc(doc(db, "users", "picker-anna"), profile("PICKER", "worker-anna")),
      setDoc(doc(db, "users", "picker-unlinked"), profile("PICKER", null)),
      setDoc(doc(db, "workers", "worker-anna"), {
        active: true,
        id: "worker-anna",
        linkedUserUid: "picker-anna"
      }),
      setDoc(doc(db, "workers", "worker-bartek"), {
        active: true,
        id: "worker-bartek",
        linkedUserUid: "picker-bartek"
      }),
      setDoc(doc(db, "seasons", "season-2026"), {
        id: "season-2026",
        status: "OPEN"
      }),
      setDoc(doc(db, "seasons", "season-2025"), {
        id: "season-2025",
        status: "CLOSED"
      }),
      setDoc(doc(db, "harvestSessions", "session-anna"), {
        workerId: "worker-anna"
      }),
      setDoc(doc(db, "harvestSessions", "session-bartek"), {
        workerId: "worker-bartek"
      }),
      setDoc(doc(db, "payments", "payment-anna"), {
        workerId: "worker-anna"
      }),
      setDoc(doc(db, "payments", "payment-bartek"), {
        workerId: "worker-bartek"
      }),
      setDoc(doc(db, "harvestEntries", "entry-anna"), {
        sequenceNumber: 1,
        sessionId: "session-anna",
        workerId: "worker-anna"
      }),
      setDoc(doc(db, "harvestEntries", "entry-bartek"), {
        sequenceNumber: 1,
        sessionId: "session-bartek",
        workerId: "worker-bartek"
      })
    ]);
  });
}

function profile(role: "ADMIN" | "OPERATOR" | "PICKER", workerId: string | null) {
  return {
    active: true,
    registrationStatus: "APPROVED",
    role,
    workerId
  };
}

function authenticatedDb(uid: string) {
  if (!testEnv) {
    throw new Error("Rules test environment is not initialized.");
  }

  return testEnv.authenticatedContext(uid).firestore();
}
