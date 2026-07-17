import type {
  SettlementPlanDocument,
  WorkerRateVersionDocument
} from "../domain/domainConfiguration";
import type { UserProfile } from "../domain/identity";
import {
  buildSettlementPlansDirectory,
  createSettlementPlanExample,
  createSettlementPlanId,
  decodeSettlementPlan,
  filterSettlementPlans,
  normalizePlanCode,
  prepareSettlementPlanCreate,
  settlementCalculationBasisLabel,
  settlementPlanStatusLabel
} from "./settlementPlans";

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

const rateVersion = ({
  id,
  planId,
  ...overrides
}: Partial<WorkerRateVersionDocument> & {
  id: string;
  planId: string;
}): WorkerRateVersionDocument => ({
  id,
  workerId: `worker-${id}`,
  planId,
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

describe("settlementPlans", () => {
  it("prepares a custom quantity plan with stable code, audit summary and warning", () => {
    const prepared = prepareSettlementPlanCreate([], {
      actorProfile: adminProfile,
      name: "  Za skrzynke  ",
      code: " skrzynka  ",
      calculationBasis: "QUANTITY",
      unitLabelSingular: "skrzynka",
      unitLabelPlural: "skrzynki",
      unitSymbol: "skrz.",
      quantityPrecision: 0,
      weightRequired: false,
      allowBatchQuantity: true,
      description: "  Rozliczenie za skrzynke. ",
      createdAt,
      deviceId: "device-1"
    });

    expect(prepared.plan).toMatchObject({
      id: "plan-skrzynka",
      name: "Za skrzynke",
      code: "SKRZYNKA",
      calculationBasis: "QUANTITY",
      quantityPrecision: 0,
      weightRequired: false,
      allowBatchQuantity: true,
      description: "Rozliczenie za skrzynke.",
      active: true,
      systemDefault: false,
      createdBy: "admin-1",
      archivedAt: null
    });
    expect(prepared.auditAction).toBe("SETTLEMENT_PLAN_CREATED");
    expect(prepared.afterSummary).toMatchObject({
      planId: "plan-skrzynka",
      code: "SKRZYNKA",
      calculationBasis: "QUANTITY",
      active: true
    });
    expect(prepared.inventoryWarning).toBe(
      "Wpis bez wagi nie zwiekszy stanu kilogramow w magazynie."
    );
  });

  it("blocks unsafe custom plan creation", () => {
    const existing = [
      plan({
        id: "plan-skrzynka",
        code: "SKRZYNKA"
      })
    ];

    expect(() =>
      prepareSettlementPlanCreate(existing, {
        actorProfile: adminProfile,
        name: "Za skrzynke",
        code: "SKRZYNKA",
        calculationBasis: "QUANTITY",
        unitLabelSingular: "skrzynka",
        unitLabelPlural: "skrzynki",
        unitSymbol: "skrz.",
        quantityPrecision: 1,
        weightRequired: false,
        allowBatchQuantity: true,
        description: null,
        createdAt,
        deviceId: "device-1"
      })
    ).toThrow("Kod planu musi byc unikalny.");

    expect(() =>
      prepareSettlementPlanCreate([], {
        actorProfile: adminProfile,
        name: "Za wage bez wagi",
        code: "BAD_WEIGHT",
        calculationBasis: "WEIGHT",
        unitLabelSingular: "kilogram",
        unitLabelPlural: "kilogramy",
        unitSymbol: "kg",
        quantityPrecision: 3,
        weightRequired: false,
        allowBatchQuantity: true,
        description: null,
        createdAt,
        deviceId: "device-1"
      })
    ).toThrow("Plan wagowy musi wymagac wagi.");

    expect(() =>
      prepareSettlementPlanCreate([], {
        actorProfile: operatorProfile,
        name: "Brak uprawnien",
        code: "NO_ACCESS",
        calculationBasis: "QUANTITY",
        unitLabelSingular: "sztuka",
        unitLabelPlural: "sztuki",
        unitSymbol: "szt.",
        quantityPrecision: 0,
        weightRequired: false,
        allowBatchQuantity: true,
        description: null,
        createdAt,
        deviceId: "device-1"
      })
    ).toThrow("Operacja planu wymaga aktywnego administratora.");
  });

  it("normalizes codes, creates stable ids and previews calculation", () => {
    expect(normalizePlanCode(" Za skrzynke! ")).toBe("ZA_SKRZYNKE");
    expect(createSettlementPlanId(" Za skrzynke! ")).toBe("plan-za-skrzynke");
    expect(
      createSettlementPlanExample({
        calculationBasis: "QUANTITY",
        quantityPrecision: 1,
        unitLabelSingular: "ubianka",
        unitLabelPlural: "ubianki",
        unitSymbol: "ubianka"
      })
    ).toBe("3,5 ubianki x 15,00 zł = 52,50 zł");
    expect(
      createSettlementPlanExample({
        calculationBasis: "WEIGHT",
        quantityPrecision: 3,
        unitLabelSingular: "kilogram",
        unitLabelPlural: "kilogramy",
        unitSymbol: "kg"
      })
    ).toBe("8,425 kg x 10,00 zł = 84,25 zł");
  });

  it("builds plan directory with rate metrics and stable sorting", () => {
    const directory = buildSettlementPlansDirectory(
      [
        {
          id: "plan-archived",
          data: plan({
            id: "plan-archived",
            name: "Archiwalny",
            active: false,
            archivedAt: "archived-at"
          })
        },
        {
          id: "plan-quantity-ubianka",
          data: plan({
            id: "plan-quantity-ubianka",
            name: "Za ubianke",
            code: "QUANTITY_UBIANKA",
            systemDefault: true
          })
        },
        {
          id: "plan-weight-kg",
          data: plan({
            id: "plan-weight-kg",
            name: "Za kilogram",
            code: "WEIGHT_KG",
            calculationBasis: "WEIGHT",
            unitLabelSingular: "kilogram",
            unitLabelPlural: "kilogramy",
            unitSymbol: "kg",
            quantityPrecision: 3,
            weightRequired: true,
            systemDefault: true
          })
        }
      ],
      [
        {
          id: "rate-weight-1",
          data: rateVersion({
            id: "rate-weight-1",
            planId: "plan-weight-kg"
          })
        },
        {
          id: "rate-quantity-1",
          data: rateVersion({
            id: "rate-quantity-1",
            planId: "plan-quantity-ubianka"
          })
        },
        {
          id: "rate-quantity-2",
          data: rateVersion({
            id: "rate-quantity-2",
            planId: "plan-quantity-ubianka",
            active: false
          })
        }
      ]
    );

    expect(directory.plans.map((item) => item.id)).toEqual([
      "plan-weight-kg",
      "plan-quantity-ubianka",
      "plan-archived"
    ]);
    expect(
      directory.plans.find((item) => item.id === "plan-quantity-ubianka")
    ).toMatchObject({
      activeRateCount: 1,
      rateVersionCount: 2,
      wasUsed: true
    });
    expect(directory.invalidPlans).toHaveLength(0);
    expect(directory.invalidRateVersions).toHaveLength(0);
  });

  it("separates invalid plans and invalid rate versions", () => {
    const directory = buildSettlementPlansDirectory(
      [
        {
          id: "plan-weight",
          data: plan({
            id: "plan-weight",
            calculationBasis: "WEIGHT",
            weightRequired: false
          })
        },
        {
          id: "plan-ok",
          data: plan({
            id: "plan-ok"
          })
        }
      ],
      [
        {
          id: "rate-bad",
          data: rateVersion({
            id: "rate-bad",
            planId: "plan-ok",
            rateGroszPerUnit: -1
          })
        }
      ]
    );

    expect(directory.plans.map((item) => item.id)).toEqual(["plan-ok"]);
    expect(directory.invalidPlans).toEqual([
      {
        id: "plan-weight",
        reason: "Plan wagowy musi wymagac wagi."
      }
    ]);
    expect(directory.invalidRateVersions).toEqual([
      {
        id: "rate-bad",
        reason: "Wersja stawki ma nieprawidlowa kwote."
      }
    ]);
  });

  it("filters plans by basis, status and search", () => {
    const directory = buildSettlementPlansDirectory(
      [
        {
          id: "plan-weight",
          data: plan({
            id: "plan-weight",
            name: "Za kilogram",
            code: "WEIGHT_KG",
            calculationBasis: "WEIGHT",
            unitSymbol: "kg",
            quantityPrecision: 3,
            weightRequired: true
          })
        },
        {
          id: "plan-quantity",
          data: plan({
            id: "plan-quantity",
            name: "Za ubianke",
            code: "QUANTITY_UBIANKA",
            active: false
          })
        }
      ],
      []
    );

    expect(
      filterSettlementPlans(directory.plans, {
        search: "kg",
        basis: "WEIGHT",
        status: "ACTIVE"
      }).map((item) => item.id)
    ).toEqual(["plan-weight"]);
    expect(
      filterSettlementPlans(directory.plans, {
        search: "",
        basis: "ALL",
        status: "ARCHIVED"
      }).map((item) => item.id)
    ).toEqual(["plan-quantity"]);
  });

  it("decodes plan labels and rejects unsupported values", () => {
    expect(settlementCalculationBasisLabel("WEIGHT")).toBe("Waga");
    expect(settlementPlanStatusLabel({ active: false })).toBe("Archiwalny");

    expect(
      decodeSettlementPlan(
        "plan-bad-precision",
        plan({
          id: "plan-bad-precision",
          quantityPrecision: 4
        })
      )
    ).toEqual({
      status: "INVALID",
      reason: "Plan ma nieobslugiwana precyzje ilosci."
    });
  });
});
