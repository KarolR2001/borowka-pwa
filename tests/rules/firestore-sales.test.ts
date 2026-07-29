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
  getDocs,
  serverTimestamp,
  setDoc,
  writeBatch
} from "firebase/firestore";
import { readFileSync } from "node:fs";

const projectId = "demo-borowka-pwa-sales";
let testEnvironment: RulesTestEnvironment | undefined;

beforeAll(async () => {
  testEnvironment = await initializeTestEnvironment({
    projectId,
    firestore: {
      host: "127.0.0.1",
      port: 8080,
      rules: readFileSync("firestore.rules", "utf8")
    }
  });
});

beforeEach(async () => {
  await testEnvironment?.clearFirestore();

  if (!testEnvironment) {
    throw new Error("Rules test environment was not initialized.");
  }

  await testEnvironment.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    await Promise.all([
      setDoc(doc(db, "users", "admin-1"), profile("ADMIN")),
      setDoc(doc(db, "users", "operator-1"), profile("OPERATOR")),
      setDoc(doc(db, "users", "picker-1"), {
        ...profile("PICKER"),
        workerId: "worker-1"
      }),
      setDoc(doc(db, "seasons", "season-1"), {
        closedAt: null,
        closedBy: null,
        createdAt: Timestamp.now(),
        createdBy: "admin-1",
        endDate: "2026-09-30",
        id: "season-1",
        isDefault: true,
        name: "Sezon 2026",
        reopenedAt: null,
        startDate: "2026-07-01",
        status: "OPEN"
      })
    ]);
  });
});

afterAll(async () => {
  await testEnvironment?.cleanup();
});

describe("sales Firestore rules", () => {
  it("allows an administrator to create a sale only with a matching audit", async () => {
    const db = authenticatedDb("admin-1");
    const batch = writeBatch(db);
    batch.set(doc(db, "sales", "sale-1"), saleDocument());
    batch.set(doc(db, "auditEvents", "sale-created-sale-1"), saleAudit());

    await assertSucceeds(batch.commit());
    await assertSucceeds(getDocs(collection(db, "sales")));
  });

  it("rejects a standalone sale and malformed ordinary sale fields", async () => {
    const db = authenticatedDb("admin-1");

    await assertFails(setDoc(doc(db, "sales", "sale-1"), saleDocument()));

    const invalidBatch = writeBatch(db);
    invalidBatch.set(doc(db, "sales", "sale-1"), {
      ...saleDocument(),
      weightG: -1
    });
    invalidBatch.set(doc(db, "auditEvents", "sale-created-sale-1"), {
      ...saleAudit(),
      afterSummary: {
        ...saleAudit().afterSummary,
        weightG: -1
      }
    });
    await assertFails(invalidBatch.commit());

    const wrongTotalBatch = writeBatch(db);
    wrongTotalBatch.set(doc(db, "sales", "sale-1"), {
      ...saleDocument(),
      totalGrosz: 3749
    });
    wrongTotalBatch.set(doc(db, "auditEvents", "sale-created-sale-1"), {
      ...saleAudit(),
      afterSummary: {
        ...saleAudit().afterSummary,
        totalGrosz: 3749
      }
    });
    await assertFails(wrongTotalBatch.commit());

    const wrongVersionBatch = writeBatch(db);
    wrongVersionBatch.set(doc(db, "sales", "sale-1"), {
      ...saleDocument(),
      calculationVersion: "legacy"
    });
    wrongVersionBatch.set(doc(db, "auditEvents", "sale-created-sale-1"), {
      ...saleAudit(),
      afterSummary: {
        ...saleAudit().afterSummary,
        calculationVersion: "legacy"
      }
    });
    await assertFails(wrongVersionBatch.commit());
  });

  it("rejects a sale outside the open season date range", async () => {
    const db = authenticatedDb("admin-1");
    const batch = writeBatch(db);
    batch.set(doc(db, "sales", "sale-1"), {
      ...saleDocument(),
      businessDate: "2026-10-01"
    });
    batch.set(doc(db, "auditEvents", "sale-created-sale-1"), {
      ...saleAudit(),
      businessDate: "2026-10-01"
    });

    await assertFails(batch.commit());
  });

  it("denies sales reads and writes to non-admin roles and anonymous users", async () => {
    const operatorDb = authenticatedDb("operator-1");
    const pickerDb = authenticatedDb("picker-1");
    const anonymousDb = requiredEnvironment().unauthenticatedContext().firestore();

    await assertFails(getDocs(collection(operatorDb, "sales")));
    await assertFails(getDocs(collection(pickerDb, "sales")));
    await assertFails(getDocs(collection(anonymousDb, "sales")));

    for (const db of [operatorDb, pickerDb]) {
      const batch = writeBatch(db);
      batch.set(doc(db, "sales", "sale-1"), saleDocument());
      batch.set(doc(db, "auditEvents", "sale-created-sale-1"), saleAudit());
      await assertFails(batch.commit());
    }
  });
});

function authenticatedDb(uid: string) {
  return requiredEnvironment()
    .authenticatedContext(uid, { email: `${uid}@example.test` })
    .firestore();
}

function requiredEnvironment(): RulesTestEnvironment {
  if (!testEnvironment) {
    throw new Error("Rules test environment was not initialized.");
  }

  return testEnvironment;
}

function profile(role: "ADMIN" | "OPERATOR" | "PICKER") {
  return {
    active: true,
    displayName: role,
    email: `${role.toLowerCase()}@example.test`,
    offlineConsent: false,
    registrationStatus: "APPROVED",
    role,
    uid: `${role.toLowerCase()}-1`,
    workerId: null
  };
}

function saleDocument() {
  return {
    businessDate: "2026-07-29",
    calculationVersion: "1",
    cancellationReason: null,
    cancelledAt: null,
    cancelledBy: null,
    correctionDirection: null,
    createdAtServer: serverTimestamp(),
    createdBy: "admin-1",
    creationAttemptId: "sale-attempt-sale-1",
    entryType: "SALE",
    id: "sale-1",
    legacyImport: false,
    legacySourceRow: null,
    note: "Odbiorca A",
    priceGroszPerKg: 1250,
    seasonId: "season-1",
    status: "ACTIVE",
    totalGrosz: 3750,
    weightG: 3000
  };
}

function saleAudit() {
  return {
    action: "SALE_CREATED",
    actorRoleSnapshot: "ADMIN",
    actorUid: "admin-1",
    afterSummary: {
      calculationVersion: "1",
      entryType: "SALE",
      projectedStockWeightG: 7000,
      saleId: "sale-1",
      seasonId: "season-1",
      status: "ACTIVE",
      totalGrosz: 3750,
      weightG: 3000
    },
    beforeSummary: {
      availableStockWeightG: 10_000,
      seasonId: "season-1"
    },
    businessDate: "2026-07-29",
    createdAtDevice: Timestamp.now(),
    createdAtServer: serverTimestamp(),
    deviceId: "device-admin",
    entityId: "sale-1",
    entityType: "SALE",
    id: "sale-created-sale-1",
    reason: null
  };
}
