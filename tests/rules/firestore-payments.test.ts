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
  updateDoc,
  writeBatch,
  type WriteBatch
} from "firebase/firestore";
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

describe("payment rules", () => {
  it("allows active admin read and denies operator read", async () => {
    await seedBase();
    const adminDb = authenticatedDb("admin-1");
    const operatorDb = authenticatedDb("operator-1");

    await assertSucceeds(getDocs(collection(adminDb, "payments")));
    await assertFails(getDocs(collection(operatorDb, "payments")));
  });

  it("allows an admin to atomically create payment, mark session PAID and append audit", async () => {
    await seedBase();
    const db = authenticatedDb("admin-1");
    const batch = writeBatch(db);
    queuePaymentWrite(batch, db);

    await assertSucceeds(batch.commit());

    const [paymentSnapshot, sessionSnapshot, auditSnapshot] = await Promise.all([
      getDoc(doc(db, "payments", "session-1")),
      getDoc(doc(db, "harvestSessions", "session-1")),
      getDoc(doc(db, "auditEvents", "payment-created-session-1"))
    ]);
    expect(paymentSnapshot.data()).toMatchObject({
      amountGrosz: 1000,
      createdBy: "admin-1",
      status: "ACTIVE"
    });
    expect(sessionSnapshot.data()).toMatchObject({
      paymentId: "session-1",
      revision: 3,
      status: "PAID"
    });
    expect(auditSnapshot.data()).toMatchObject({
      action: "HARVEST_SESSION_PAID",
      entityId: "session-1"
    });
  });

  it("denies standalone payment and standalone PAID session writes", async () => {
    await seedBase();
    const db = authenticatedDb("admin-1");

    await assertFails(setDoc(doc(db, "payments", "session-1"), paymentDocument()));
    await assertFails(
      updateDoc(doc(db, "harvestSessions", "session-1"), paidSessionUpdate())
    );
  });

  it("denies payment and PAID session without the required audit event", async () => {
    await seedBase();
    const db = authenticatedDb("admin-1");
    const batch = writeBatch(db);
    batch.set(doc(db, "payments", "session-1"), paymentDocument());
    batch.update(doc(db, "harvestSessions", "session-1"), paidSessionUpdate());

    await assertFails(batch.commit());
  });

  it("denies an operator and rejects a modified official amount", async () => {
    await seedBase();
    const operatorDb = authenticatedDb("operator-1");
    const operatorBatch = writeBatch(operatorDb);
    queuePaymentWrite(operatorBatch, operatorDb, {
      actorUid: "operator-1"
    });
    await assertFails(operatorBatch.commit());

    const adminDb = authenticatedDb("admin-1");
    const amountBatch = writeBatch(adminDb);
    queuePaymentWrite(amountBatch, adminDb, {
      amountGrosz: 999
    });
    await assertFails(amountBatch.commit());
  });

  it("keeps an accepted payment immutable", async () => {
    await seedBase();
    const db = authenticatedDb("admin-1");
    const batch = writeBatch(db);
    queuePaymentWrite(batch, db);
    await assertSucceeds(batch.commit());

    await assertFails(
      updateDoc(doc(db, "payments", "session-1"), {
        note: "Zmieniona notatka"
      })
    );
    await assertFails(deleteDoc(doc(db, "payments", "session-1")));
  });
});

function authenticatedDb(uid: string) {
  if (!testEnv) {
    throw new Error("Rules test environment was not initialized.");
  }

  return testEnv
    .authenticatedContext(uid, {
      email: `${uid}@example.test`
    })
    .firestore();
}

async function seedBase(): Promise<void> {
  if (!testEnv) {
    throw new Error("Rules test environment was not initialized.");
  }

  await testEnv.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    await Promise.all([
      setDoc(doc(db, "users", "admin-1"), profile("admin-1", "ADMIN")),
      setDoc(doc(db, "users", "operator-1"), profile("operator-1", "OPERATOR")),
      setDoc(doc(db, "harvestSessions", "session-1"), closedSession())
    ]);
  });
}

function queuePaymentWrite(
  batch: WriteBatch,
  db: ReturnType<typeof authenticatedDb>,
  {
    actorUid = "admin-1",
    amountGrosz = 1000
  }: {
    actorUid?: string;
    amountGrosz?: number;
  } = {}
): void {
  batch.set(
    doc(db, "payments", "session-1"),
    paymentDocument({ amountGrosz, createdBy: actorUid })
  );
  batch.update(doc(db, "harvestSessions", "session-1"), paidSessionUpdate());
  batch.set(doc(db, "auditEvents", "payment-created-session-1"), paymentAudit(actorUid));
}

function paymentDocument(overrides: Record<string, unknown> = {}) {
  return {
    amountGrosz: 1000,
    cancellationReason: null,
    cancelledAt: null,
    cancelledBy: null,
    createdAtServer: serverTimestamp(),
    createdBy: "admin-1",
    id: "session-1",
    legacyImport: false,
    note: null,
    paidBusinessDate: "2026-07-28",
    paymentMethod: "CASH",
    seasonId: "season-1",
    sessionId: "session-1",
    status: "ACTIVE",
    workerId: "worker-1",
    workerNameSnapshot: "Anna",
    ...overrides
  };
}

function paidSessionUpdate() {
  return {
    paidAt: serverTimestamp(),
    paymentId: "session-1",
    revision: 3,
    status: "PAID",
    updatedAtServer: serverTimestamp()
  };
}

function paymentAudit(actorUid: string) {
  return {
    action: "HARVEST_SESSION_PAID",
    actorRoleSnapshot: actorUid === "admin-1" ? "ADMIN" : "OPERATOR",
    actorUid,
    afterSummary: {
      amountDueGrosz: 1000,
      businessDate: "2026-07-20",
      paymentId: "session-1",
      revision: 3,
      seasonId: "season-1",
      status: "PAID",
      workerId: "worker-1"
    },
    beforeSummary: {
      amountDueGrosz: 1000,
      businessDate: "2026-07-20",
      paymentId: null,
      revision: 2,
      seasonId: "season-1",
      status: "CLOSED",
      workerId: "worker-1"
    },
    businessDate: "2026-07-28",
    createdAtDevice: Timestamp.now(),
    createdAtServer: serverTimestamp(),
    deviceId: "device-admin",
    entityId: "session-1",
    entityType: "HARVEST_SESSION",
    id: "payment-created-session-1",
    reason: null
  };
}

function closedSession() {
  return {
    allowBatchQuantitySnapshot: true,
    amountDueGrosz: 1000,
    businessDate: "2026-07-20",
    calculationBasisSnapshot: "WEIGHT",
    calculationVersion: "1",
    cancellationReason: null,
    cancelledAt: null,
    cancelledBy: null,
    closedAtDevice: Timestamp.now(),
    closedAtServer: Timestamp.now(),
    closedBy: "operator-1",
    createdAtDevice: Timestamp.now(),
    createdAtServer: Timestamp.now(),
    createdBy: "operator-1",
    createdDeviceId: "device-operator",
    id: "session-1",
    legacyImport: false,
    legacySourceRows: [],
    note: null,
    paidAt: null,
    paymentId: null,
    planIdSnapshot: "plan-1",
    planNameSnapshot: "Za kilogram",
    quantityPrecisionSnapshot: 3,
    rateGroszSnapshot: 1000,
    rateVersionIdSnapshot: "rate-1",
    revision: 2,
    seasonId: "season-1",
    status: "CLOSED",
    totalEntryCount: 1,
    totalQuantityMilli: 1000,
    totalWeightG: 1000,
    unitLabelPluralSnapshot: "kilogramy",
    unitLabelSnapshot: "kilogram",
    updatedAtServer: Timestamp.now(),
    weightRequiredSnapshot: true,
    workerId: "worker-1",
    workerNameSnapshot: "Anna"
  };
}

function profile(uid: string, role: "ADMIN" | "OPERATOR") {
  return {
    active: true,
    displayName: uid,
    email: `${uid}@example.test`,
    offlineConsent: false,
    registrationStatus: "APPROVED",
    role,
    uid,
    workerId: null
  };
}
