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
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
  type WriteBatch
} from "firebase/firestore";
import { readFileSync } from "node:fs";

const projectId = "demo-borowka-pwa-payments";
const paymentId = "session-1--payment-r3";
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
  it("allows an active admin read and denies anonymous access", async () => {
    await seedBase();
    const adminDb = authenticatedDb("admin-1");
    const anonymousDb = unauthenticatedDb();

    await assertSucceeds(getDocs(collection(adminDb, "payments")));
    await assertFails(getDocs(collection(anonymousDb, "payments")));
    await assertFails(getDoc(doc(anonymousDb, "payments", paymentId)));
  });

  it("allows a picker to read only payments for the linked worker", async () => {
    await seedBase();
    await seedPaymentsForRead();
    const pickerDb = authenticatedDb("picker-1");

    await assertSucceeds(getDoc(doc(pickerDb, "payments", paymentId)));
    await assertFails(getDoc(doc(pickerDb, "payments", "session-2--payment-r3")));

    const ownPayments = await assertSucceeds(
      getDocs(
        query(collection(pickerDb, "payments"), where("workerId", "==", "worker-1"))
      )
    );
    expect(ownPayments.docs.map((snapshot) => snapshot.id)).toEqual([paymentId]);

    await assertFails(getDocs(collection(pickerDb, "payments")));
    await assertFails(
      getDocs(
        query(collection(pickerDb, "payments"), where("workerId", "==", "worker-2"))
      )
    );
  });

  it("denies an operator payment reads and creation", async () => {
    await seedBase();
    await seedPaymentsForRead();
    const operatorDb = authenticatedDb("operator-1");

    await assertFails(getDocs(collection(operatorDb, "payments")));
    await assertFails(getDoc(doc(operatorDb, "payments", paymentId)));

    const operatorBatch = writeBatch(operatorDb);
    queuePaymentWrite(operatorBatch, operatorDb, {
      actorUid: "operator-1"
    });
    await assertFails(operatorBatch.commit());
  });

  it("allows an admin to atomically create payment, mark session PAID and append audit", async () => {
    await seedBase();
    const db = authenticatedDb("admin-1");
    const batch = writeBatch(db);
    queuePaymentWrite(batch, db);

    await assertSucceeds(batch.commit());

    const [paymentSnapshot, sessionSnapshot, auditSnapshot] = await Promise.all([
      getDoc(doc(db, "payments", paymentId)),
      getDoc(doc(db, "harvestSessions", "session-1")),
      getDoc(doc(db, "auditEvents", "payment-created-session-1--payment-r3"))
    ]);
    expect(paymentSnapshot.data()).toMatchObject({
      amountGrosz: 1000,
      createdBy: "admin-1",
      status: "ACTIVE"
    });
    expect(sessionSnapshot.data()).toMatchObject({
      paymentId: "session-1--payment-r3",
      revision: 3,
      status: "PAID"
    });
    expect(auditSnapshot.data()).toMatchObject({
      action: "HARVEST_SESSION_PAID",
      entityId: "session-1"
    });
  });

  it("denies payment creation by an inactive administrator", async () => {
    await seedBase();
    const db = authenticatedDb("admin-inactive");
    const batch = writeBatch(db);
    queuePaymentWrite(batch, db, {
      actorUid: "admin-inactive"
    });

    await assertFails(batch.commit());
  });

  it("requires the payment document id to match the session and target revision", async () => {
    await seedBase();
    const db = authenticatedDb("admin-1");
    const batch = writeBatch(db);
    queuePaymentWrite(batch, db, {
      paymentId: "unrelated-payment"
    });

    await assertFails(batch.commit());
  });

  it("rejects invalid amount, worker, season, session and worker-name types", async () => {
    await seedBase();
    const db = authenticatedDb("admin-1");
    const invalidDocuments: Record<string, unknown>[] = [
      { amountGrosz: "1000" },
      { workerId: 123 },
      { seasonId: 123 },
      { sessionId: 123 },
      { workerNameSnapshot: 123 }
    ];

    for (const paymentOverrides of invalidDocuments) {
      const batch = writeBatch(db);
      queuePaymentWrite(batch, db, { paymentOverrides });
      await assertFails(batch.commit());
    }
  });

  it("requires an existing CLOSED source session", async () => {
    await seedBase();
    const db = authenticatedDb("admin-1");

    await setSessionWithRulesDisabled(
      closedSession({
        amountDueGrosz: null,
        closedAtDevice: null,
        closedAtServer: null,
        closedBy: null,
        status: "OPEN"
      })
    );
    const openSessionBatch = writeBatch(db);
    queuePaymentWrite(openSessionBatch, db);
    await assertFails(openSessionBatch.commit());

    const missingSessionBatch = writeBatch(db);
    const missingPaymentId = "missing-session--payment-r3";
    missingSessionBatch.set(
      doc(db, "payments", missingPaymentId),
      paymentDocument({
        id: missingPaymentId,
        sessionId: "missing-session"
      })
    );
    missingSessionBatch.set(
      doc(db, "auditEvents", `payment-created-${missingPaymentId}`),
      paymentAudit("admin-1", missingPaymentId, "missing-session")
    );
    await assertFails(missingSessionBatch.commit());
  });

  it("denies standalone payment and standalone PAID session writes", async () => {
    await seedBase();
    const db = authenticatedDb("admin-1");

    await assertFails(setDoc(doc(db, "payments", paymentId), paymentDocument()));
    await assertFails(
      updateDoc(doc(db, "harvestSessions", "session-1"), paidSessionUpdate())
    );
  });

  it("denies payment and PAID session without the required audit event", async () => {
    await seedBase();
    const db = authenticatedDb("admin-1");
    const batch = writeBatch(db);
    batch.set(doc(db, "payments", paymentId), paymentDocument());
    batch.update(doc(db, "harvestSessions", "session-1"), paidSessionUpdate());

    await assertFails(batch.commit());
  });

  it("rejects a modified official amount", async () => {
    await seedBase();
    const adminDb = authenticatedDb("admin-1");
    const amountBatch = writeBatch(adminDb);
    queuePaymentWrite(amountBatch, adminDb, {
      amountGrosz: 999
    });
    await assertFails(amountBatch.commit());
  });

  it("accepts the previous client schema without a creation attempt id", async () => {
    await seedBase();
    const db = authenticatedDb("admin-1");
    const batch = writeBatch(db);
    const legacyPayment = paymentDocument();
    Reflect.deleteProperty(legacyPayment, "creationAttemptId");
    batch.set(doc(db, "payments", paymentId), legacyPayment);
    batch.update(doc(db, "harvestSessions", "session-1"), paidSessionUpdate());
    batch.set(
      doc(db, "auditEvents", "payment-created-session-1--payment-r3"),
      paymentAudit("admin-1")
    );

    await assertSucceeds(batch.commit());
  });

  it("rejects an invalid creation attempt id", async () => {
    await seedBase();
    const db = authenticatedDb("admin-1");
    const batch = writeBatch(db);
    batch.set(doc(db, "payments", paymentId), paymentDocument({ creationAttemptId: "" }));
    batch.update(doc(db, "harvestSessions", "session-1"), paidSessionUpdate());
    batch.set(
      doc(db, "auditEvents", "payment-created-session-1--payment-r3"),
      paymentAudit("admin-1")
    );

    await assertFails(batch.commit());
  });

  it("keeps an accepted payment immutable", async () => {
    await seedBase();
    const db = authenticatedDb("admin-1");
    const batch = writeBatch(db);
    queuePaymentWrite(batch, db);
    await assertSucceeds(batch.commit());

    await assertFails(
      updateDoc(doc(db, "payments", paymentId), {
        note: "Zmieniona notatka"
      })
    );
    await assertFails(
      updateDoc(doc(db, "payments", paymentId), {
        amountGrosz: 999
      })
    );
    await assertFails(deleteDoc(doc(db, "payments", paymentId)));

    const retainedPayment = await assertSucceeds(getDoc(doc(db, "payments", paymentId)));
    expect(retainedPayment.data()?.amountGrosz).toBe(1000);
  });

  it("allows only an atomic admin cancellation with CLOSED session and audit", async () => {
    await seedBase();
    const db = authenticatedDb("admin-1");
    const paymentBatch = writeBatch(db);
    queuePaymentWrite(paymentBatch, db);
    await assertSucceeds(paymentBatch.commit());

    const standalone = writeBatch(db);
    standalone.update(doc(db, "payments", paymentId), paymentCancellationUpdate());
    await assertFails(standalone.commit());

    const operatorDb = authenticatedDb("operator-1");
    const operatorBatch = writeBatch(operatorDb);
    queueCancellation(operatorBatch, operatorDb, "operator-1");
    await assertFails(operatorBatch.commit());

    const changedAmountBatch = writeBatch(db);
    queueCancellation(changedAmountBatch, db, "admin-1", {
      amountGrosz: 999
    });
    await assertFails(changedAmountBatch.commit());

    const cancellationBatch = writeBatch(db);
    queueCancellation(cancellationBatch, db, "admin-1");
    await assertSucceeds(cancellationBatch.commit());

    const [paymentSnapshot, sessionSnapshot, auditSnapshot] = await Promise.all([
      getDoc(doc(db, "payments", paymentId)),
      getDoc(doc(db, "harvestSessions", "session-1")),
      getDoc(doc(db, "auditEvents", `payment-cancelled-${paymentId}`))
    ]);
    expect(paymentSnapshot.data()).toMatchObject({
      cancellationReason: "Bledna metoda",
      status: "CANCELLED"
    });
    expect(sessionSnapshot.data()).toMatchObject({
      paidAt: null,
      paymentId: null,
      revision: 4,
      status: "CLOSED"
    });
    expect(auditSnapshot.data()).toMatchObject({
      action: "PAYMENT_CANCELLED",
      entityId: paymentId
    });

    const nextPaymentId = "session-1--payment-r5";
    const nextPaymentBatch = writeBatch(db);
    nextPaymentBatch.set(
      doc(db, "payments", nextPaymentId),
      paymentDocument({
        creationAttemptId: "attempt-2",
        id: nextPaymentId,
        paidBusinessDate: "2026-07-29"
      })
    );
    nextPaymentBatch.update(doc(db, "harvestSessions", "session-1"), {
      paidAt: serverTimestamp(),
      paymentId: nextPaymentId,
      revision: 5,
      status: "PAID",
      updatedAtServer: serverTimestamp()
    });
    nextPaymentBatch.set(doc(db, "auditEvents", `payment-created-${nextPaymentId}`), {
      ...paymentAudit("admin-1"),
      afterSummary: {
        ...paymentAudit("admin-1").afterSummary,
        paymentId: nextPaymentId,
        revision: 5
      },
      beforeSummary: {
        ...paymentAudit("admin-1").beforeSummary,
        revision: 4
      },
      businessDate: "2026-07-29",
      id: `payment-created-${nextPaymentId}`
    });
    await assertSucceeds(nextPaymentBatch.commit());

    const paymentHistory = await getDocs(collection(db, "payments"));
    expect(
      paymentHistory.docs
        .map((snapshot) => String((snapshot.data() as Record<string, unknown>).status))
        .sort()
    ).toEqual(["ACTIVE", "CANCELLED"]);
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

function unauthenticatedDb() {
  if (!testEnv) {
    throw new Error("Rules test environment was not initialized.");
  }

  return testEnv.unauthenticatedContext().firestore();
}

async function seedBase(): Promise<void> {
  if (!testEnv) {
    throw new Error("Rules test environment was not initialized.");
  }

  await testEnv.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    await Promise.all([
      setDoc(doc(db, "users", "admin-1"), profile("admin-1", "ADMIN")),
      setDoc(
        doc(db, "users", "admin-inactive"),
        profile("admin-inactive", "ADMIN", {
          active: false
        })
      ),
      setDoc(doc(db, "users", "operator-1"), profile("operator-1", "OPERATOR")),
      setDoc(
        doc(db, "users", "picker-1"),
        profile("picker-1", "PICKER", {
          workerId: "worker-1"
        })
      ),
      setDoc(doc(db, "harvestSessions", "session-1"), closedSession())
    ]);
  });
}

async function seedPaymentsForRead(): Promise<void> {
  if (!testEnv) {
    throw new Error("Rules test environment was not initialized.");
  }

  await testEnv.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    await Promise.all([
      setDoc(
        doc(db, "payments", paymentId),
        storedPaymentDocument({
          id: paymentId,
          workerId: "worker-1"
        })
      ),
      setDoc(
        doc(db, "payments", "session-2--payment-r3"),
        storedPaymentDocument({
          id: "session-2--payment-r3",
          sessionId: "session-2",
          workerId: "worker-2",
          workerNameSnapshot: "Beata"
        })
      )
    ]);
  });
}

async function setSessionWithRulesDisabled(
  session: Record<string, unknown>
): Promise<void> {
  if (!testEnv) {
    throw new Error("Rules test environment was not initialized.");
  }

  await testEnv.withSecurityRulesDisabled(async (context) => {
    await setDoc(doc(context.firestore(), "harvestSessions", "session-1"), session);
  });
}

function queuePaymentWrite(
  batch: WriteBatch,
  db: ReturnType<typeof authenticatedDb>,
  {
    actorUid = "admin-1",
    amountGrosz = 1000,
    paymentId: targetPaymentId = paymentId,
    paymentOverrides = {}
  }: {
    actorUid?: string;
    amountGrosz?: number;
    paymentId?: string;
    paymentOverrides?: Record<string, unknown>;
  } = {}
): void {
  batch.set(
    doc(db, "payments", targetPaymentId),
    paymentDocument({
      amountGrosz,
      createdBy: actorUid,
      id: targetPaymentId,
      ...paymentOverrides
    })
  );
  batch.update(
    doc(db, "harvestSessions", "session-1"),
    paidSessionUpdate({ paymentId: targetPaymentId })
  );
  batch.set(
    doc(db, "auditEvents", `payment-created-${targetPaymentId}`),
    paymentAudit(actorUid, targetPaymentId)
  );
}

function paymentDocument(overrides: Record<string, unknown> = {}) {
  return {
    amountGrosz: 1000,
    cancellationReason: null,
    cancelledAt: null,
    cancelledBy: null,
    creationAttemptId: "attempt-1",
    createdAtServer: serverTimestamp(),
    createdBy: "admin-1",
    id: paymentId,
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

function storedPaymentDocument(overrides: Record<string, unknown> = {}) {
  return {
    ...paymentDocument(overrides),
    createdAtServer: Timestamp.now()
  };
}

function queueCancellation(
  batch: WriteBatch,
  db: ReturnType<typeof authenticatedDb>,
  actorUid: string,
  paymentOverrides: Record<string, unknown> = {}
): void {
  batch.update(doc(db, "payments", paymentId), {
    ...paymentCancellationUpdate(),
    ...paymentOverrides
  });
  batch.update(doc(db, "harvestSessions", "session-1"), {
    paidAt: null,
    paymentId: null,
    revision: 4,
    status: "CLOSED",
    updatedAtServer: serverTimestamp()
  });
  batch.set(
    doc(db, "auditEvents", `payment-cancelled-${paymentId}`),
    paymentCancellationAudit(actorUid)
  );
}

function paymentCancellationUpdate() {
  return {
    cancellationReason: "Bledna metoda",
    cancelledAt: serverTimestamp(),
    cancelledBy: "admin-1",
    status: "CANCELLED"
  };
}

function paymentCancellationAudit(actorUid: string) {
  return {
    action: "PAYMENT_CANCELLED",
    actorRoleSnapshot: actorUid === "admin-1" ? "ADMIN" : "OPERATOR",
    actorUid,
    afterSummary: {
      amountGrosz: 1000,
      paymentId,
      sessionId: "session-1",
      status: "CANCELLED",
      workerId: "worker-1"
    },
    beforeSummary: {
      amountGrosz: 1000,
      paymentId,
      sessionId: "session-1",
      status: "ACTIVE",
      workerId: "worker-1"
    },
    businessDate: "2026-07-28",
    createdAtDevice: Timestamp.now(),
    createdAtServer: serverTimestamp(),
    deviceId: "device-admin",
    entityId: paymentId,
    entityType: "PAYMENT",
    id: `payment-cancelled-${paymentId}`,
    reason: "Bledna metoda"
  };
}

function paidSessionUpdate(overrides: Record<string, unknown> = {}) {
  return {
    paidAt: serverTimestamp(),
    paymentId: "session-1--payment-r3",
    revision: 3,
    status: "PAID",
    updatedAtServer: serverTimestamp(),
    ...overrides
  };
}

function paymentAudit(
  actorUid: string,
  targetPaymentId = paymentId,
  sessionId = "session-1"
) {
  return {
    action: "HARVEST_SESSION_PAID",
    actorRoleSnapshot: actorUid.startsWith("admin-") ? "ADMIN" : "OPERATOR",
    actorUid,
    afterSummary: {
      amountDueGrosz: 1000,
      businessDate: "2026-07-20",
      paymentId: targetPaymentId,
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
    entityId: sessionId,
    entityType: "HARVEST_SESSION",
    id: `payment-created-${targetPaymentId}`,
    reason: null
  };
}

function closedSession(overrides: Record<string, unknown> = {}) {
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
    workerNameSnapshot: "Anna",
    ...overrides
  };
}

function profile(
  uid: string,
  role: "ADMIN" | "OPERATOR" | "PICKER",
  overrides: Record<string, unknown> = {}
) {
  return {
    active: true,
    displayName: uid,
    email: `${uid}@example.test`,
    offlineConsent: false,
    registrationStatus: "APPROVED",
    role,
    uid,
    workerId: null,
    ...overrides
  };
}
