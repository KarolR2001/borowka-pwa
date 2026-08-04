import {
  initializeTestEnvironment,
  type RulesTestContext,
  type RulesTestEnvironment
} from "@firebase/rules-unit-testing";
import { doc, setDoc, writeBatch } from "firebase/firestore";
import { readFileSync } from "node:fs";

import {
  isAdminDashboardSnapshot,
  loadAdminDashboard,
  prepareAdminDashboardSnapshot,
  type AdminDashboardResult
} from "../../src/dashboard/adminDashboard";
import {
  estimateDashboardReads,
  type DashboardScale
} from "../../src/dashboard/dashboardReadStrategy";
import {
  loadDashboardSnapshot,
  saveDashboardSnapshot,
  type DashboardSnapshotStorage
} from "../../src/dashboard/dashboardOfflineState";
import type { UserProfile } from "../../src/domain/identity";

const projectId = "demo-borowka-pwa-dashboard-performance";
const selectedSeasonId = "season-2026";
const selectedSeasonSessionCount = 1200;
const selectedSeasonSaleCount = 600;
const selectedSeasonPaymentCount = 600;
const harvestEntryCount = 3000;
const workerCount = 100;
const otherSeasonCount = 4;
const otherSeasonDocumentsPerCollection = 50;
const regressionCeilingMs = 10_000;

const firebaseServicesMock = vi.hoisted(() => ({
  getFirebaseServices: vi.fn()
}));

vi.mock("../../src/config/firebaseServices", () => ({
  getFirebaseServices: firebaseServicesMock.getFirebaseServices
}));

const adminProfile: UserProfile = {
  active: true,
  displayName: "Admin Performance",
  email: "admin-performance@example.test",
  offlineConsent: false,
  registrationStatus: "APPROVED",
  role: "ADMIN",
  uid: "admin-performance",
  workerId: null
};

let testEnvironment: RulesTestEnvironment | undefined;

beforeAll(async () => {
  testEnvironment = await initializeTestEnvironment({
    firestore: {
      host: "127.0.0.1",
      port: 8080,
      rules: readFileSync("firestore.rules", "utf8")
    },
    projectId
  });

  await testEnvironment.withSecurityRulesDisabled(async (context) => {
    await seedSyntheticDataset(context.firestore());
  });
}, 120_000);

beforeEach(() => {
  if (!testEnvironment) {
    throw new Error("Rules test environment was not initialized.");
  }

  firebaseServicesMock.getFirebaseServices.mockReset();
  firebaseServicesMock.getFirebaseServices.mockReturnValue({
    firestore: testEnvironment
      .authenticatedContext(adminProfile.uid, { email: adminProfile.email })
      .firestore()
  });
});

afterAll(async () => {
  await testEnvironment?.cleanup();
});

describe("admin dashboard synthetic performance", () => {
  it("measures reads, filters, cache and updates at a realistic scale", async () => {
    const firstLoad = await measure(() => loadDashboard());

    expect(firstLoad.durationMs).toBeLessThan(regressionCeilingMs);
    expect(firstLoad.value.seasons).toHaveLength(otherSeasonCount + 1);
    expect(firstLoad.value.selectedSeason).toMatchObject({
      id: selectedSeasonId,
      metrics: {
        accruedGrosz: 1_200_000,
        activeWorkerCount: workerCount,
        availableWeightG: 900_000,
        confirmedHarvestWeightG: 1_200_000,
        dueGrosz: 900_000,
        paidGrosz: 300_000,
        resultAfterHarvestCostGrosz: 0,
        revenueGrosz: 1_200_000,
        soldWeightG: 300_000
      }
    });

    const syntheticScale: DashboardScale = {
      harvestEntryCount,
      harvestSessionCount:
        selectedSeasonSessionCount + otherSeasonCount * otherSeasonDocumentsPerCollection,
      operationalStockMovementCount: 0,
      paymentCount:
        selectedSeasonPaymentCount + otherSeasonCount * otherSeasonDocumentsPerCollection,
      saleCount:
        selectedSeasonSaleCount + otherSeasonCount * otherSeasonDocumentsPerCollection,
      seasonCount: otherSeasonCount + 1,
      workerCount
    };
    const estimatedReads = estimateDashboardReads(syntheticScale);

    expect(estimatedReads.admin).toEqual({
      aggregateBilledReadUpperBound: 14,
      previousDocumentReads: 3105
    });

    const filterChange = await measure(() =>
      loadDashboard({
        customFromDate: "2026-08-01",
        customToDate: "2026-08-01",
        preset: "CUSTOM"
      })
    );

    expect(filterChange.durationMs).toBeLessThan(regressionCeilingMs);
    expect(filterChange.value.selectedSeason?.metrics).toMatchObject({
      accruedGrosz: 0,
      activeWorkerCount: workerCount,
      availableWeightG: 0,
      confirmedHarvestWeightG: 0,
      paidGrosz: 0,
      revenueGrosz: 0,
      soldWeightG: 0
    });

    const storage = new MeasuredStorage();
    saveDashboardSnapshot({
      kind: "ADMIN",
      ownerUid: adminProfile.uid,
      payload: prepareAdminDashboardSnapshot(firstLoad.value),
      storage
    });
    const cacheReopen = measureSync(() =>
      loadDashboardSnapshot({
        isPayload: isAdminDashboardSnapshot,
        kind: "ADMIN",
        ownerUid: adminProfile.uid,
        storage
      })
    );

    expect(cacheReopen.durationMs).toBeLessThan(250);
    expect(cacheReopen.value?.payload.selectedSeason?.metrics.availableWeightG).toBe(
      900_000
    );
    expect(storage.getCount).toBe(1);

    await addClosedSessionAndSale();
    const afterUpdate = await measure(() => loadDashboard());

    expect(afterUpdate.durationMs).toBeLessThan(regressionCeilingMs);
    expect(afterUpdate.value.selectedSeason?.metrics).toMatchObject({
      accruedGrosz: 1_202_500,
      availableWeightG: 901_500,
      confirmedHarvestWeightG: 1_202_000,
      dueGrosz: 902_500,
      revenueGrosz: 1_202_000,
      soldWeightG: 300_500
    });

    console.info(
      "[dashboard-performance]",
      JSON.stringify({
        cacheReopenMs: rounded(cacheReopen.durationMs),
        filterChangeMs: rounded(filterChange.durationMs),
        firstLoadMs: rounded(firstLoad.durationMs),
        syntheticAdminReadUpperBound: estimatedReads.admin.aggregateBilledReadUpperBound,
        syntheticDocuments: syntheticDocumentCount(),
        updateRefreshMs: rounded(afterUpdate.durationMs)
      })
    );
  }, 30_000);
});

async function loadDashboard(periodSelection?: {
  customFromDate: string;
  customToDate: string;
  preset: "CUSTOM";
}): Promise<AdminDashboardResult> {
  return loadAdminDashboard(
    {},
    {
      actorProfile: adminProfile,
      businessDate: "2026-07-20",
      isOnline: true,
      periodSelection,
      selectedSeasonId,
      syncDocuments: []
    }
  );
}

async function seedSyntheticDataset(
  firestore: ReturnType<RulesTestContext["firestore"]>
): Promise<void> {
  const documents: SeedDocument[] = [
    {
      collectionName: "users",
      data: adminProfile,
      id: adminProfile.uid
    }
  ];

  for (let seasonIndex = 0; seasonIndex <= otherSeasonCount; seasonIndex += 1) {
    const year = 2026 - seasonIndex;
    const seasonId = seasonIndex === 0 ? selectedSeasonId : `season-${String(year)}`;
    documents.push({
      collectionName: "seasons",
      data: seasonDocument(seasonId, year, seasonIndex === 0),
      id: seasonId
    });
  }

  for (let index = 0; index < workerCount; index += 1) {
    documents.push({
      collectionName: "workers",
      data: { active: true, id: `worker-${String(index)}` },
      id: `worker-${String(index)}`
    });
  }

  addSyntheticDocuments(documents, {
    count: selectedSeasonSessionCount,
    createData: (id) => sessionDocument(id, selectedSeasonId, "2026-07-15"),
    name: "harvestSessions",
    prefix: "session-selected"
  });
  addSyntheticDocuments(documents, {
    count: selectedSeasonSaleCount,
    createData: (id) => saleDocument(id, selectedSeasonId, "2026-07-15"),
    name: "sales",
    prefix: "sale-selected"
  });
  addSyntheticDocuments(documents, {
    count: selectedSeasonPaymentCount,
    createData: (id) => paymentDocument(id, selectedSeasonId, "2026-07-15"),
    name: "payments",
    prefix: "payment-selected"
  });
  addSyntheticDocuments(documents, {
    count: harvestEntryCount,
    createData: (id) => ({
      businessDate: "2026-07-15",
      id,
      seasonId: selectedSeasonId,
      sessionId: "session-selected-0",
      status: "ACTIVE"
    }),
    name: "harvestEntries",
    prefix: "entry-selected"
  });

  for (let seasonIndex = 1; seasonIndex <= otherSeasonCount; seasonIndex += 1) {
    const year = 2026 - seasonIndex;
    const seasonId = `season-${String(year)}`;
    const businessDate = `${String(year)}-07-15`;
    addSyntheticDocuments(documents, {
      count: otherSeasonDocumentsPerCollection,
      createData: (id) => sessionDocument(id, seasonId, businessDate),
      name: "harvestSessions",
      prefix: `session-${seasonId}`
    });
    addSyntheticDocuments(documents, {
      count: otherSeasonDocumentsPerCollection,
      createData: (id) => saleDocument(id, seasonId, businessDate),
      name: "sales",
      prefix: `sale-${seasonId}`
    });
    addSyntheticDocuments(documents, {
      count: otherSeasonDocumentsPerCollection,
      createData: (id) => paymentDocument(id, seasonId, businessDate),
      name: "payments",
      prefix: `payment-${seasonId}`
    });
  }

  for (let offset = 0; offset < documents.length; offset += 450) {
    const batch = writeBatch(firestore);
    for (const seed of documents.slice(offset, offset + 450)) {
      batch.set(doc(firestore, seed.collectionName, seed.id), seed.data);
    }
    await batch.commit();
  }
}

async function addClosedSessionAndSale(): Promise<void> {
  const environment = requiredEnvironment();
  await environment.withSecurityRulesDisabled(async (context) => {
    const firestore = context.firestore();
    await Promise.all([
      setDoc(
        doc(firestore, "harvestSessions", "session-after-first-load"),
        sessionDocument(
          "session-after-first-load",
          selectedSeasonId,
          "2026-07-15",
          2000,
          2500
        )
      ),
      setDoc(
        doc(firestore, "sales", "sale-after-first-load"),
        saleDocument("sale-after-first-load", selectedSeasonId, "2026-07-15", 500, 2000)
      )
    ]);
  });
}

function addSyntheticDocuments(
  target: SeedDocument[],
  input: {
    count: number;
    createData: (id: string) => Record<string, unknown>;
    name: string;
    prefix: string;
  }
): void {
  for (let index = 0; index < input.count; index += 1) {
    const id = `${input.prefix}-${String(index)}`;
    target.push({ collectionName: input.name, data: input.createData(id), id });
  }
}

function seasonDocument(id: string, year: number, isDefault: boolean) {
  return {
    closedAt: isDefault ? null : `${String(year)}-10-01T00:00:00.000Z`,
    closedBy: isDefault ? null : adminProfile.uid,
    createdAt: `${String(year)}-01-01T00:00:00.000Z`,
    createdBy: adminProfile.uid,
    endDate: `${String(year)}-09-30`,
    id,
    isDefault,
    name: `Sezon ${String(year)}`,
    reopenedAt: null,
    startDate: `${String(year)}-07-01`,
    status: isDefault ? "OPEN" : "CLOSED"
  };
}

function sessionDocument(
  id: string,
  seasonId: string,
  businessDate: string,
  totalWeightG = 1000,
  amountDueGrosz = 1000
) {
  return {
    amountDueGrosz,
    businessDate,
    id,
    seasonId,
    status: "CLOSED",
    totalWeightG
  };
}

function saleDocument(
  id: string,
  seasonId: string,
  businessDate: string,
  weightG = 500,
  totalGrosz = 2000
) {
  return {
    businessDate,
    correctionDirection: null,
    entryType: "SALE",
    id,
    seasonId,
    status: "ACTIVE",
    totalGrosz,
    weightG
  };
}

function paymentDocument(id: string, seasonId: string, paidBusinessDate: string) {
  return {
    amountGrosz: 500,
    id,
    paidBusinessDate,
    seasonId,
    status: "ACTIVE"
  };
}

function syntheticDocumentCount(): number {
  return (
    1 +
    otherSeasonCount +
    1 +
    workerCount +
    selectedSeasonSessionCount +
    selectedSeasonSaleCount +
    selectedSeasonPaymentCount +
    harvestEntryCount +
    otherSeasonCount * otherSeasonDocumentsPerCollection * 3
  );
}

async function measure<T>(operation: () => Promise<T>) {
  const startedAt = performance.now();
  const value = await operation();
  return { durationMs: performance.now() - startedAt, value };
}

function measureSync<T>(operation: () => T) {
  const startedAt = performance.now();
  const value = operation();
  return { durationMs: performance.now() - startedAt, value };
}

function rounded(value: number): number {
  return Math.round(value * 100) / 100;
}

function requiredEnvironment(): RulesTestEnvironment {
  if (!testEnvironment) {
    throw new Error("Rules test environment was not initialized.");
  }

  return testEnvironment;
}

type SeedDocument = {
  collectionName: string;
  data: Record<string, unknown>;
  id: string;
};

class MeasuredStorage implements DashboardSnapshotStorage {
  readonly values = new Map<string, string>();
  getCount = 0;

  getItem(key: string): string | null {
    this.getCount += 1;
    return this.values.get(key) ?? null;
  }

  removeItem(key: string): void {
    this.values.delete(key);
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }
}
