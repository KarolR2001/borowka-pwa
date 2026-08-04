import type { HarvestSessionDocument } from "../harvest/openHarvestSession";
import {
  calculateLocalDashboardProjection,
  clearDashboardSnapshots,
  loadDashboardSnapshot,
  saveDashboardSnapshot
} from "./dashboardOfflineState";

describe("dashboard offline state", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("isolates versioned snapshots by role and user", () => {
    saveDashboardSnapshot({
      kind: "ADMIN",
      ownerUid: "admin-1",
      payload: { availableWeightG: 12_000 },
      savedAtIso: "2026-08-04T10:00:00.000Z"
    });

    expect(
      loadDashboardSnapshot({
        isPayload: isStockPayload,
        kind: "ADMIN",
        ownerUid: "admin-1"
      })
    ).toEqual({
      payload: { availableWeightG: 12_000 },
      savedAtIso: "2026-08-04T10:00:00.000Z"
    });
    expect(
      loadDashboardSnapshot({
        isPayload: isStockPayload,
        kind: "OPERATOR",
        ownerUid: "admin-1"
      })
    ).toBeNull();
    expect(
      loadDashboardSnapshot({
        isPayload: isStockPayload,
        kind: "ADMIN",
        ownerUid: "admin-2"
      })
    ).toBeNull();
  });

  it("adds only valid pending confirmed sessions from the selected scope", () => {
    const closed = session({ id: "closed-1", status: "CLOSED", totalWeightG: 4000 });
    const result = calculateLocalDashboardProjection({
      officialAvailableWeightG: 10_000,
      period: { fromDate: "2026-08-01", toDate: "2026-08-04" },
      seasonId: "season-1",
      syncDocuments: [
        syncDocument(closed),
        syncDocument(session({ id: "open-1", status: "OPEN", totalWeightG: 1000 })),
        syncDocument(
          session({ id: "other-season", seasonId: "season-2", status: "CLOSED" })
        ),
        syncDocument(session({ businessDate: "2026-07-31", id: "outside" })),
        { ...syncDocument(closed), pendingSync: false, savedLocally: false }
      ]
    });

    expect(result).toEqual({
      pendingConfirmedSessionCount: 1,
      pendingConfirmedWeightG: 4000,
      pendingSessionCount: 2,
      projectedAvailableWeightG: 14_000
    });
  });

  it("clears both role snapshots only for the selected user", () => {
    for (const kind of ["ADMIN", "OPERATOR"] as const) {
      saveDashboardSnapshot({
        kind,
        ownerUid: "user-1",
        payload: { availableWeightG: 1 }
      });
      saveDashboardSnapshot({
        kind,
        ownerUid: "user-2",
        payload: { availableWeightG: 2 }
      });
    }

    clearDashboardSnapshots({ ownerUid: "user-1" });

    expect(readStockSnapshot("ADMIN", "user-1")).toBeNull();
    expect(readStockSnapshot("OPERATOR", "user-1")).toBeNull();
    expect(readStockSnapshot("ADMIN", "user-2")?.payload.availableWeightG).toBe(2);
    expect(readStockSnapshot("OPERATOR", "user-2")?.payload.availableWeightG).toBe(2);
  });
});

function readStockSnapshot(kind: "ADMIN" | "OPERATOR", ownerUid: string) {
  return loadDashboardSnapshot({ isPayload: isStockPayload, kind, ownerUid });
}

function isStockPayload(value: unknown): value is { availableWeightG: number } {
  return (
    typeof value === "object" &&
    value !== null &&
    "availableWeightG" in value &&
    typeof value.availableWeightG === "number"
  );
}

function syncDocument(sessionDocument: HarvestSessionDocument) {
  return {
    id: sessionDocument.id,
    kind: "HARVEST_SESSION" as const,
    localSnapshot: sessionDocument,
    pendingSync: true,
    savedLocally: true
  };
}

function session(
  overrides: Partial<HarvestSessionDocument> & { id: string }
): HarvestSessionDocument {
  const { id, ...sessionOverrides } = overrides;

  return {
    allowBatchQuantitySnapshot: true,
    amountDueGrosz: overrides.status === "OPEN" ? null : 1000,
    businessDate: "2026-08-04",
    calculationBasisSnapshot: "WEIGHT",
    calculationVersion: "1",
    cancellationReason: null,
    cancelledAt: null,
    cancelledBy: null,
    closedAtDevice: "closed-device",
    closedAtServer: null,
    closedBy: "operator-1",
    createdAtDevice: "created-device",
    createdAtServer: null,
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
    totalWeightG: 1000,
    unitLabelPluralSnapshot: "kilogramy",
    unitLabelSnapshot: "kilogram",
    updatedAtServer: null,
    weightRequiredSnapshot: true,
    workerId: "worker-1",
    workerNameSnapshot: "Zbieracz A",
    ...sessionOverrides
  };
}
