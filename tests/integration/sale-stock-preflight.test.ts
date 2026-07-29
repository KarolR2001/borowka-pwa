import {
  initializeTestEnvironment,
  type RulesTestEnvironment
} from "@firebase/rules-unit-testing";
import { collection, doc, getDocs, setDoc } from "firebase/firestore";
import { readFileSync } from "node:fs";

import type { UserProfile } from "../../src/domain/identity";
import type { PreparedOrdinarySale } from "../../src/sales/ordinarySalePreparation";
import {
  cancelSale,
  listSaleCancellationCandidates
} from "../../src/sales/saleCancellation";
import { listAdminSales } from "../../src/sales/saleDirectory";
import type { PreparedSaleCorrection } from "../../src/sales/saleCorrectionPreparation";
import {
  checkSaleCorrection,
  createSaleCorrection
} from "../../src/sales/saleCorrectionWrite";
import {
  checkOrdinarySaleStock,
  createOrdinarySale
} from "../../src/sales/saleStockPreflight";

const projectId = "demo-borowka-pwa-sale-preflight";
const firebaseServicesMock = vi.hoisted(() => ({
  getFirebaseServices: vi.fn()
}));

vi.mock("../../src/config/firebaseServices", () => ({
  getFirebaseServices: firebaseServicesMock.getFirebaseServices
}));

const adminProfile: UserProfile = {
  active: true,
  displayName: "Admin Sale",
  email: "admin-sale@example.test",
  offlineConsent: false,
  registrationStatus: "APPROVED",
  role: "ADMIN",
  uid: "admin-sale",
  workerId: null
};

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
  firebaseServicesMock.getFirebaseServices.mockReset();

  if (!testEnvironment) {
    throw new Error("Rules test environment was not initialized.");
  }

  await testEnvironment.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    await Promise.all([
      setDoc(doc(db, "users", adminProfile.uid), adminProfile),
      setDoc(doc(db, "seasons", "season-1"), seasonDocument()),
      setDoc(doc(db, "harvestSessions", "session-1"), closedSession())
    ]);
  });

  firebaseServicesMock.getFirebaseServices.mockReturnValue({
    firestore: testEnvironment
      .authenticatedContext(adminProfile.uid, { email: adminProfile.email })
      .firestore()
  });
});

afterAll(async () => {
  await testEnvironment?.cleanup();
});

describe("ordinary sale stock preflight Firestore flow", () => {
  it("checks fresh sources, writes sale with audit and recalculates post-write stock", async () => {
    const checkResult = await checkOrdinarySaleStock(
      {},
      {
        actorProfile: adminProfile,
        isOnline: true,
        preparedSale: preparedSale(),
        saleId: "sale-1"
      }
    );

    expect(checkResult).toMatchObject({
      check: {
        expectedAvailableWeightG: 10_000,
        stockChanged: false
      },
      status: "CONFIRMATION_REQUIRED"
    });

    if (checkResult.status !== "CONFIRMATION_REQUIRED") {
      throw new Error("Expected a confirmable sale.");
    }

    const writeResult = await createOrdinarySale(
      {},
      {
        actorProfile: adminProfile,
        check: checkResult.check,
        deviceId: "device-admin",
        isOnline: true
      }
    );

    expect(writeResult).toMatchObject({
      concurrentStockChangeDetected: false,
      postWriteAvailableWeightG: 7000,
      sale: {
        id: "sale-1",
        totalGrosz: 3750,
        weightG: 3000
      },
      status: "CONFIRMED",
      stockIsConsistent: true
    });

    const db = testEnvironment
      ?.authenticatedContext(adminProfile.uid, { email: adminProfile.email })
      .firestore();

    if (!db) {
      throw new Error("Expected an authenticated database.");
    }

    const [sales, audits] = await Promise.all([
      getDocs(collection(db, "sales")),
      getDocs(collection(db, "auditEvents"))
    ]);
    expect(sales.docs.map((snapshot) => snapshot.id)).toEqual(["sale-1"]);
    expect(audits.docs.map((snapshot) => snapshot.id)).toEqual(["sale-created-sale-1"]);
  });

  it("does not write when the confirmed stock became stale", async () => {
    const staleCheck = await checkOrdinarySaleStock(
      {},
      {
        actorProfile: adminProfile,
        isOnline: true,
        preparedSale: preparedSale(),
        saleId: "sale-stale"
      }
    );
    const firstCheck = await checkOrdinarySaleStock(
      {},
      {
        actorProfile: adminProfile,
        isOnline: true,
        preparedSale: preparedSale(),
        saleId: "sale-first"
      }
    );

    if (
      staleCheck.status !== "CONFIRMATION_REQUIRED" ||
      firstCheck.status !== "CONFIRMATION_REQUIRED"
    ) {
      throw new Error("Expected confirmable sales.");
    }

    await createOrdinarySale(
      {},
      {
        actorProfile: adminProfile,
        check: firstCheck.check,
        deviceId: "device-first",
        isOnline: true
      }
    );

    const staleResult = await createOrdinarySale(
      {},
      {
        actorProfile: adminProfile,
        check: staleCheck.check,
        deviceId: "device-stale",
        isOnline: true
      }
    );

    expect(staleResult).toMatchObject({
      check: {
        expectedAvailableWeightG: 7000,
        sale: {
          projectedAvailableWeightG: 4000
        },
        saleId: "sale-stale",
        stockChanged: true
      },
      status: "RECONFIRMATION_REQUIRED"
    });

    if (!testEnvironment) {
      throw new Error("Expected test environment.");
    }

    await testEnvironment.withSecurityRulesDisabled(async (context) => {
      const sales = await getDocs(collection(context.firestore(), "sales"));
      expect(sales.docs.map((snapshot) => snapshot.id)).toEqual(["sale-first"]);
    });
  });

  it("rejects a business date outside the selected season before writing", async () => {
    await expect(
      checkOrdinarySaleStock(
        {},
        {
          actorProfile: adminProfile,
          isOnline: true,
          preparedSale: {
            ...preparedSale(),
            businessDate: "2026-10-01"
          },
          saleId: "sale-outside-season"
        }
      )
    ).rejects.toThrow("poza zakresem wybranego sezonu");

    if (!testEnvironment) {
      throw new Error("Expected test environment.");
    }

    await testEnvironment.withSecurityRulesDisabled(async (context) => {
      const sales = await getDocs(collection(context.firestore(), "sales"));
      expect(sales.empty).toBe(true);
    });
  });
});

describe("sale correction Firestore flow", () => {
  it("checks fresh stock and writes a separate correction with audit", async () => {
    const checkResult = await checkSaleCorrection(
      {},
      {
        actorProfile: adminProfile,
        correctionId: "correction-1",
        isOnline: true,
        preparedCorrection: preparedCorrection()
      }
    );

    expect(checkResult).toMatchObject({
      check: {
        correction: {
          projectedAvailableWeightG: 13_000,
          revenueImpactGrosz: -3750,
          stockImpactG: 3000
        },
        expectedAvailableWeightG: 10_000,
        stockChanged: false
      },
      status: "CONFIRMATION_REQUIRED"
    });

    if (checkResult.status !== "CONFIRMATION_REQUIRED") {
      throw new Error("Expected a confirmable correction.");
    }

    const writeResult = await createSaleCorrection(
      {},
      {
        actorProfile: adminProfile,
        check: checkResult.check,
        deviceId: "device-admin",
        isOnline: true
      }
    );

    expect(writeResult).toMatchObject({
      concurrentStockChangeDetected: false,
      correction: {
        correctionDirection: "INCREASE_STOCK",
        entryType: "CORRECTION",
        id: "correction-1",
        note: "Powod korekty sprzedazy",
        totalGrosz: 3750,
        weightG: 3000
      },
      postWriteAvailableWeightG: 13_000,
      status: "CONFIRMED"
    });

    const db = testEnvironment
      ?.authenticatedContext(adminProfile.uid, { email: adminProfile.email })
      .firestore();

    if (!db) {
      throw new Error("Expected an authenticated database.");
    }

    const [sales, audits] = await Promise.all([
      getDocs(collection(db, "sales")),
      getDocs(collection(db, "auditEvents"))
    ]);
    expect(sales.docs.map((snapshot) => snapshot.id)).toEqual(["correction-1"]);
    expect(audits.docs.map((snapshot) => snapshot.id)).toEqual([
      "sale-correction-created-correction-1"
    ]);
  });

  it("requires another confirmation when stock changes before correction write", async () => {
    const staleCorrection = await checkSaleCorrection(
      {},
      {
        actorProfile: adminProfile,
        correctionId: "correction-stale",
        isOnline: true,
        preparedCorrection: preparedCorrection()
      }
    );
    const saleCheck = await checkOrdinarySaleStock(
      {},
      {
        actorProfile: adminProfile,
        isOnline: true,
        preparedSale: preparedSale(),
        saleId: "sale-first"
      }
    );

    if (
      staleCorrection.status !== "CONFIRMATION_REQUIRED" ||
      saleCheck.status !== "CONFIRMATION_REQUIRED"
    ) {
      throw new Error("Expected confirmable operations.");
    }

    await createOrdinarySale(
      {},
      {
        actorProfile: adminProfile,
        check: saleCheck.check,
        deviceId: "device-first",
        isOnline: true
      }
    );

    const staleResult = await createSaleCorrection(
      {},
      {
        actorProfile: adminProfile,
        check: staleCorrection.check,
        deviceId: "device-stale",
        isOnline: true
      }
    );

    expect(staleResult).toMatchObject({
      check: {
        correction: {
          availableWeightG: 7000,
          projectedAvailableWeightG: 10_000
        },
        correctionId: "correction-stale",
        expectedAvailableWeightG: 7000,
        stockChanged: true
      },
      status: "RECONFIRMATION_REQUIRED"
    });

    if (!testEnvironment) {
      throw new Error("Expected test environment.");
    }

    await testEnvironment.withSecurityRulesDisabled(async (context) => {
      const sales = await getDocs(collection(context.firestore(), "sales"));
      expect(sales.docs.map((snapshot) => snapshot.id)).toEqual(["sale-first"]);
    });
  });
});

describe("sale cancellation Firestore flow", () => {
  it("cancels an active sale with audit and restores stock after season close", async () => {
    const checkResult = await checkOrdinarySaleStock(
      {},
      {
        actorProfile: adminProfile,
        isOnline: true,
        preparedSale: preparedSale(),
        saleId: "sale-to-cancel"
      }
    );

    if (checkResult.status !== "CONFIRMATION_REQUIRED") {
      throw new Error("Expected a confirmable sale.");
    }

    await createOrdinarySale(
      {},
      {
        actorProfile: adminProfile,
        check: checkResult.check,
        deviceId: "device-admin",
        isOnline: true
      }
    );

    expect(
      await listSaleCancellationCandidates(
        {},
        { actorProfile: adminProfile, isOnline: true }
      )
    ).toMatchObject([
      {
        sale: { id: "sale-to-cancel", status: "ACTIVE" },
        seasonName: "Sezon 2026"
      }
    ]);

    if (!testEnvironment) {
      throw new Error("Expected test environment.");
    }

    await testEnvironment.withSecurityRulesDisabled(async (context) => {
      await setDoc(
        doc(context.firestore(), "seasons", "season-1"),
        {
          closedAt: "closed-time",
          closedBy: adminProfile.uid,
          status: "CLOSED"
        },
        { merge: true }
      );
    });

    const result = await cancelSale(
      {},
      {
        actorProfile: adminProfile,
        confirmed: true,
        deviceId: "device-admin",
        isOnline: true,
        reason: "Bledna masa",
        saleId: "sale-to-cancel"
      }
    );

    expect(result).toMatchObject({
      auditEvent: {
        action: "SALE_CANCELLED",
        id: "sale-cancelled-sale-to-cancel",
        reason: "Bledna masa"
      },
      cancelledSale: {
        cancellationReason: "Bledna masa",
        cancelledBy: adminProfile.uid,
        id: "sale-to-cancel",
        status: "CANCELLED"
      },
      impact: {
        revenueImpactGrosz: -3750,
        stockImpactG: 3000
      },
      postWriteAvailableWeightG: 10_000,
      status: "CANCELLED"
    });
    expect(
      await listSaleCancellationCandidates(
        {},
        { actorProfile: adminProfile, isOnline: true }
      )
    ).toEqual([]);
    expect(await listAdminSales({}, adminProfile)).toMatchObject({
      invalidSaleCount: 0,
      invalidSeasonCount: 0,
      invalidUserCount: 0,
      sales: [
        {
          authorName: "Admin Sale",
          cancellationReason: "Bledna masa",
          id: "sale-to-cancel",
          seasonName: "Sezon 2026",
          status: "CANCELLED"
        }
      ]
    });
  });
});

function preparedSale(): PreparedOrdinarySale {
  return {
    availableWeightG: 10_000,
    businessDate: "2026-07-29",
    correctionDirection: null,
    entryType: "SALE",
    note: "Odbiorca A",
    pendingDocumentCount: 0,
    priceGroszPerKg: 1250,
    projectedAvailableWeightG: 7000,
    refreshedAtIso: "2026-07-29T06:00:00.000Z",
    revenueCalculationVersion: "1",
    revenuePreviewGrosz: 3750,
    revenueRemainderMilliGrosz: 0,
    revenueRoundingRule: "HALF_UP_TO_GROSZ",
    seasonId: "season-1",
    seasonName: "Sezon 2026",
    status: "ACTIVE",
    stockDataSource: "SERVER",
    stockWasFresh: true,
    weightG: 3000
  };
}

function preparedCorrection(): PreparedSaleCorrection {
  return {
    availableWeightG: 10_000,
    businessDate: "2026-07-29",
    calculationVersion: "1",
    correctionDirection: "INCREASE_STOCK",
    entryType: "CORRECTION",
    note: "Powod korekty sprzedazy",
    pendingDocumentCount: 0,
    priceGroszPerKg: 1250,
    projectedAvailableWeightG: 13_000,
    refreshedAtIso: "2026-07-29T06:00:00.000Z",
    revenueImpactGrosz: -3750,
    revenueMagnitudeGrosz: 3750,
    revenueRemainderMilliGrosz: 0,
    revenueRoundingRule: "HALF_UP_TO_GROSZ",
    seasonId: "season-1",
    seasonName: "Sezon 2026",
    status: "ACTIVE",
    stockDataSource: "SERVER",
    stockImpactG: 3000,
    stockWasFresh: true,
    weightG: 3000
  };
}

function seasonDocument() {
  return {
    closedAt: null,
    closedBy: null,
    createdAt: "created-time",
    createdBy: adminProfile.uid,
    endDate: "2026-09-30",
    id: "season-1",
    isDefault: true,
    name: "Sezon 2026",
    reopenedAt: null,
    startDate: "2026-07-01",
    status: "OPEN"
  };
}

function closedSession() {
  return {
    allowBatchQuantitySnapshot: true,
    amountDueGrosz: 10_000,
    businessDate: "2026-07-28",
    calculationBasisSnapshot: "WEIGHT",
    calculationVersion: "1",
    cancellationReason: null,
    cancelledAt: null,
    cancelledBy: null,
    closedAtDevice: "closed-device-time",
    closedAtServer: "closed-server-time",
    closedBy: adminProfile.uid,
    createdAtDevice: "created-device-time",
    createdAtServer: "created-server-time",
    createdBy: adminProfile.uid,
    createdDeviceId: "device-admin",
    id: "session-1",
    legacyImport: false,
    legacySourceRows: [],
    note: null,
    paidAt: null,
    paymentId: null,
    planIdSnapshot: "plan-weight",
    planNameSnapshot: "Za kilogram",
    quantityPrecisionSnapshot: 3,
    rateGroszSnapshot: 1000,
    rateVersionIdSnapshot: "rate-1",
    revision: 2,
    seasonId: "season-1",
    status: "CLOSED",
    totalEntryCount: 1,
    totalQuantityMilli: 1000,
    totalWeightG: 10_000,
    unitLabelPluralSnapshot: "kilogramy",
    unitLabelSnapshot: "kilogram",
    updatedAtServer: "closed-server-time",
    weightRequiredSnapshot: true,
    workerId: "worker-1",
    workerNameSnapshot: "Anna"
  };
}
