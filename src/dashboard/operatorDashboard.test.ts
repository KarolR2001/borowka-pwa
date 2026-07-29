import type { HarvestSessionDocument } from "../harvest/openHarvestSession";
import {
  buildOperatorDashboard,
  type OperatorDashboardResult
} from "./operatorDashboard";

describe("operator dashboard", () => {
  it("builds a non-financial operational summary for the current operator", () => {
    const result = dashboard();

    expect(result).toMatchObject({
      activeSeason: {
        id: "season-1",
        name: "Sezon 2026"
      },
      connection: "ONLINE",
      metrics: {
        availableWeightG: 9000,
        closedTodayCount: 1,
        conflictCount: 1,
        localPendingCount: 2,
        openSessionCount: 2,
        ownOpenSessionCount: 1
      },
      stock: {
        dataSource: "SERVER",
        invalidMovementCount: 0,
        movementCount: 2,
        pendingMovementCount: 0
      }
    });
    expect(result.openSessions.map((session) => session.id)).toEqual([
      "session-own-open",
      "session-other-open"
    ]);
    expect(result.ownRecentSessions.map((session) => session.id)).toEqual([
      "session-own-open",
      "session-own-closed"
    ]);
    expect(result.conflicts).toEqual([
      {
        detail: "Operacja wymaga sprawdzenia w centrum synchronizacji.",
        id: "conflict-1",
        label: "Odrzucony"
      }
    ]);
    expect(JSON.stringify(result)).not.toContain("rateGroszSnapshot");
    expect(JSON.stringify(result)).not.toContain("amountDueGrosz");
    expect(JSON.stringify(result)).not.toContain("priceGroszPerKg");
    expect(JSON.stringify(result)).not.toContain("revenue");
  });

  it("marks cached or invalid stock without inventing a confirmed value", () => {
    const result = dashboard({
      isOnline: false,
      movementDocuments: [
        {
          data: {
            id: "sale-sale-1",
            seasonId: "season-1",
            sourceId: "sale-1",
            sourceType: "SALE",
            updatedAt: "server-time",
            updatedBy: "admin-1",
            weightImpactG: "bad"
          },
          id: "sale-sale-1"
        }
      ],
      movementFromCache: true,
      syncDocuments: []
    });

    expect(result.connection).toBe("OFFLINE");
    expect(result.metrics.availableWeightG).toBeNull();
    expect(result.stock).toMatchObject({
      dataSource: "CACHE",
      invalidMovementCount: 1
    });
  });

  it("returns unavailable stock when there is no active season", () => {
    const result = dashboard({
      movementDocuments: [],
      seasonDocuments: []
    });

    expect(result.activeSeason).toBeNull();
    expect(result.metrics.availableWeightG).toBeNull();
    expect(result.stock.dataSource).toBe("UNAVAILABLE");
  });
});

function dashboard(
  overrides: Partial<Parameters<typeof buildOperatorDashboard>[0]> = {}
): OperatorDashboardResult {
  return buildOperatorDashboard({
    actorUid: "operator-1",
    businessDate: "2026-07-29",
    isOnline: true,
    movementDocuments: [
      {
        data: movement("harvest-session-session-own-closed", 12_000, {
          sourceId: "session-own-closed",
          sourceType: "HARVEST_SESSION"
        }),
        id: "harvest-session-session-own-closed"
      },
      {
        data: movement("sale-sale-1", -3000, {
          sourceId: "sale-1",
          sourceType: "SALE"
        }),
        id: "sale-sale-1"
      }
    ],
    movementFromCache: false,
    openSessionDocuments: [
      {
        data: session({
          createdAtServer: "2026-07-29T08:00:00.000Z",
          id: "session-own-open"
        }),
        id: "session-own-open"
      },
      {
        data: session({
          createdAtServer: "2026-07-29T07:00:00.000Z",
          createdBy: "operator-2",
          id: "session-other-open",
          workerId: "worker-2",
          workerNameSnapshot: "Bartek"
        }),
        id: "session-other-open"
      }
    ],
    ownSessionDocuments: [
      {
        data: session({
          createdAtServer: "2026-07-29T08:00:00.000Z",
          id: "session-own-open"
        }),
        id: "session-own-open"
      },
      {
        data: session({
          createdAtServer: "2026-07-29T06:00:00.000Z",
          id: "session-own-closed",
          status: "CLOSED",
          totalWeightG: 12_000
        }),
        id: "session-own-closed"
      }
    ],
    refreshedAtIso: "2026-07-29T09:00:00.000Z",
    seasonDocuments: [
      {
        data: season(),
        id: "season-1"
      }
    ],
    syncDocuments: [
      {
        id: "pending-1",
        kind: "HARVEST_ENTRY",
        pendingSync: true
      },
      {
        id: "local-1",
        kind: "HARVEST_SESSION",
        savedLocally: true
      },
      {
        id: "conflict-1",
        kind: "HARVEST_SESSION",
        rejectedReason: "rateGroszSnapshot=1000; amountDueGrosz=5000"
      }
    ],
    ...overrides
  });
}

function movement(
  id: string,
  weightImpactG: number,
  source: {
    sourceId: string;
    sourceType: "HARVEST_SESSION" | "SALE";
  }
) {
  return {
    id,
    seasonId: "season-1",
    ...source,
    updatedAt: "server-time",
    updatedBy: "admin-1",
    weightImpactG
  };
}

function season() {
  return {
    closedAt: null,
    closedBy: null,
    createdAt: "server-time",
    createdBy: "admin-1",
    endDate: "2026-09-30",
    id: "season-1",
    isDefault: true,
    name: "Sezon 2026",
    reopenedAt: null,
    startDate: "2026-07-01",
    status: "OPEN"
  };
}

function session(overrides: Partial<HarvestSessionDocument>): HarvestSessionDocument {
  return {
    allowBatchQuantitySnapshot: true,
    amountDueGrosz: null,
    businessDate: "2026-07-29",
    calculationBasisSnapshot: "WEIGHT",
    calculationVersion: "1",
    cancellationReason: null,
    cancelledAt: null,
    cancelledBy: null,
    closedAtDevice: null,
    closedAtServer: null,
    closedBy: null,
    createdAtDevice: "device-time",
    createdAtServer: "server-time",
    createdBy: "operator-1",
    createdDeviceId: "device-1",
    id: "session-own-open",
    legacyImport: false,
    legacySourceRows: [],
    note: null,
    paidAt: null,
    paymentId: null,
    planIdSnapshot: "plan-1",
    planNameSnapshot: "Za kilogram",
    quantityPrecisionSnapshot: 3,
    rateGroszSnapshot: 1000,
    rateVersionIdSnapshot: "rate-1",
    revision: 1,
    seasonId: "season-1",
    status: "OPEN",
    totalEntryCount: 0,
    totalQuantityMilli: 0,
    totalWeightG: 0,
    unitLabelPluralSnapshot: "kilogramy",
    unitLabelSnapshot: "kilogram",
    updatedAtServer: null,
    weightRequiredSnapshot: true,
    workerId: "worker-1",
    workerNameSnapshot: "Anna",
    ...overrides
  };
}
