import type {
  SettlementPlanDocument,
  WorkerRateVersionDocument
} from "../domain/domainConfiguration";
import {
  buildSettlementPlansDirectory,
  decodeSettlementPlan,
  filterSettlementPlans,
  settlementCalculationBasisLabel,
  settlementPlanStatusLabel
} from "./settlementPlans";

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
