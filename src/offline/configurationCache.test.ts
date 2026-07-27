import type {
  SeasonDocument,
  SettlementPlanDocument,
  WorkerRateVersionDocument
} from "../domain/domainConfiguration";
import type { UserProfile } from "../domain/identity";
import type { HarvestSessionDocument } from "../harvest/openHarvestSession";
import type { WorkerDirectoryListItem } from "../workers/workerDirectory";
import {
  buildConfigurationCacheSnapshot,
  createMemoryConfigurationCacheStorage,
  evaluateConfigurationCacheReadiness
} from "./configurationCache";

const adminProfile: UserProfile = {
  uid: "admin-1",
  email: "admin@example.test",
  displayName: "Admin Test",
  role: "ADMIN",
  workerId: null,
  active: true,
  registrationStatus: "APPROVED",
  offlineConsent: true
};

const season = ({
  id,
  ...overrides
}: Partial<SeasonDocument> & { id: string }): SeasonDocument => ({
  id,
  name: "Sezon 2026",
  startDate: "2026-07-01",
  endDate: "2026-09-30",
  status: "OPEN",
  isDefault: true,
  createdAt: "created-at",
  createdBy: "admin-1",
  closedAt: null,
  closedBy: null,
  reopenedAt: null,
  ...overrides
});

const plan = ({
  id,
  ...overrides
}: Partial<SettlementPlanDocument> & { id: string }): SettlementPlanDocument => ({
  id,
  name: "Za kilogram",
  code: "WEIGHT_KG",
  calculationBasis: "WEIGHT",
  unitLabelSingular: "kilogram",
  unitLabelPlural: "kilogramy",
  unitSymbol: "kg",
  quantityPrecision: 3,
  weightRequired: true,
  allowBatchQuantity: true,
  description: null,
  active: true,
  systemDefault: true,
  createdAt: "created-at",
  createdBy: "admin-1",
  archivedAt: null,
  ...overrides
});

const rateVersion = ({
  id,
  workerId,
  ...overrides
}: Partial<WorkerRateVersionDocument> & {
  id: string;
  workerId: string;
}): WorkerRateVersionDocument => ({
  id,
  workerId,
  planId: "plan-weight-kg",
  rateGroszPerUnit: 1000,
  validFrom: "2026-07-01",
  validTo: null,
  active: true,
  note: "Notatka administracyjna nie trafia do cache.",
  createdAt: "created-at",
  createdBy: "admin-1",
  supersedesRateId: null,
  ...overrides
});

const worker = ({
  id,
  rateVersions,
  ...overrides
}: Partial<WorkerDirectoryListItem> & {
  id: string;
  rateVersions?: WorkerRateVersionDocument[];
}): WorkerDirectoryListItem => {
  const currentRateVersion =
    rateVersions?.find((rate) => rate.id === `rate-${id}-2026-07-01`) ??
    rateVersion({
      id: `rate-${id}-2026-07-01`,
      workerId: id
    });

  return {
    id,
    displayName: "Anna Test",
    normalizedName: "anna test",
    active: true,
    currentPlanId: "plan-weight-kg",
    currentRateVersionId: currentRateVersion.id,
    linkedUserUid: null,
    phone: "500 600 700",
    emailContact: "anna@example.test",
    notes: "Notatka administracyjna.",
    createdAt: "created-at",
    createdBy: "admin-1",
    updatedAt: "updated-at",
    archivedAt: null,
    legacyName: null,
    currentPlan: plan({ id: "plan-weight-kg" }),
    currentRateVersion,
    rateVersions: rateVersions ?? [currentRateVersion],
    linkedUser: null,
    auditEvents: [],
    warnings: [],
    seasonSummary: {
      totalKgGrams: null,
      earnedGrosz: null,
      paidGrosz: null,
      dueGrosz: null
    },
    ...overrides
  };
};

const openSession = ({
  id,
  ...overrides
}: Partial<HarvestSessionDocument> & { id: string }): HarvestSessionDocument => ({
  id,
  seasonId: "season-2026",
  workerId: "worker-anna-test",
  workerNameSnapshot: "Anna Test",
  businessDate: "2026-07-17",
  status: "OPEN",
  planIdSnapshot: "plan-weight-kg",
  planNameSnapshot: "Za kilogram",
  calculationBasisSnapshot: "WEIGHT",
  unitLabelSnapshot: "kilogram",
  unitLabelPluralSnapshot: "kilogramy",
  rateVersionIdSnapshot: "rate-worker-anna-test-2026-07-01",
  rateGroszSnapshot: 1000,
  weightRequiredSnapshot: true,
  quantityPrecisionSnapshot: 3,
  allowBatchQuantitySnapshot: true,
  totalEntryCount: 2,
  totalQuantityMilli: 0,
  totalWeightG: 3000,
  amountDueGrosz: null,
  calculationVersion: "calc-0001",
  note: "Notatka sesji nie trafia do cache.",
  createdBy: "operator-1",
  createdDeviceId: "device-operator-1",
  createdAtDevice: "created-device",
  createdAtServer: "created-server",
  updatedAtServer: "updated-server",
  closedAtDevice: null,
  closedAtServer: null,
  closedBy: null,
  paidAt: null,
  paymentId: null,
  cancelledAt: null,
  cancelledBy: null,
  cancellationReason: null,
  revision: 1,
  legacyImport: false,
  legacySourceRows: [],
  ...overrides
});

describe("configurationCache", () => {
  it("builds a ready configuration snapshot for offline preparation", () => {
    const currentWorker = worker({
      id: "worker-anna-test"
    });
    const snapshot = buildConfigurationCacheSnapshot({
      account: adminProfile,
      deviceId: "device-1",
      preparedAt: new Date("2026-07-17T10:00:00.000Z"),
      viewerRole: "ADMIN",
      seasonDirectory: {
        seasons: [
          season({
            id: "season-archived",
            status: "ARCHIVED",
            isDefault: false
          }),
          season({
            id: "season-2026"
          })
        ],
        invalidSeasons: []
      },
      workerDirectory: {
        workers: [currentWorker],
        plans: [plan({ id: "plan-weight-kg" })],
        profiles: [],
        invalidWorkers: [],
        invalidPlans: [],
        invalidRateVersions: [],
        invalidProfiles: [],
        invalidAuditEvents: []
      },
      harvestSessionDirectory: {
        openSessions: [openSession({ id: "session-open-1" })],
        invalidSessions: []
      }
    });
    const readiness = evaluateConfigurationCacheReadiness({
      profile: adminProfile,
      serviceWorkerReady: true,
      snapshot
    });

    expect(snapshot).toMatchObject({
      id: "admin-1:device-1",
      preparedAtIso: "2026-07-17T10:00:00.000Z",
      viewerRole: "ADMIN",
      activeSeason: {
        id: "season-2026"
      },
      account: {
        uid: "admin-1",
        offlineConsent: true
      }
    });
    expect(snapshot.workers).toEqual([
      {
        id: "worker-anna-test",
        displayName: "Anna Test",
        normalizedName: "anna test",
        active: true,
        currentPlanId: "plan-weight-kg",
        currentRateVersionId: "rate-worker-anna-test-2026-07-01"
      }
    ]);
    expect(snapshot.rateVersions[0]).not.toHaveProperty("note");
    expect(snapshot.workers[0]).not.toHaveProperty("notes");
    expect(snapshot.openSessions).toEqual([
      expect.objectContaining({
        id: "session-open-1",
        status: "OPEN",
        workerId: "worker-anna-test",
        businessDate: "2026-07-17",
        createdDeviceId: "device-operator-1"
      })
    ]);
    expect(snapshot.openSessions[0]).not.toHaveProperty("note");
    expect(readiness).toMatchObject({
      status: "READY",
      missingRequirements: [],
      counts: {
        workers: 1,
        plans: 1,
        rateVersions: 1,
        openSessions: 1
      }
    });
  });

  it("reports missing mandatory offline requirements", () => {
    const snapshot = buildConfigurationCacheSnapshot({
      account: {
        ...adminProfile,
        offlineConsent: false
      },
      deviceId: "device-1",
      preparedAt: new Date("2026-07-17T10:00:00.000Z"),
      viewerRole: "ADMIN",
      seasonDirectory: {
        seasons: [],
        invalidSeasons: []
      },
      workerDirectory: {
        workers: [
          worker({
            id: "worker-anna-test",
            currentRateVersion: null,
            rateVersions: []
          })
        ],
        plans: [],
        profiles: [],
        invalidWorkers: [],
        invalidPlans: [],
        invalidRateVersions: [],
        invalidProfiles: [],
        invalidAuditEvents: []
      }
    });
    const readiness = evaluateConfigurationCacheReadiness({
      profile: {
        ...adminProfile,
        offlineConsent: false
      },
      serviceWorkerReady: false,
      snapshot
    });

    expect(readiness.status).toBe("NOT_READY");
    expect(readiness.missingRequirements).toEqual(
      expect.arrayContaining([
        "Brak zgody na trwale dane offline.",
        "Pliki PWA nie sa potwierdzone w cache service workera.",
        "Brak aktywnego sezonu.",
        "Brak aktywnych planow.",
        "Brak wersji stawek.",
        "Brak planu dla zbieracza Anna Test.",
        "Brak biezacej stawki dla zbieracza Anna Test."
      ])
    );
  });

  it("stores and clears snapshots through memory storage", async () => {
    const snapshot = buildConfigurationCacheSnapshot({
      account: adminProfile,
      deviceId: "device-1",
      preparedAt: new Date("2026-07-17T10:00:00.000Z"),
      viewerRole: "ADMIN",
      seasonDirectory: {
        seasons: [season({ id: "season-2026" })],
        invalidSeasons: []
      },
      workerDirectory: {
        workers: [worker({ id: "worker-anna-test" })],
        plans: [plan({ id: "plan-weight-kg" })],
        profiles: [],
        invalidWorkers: [],
        invalidPlans: [],
        invalidRateVersions: [],
        invalidProfiles: [],
        invalidAuditEvents: []
      }
    });
    const storage = createMemoryConfigurationCacheStorage();

    await storage.write(snapshot);
    await expect(
      storage.read({
        userUid: "admin-1",
        deviceId: "device-1"
      })
    ).resolves.toMatchObject({
      id: "admin-1:device-1"
    });

    await storage.clear({
      userUid: "admin-1",
      deviceId: "device-1"
    });

    await expect(
      storage.read({
        userUid: "admin-1",
        deviceId: "device-1"
      })
    ).resolves.toBeNull();
  });
});
