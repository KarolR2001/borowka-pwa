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
  query,
  setDoc,
  where
} from "firebase/firestore";
import { readFileSync } from "node:fs";

import { FULL_CLOUD_EXPORT_COLLECTIONS } from "../../src/reports/fullCloudExport";

const projectId = "demo-borowka-pwa-export-permissions";
const ownWorkerId = "worker-1";
const otherWorkerId = "worker-2";
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
  if (!testEnv) throw new Error("Rules test environment was not initialized.");

  await testEnv.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    await Promise.all([
      setDoc(doc(db, "users", "admin-1"), profile("admin-1", "ADMIN", null)),
      setDoc(
        doc(db, "users", "blocked-admin"),
        profile("blocked-admin", "ADMIN", null, false)
      ),
      setDoc(doc(db, "users", "operator-1"), profile("operator-1", "OPERATOR", null)),
      setDoc(doc(db, "users", "picker-1"), profile("picker-1", "PICKER", ownWorkerId)),
      setDoc(doc(db, "registrationInvitations", "invitation-1"), {
        emailNormalized: "invited@example.test"
      }),
      setDoc(doc(db, "auditEvents", "audit-1"), { actorUid: "admin-1" }),
      setDoc(doc(db, "devices", "device-1"), { userUid: "admin-1" }),
      setDoc(doc(db, "appSettings", "domain"), {
        id: "domain",
        pickerOwnReportExportEnabled: true
      }),
      setDoc(doc(db, "seasons", "season-1"), {
        id: "season-1",
        status: "OPEN"
      }),
      setDoc(doc(db, "settlementPlans", "plan-1"), {
        active: true,
        id: "plan-1"
      }),
      setDoc(doc(db, "workers", ownWorkerId), {
        active: true,
        id: ownWorkerId,
        linkedUserUid: "picker-1"
      }),
      setDoc(doc(db, "workers", otherWorkerId), {
        active: true,
        id: otherWorkerId,
        linkedUserUid: null
      }),
      setDoc(doc(db, "workerRateVersions", "rate-1"), {
        active: true,
        id: "rate-1"
      }),
      ...ownedDocuments("harvestSessions"),
      ...ownedDocuments("harvestEntries"),
      setDoc(doc(db, "sales", "sale-1"), {
        seasonId: "season-1",
        totalGrosz: 1000
      }),
      setDoc(doc(db, "operationalStockMovements", "movement-1"), {
        seasonId: "season-1",
        weightDeltaG: -1000
      }),
      ...ownedDocuments("payments"),
      ...ownedDocuments("issueReports")
    ]);

    function ownedDocuments(collectionName: string) {
      return [
        setDoc(doc(db, collectionName, `${collectionName}-own`), {
          workerId: ownWorkerId
        }),
        setDoc(doc(db, collectionName, `${collectionName}-other`), {
          workerId: otherWorkerId
        })
      ];
    }
  });
});

afterAll(async () => {
  await testEnv?.cleanup();
});

describe("export permission matrix", () => {
  it("allows only an active administrator to list every full-export collection", async () => {
    const adminDb = authenticatedDb("admin-1");
    const blockedAdminDb = authenticatedDb("blocked-admin");
    const anonymousDb = unauthenticatedDb();

    for (const collectionName of FULL_CLOUD_EXPORT_COLLECTIONS) {
      await assertSucceeds(getDocs(collection(adminDb, collectionName)));
      await assertFails(getDocs(collection(anonymousDb, collectionName)));
    }

    await assertFails(getDocs(collection(blockedAdminDb, "appSettings")));
  });

  it("prevents an operator from listing personal and financial export data", async () => {
    const operatorDb = authenticatedDb("operator-1");
    const protectedCollections = [
      "appSettings",
      "auditEvents",
      "devices",
      "payments",
      "registrationInvitations",
      "sales",
      "users"
    ];

    for (const collectionName of protectedCollections) {
      await assertFails(getDocs(collection(operatorDb, collectionName)));
    }
  });

  it("allows a picker export to read only the linked worker records", async () => {
    const pickerDb = authenticatedDb("picker-1");

    await assertSucceeds(getDoc(doc(pickerDb, "users", "picker-1")));
    await assertFails(getDoc(doc(pickerDb, "users", "admin-1")));
    await assertSucceeds(getDocs(collection(pickerDb, "seasons")));
    await assertSucceeds(getDoc(doc(pickerDb, "appSettings", "domain")));
    await assertFails(getDocs(collection(pickerDb, "appSettings")));
    await assertFails(getDocs(collection(pickerDb, "sales")));

    for (const collectionName of ["harvestSessions", "harvestEntries", "payments"]) {
      const own = await assertSucceeds(
        getDocs(
          query(
            collection(pickerDb, collectionName),
            where("workerId", "==", ownWorkerId)
          )
        )
      );
      expect(own.docs.map((snapshot) => snapshot.id)).toEqual([`${collectionName}-own`]);
      await assertFails(getDocs(collection(pickerDb, collectionName)));
      await assertFails(
        getDocs(
          query(
            collection(pickerDb, collectionName),
            where("workerId", "==", otherWorkerId)
          )
        )
      );
    }
  });
});

function authenticatedDb(uid: string) {
  if (!testEnv) throw new Error("Rules test environment was not initialized.");
  return testEnv.authenticatedContext(uid, { email: `${uid}@example.test` }).firestore();
}

function unauthenticatedDb() {
  if (!testEnv) throw new Error("Rules test environment was not initialized.");
  return testEnv.unauthenticatedContext().firestore();
}

function profile(
  uid: string,
  role: "ADMIN" | "OPERATOR" | "PICKER",
  workerId: string | null,
  active = true
) {
  return {
    active,
    displayName: uid,
    email: `${uid}@example.test`,
    offlineConsent: false,
    registrationStatus: active ? "APPROVED" : "BLOCKED",
    role,
    uid,
    workerId
  };
}
