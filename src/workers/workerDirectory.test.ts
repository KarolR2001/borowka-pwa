import type {
  SettlementPlanDocument,
  WorkerDocument,
  WorkerRateVersionDocument
} from "../domain/domainConfiguration";
import type { AuditEventDocument } from "../audit/auditEvents";
import type { UserProfile } from "../domain/identity";
import {
  analyzeWorkerRateHistory,
  buildWorkerRateConsistencyReport,
  buildWorkerDirectory,
  createInitialWorkerRateVersionId,
  createWorkerRateVersionId,
  decodeWorker,
  findSimilarWorkerNames,
  filterWorkerDirectory,
  prepareWorkerCreate,
  prepareWorkerRateVersionCreate,
  workerRateLabel,
  workerRateHistoryStatusLabel,
  workerStatusLabel,
  workerSummaryKgLabel,
  workerSummaryMoneyLabel,
  workerUnitLabel,
  type WorkerDirectoryListItem
} from "./workerDirectory";

const createdAt = "created-at";

const adminProfile: UserProfile = {
  uid: "admin-1",
  email: "admin@example.test",
  displayName: "Admin Test",
  role: "ADMIN",
  workerId: null,
  active: true,
  registrationStatus: "APPROVED",
  offlineConsent: false
};

const operatorProfile: UserProfile = {
  ...adminProfile,
  uid: "operator-1",
  role: "OPERATOR"
};

const plan = ({
  id,
  ...overrides
}: Partial<SettlementPlanDocument> & { id: string }): SettlementPlanDocument => ({
  id,
  name: id,
  code: id.toLocaleUpperCase("pl-PL"),
  calculationBasis: "QUANTITY",
  unitLabelSingular: "ubianka",
  unitLabelPlural: "ubianki",
  unitSymbol: "ubianka",
  quantityPrecision: 1,
  weightRequired: false,
  allowBatchQuantity: true,
  description: null,
  active: true,
  systemDefault: false,
  createdAt,
  createdBy: "admin-1",
  archivedAt: null,
  ...overrides
});

const worker = ({
  id,
  ...overrides
}: Partial<WorkerDocument> & { id: string }): WorkerDocument => ({
  id,
  displayName: id,
  normalizedName: id,
  active: true,
  currentPlanId: "plan-quantity",
  currentRateVersionId: `rate-${id}`,
  linkedUserUid: null,
  phone: null,
  emailContact: null,
  notes: null,
  createdAt,
  createdBy: "admin-1",
  updatedAt: createdAt,
  archivedAt: null,
  legacyName: null,
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
  planId: "plan-quantity",
  rateGroszPerUnit: 1500,
  validFrom: "2026-07-01",
  validTo: null,
  active: true,
  note: null,
  createdAt,
  createdBy: "admin-1",
  supersedesRateId: null,
  ...overrides
});

const auditEvent = ({
  id,
  ...overrides
}: Partial<AuditEventDocument> & { id: string }): AuditEventDocument => ({
  id,
  actorUid: "admin-1",
  actorRoleSnapshot: "ADMIN",
  action: "WORKER_CREATED",
  entityType: "WORKER",
  entityId: "worker-anna",
  businessDate: null,
  beforeSummary: null,
  afterSummary: {
    workerId: "worker-anna"
  },
  reason: null,
  createdAtDevice: "device-time",
  createdAtServer: "server-time",
  deviceId: "device-1",
  ...overrides
});

const profile = ({
  uid,
  ...overrides
}: Partial<UserProfile> & { uid: string }): UserProfile => ({
  uid,
  email: `${uid}@example.test`,
  displayName: uid,
  role: "PICKER",
  workerId: null,
  active: true,
  registrationStatus: "APPROVED",
  offlineConsent: false,
  ...overrides
});

const workerListItem = ({
  rateVersions,
  ...overrides
}: Partial<WorkerDirectoryListItem> & {
  id: string;
  rateVersions?: WorkerRateVersionDocument[];
}): WorkerDirectoryListItem => {
  const currentWorker = worker(overrides);
  const currentRateVersion =
    rateVersions?.find((rate) => rate.id === currentWorker.currentRateVersionId) ?? null;

  return {
    ...currentWorker,
    currentPlan: plan({ id: currentWorker.currentPlanId }),
    currentRateVersion,
    rateVersions: rateVersions ?? [],
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

describe("workerDirectory", () => {
  it("prepares active worker with initial rate and audit summary", () => {
    const prepared = prepareWorkerCreate([], [plan({ id: "plan-weight" })], {
      actorProfile: adminProfile,
      workerId: "worker-new",
      displayName: "  Anna Nowa  ",
      planId: "plan-weight",
      rateGroszPerUnit: 1250,
      validFrom: "2026-07-15",
      phone: "  500 600 700 ",
      emailContact: " ANNA@EXAMPLE.TEST ",
      notes: "  Testowa osoba. ",
      confirmSimilarName: false,
      createdAt,
      deviceId: "device-1"
    });

    expect(prepared.worker).toMatchObject({
      id: "worker-new",
      displayName: "Anna Nowa",
      normalizedName: "anna nowa",
      active: true,
      currentPlanId: "plan-weight",
      currentRateVersionId: "rate-worker-new-2026-07-15",
      linkedUserUid: null,
      phone: "500 600 700",
      emailContact: "anna@example.test",
      notes: "Testowa osoba.",
      createdBy: "admin-1",
      updatedAt: createdAt,
      archivedAt: null,
      legacyName: null
    });
    expect(prepared.rateVersion).toMatchObject({
      id: "rate-worker-new-2026-07-15",
      workerId: "worker-new",
      planId: "plan-weight",
      rateGroszPerUnit: 1250,
      validFrom: "2026-07-15",
      validTo: null,
      active: true,
      note: "Pierwsza stawka zbieracza.",
      createdBy: "admin-1",
      supersedesRateId: null
    });
    expect(prepared.auditAction).toBe("WORKER_CREATED");
    expect(prepared.afterSummary).toMatchObject({
      workerId: "worker-new",
      displayName: "Anna Nowa",
      planId: "plan-weight",
      rateVersionId: "rate-worker-new-2026-07-15",
      rateGroszPerUnit: 1250,
      validFrom: "2026-07-15"
    });
    expect(prepared.similarNameWarning).toBeNull();
  });

  it("requires confirmation for similar worker names", () => {
    const existingWorkers = [
      worker({
        id: "worker-anna",
        displayName: "Anna Test"
      })
    ];

    expect(findSimilarWorkerNames(existingWorkers, " anna test ")).toEqual(["Anna Test"]);
    expect(() =>
      prepareWorkerCreate(existingWorkers, [plan({ id: "plan-weight" })], {
        actorProfile: adminProfile,
        workerId: "worker-new",
        displayName: "Anna Test",
        planId: "plan-weight",
        rateGroszPerUnit: 1200,
        validFrom: "2026-07-15",
        confirmSimilarName: false,
        createdAt,
        deviceId: "device-1"
      })
    ).toThrow("Potwierdz, ze to inny zbieracz niz podobna osoba na liscie.");

    expect(
      prepareWorkerCreate(existingWorkers, [plan({ id: "plan-weight" })], {
        actorProfile: adminProfile,
        workerId: "worker-new",
        displayName: "Anna Test",
        planId: "plan-weight",
        rateGroszPerUnit: 1200,
        validFrom: "2026-07-15",
        confirmSimilarName: true,
        createdAt,
        deviceId: "device-1"
      }).similarNameWarning
    ).toBe("Podobna nazwa: Anna Test.");
  });

  it("blocks unsafe worker creation input", () => {
    expect(() =>
      prepareWorkerCreate([], [plan({ id: "plan-archived", active: false })], {
        actorProfile: adminProfile,
        workerId: "worker-new",
        displayName: "Nowy",
        planId: "plan-archived",
        rateGroszPerUnit: 1200,
        validFrom: "2026-07-15",
        confirmSimilarName: false,
        createdAt,
        deviceId: "device-1"
      })
    ).toThrow("Nie mozna przypisac archiwalnego planu.");

    expect(() =>
      prepareWorkerCreate([], [plan({ id: "plan-weight" })], {
        actorProfile: adminProfile,
        workerId: "worker-new",
        displayName: "Nowy",
        planId: "plan-weight",
        rateGroszPerUnit: 0,
        validFrom: "2026-07-15",
        confirmSimilarName: false,
        createdAt,
        deviceId: "device-1"
      })
    ).toThrow("Stawka musi byc dodatnia kwota w groszach.");

    expect(() =>
      prepareWorkerCreate([], [plan({ id: "plan-weight" })], {
        actorProfile: operatorProfile,
        workerId: "worker-new",
        displayName: "Nowy",
        planId: "plan-weight",
        rateGroszPerUnit: 1200,
        validFrom: "2026-07-15",
        confirmSimilarName: false,
        createdAt,
        deviceId: "device-1"
      })
    ).toThrow("Utworzenie zbieracza wymaga aktywnego administratora.");
  });

  it("creates initial rate ids from worker id and valid from date", () => {
    expect(createInitialWorkerRateVersionId("worker-new", "2026-07-15")).toBe(
      "rate-worker-new-2026-07-15"
    );
    expect(() => createInitialWorkerRateVersionId("worker-new", "15.07.2026")).toThrow(
      "Data obowiazywania musi miec format RRRR-MM-DD."
    );
  });

  it("prepares a new worker rate version and closes previous current rate", () => {
    const currentRate = rateVersion({
      id: "rate-worker-anna-test-2026-07-01",
      workerId: "worker-anna-test",
      planId: "plan-weight",
      rateGroszPerUnit: 1000,
      validFrom: "2026-07-01",
      active: true
    });
    const currentWorker = workerListItem({
      id: "worker-anna-test",
      displayName: "Anna Test",
      currentPlanId: "plan-weight",
      currentRateVersionId: currentRate.id,
      rateVersions: [currentRate]
    });
    const prepared = prepareWorkerRateVersionCreate(
      currentWorker,
      [plan({ id: "plan-weight" }), plan({ id: "plan-quantity" })],
      currentWorker.rateVersions,
      {
        actorProfile: adminProfile,
        workerId: "worker-anna-test",
        expectedCurrentRateVersionId: currentRate.id,
        planId: "plan-quantity",
        rateGroszPerUnit: 1400,
        validFrom: "2026-07-15",
        note: "Nowa stawka.",
        confirmBackdatedRate: false,
        confirmHistoricalSnapshotsUnchanged: true,
        confirmPeriodWarning: false,
        businessDate: "2026-07-10",
        createdAt,
        updatedAt: "updated-at",
        deviceId: "device-1"
      }
    );

    expect(prepared.worker).toMatchObject({
      id: "worker-anna-test",
      currentPlanId: "plan-quantity",
      currentRateVersionId: "rate-worker-anna-test-2026-07-15",
      updatedAt: "updated-at"
    });
    expect(prepared.previousRateVersion).toMatchObject({
      id: currentRate.id,
      active: false,
      validTo: "2026-07-14"
    });
    expect(prepared.rateVersion).toMatchObject({
      id: "rate-worker-anna-test-2026-07-15",
      workerId: "worker-anna-test",
      planId: "plan-quantity",
      rateGroszPerUnit: 1400,
      validFrom: "2026-07-15",
      validTo: null,
      active: true,
      note: "Nowa stawka.",
      createdBy: "admin-1",
      supersedesRateId: currentRate.id
    });
    expect(prepared.auditAction).toBe("WORKER_RATE_CHANGED");
    expect(prepared.beforeSummary).toMatchObject({
      workerId: "worker-anna-test",
      rateVersionId: currentRate.id,
      rateGroszPerUnit: 1000,
      validFrom: "2026-07-01",
      validTo: null
    });
    expect(prepared.afterSummary).toMatchObject({
      workerId: "worker-anna-test",
      rateVersionId: "rate-worker-anna-test-2026-07-15",
      currentRateVersionId: "rate-worker-anna-test-2026-07-15",
      rateGroszPerUnit: 1400,
      validFrom: "2026-07-15",
      validTo: null
    });
    expect(prepared.reason).toContain("Historyczne snapshoty sesji");
  });

  it("blocks unsafe worker rate changes", () => {
    const currentRate = rateVersion({
      id: "rate-worker-anna-test-2026-07-01",
      workerId: "worker-anna-test",
      planId: "plan-weight",
      validFrom: "2026-07-01"
    });
    const currentWorker = workerListItem({
      id: "worker-anna-test",
      currentPlanId: "plan-weight",
      currentRateVersionId: currentRate.id,
      rateVersions: [currentRate]
    });
    const input = {
      actorProfile: adminProfile,
      workerId: "worker-anna-test",
      expectedCurrentRateVersionId: currentRate.id,
      planId: "plan-weight",
      rateGroszPerUnit: 1200,
      validFrom: "2026-07-15",
      note: null,
      confirmBackdatedRate: false,
      confirmHistoricalSnapshotsUnchanged: true,
      confirmPeriodWarning: false,
      businessDate: "2026-07-10",
      createdAt,
      updatedAt: "updated-at",
      deviceId: "device-1"
    };

    expect(() =>
      prepareWorkerRateVersionCreate(
        currentWorker,
        [plan({ id: "plan-weight" })],
        [currentRate],
        {
          ...input,
          confirmHistoricalSnapshotsUnchanged: false
        }
      )
    ).toThrow("Potwierdz, ze historyczne snapshoty nie zostana przeliczone.");

    expect(() =>
      prepareWorkerRateVersionCreate(
        currentWorker,
        [plan({ id: "plan-weight", active: false })],
        [currentRate],
        input
      )
    ).toThrow("Nie mozna przypisac archiwalnego planu.");

    expect(() =>
      prepareWorkerRateVersionCreate(
        currentWorker,
        [plan({ id: "plan-weight" })],
        [currentRate],
        {
          ...input,
          validFrom: "2026-07-05",
          businessDate: "2026-07-10"
        }
      )
    ).toThrow("Potwierdz zapis stawki z data wsteczna.");

    expect(() =>
      prepareWorkerRateVersionCreate(
        {
          ...currentWorker,
          currentRateVersionId: "rate-worker-anna-test-2026-07-12"
        },
        [plan({ id: "plan-weight" })],
        [
          currentRate,
          rateVersion({
            id: "rate-worker-anna-test-2026-07-12",
            workerId: "worker-anna-test",
            validFrom: "2026-07-12"
          })
        ],
        input
      )
    ).toThrow("Stawka zostala zmieniona w innym oknie.");

    expect(createWorkerRateVersionId("worker-anna-test", "2026-07-15")).toBe(
      "rate-worker-anna-test-2026-07-15"
    );
  });

  it("analyzes rate history statuses, gaps and overlaps", () => {
    const items = analyzeWorkerRateHistory(
      [
        rateVersion({
          id: "rate-worker-anna-old",
          workerId: "worker-anna",
          validFrom: "2026-06-01",
          validTo: "2026-06-10",
          active: false
        }),
        rateVersion({
          id: "rate-worker-anna-current",
          workerId: "worker-anna",
          validFrom: "2026-06-12",
          validTo: null,
          active: true
        }),
        rateVersion({
          id: "rate-worker-anna-future",
          workerId: "worker-anna",
          validFrom: "2026-07-20",
          validTo: null,
          active: true
        })
      ],
      "2026-07-17"
    );

    expect(
      items.map((item) => ({
        id: item.rateVersion.id,
        status: item.status,
        warnings: item.warnings
      }))
    ).toEqual([
      {
        id: "rate-worker-anna-future",
        status: "FUTURE",
        warnings: ["Naklada sie z wersja od 2026-06-12."]
      },
      {
        id: "rate-worker-anna-current",
        status: "CURRENT",
        warnings: [
          "Przerwa po wersji do 2026-06-10.",
          "Naklada sie z wersja od 2026-07-20."
        ]
      },
      {
        id: "rate-worker-anna-old",
        status: "INACTIVE",
        warnings: ["Przerwa przed wersja od 2026-06-12."]
      }
    ]);
    expect(workerRateHistoryStatusLabel("FUTURE")).toBe("Przyszla");
  });

  it("builds a worker rate consistency report with MVP limitations", () => {
    const currentRate = rateVersion({
      id: "rate-worker-anna-current",
      workerId: "worker-anna",
      validFrom: "2026-07-01",
      validTo: null,
      active: true
    });
    const overlappingRate = rateVersion({
      id: "rate-worker-anna-overlap",
      workerId: "worker-anna",
      validFrom: "2026-07-10",
      validTo: null,
      active: true
    });
    const report = buildWorkerRateConsistencyReport(
      workerListItem({
        id: "worker-anna",
        currentRateVersionId: currentRate.id,
        currentRateVersion: currentRate,
        rateVersions: [currentRate, overlappingRate]
      }),
      "2026-07-17"
    );

    expect(report.level).toBe("ERROR");
    expect(report.checks.find((check) => check.id === "open-rate-period")).toMatchObject({
      level: "ERROR",
      detail: "Liczba otwartych wersji: 2."
    });
    const periodCheck = report.checks.find((check) => check.id === "rate-periods");
    expect(periodCheck).toMatchObject({
      level: "WARNING"
    });
    expect(periodCheck?.detail).toContain("Naklada sie");
    expect(report.limitations).toEqual(
      expect.arrayContaining([
        expect.stringContaining("Bez funkcji serwerowej"),
        expect.stringContaining("transakcji klienta")
      ])
    );
  });

  it("builds worker list with current plan, rate, linked account and empty summaries", () => {
    const directory = buildWorkerDirectory({
      workerDocuments: [
        {
          id: "worker-anna",
          data: worker({
            id: "worker-anna",
            displayName: "Anna Test",
            normalizedName: "anna test",
            currentPlanId: "plan-weight",
            currentRateVersionId: "rate-worker-anna",
            linkedUserUid: "picker-anna"
          })
        }
      ],
      planDocuments: [
        {
          id: "plan-weight",
          data: plan({
            id: "plan-weight",
            name: "Za kilogram",
            code: "WEIGHT_KG",
            calculationBasis: "WEIGHT",
            unitLabelSingular: "kilogram",
            unitLabelPlural: "kilogramy",
            unitSymbol: "kg",
            quantityPrecision: 3,
            weightRequired: true
          })
        }
      ],
      rateVersionDocuments: [
        {
          id: "rate-worker-anna",
          data: rateVersion({
            id: "rate-worker-anna",
            workerId: "worker-anna",
            planId: "plan-weight",
            rateGroszPerUnit: 1000
          })
        },
        {
          id: "rate-worker-anna-old",
          data: rateVersion({
            id: "rate-worker-anna-old",
            workerId: "worker-anna",
            planId: "plan-weight",
            rateGroszPerUnit: 900,
            validFrom: "2026-06-01",
            active: false
          })
        }
      ],
      auditEventDocuments: [
        {
          id: "audit-worker-created",
          data: auditEvent({
            id: "audit-worker-created"
          })
        },
        {
          id: "audit-user-changed",
          data: auditEvent({
            id: "audit-user-changed",
            action: "USER_WORKER_LINK_CHANGED",
            entityType: "USER_PROFILE",
            entityId: "picker-anna"
          })
        }
      ],
      userDocuments: [
        {
          id: "picker-anna",
          data: profile({
            uid: "picker-anna",
            email: "anna@example.test",
            workerId: "worker-anna"
          })
        }
      ]
    });

    expect(directory.workers).toHaveLength(1);
    expect(directory.workers[0]).toMatchObject({
      id: "worker-anna",
      displayName: "Anna Test",
      currentPlan: {
        name: "Za kilogram"
      },
      currentRateVersion: {
        rateGroszPerUnit: 1000
      },
      rateVersions: [
        {
          id: "rate-worker-anna"
        },
        {
          id: "rate-worker-anna-old"
        }
      ],
      auditEvents: [
        {
          id: "audit-worker-created"
        }
      ],
      linkedUser: {
        email: "anna@example.test"
      },
      warnings: [],
      seasonSummary: {
        totalKgGrams: null,
        earnedGrosz: null,
        paidGrosz: null,
        dueGrosz: null
      }
    });
    expect(workerRateLabel(directory.workers[0].currentRateVersion)).toBe("10,00 zł");
    expect(workerUnitLabel(directory.workers[0].currentPlan)).toBe("kg");
    expect(workerSummaryKgLabel(directory.workers[0].seasonSummary.totalKgGrams)).toBe(
      "brak danych"
    );
    expect(workerSummaryMoneyLabel(directory.workers[0].seasonSummary.earnedGrosz)).toBe(
      "brak danych"
    );
  });

  it("reports configuration warnings and sorts active workers first", () => {
    const directory = buildWorkerDirectory({
      workerDocuments: [
        {
          id: "worker-archived",
          data: worker({
            id: "worker-archived",
            displayName: "Archiwalny",
            active: false,
            archivedAt: "archived-at"
          })
        },
        {
          id: "worker-warning",
          data: worker({
            id: "worker-warning",
            displayName: "Brak planu",
            currentPlanId: "missing-plan",
            currentRateVersionId: "missing-rate",
            linkedUserUid: "missing-user"
          })
        }
      ],
      planDocuments: [],
      rateVersionDocuments: [],
      userDocuments: []
    });

    expect(directory.workers.map((item) => item.id)).toEqual([
      "worker-warning",
      "worker-archived"
    ]);
    expect(directory.workers[0].warnings).toEqual([
      "Brak aktualnego planu.",
      "Brak aktualnej stawki.",
      "Brak powiazanego profilu konta."
    ]);
    expect(workerStatusLabel(directory.workers[1])).toBe("Archiwalny");
  });

  it("filters workers by search, status and plan", () => {
    const directory = buildWorkerDirectory({
      workerDocuments: [
        {
          id: "worker-anna",
          data: worker({
            id: "worker-anna",
            displayName: "Anna Test",
            currentPlanId: "plan-weight",
            currentRateVersionId: "rate-worker-anna"
          })
        },
        {
          id: "worker-bartek",
          data: worker({
            id: "worker-bartek",
            displayName: "Bartek Test",
            active: false,
            currentPlanId: "plan-quantity",
            currentRateVersionId: "rate-worker-bartek"
          })
        }
      ],
      planDocuments: [
        {
          id: "plan-weight",
          data: plan({
            id: "plan-weight",
            name: "Za kilogram",
            code: "WEIGHT_KG"
          })
        },
        {
          id: "plan-quantity",
          data: plan({
            id: "plan-quantity",
            name: "Za ubianke",
            code: "QUANTITY_UBIANKA"
          })
        }
      ],
      rateVersionDocuments: [
        {
          id: "rate-worker-anna",
          data: rateVersion({
            id: "rate-worker-anna",
            workerId: "worker-anna",
            planId: "plan-weight"
          })
        },
        {
          id: "rate-worker-bartek",
          data: rateVersion({
            id: "rate-worker-bartek",
            workerId: "worker-bartek",
            planId: "plan-quantity"
          })
        }
      ],
      userDocuments: []
    });

    expect(
      filterWorkerDirectory(directory.workers, {
        search: "anna",
        activity: "ACTIVE",
        planId: "plan-weight",
        sort: "NAME"
      }).map((item) => item.id)
    ).toEqual(["worker-anna"]);
    expect(
      filterWorkerDirectory(directory.workers, {
        search: "",
        activity: "ARCHIVED",
        planId: "ALL",
        sort: "TOTAL_KG"
      }).map((item) => item.id)
    ).toEqual(["worker-bartek"]);
  });

  it("separates invalid workers and related documents", () => {
    const directory = buildWorkerDirectory({
      workerDocuments: [
        {
          id: "worker-invalid",
          data: worker({
            id: "worker-invalid",
            active: "yes" as unknown as boolean
          })
        }
      ],
      planDocuments: [
        {
          id: "plan-invalid",
          data: plan({
            id: "plan-invalid",
            calculationBasis: "WEIGHT",
            weightRequired: false
          })
        }
      ],
      rateVersionDocuments: [
        {
          id: "rate-invalid",
          data: rateVersion({
            id: "rate-invalid",
            workerId: "worker-invalid",
            rateGroszPerUnit: -1
          })
        }
      ],
      userDocuments: [
        {
          id: "profile-invalid",
          data: profile({
            uid: "profile-invalid",
            role: "UNKNOWN" as unknown as UserProfile["role"]
          })
        }
      ],
      auditEventDocuments: [
        {
          id: "audit-invalid",
          data: auditEvent({
            id: "audit-invalid",
            beforeSummary: ["bad"] as never
          })
        }
      ]
    });

    expect(directory.workers).toHaveLength(0);
    expect(directory.invalidWorkers).toEqual([
      {
        id: "worker-invalid",
        reason: "Zbieracz ma nieprawidlowy status aktywnosci."
      }
    ]);
    expect(directory.invalidPlans).toEqual([
      {
        id: "plan-invalid",
        reason: "Plan wagowy musi wymagac wagi."
      }
    ]);
    expect(directory.invalidRateVersions).toEqual([
      {
        id: "rate-invalid",
        reason: "Wersja stawki ma nieprawidlowa kwote."
      }
    ]);
    expect(directory.invalidProfiles).toEqual([
      {
        id: "profile-invalid",
        reason: "Profil uzytkownika ma nieznana role."
      }
    ]);
    expect(directory.invalidAuditEvents).toEqual([
      {
        id: "audit-invalid",
        reason: "Podsumowanie audytu ma nieprawidlowy format."
      }
    ]);
  });

  it("rejects malformed worker documents", () => {
    expect(
      decodeWorker(
        "worker-bad",
        worker({
          id: "worker-other"
        })
      )
    ).toEqual({
      status: "INVALID",
      reason: "Zbieracz ma niezgodny identyfikator."
    });
  });
});
