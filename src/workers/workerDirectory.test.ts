import type {
  SettlementPlanDocument,
  WorkerDocument,
  WorkerRateVersionDocument
} from "../domain/domainConfiguration";
import type { UserProfile } from "../domain/identity";
import {
  buildWorkerDirectory,
  decodeWorker,
  filterWorkerDirectory,
  workerRateLabel,
  workerStatusLabel,
  workerSummaryKgLabel,
  workerSummaryMoneyLabel,
  workerUnitLabel
} from "./workerDirectory";

const createdAt = "created-at";

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

describe("workerDirectory", () => {
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
