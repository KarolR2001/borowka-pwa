import type { HarvestSessionDocument } from "../harvest/openHarvestSession";
import type { SourceStockSale } from "./sourceStockCalculation";
import type { OperationalStockMovementDocument } from "./operationalStockMovement";
import { reconcileStockSources } from "./stockReconciliation";

describe("stock reconciliation", () => {
  it("confirms matching source documents and operational movements", () => {
    const report = reconcileStockSources({
      checkedAtIso: "2026-08-04T10:00:00.000Z",
      harvestSessions: [session("session-1", 10_000)],
      movements: [movement("HARVEST_SESSION", "session-1", 10_000)],
      sales: [],
      seasonId: "season-1"
    });

    expect(report).toMatchObject({
      blocksOrdinarySale: false,
      differenceG: 0,
      expectedMovementCount: 1,
      issues: [],
      operationalAvailableWeightG: 10_000,
      operationalMovementCount: 1,
      source: {
        availableWeightG: 10_000,
        confirmedHarvestWeightG: 10_000,
        soldWeightG: 0
      }
    });
  });

  it("reports missing, stale and unexpected movements with aggregate difference", () => {
    const report = reconcileStockSources({
      checkedAtIso: "2026-08-04T10:00:00.000Z",
      harvestSessions: [session("missing", 4000), session("stale", 3000)],
      movements: [
        movement("HARVEST_SESSION", "stale", 1000),
        movement("SALE", "orphan", -500)
      ],
      sales: [],
      seasonId: "season-1"
    });

    expect(report.blocksOrdinarySale).toBe(true);
    expect(report.differenceG).toBe(-6500);
    expect(issue(report, "MISSING_MOVEMENTS").documentIds).toEqual([
      "harvest-session-missing"
    ]);
    expect(issue(report, "MISMATCHED_MOVEMENTS").documentIds).toEqual([
      "harvest-session-stale"
    ]);
    expect(issue(report, "UNEXPECTED_MOVEMENTS").documentIds).toEqual(["sale-orphan"]);
    expect(issue(report, "AGGREGATE_DIFFERENCE").count).toBe(1);
  });

  it("blocks a negative source state even when the projection matches", () => {
    const sale = ordinarySale("sale-1", 3000);
    const report = reconcileStockSources({
      checkedAtIso: "2026-08-04T10:00:00.000Z",
      harvestSessions: [session("session-1", 1000)],
      movements: [
        movement("HARVEST_SESSION", "session-1", 1000),
        movement("SALE", "sale-1", -3000)
      ],
      sales: [sale],
      seasonId: "season-1"
    });

    expect(report.differenceG).toBe(0);
    expect(report.source.availableWeightG).toBe(-2000);
    expect(issue(report, "NEGATIVE_SOURCE_STOCK")).toBeDefined();
    expect(report.blocksOrdinarySale).toBe(true);
  });

  it("includes invalid source and movement counts in the blocking report", () => {
    const report = reconcileStockSources({
      checkedAtIso: "2026-08-04T10:00:00.000Z",
      harvestSessions: [],
      movementInvalidDocumentCount: 2,
      movements: [],
      sales: [],
      seasonId: "season-1",
      sourceInvalidDocumentCount: 1
    });

    expect(issue(report, "INVALID_SOURCES").count).toBe(1);
    expect(issue(report, "INVALID_MOVEMENTS").count).toBe(2);
    expect(report.blocksOrdinarySale).toBe(true);
  });
});

function issue(
  report: ReturnType<typeof reconcileStockSources>,
  code: ReturnType<typeof reconcileStockSources>["issues"][number]["code"]
) {
  const result = report.issues.find((item) => item.code === code);
  if (!result) {
    throw new Error(`Brak oczekiwanego problemu ${code}.`);
  }
  return result;
}

function movement(
  sourceType: "HARVEST_SESSION" | "SALE",
  sourceId: string,
  weightImpactG: number
): OperationalStockMovementDocument {
  return {
    id: `${sourceType === "HARVEST_SESSION" ? "harvest-session" : "sale"}-${sourceId}`,
    seasonId: "season-1",
    sourceId,
    sourceType,
    updatedAt: "server-time",
    updatedBy: "admin-1",
    weightImpactG
  };
}

function ordinarySale(id: string, weightG: number): SourceStockSale {
  return {
    correctionDirection: null,
    entryType: "SALE",
    id,
    seasonId: "season-1",
    status: "ACTIVE",
    weightG
  };
}

function session(id: string, totalWeightG: number): HarvestSessionDocument {
  return {
    allowBatchQuantitySnapshot: true,
    amountDueGrosz: 1000,
    businessDate: "2026-08-04",
    calculationBasisSnapshot: "WEIGHT",
    calculationVersion: "1",
    cancellationReason: null,
    cancelledAt: null,
    cancelledBy: null,
    closedAtDevice: "device-time",
    closedAtServer: "server-time",
    closedBy: "operator-1",
    createdAtDevice: "device-time",
    createdAtServer: "server-time",
    createdBy: "operator-1",
    createdDeviceId: "device-1",
    id,
    legacyImport: false,
    legacySourceRows: [],
    note: null,
    paidAt: null,
    paymentId: null,
    planIdSnapshot: "plan-1",
    planNameSnapshot: "Za kilogram",
    quantityPrecisionSnapshot: 3,
    rateGroszSnapshot: 100,
    rateVersionIdSnapshot: "rate-1",
    revision: 1,
    seasonId: "season-1",
    status: "CLOSED",
    totalEntryCount: 1,
    totalQuantityMilli: 1000,
    totalWeightG,
    unitLabelPluralSnapshot: "kilogramy",
    unitLabelSnapshot: "kilogram",
    updatedAtServer: "server-time",
    weightRequiredSnapshot: true,
    workerId: "worker-1",
    workerNameSnapshot: "Zbieracz A"
  };
}
