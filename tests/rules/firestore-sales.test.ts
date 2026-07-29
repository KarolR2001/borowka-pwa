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

  it.each(["INCREASE_STOCK", "DECREASE_STOCK"] as const)(
    "allows an administrator to create a %s correction with matching impacts",
    async (direction) => {
      const db = authenticatedDb("admin-1");
      const batch = writeBatch(db);
      batch.set(doc(db, "sales", "correction-1"), correctionDocument(direction));
      batch.set(
        doc(db, "auditEvents", "sale-correction-created-correction-1"),
        correctionAudit(direction)
      );

      await assertSucceeds(batch.commit());
    }
  );

  it("rejects a standalone or malformed correction", async () => {
    const db = authenticatedDb("admin-1");

    await assertFails(
      setDoc(doc(db, "sales", "correction-1"), correctionDocument("INCREASE_STOCK"))
    );

    const missingReasonBatch = writeBatch(db);
    missingReasonBatch.set(doc(db, "sales", "correction-1"), {
      ...correctionDocument("INCREASE_STOCK"),
      note: null
    });
    missingReasonBatch.set(
      doc(db, "auditEvents", "sale-correction-created-correction-1"),
      {
        ...correctionAudit("INCREASE_STOCK"),
        reason: null
      }
    );
    await assertFails(missingReasonBatch.commit());

    const blankReasonBatch = writeBatch(db);
    blankReasonBatch.set(doc(db, "sales", "correction-1"), {
      ...correctionDocument("INCREASE_STOCK"),
      note: "   "
    });
    blankReasonBatch.set(doc(db, "auditEvents", "sale-correction-created-correction-1"), {
      ...correctionAudit("INCREASE_STOCK"),
      reason: "   "
    });
    await assertFails(blankReasonBatch.commit());

    const invalidDirectionBatch = writeBatch(db);
    invalidDirectionBatch.set(doc(db, "sales", "correction-1"), {
      ...correctionDocument("INCREASE_STOCK"),
      correctionDirection: null
    });
    invalidDirectionBatch.set(
      doc(db, "auditEvents", "sale-correction-created-correction-1"),
      {
        ...correctionAudit("INCREASE_STOCK"),
        afterSummary: {
          ...correctionAudit("INCREASE_STOCK").afterSummary,
          correctionDirection: null
        }
      }
    );
    await assertFails(invalidDirectionBatch.commit());

    const wrongImpactBatch = writeBatch(db);
    wrongImpactBatch.set(
      doc(db, "sales", "correction-1"),
      correctionDocument("INCREASE_STOCK")
    );
    wrongImpactBatch.set(doc(db, "auditEvents", "sale-correction-created-correction-1"), {
      ...correctionAudit("INCREASE_STOCK"),
      afterSummary: {
        ...correctionAudit("INCREASE_STOCK").afterSummary,
        revenueImpactGrosz: 3750
      }
    });
    await assertFails(wrongImpactBatch.commit());
  });

  it.each([
    ["SALE", null],
    ["CORRECTION", "INCREASE_STOCK"],
    ["CORRECTION", "DECREASE_STOCK"]
  ] as const)(
    "allows an administrator to cancel %s %s with a matching reversal audit",
    async (entryType, correctionDirection) => {
      const source =
        entryType === "SALE" ? saleDocument() : correctionDocument(correctionDirection);
      await seedSale(source);
      const db = authenticatedDb("admin-1");
      const batch = writeBatch(db);
      batch.update(doc(db, "sales", source.id), saleCancellationUpdate());
      batch.set(
        doc(db, "auditEvents", `sale-cancelled-${source.id}`),
        saleCancellationAudit(source)
      );

      await assertSucceeds(batch.commit());
    }
  );

  it("allows cancellation after the source season has been closed", async () => {
    const source = saleDocument();
    await seedSale(source);
    await requiredEnvironment().withSecurityRulesDisabled(async (context) => {
      await setDoc(
        doc(context.firestore(), "seasons", "season-1"),
        { status: "CLOSED" },
        { merge: true }
      );
    });
    const db = authenticatedDb("admin-1");
    const batch = writeBatch(db);
    batch.update(doc(db, "sales", source.id), saleCancellationUpdate());
    batch.set(
      doc(db, "auditEvents", `sale-cancelled-${source.id}`),
      saleCancellationAudit(source)
    );

    await assertSucceeds(batch.commit());
  });

  it("rejects cancellation without audit, with a mismatched audit or changed history", async () => {
    const source = saleDocument();
    await seedSale(source);
    const db = authenticatedDb("admin-1");

    const standalone = writeBatch(db);
    standalone.update(doc(db, "sales", source.id), saleCancellationUpdate());
    await assertFails(standalone.commit());

    const wrongAudit = writeBatch(db);
    wrongAudit.update(doc(db, "sales", source.id), saleCancellationUpdate());
    wrongAudit.set(doc(db, "auditEvents", "sale-cancelled-sale-1"), {
      ...saleCancellationAudit(source),
      afterSummary: {
        ...saleCancellationAudit(source).afterSummary,
        stockImpactG: -3000
      }
    });
    await assertFails(wrongAudit.commit());

    const changedHistory = writeBatch(db);
    changedHistory.update(doc(db, "sales", source.id), {
      ...saleCancellationUpdate(),
      weightG: 4000
    });
    changedHistory.set(
      doc(db, "auditEvents", "sale-cancelled-sale-1"),
      saleCancellationAudit({ ...source, weightG: 4000 })
    );
    await assertFails(changedHistory.commit());
  });

  it("rejects sale deletion", async () => {
    const source = saleDocument();
    await seedSale(source);

    await assertFails(deleteDoc(doc(authenticatedDb("admin-1"), "sales", source.id)));
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

function correctionDocument(correctionDirection: "INCREASE_STOCK" | "DECREASE_STOCK") {
  return {
    ...saleDocument(),
    correctionDirection,
    creationAttemptId: "sale-correction-attempt-correction-1",
    entryType: "CORRECTION",
    id: "correction-1",
    note: "Powod korekty sprzedazy"
  };
}

function correctionAudit(correctionDirection: "INCREASE_STOCK" | "DECREASE_STOCK") {
  const increasesStock = correctionDirection === "INCREASE_STOCK";

  return {
    ...saleAudit(),
    action: "SALE_CORRECTION_CREATED",
    afterSummary: {
      calculationVersion: "1",
      correctionDirection,
      entryType: "CORRECTION",
      projectedStockWeightG: increasesStock ? 13_000 : 7000,
      revenueImpactGrosz: increasesStock ? -3750 : 3750,
      saleId: "correction-1",
      seasonId: "season-1",
      status: "ACTIVE",
      totalGrosz: 3750,
      weightG: 3000
    },
    entityId: "correction-1",
    id: "sale-correction-created-correction-1",
    reason: "Powod korekty sprzedazy"
  };
}

type SaleFixture =
  ReturnType<typeof saleDocument> | ReturnType<typeof correctionDocument>;

async function seedSale(source: SaleFixture) {
  await requiredEnvironment().withSecurityRulesDisabled(async (context) => {
    await setDoc(doc(context.firestore(), "sales", source.id), source);
  });
}

function saleCancellationUpdate() {
  return {
    cancellationReason: "Bledna masa",
    cancelledAt: serverTimestamp(),
    cancelledBy: "admin-1",
    status: "CANCELLED"
  };
}

function saleCancellationAudit(source: SaleFixture) {
  const isOrdinarySale = source.entryType === "SALE";
  const increasesStock = source.correctionDirection === "INCREASE_STOCK";
  const activeStockImpactG = isOrdinarySale
    ? -source.weightG
    : increasesStock
      ? source.weightG
      : -source.weightG;
  const activeRevenueImpactGrosz =
    !isOrdinarySale && increasesStock ? -source.totalGrosz : source.totalGrosz;

  return {
    action: "SALE_CANCELLED",
    actorRoleSnapshot: "ADMIN",
    actorUid: "admin-1",
    afterSummary: {
      correctionDirection: source.correctionDirection,
      entryType: source.entryType,
      revenueImpactGrosz: -activeRevenueImpactGrosz,
      saleId: source.id,
      seasonId: source.seasonId,
      status: "CANCELLED",
      stockImpactG: -activeStockImpactG,
      totalGrosz: source.totalGrosz,
      weightG: source.weightG
    },
    beforeSummary: {
      correctionDirection: source.correctionDirection,
      entryType: source.entryType,
      revenueImpactGrosz: activeRevenueImpactGrosz,
      saleId: source.id,
      seasonId: source.seasonId,
      status: "ACTIVE",
      stockImpactG: activeStockImpactG,
      totalGrosz: source.totalGrosz,
      weightG: source.weightG
    },
    businessDate: source.businessDate,
    createdAtDevice: Timestamp.now(),
    createdAtServer: serverTimestamp(),
    deviceId: "device-admin",
    entityId: source.id,
    entityType: "SALE",
    id: `sale-cancelled-${source.id}`,
    reason: "Bledna masa"
  };
}
