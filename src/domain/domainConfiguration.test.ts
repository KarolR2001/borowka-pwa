import {
  APP_SETTINGS_COLLECTION,
  CALCULATION_RULE_VERSION,
  DOMAIN_SCHEMA_VERSION,
  DOMAIN_SETTINGS_DOCUMENT_ID,
  QUANTITY_UBIANKA_PLAN_ID,
  SEASONS_COLLECTION,
  SETTLEMENT_PLANS_COLLECTION,
  TEST_SEASON_ID,
  WEIGHT_KG_PLAN_ID,
  WORKERS_COLLECTION,
  WORKER_RATE_VERSIONS_COLLECTION,
  createInitialDomainSeed,
  createInitialDomainSeedWrites,
  normalizeWorkerName
} from "./domainConfiguration";

const createdAt = "2026-07-16T00:00:00.000Z";

describe("domain configuration seed", () => {
  it("creates versioned settings and a default open test season", () => {
    const seed = createInitialDomainSeed({ createdAt, createdBy: "admin-1" });

    expect(seed.settings).toMatchObject({
      id: DOMAIN_SETTINGS_DOCUMENT_ID,
      schemaVersion: DOMAIN_SCHEMA_VERSION,
      calculationRuleVersion: CALCULATION_RULE_VERSION,
      defaultSeasonId: TEST_SEASON_ID,
      pickerOwnReportExportEnabled: false,
      initializedBy: "admin-1"
    });
    expect(seed.seasons).toEqual([
      expect.objectContaining({
        id: TEST_SEASON_ID,
        status: "OPEN",
        isDefault: true,
        startDate: "2026-07-01",
        endDate: "2026-09-30"
      })
    ]);
  });

  it("creates the two required system settlement plans", () => {
    const seed = createInitialDomainSeed({ createdAt });

    expect(seed.settlementPlans).toEqual([
      expect.objectContaining({
        id: WEIGHT_KG_PLAN_ID,
        code: "WEIGHT_KG",
        calculationBasis: "WEIGHT",
        unitSymbol: "kg",
        quantityPrecision: 3,
        weightRequired: true,
        active: true,
        systemDefault: true
      }),
      expect.objectContaining({
        id: QUANTITY_UBIANKA_PLAN_ID,
        code: "QUANTITY_UBIANKA",
        calculationBasis: "QUANTITY",
        unitSymbol: "ubianka",
        quantityPrecision: 1,
        weightRequired: false,
        allowBatchQuantity: true,
        active: true,
        systemDefault: true
      })
    ]);
  });

  it("creates active test workers with current rate versions", () => {
    const seed = createInitialDomainSeed({ createdAt });
    const planIds = new Set(seed.settlementPlans.map((plan) => plan.id));
    const rateVersionIds = new Set(
      seed.workerRateVersions.map((rateVersion) => rateVersion.id)
    );

    expect(seed.workers).toHaveLength(3);
    for (const worker of seed.workers) {
      expect(worker.active).toBe(true);
      expect(planIds.has(worker.currentPlanId)).toBe(true);
      expect(rateVersionIds.has(worker.currentRateVersionId)).toBe(true);
      expect(worker.linkedUserUid).toBeNull();
    }

    const quantityRates = seed.workerRateVersions.filter(
      (rateVersion) => rateVersion.planId === QUANTITY_UBIANKA_PLAN_ID
    );

    expect(quantityRates.map((rateVersion) => rateVersion.rateGroszPerUnit)).toEqual([
      1500, 1800
    ]);
  });

  it("builds stable idempotent write targets", () => {
    const firstSeed = createInitialDomainSeed({ createdAt });
    const secondSeed = createInitialDomainSeed({
      createdAt: "2026-08-01T00:00:00.000Z",
      createdBy: "another-admin"
    });
    const firstWrites = createInitialDomainSeedWrites(firstSeed);
    const secondWrites = createInitialDomainSeedWrites(secondSeed);
    const firstTargets = firstWrites.map(
      (write) => `${write.collectionPath}/${write.documentId}`
    );

    expect(firstWrites).toHaveLength(10);
    expect(firstTargets).toEqual([
      `${APP_SETTINGS_COLLECTION}/${DOMAIN_SETTINGS_DOCUMENT_ID}`,
      `${SEASONS_COLLECTION}/${TEST_SEASON_ID}`,
      `${SETTLEMENT_PLANS_COLLECTION}/${WEIGHT_KG_PLAN_ID}`,
      `${SETTLEMENT_PLANS_COLLECTION}/${QUANTITY_UBIANKA_PLAN_ID}`,
      `${WORKERS_COLLECTION}/worker-anna-test`,
      `${WORKERS_COLLECTION}/worker-bartek-test`,
      `${WORKERS_COLLECTION}/worker-celina-test`,
      `${WORKER_RATE_VERSIONS_COLLECTION}/rate-worker-anna-test-2026-07-01`,
      `${WORKER_RATE_VERSIONS_COLLECTION}/rate-worker-bartek-test-2026-07-01`,
      `${WORKER_RATE_VERSIONS_COLLECTION}/rate-worker-celina-test-2026-07-01`
    ]);
    expect(
      secondWrites.map((write) => `${write.collectionPath}/${write.documentId}`)
    ).toEqual(firstTargets);
    expect(new Set(firstTargets).size).toBe(firstTargets.length);
  });

  it("normalizes worker names for sorting and duplicate checks", () => {
    expect(normalizeWorkerName("  ANNA   Test  ")).toBe("anna test");
  });
});
