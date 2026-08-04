import { describe, expect, it } from "vitest";

import type { SeasonDocument } from "../domain/domainConfiguration";
import { buildAggregatedSeasonDashboard } from "../dashboard/adminDashboard";
import { summarizeSyncDocumentMetadata } from "../offline/pendingWriteMetadata";
import {
  calculateSourceStockForSeason,
  type SourceStockHarvestSession,
  type SourceStockSale
} from "./sourceStockCalculation";

const SEASON_ID = "season-2026";

describe("stage 8.16 stock correctness verification", () => {
  it("1. closing a harvest session increases available stock", () => {
    const before = calculate([session("session-1", "OPEN", 12_500)]);
    const after = calculate([session("session-1", "CLOSED", 12_500)]);

    expect(before.availableWeightG).toBe(0);
    expect(after.availableWeightG - before.availableWeightG).toBe(12_500);
  });

  it("2. an open harvest session does not increase available stock", () => {
    const result = calculate([session("session-open", "OPEN", 18_000)]);

    expect(result.confirmedHarvestWeightG).toBe(0);
    expect(result.availableWeightG).toBe(0);
  });

  it("3. payment changes CLOSED to PAID without changing kilograms", () => {
    const beforePayment = calculate([session("session-paid", "CLOSED", 9700)]);
    const afterPayment = calculate([session("session-paid", "PAID", 9700)]);

    expect(afterPayment.confirmedHarvestWeightG).toBe(
      beforePayment.confirmedHarvestWeightG
    );
    expect(afterPayment.availableWeightG).toBe(beforePayment.availableWeightG);
  });

  it("4. cancelling a confirmed harvest session removes its stock", () => {
    const beforeCancellation = calculate([
      session("session-kept", "CLOSED", 4000),
      session("session-cancelled", "CLOSED", 6500)
    ]);
    const afterCancellation = calculate([
      session("session-kept", "CLOSED", 4000),
      session("session-cancelled", "CANCELLED", 6500)
    ]);

    expect(beforeCancellation.availableWeightG).toBe(10_500);
    expect(afterCancellation.availableWeightG).toBe(4000);
  });

  it("5. a confirmed session without weight does not increase stock", () => {
    const result = calculate([session("session-no-weight", "CLOSED", 0)]);

    expect(result.confirmedHarvestWeightG).toBe(0);
    expect(result.sourceCounts.includedHarvestSessionDocuments).toBe(1);
  });

  it("6. an active ordinary sale decreases available stock", () => {
    const before = calculate([session("session-1", "CLOSED", 20_000)]);
    const after = calculate(
      [session("session-1", "CLOSED", 20_000)],
      [sale("sale-1", "SALE", "ACTIVE", 7500)]
    );

    expect(after.availableWeightG).toBe(12_500);
    expect(before.availableWeightG - after.availableWeightG).toBe(7500);
  });

  it("7. cancelling an ordinary sale restores available stock", () => {
    const active = calculate(
      [session("session-1", "CLOSED", 20_000)],
      [sale("sale-1", "SALE", "ACTIVE", 7500)]
    );
    const cancelled = calculate(
      [session("session-1", "CLOSED", 20_000)],
      [sale("sale-1", "SALE", "CANCELLED", 7500)]
    );

    expect(cancelled.availableWeightG - active.availableWeightG).toBe(7500);
    expect(cancelled.availableWeightG).toBe(20_000);
  });

  it("8. corrections apply their explicit stock direction", () => {
    const result = calculate(
      [session("session-1", "CLOSED", 10_000)],
      [
        sale("correction-increase", "CORRECTION", "ACTIVE", 2000, "INCREASE_STOCK"),
        sale("correction-decrease", "CORRECTION", "ACTIVE", 3500, "DECREASE_STOCK")
      ]
    );

    expect(result.correctionIncreaseWeightG).toBe(2000);
    expect(result.correctionDecreaseWeightG).toBe(3500);
    expect(result.availableWeightG).toBe(8500);
  });

  it("9. documents from another season do not affect the selected season", () => {
    const result = calculate(
      [
        session("selected-session", "CLOSED", 9000),
        session("other-session", "CLOSED", 99_000, "season-2025")
      ],
      [
        sale("selected-sale", "SALE", "ACTIVE", 1000),
        sale("other-sale", "SALE", "ACTIVE", 88_000, null, "season-2025")
      ]
    );

    expect(result.confirmedHarvestWeightG).toBe(9000);
    expect(result.soldWeightG).toBe(1000);
    expect(result.availableWeightG).toBe(8000);
  });

  it("10. cancelled source documents do not enter stock totals", () => {
    const result = calculate(
      [
        session("confirmed", "CLOSED", 8000),
        session("cancelled-session", "CANCELLED", 60_000)
      ],
      [
        sale("cancelled-sale", "SALE", "CANCELLED", 3000),
        sale("cancelled-correction", "CORRECTION", "CANCELLED", 2000, "DECREASE_STOCK")
      ]
    );

    expect(result.confirmedHarvestWeightG).toBe(8000);
    expect(result.soldWeightG).toBe(0);
    expect(result.availableWeightG).toBe(8000);
  });

  it("11. an imported confirmed session preserves its historical kilograms", () => {
    const importedSession = {
      ...session("legacy-session", "PAID", 7315),
      legacyImport: true,
      legacySourceRows: ["legacy-row-17"]
    };

    const result = calculate([importedSession]);

    expect(result.confirmedHarvestWeightG).toBe(7315);
    expect(result.availableWeightG).toBe(7315);
  });

  it("12. source calculation and dashboard expose the same stock totals", () => {
    const source = calculate(
      [
        session("closed", "CLOSED", 20_000),
        session("paid", "PAID", 5000),
        session("open", "OPEN", 9000)
      ],
      [
        sale("sale", "SALE", "ACTIVE", 8000),
        sale("increase", "CORRECTION", "ACTIVE", 1000, "INCREASE_STOCK"),
        sale("decrease", "CORRECTION", "ACTIVE", 2000, "DECREASE_STOCK")
      ]
    );
    const dashboard = buildAggregatedSeasonDashboard({
      activeWorkerCount: 0,
      accruedGrosz: 0,
      confirmedHarvestWeightG: source.confirmedHarvestWeightG,
      inProgressHarvestWeightG: 9000,
      invalidDocumentCounts: {
        payments: 0,
        sales: 0,
        seasons: 0,
        sessions: 0,
        workers: 0
      },
      localSyncSummary: summarizeSyncDocumentMetadata([]),
      openSessionCount: 1,
      paidGrosz: 0,
      period: {
        dateBasis: "BUSINESS_DATE",
        fromDate: "2026-07-01",
        label: "Sezon 2026",
        preset: "SEASON",
        toDate: "2026-09-30"
      },
      reviewRequiredSessionCount: 0,
      saleRevenueGrosz: 0,
      saleWeightG: source.activeSaleWeightG,
      season: seasonDocument(),
      stockDecreaseRevenueGrosz: 0,
      stockDecreaseWeightG: source.correctionDecreaseWeightG,
      stockIncreaseRevenueGrosz: 0,
      stockIncreaseWeightG: source.correctionIncreaseWeightG
    });

    expect(dashboard.metrics.confirmedHarvestWeightG).toBe(
      source.confirmedHarvestWeightG
    );
    expect(dashboard.metrics.soldWeightG).toBe(source.soldWeightG);
    expect(dashboard.metrics.availableWeightG).toBe(source.availableWeightG);
  });
});

function calculate(
  harvestSessions: readonly SourceStockHarvestSession[],
  sales: readonly SourceStockSale[] = []
) {
  return calculateSourceStockForSeason({
    harvestSessions,
    sales,
    seasonId: SEASON_ID
  });
}

function session(
  id: string,
  status: SourceStockHarvestSession["status"],
  totalWeightG: number,
  seasonId = SEASON_ID
): SourceStockHarvestSession {
  return {
    id,
    seasonId,
    status,
    totalWeightG
  };
}

function sale(
  id: string,
  entryType: SourceStockSale["entryType"],
  status: SourceStockSale["status"],
  weightG: number,
  correctionDirection: SourceStockSale["correctionDirection"] = null,
  seasonId = SEASON_ID
): SourceStockSale {
  return {
    correctionDirection,
    entryType,
    id,
    seasonId,
    status,
    weightG
  };
}

function seasonDocument(): SeasonDocument {
  return {
    closedAt: null,
    closedBy: null,
    createdAt: "2026-07-01T00:00:00.000Z",
    createdBy: "admin-1",
    endDate: "2026-09-30",
    id: SEASON_ID,
    isDefault: true,
    name: "Sezon 2026",
    reopenedAt: null,
    startDate: "2026-07-01",
    status: "OPEN"
  };
}
