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
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where
} from "firebase/firestore";
import { readFileSync } from "node:fs";

const projectId = "demo-borowka-pwa-issue-reports";
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

afterEach(async () => {
  await testEnv?.clearFirestore();
});

afterAll(async () => {
  await testEnv?.cleanup();
});

describe("issue report rules", () => {
  it("allows a picker to create own session and entry reports", async () => {
    await seedBase();
    const pickerDb = authenticatedDb("picker-1");

    await assertSucceeds(
      setDoc(
        doc(pickerDb, "issueReports", "report-session"),
        reportDocument("report-session")
      )
    );
    await assertSucceeds(
      setDoc(
        doc(pickerDb, "issueReports", "report-entry"),
        reportDocument("report-entry", {
          entryId: "entry-1",
          subject: "ENTRY"
        })
      )
    );

    expect(
      (await getDoc(doc(pickerDb, "issueReports", "report-entry"))).data()
    ).toMatchObject({
      reporterUid: "picker-1",
      status: "OPEN",
      workerId: "worker-1"
    });
  });

  it("rejects foreign ownership, mismatched source and invalid assignment", async () => {
    await seedBase();
    const pickerDb = authenticatedDb("picker-1");

    await assertFails(
      setDoc(
        doc(pickerDb, "issueReports", "foreign-worker"),
        reportDocument("foreign-worker", {
          workerId: "worker-2"
        })
      )
    );
    await assertFails(
      setDoc(
        doc(pickerDb, "issueReports", "foreign-session"),
        reportDocument("foreign-session", {
          seasonId: "season-2",
          sessionId: "session-2"
        })
      )
    );
    await assertFails(
      setDoc(
        doc(pickerDb, "issueReports", "foreign-entry"),
        reportDocument("foreign-entry", {
          entryId: "entry-2",
          subject: "ENTRY"
        })
      )
    );
    await assertFails(
      setDoc(
        doc(pickerDb, "issueReports", "entry-on-session"),
        reportDocument("entry-on-session", {
          entryId: "entry-1",
          subject: "SESSION"
        })
      )
    );
  });

  it("limits picker reads to own worker query and denies operator access", async () => {
    await seedBase();
    await seedReports();
    const pickerDb = authenticatedDb("picker-1");
    const operatorDb = authenticatedDb("operator-1");

    await assertSucceeds(getDoc(doc(pickerDb, "issueReports", "report-own")));
    await assertFails(getDoc(doc(pickerDb, "issueReports", "report-foreign")));
    await assertFails(getDocs(collection(pickerDb, "issueReports")));
    await assertSucceeds(
      getDocs(
        query(collection(pickerDb, "issueReports"), where("workerId", "==", "worker-1"))
      )
    );
    await assertFails(getDocs(collection(operatorDb, "issueReports")));
  });

  it("allows only an admin to resolve once without changing source fields", async () => {
    await seedBase();
    await seedReports();
    const adminDb = authenticatedDb("admin-1");
    const pickerDb = authenticatedDb("picker-1");

    await assertFails(
      updateDoc(doc(pickerDb, "issueReports", "report-own"), {
        resolutionNote: "Picker nie moze odpowiadac.",
        resolvedAt: serverTimestamp(),
        resolvedBy: "picker-1",
        status: "RESOLVED"
      })
    );
    await assertSucceeds(
      updateDoc(doc(adminDb, "issueReports", "report-own"), {
        resolutionNote: "Sprawdzono i wykonano osobna korekte.",
        resolvedAt: serverTimestamp(),
        resolvedBy: "admin-1",
        status: "RESOLVED"
      })
    );

    const resolved = await getDoc(doc(pickerDb, "issueReports", "report-own"));
    expect(resolved.data()).toMatchObject({
      resolutionNote: "Sprawdzono i wykonano osobna korekte.",
      resolvedBy: "admin-1",
      status: "RESOLVED"
    });

    await assertFails(
      updateDoc(doc(adminDb, "issueReports", "report-own"), {
        resolutionNote: "Druga odpowiedz.",
        resolvedAt: serverTimestamp(),
        resolvedBy: "admin-1",
        status: "REJECTED"
      })
    );
    await assertFails(
      updateDoc(doc(adminDb, "issueReports", "report-foreign"), {
        message: "Zmieniony opis",
        resolutionNote: "Nie wolno zmieniac opisu.",
        resolvedAt: serverTimestamp(),
        resolvedBy: "admin-1",
        status: "REJECTED"
      })
    );
    await assertFails(deleteDoc(doc(adminDb, "issueReports", "report-own")));
  });
});

function authenticatedDb(uid: string) {
  if (!testEnv) {
    throw new Error("Rules test environment was not initialized.");
  }

  return testEnv.authenticatedContext(uid, { email: `${uid}@example.test` }).firestore();
}

async function seedBase(): Promise<void> {
  if (!testEnv) {
    throw new Error("Rules test environment was not initialized.");
  }

  await testEnv.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    await Promise.all([
      setDoc(doc(db, "users", "admin-1"), profile("admin-1", "ADMIN", null)),
      setDoc(doc(db, "users", "operator-1"), profile("operator-1", "OPERATOR", null)),
      setDoc(doc(db, "users", "picker-1"), profile("picker-1", "PICKER", "worker-1")),
      setDoc(doc(db, "users", "picker-2"), profile("picker-2", "PICKER", "worker-2")),
      setDoc(doc(db, "harvestSessions", "session-1"), {
        id: "session-1",
        seasonId: "season-1",
        workerId: "worker-1"
      }),
      setDoc(doc(db, "harvestSessions", "session-2"), {
        id: "session-2",
        seasonId: "season-2",
        workerId: "worker-2"
      }),
      setDoc(doc(db, "harvestEntries", "entry-1"), {
        id: "entry-1",
        seasonId: "season-1",
        sessionId: "session-1",
        workerId: "worker-1"
      }),
      setDoc(doc(db, "harvestEntries", "entry-2"), {
        id: "entry-2",
        seasonId: "season-2",
        sessionId: "session-2",
        workerId: "worker-2"
      })
    ]);
  });
}

async function seedReports(): Promise<void> {
  if (!testEnv) {
    throw new Error("Rules test environment was not initialized.");
  }

  await testEnv.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    await Promise.all([
      setDoc(
        doc(db, "issueReports", "report-own"),
        reportDocument("report-own", { createdAt: new Date("2026-07-28T08:00:00Z") })
      ),
      setDoc(
        doc(db, "issueReports", "report-foreign"),
        reportDocument("report-foreign", {
          createdAt: new Date("2026-07-28T09:00:00Z"),
          reporterUid: "picker-2",
          seasonId: "season-2",
          sessionId: "session-2",
          workerId: "worker-2"
        })
      )
    ]);
  });
}

function profile(
  uid: string,
  role: "ADMIN" | "OPERATOR" | "PICKER",
  workerId: string | null
) {
  return {
    active: true,
    registrationStatus: "APPROVED",
    role,
    uid,
    workerId
  };
}

function reportDocument(id: string, overrides: Partial<Record<string, unknown>> = {}) {
  return {
    createdAt: serverTimestamp(),
    entryId: null,
    id,
    message: "Kwota nie zgadza sie z wpisami.",
    reporterUid: "picker-1",
    resolutionNote: null,
    resolvedAt: null,
    resolvedBy: null,
    seasonId: "season-1",
    sessionId: "session-1",
    status: "OPEN",
    subject: "AMOUNT",
    workerId: "worker-1",
    ...overrides
  };
}
