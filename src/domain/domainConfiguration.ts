export const DOMAIN_SCHEMA_VERSION = 1;
export const CALCULATION_RULE_VERSION = 1;

export const APP_SETTINGS_COLLECTION = "appSettings";
export const DOMAIN_SETTINGS_DOCUMENT_ID = "domain";
export const SEASONS_COLLECTION = "seasons";
export const SETTLEMENT_PLANS_COLLECTION = "settlementPlans";
export const WORKERS_COLLECTION = "workers";
export const WORKER_RATE_VERSIONS_COLLECTION = "workerRateVersions";

export const SYSTEM_SEED_ACTOR = "SYSTEM_SEED";
export const TEST_SEASON_ID = "season-2026-test";
export const WEIGHT_KG_PLAN_ID = "plan-weight-kg";
export const QUANTITY_UBIANKA_PLAN_ID = "plan-quantity-ubianka";

export type SettlementCalculationBasis = "WEIGHT" | "QUANTITY";
export type SeasonStatus = "PLANNED" | "OPEN" | "CLOSED" | "ARCHIVED";

export type DomainSettingsDocument = {
  id: typeof DOMAIN_SETTINGS_DOCUMENT_ID;
  schemaVersion: number;
  calculationRuleVersion: number;
  defaultSeasonId: string;
  pickerOwnReportExportEnabled: boolean;
  initializedAt: unknown;
  initializedBy: string;
  updatedAt: unknown;
};

export type SettlementPlanDocument = {
  id: string;
  name: string;
  code: string;
  calculationBasis: SettlementCalculationBasis;
  unitLabelSingular: string;
  unitLabelPlural: string;
  unitSymbol: string;
  quantityPrecision: number;
  weightRequired: boolean;
  allowBatchQuantity: boolean;
  description: string | null;
  active: boolean;
  systemDefault: boolean;
  createdAt: unknown;
  createdBy: string;
  archivedAt: unknown;
};

export type WorkerDocument = {
  id: string;
  displayName: string;
  normalizedName: string;
  active: boolean;
  currentPlanId: string;
  currentRateVersionId: string;
  linkedUserUid: string | null;
  phone: string | null;
  emailContact: string | null;
  notes: string | null;
  createdAt: unknown;
  createdBy: string;
  updatedAt: unknown;
  archivedAt: unknown;
  legacyName: string | null;
};

export type WorkerRateVersionDocument = {
  id: string;
  workerId: string;
  planId: string;
  rateGroszPerUnit: number;
  validFrom: string;
  validTo: string | null;
  active: boolean;
  note: string | null;
  createdAt: unknown;
  createdBy: string;
  supersedesRateId: string | null;
};

export type SeasonDocument = {
  id: string;
  name: string;
  startDate: string;
  endDate: string | null;
  status: SeasonStatus;
  isDefault: boolean;
  createdAt: unknown;
  createdBy: string;
  closedAt: unknown;
  closedBy: string | null;
  reopenedAt: unknown;
};

export type InitialDomainSeedInput = {
  createdAt: unknown;
  createdBy?: string;
};

export type InitialDomainSeed = {
  settings: DomainSettingsDocument;
  seasons: SeasonDocument[];
  settlementPlans: SettlementPlanDocument[];
  workers: WorkerDocument[];
  workerRateVersions: WorkerRateVersionDocument[];
};

export type DomainSeedWrite = {
  collectionPath: string;
  documentId: string;
  data:
    | DomainSettingsDocument
    | SeasonDocument
    | SettlementPlanDocument
    | WorkerDocument
    | WorkerRateVersionDocument;
};

type SeedWorkerDefinition = {
  id: string;
  displayName: string;
  planId: string;
  rateGroszPerUnit: number;
  note: string;
};

const seedWorkers: SeedWorkerDefinition[] = [
  {
    id: "worker-anna-test",
    displayName: "Anna Test",
    planId: WEIGHT_KG_PLAN_ID,
    rateGroszPerUnit: 1000,
    note: "Testowa stawka za kilogram."
  },
  {
    id: "worker-bartek-test",
    displayName: "Bartek Test",
    planId: QUANTITY_UBIANKA_PLAN_ID,
    rateGroszPerUnit: 1500,
    note: "Testowa stawka za ubianke."
  },
  {
    id: "worker-celina-test",
    displayName: "Celina Test",
    planId: QUANTITY_UBIANKA_PLAN_ID,
    rateGroszPerUnit: 1800,
    note: "Druga testowa stawka za ten sam plan."
  }
];

export function createInitialDomainSeed(
  input: InitialDomainSeedInput
): InitialDomainSeed {
  const createdBy = normalizeRequiredText(input.createdBy ?? SYSTEM_SEED_ACTOR);
  const plans = createSystemSettlementPlans(input.createdAt, createdBy);
  const rateVersions = seedWorkers.map((worker) =>
    createWorkerRateVersion(worker, input.createdAt, createdBy)
  );
  const workers = seedWorkers.map((worker) =>
    createWorker(worker, input.createdAt, createdBy)
  );

  return {
    settings: {
      id: DOMAIN_SETTINGS_DOCUMENT_ID,
      schemaVersion: DOMAIN_SCHEMA_VERSION,
      calculationRuleVersion: CALCULATION_RULE_VERSION,
      defaultSeasonId: TEST_SEASON_ID,
      pickerOwnReportExportEnabled: false,
      initializedAt: input.createdAt,
      initializedBy: createdBy,
      updatedAt: input.createdAt
    },
    seasons: [
      {
        id: TEST_SEASON_ID,
        name: "Sezon testowy 2026",
        startDate: "2026-07-01",
        endDate: "2026-09-30",
        status: "OPEN",
        isDefault: true,
        createdAt: input.createdAt,
        createdBy,
        closedAt: null,
        closedBy: null,
        reopenedAt: null
      }
    ],
    settlementPlans: plans,
    workers,
    workerRateVersions: rateVersions
  };
}

export function createInitialDomainSeedWrites(
  seed: InitialDomainSeed
): DomainSeedWrite[] {
  const writes: DomainSeedWrite[] = [
    {
      collectionPath: APP_SETTINGS_COLLECTION,
      documentId: seed.settings.id,
      data: seed.settings
    },
    ...seed.seasons.map((season) => ({
      collectionPath: SEASONS_COLLECTION,
      documentId: season.id,
      data: season
    })),
    ...seed.settlementPlans.map((plan) => ({
      collectionPath: SETTLEMENT_PLANS_COLLECTION,
      documentId: plan.id,
      data: plan
    })),
    ...seed.workers.map((worker) => ({
      collectionPath: WORKERS_COLLECTION,
      documentId: worker.id,
      data: worker
    })),
    ...seed.workerRateVersions.map((rateVersion) => ({
      collectionPath: WORKER_RATE_VERSIONS_COLLECTION,
      documentId: rateVersion.id,
      data: rateVersion
    }))
  ];

  assertUniqueDocumentTargets(writes);

  return writes;
}

export function normalizeWorkerName(name: string): string {
  return normalizeRequiredText(name).toLocaleLowerCase("pl-PL");
}

function createSystemSettlementPlans(
  createdAt: unknown,
  createdBy: string
): SettlementPlanDocument[] {
  return [
    {
      id: WEIGHT_KG_PLAN_ID,
      name: "Za kilogram",
      code: "WEIGHT_KG",
      calculationBasis: "WEIGHT",
      unitLabelSingular: "kilogram",
      unitLabelPlural: "kilogramy",
      unitSymbol: "kg",
      quantityPrecision: 3,
      weightRequired: true,
      allowBatchQuantity: true,
      description: "Rozliczenie wedlug potwierdzonej masy w kilogramach.",
      active: true,
      systemDefault: true,
      createdAt,
      createdBy,
      archivedAt: null
    },
    {
      id: QUANTITY_UBIANKA_PLAN_ID,
      name: "Za ubianke",
      code: "QUANTITY_UBIANKA",
      calculationBasis: "QUANTITY",
      unitLabelSingular: "ubianka",
      unitLabelPlural: "ubianki",
      unitSymbol: "ubianka",
      quantityPrecision: 1,
      weightRequired: false,
      allowBatchQuantity: true,
      description:
        "Rozliczenie wedlug liczby ubianek; wpis bez wagi nie zwieksza stanu kg.",
      active: true,
      systemDefault: true,
      createdAt,
      createdBy,
      archivedAt: null
    }
  ];
}

function createWorker(
  definition: SeedWorkerDefinition,
  createdAt: unknown,
  createdBy: string
): WorkerDocument {
  return {
    id: definition.id,
    displayName: definition.displayName,
    normalizedName: normalizeWorkerName(definition.displayName),
    active: true,
    currentPlanId: definition.planId,
    currentRateVersionId: rateVersionIdForWorker(definition.id),
    linkedUserUid: null,
    phone: null,
    emailContact: null,
    notes: "Testowy zbieracz development.",
    createdAt,
    createdBy,
    updatedAt: createdAt,
    archivedAt: null,
    legacyName: null
  };
}

function createWorkerRateVersion(
  definition: SeedWorkerDefinition,
  createdAt: unknown,
  createdBy: string
): WorkerRateVersionDocument {
  return {
    id: rateVersionIdForWorker(definition.id),
    workerId: definition.id,
    planId: definition.planId,
    rateGroszPerUnit: definition.rateGroszPerUnit,
    validFrom: "2026-07-01",
    validTo: null,
    active: true,
    note: definition.note,
    createdAt,
    createdBy,
    supersedesRateId: null
  };
}

function rateVersionIdForWorker(workerId: string): string {
  return `rate-${workerId}-2026-07-01`;
}

function assertUniqueDocumentTargets(writes: DomainSeedWrite[]): void {
  const seen = new Set<string>();

  for (const write of writes) {
    const target = `${write.collectionPath}/${write.documentId}`;

    if (seen.has(target)) {
      throw new Error(`Duplicate seed document target: ${target}`);
    }

    seen.add(target);
  }
}

function normalizeRequiredText(value: string): string {
  const trimmed = value.trim().replace(/\s+/g, " ");

  if (!trimmed) {
    throw new Error("Wartosc tekstowa jest wymagana.");
  }

  return trimmed;
}
