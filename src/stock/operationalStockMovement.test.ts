import type { HarvestSessionDocument } from "../harvest/openHarvestSession";
import type { SaleDocument } from "../sales/saleStockPreflight";
import {
  calculateOperationalStock,
  createHarvestSessionStockMovement,
  createSaleStockMovement,
  decodeOperationalStockMovement,
  operationalStockMovementId
} from "./operationalStockMovement";

describe("operational stock movements", () => {
  it("projects confirmed harvest without exposing settlement fields", () => {
    const movement = createHarvestSessionStockMovement({
      actorUid: "operator-1",
      session: harvestSession({ status: "CLOSED", totalWeightG: 12_500 }),
      updatedAt: "server-time"
    });

    expect(movement).toEqual({
      id: "harvest-session-session-1",
      seasonId: "season-1",
      sourceId: "session-1",
      sourceType: "HARVEST_SESSION",
      updatedAt: "server-time",
      updatedBy: "operator-1",
      weightImpactG: 12_500
    });
    expect(movement).not.toHaveProperty("amountDueGrosz");
    expect(movement).not.toHaveProperty("rateGroszSnapshot");
  });

  it.each([
    ["OPEN", 0],
    ["REVIEW_REQUIRED", 0],
    ["CANCELLED", 0],
    ["CLOSED", 12_500],
    ["PAID", 12_500]
  ] as const)("maps a %s harvest session to %i grams", (status, expected) => {
    expect(
      createHarvestSessionStockMovement({
        actorUid: "operator-1",
        session: harvestSession({ status }),
        updatedAt: "server-time"
      }).weightImpactG
    ).toBe(expected);
  });

  it.each([
    ["SALE", null, "ACTIVE", -3000],
    ["CORRECTION", "INCREASE_STOCK", "ACTIVE", 3000],
    ["CORRECTION", "DECREASE_STOCK", "ACTIVE", -3000],
    ["SALE", null, "CANCELLED", 0]
  ] as const)(
    "maps %s/%s/%s sale source to %i grams",
    (entryType, correctionDirection, status, expected) => {
      expect(
        createSaleStockMovement({
          actorUid: "admin-1",
          sale: saleDocument({ correctionDirection, entryType, status }),
          updatedAt: "server-time"
        }).weightImpactG
      ).toBe(expected);
    }
  );

  it("sums only movements from the selected season", () => {
    const movements = [
      createHarvestSessionStockMovement({
        actorUid: "operator-1",
        session: harvestSession({}),
        updatedAt: "time-1"
      }),
      createSaleStockMovement({
        actorUid: "admin-1",
        sale: saleDocument({}),
        updatedAt: "time-2"
      }),
      {
        ...createHarvestSessionStockMovement({
          actorUid: "operator-1",
          session: harvestSession({ id: "session-2" }),
          updatedAt: "time-3"
        }),
        seasonId: "season-2"
      }
    ];

    expect(calculateOperationalStock(movements, "season-1")).toEqual({
      availableWeightG: 9500,
      movementCount: 2,
      seasonId: "season-1"
    });
  });

  it("rejects duplicate movements and unsafe totals", () => {
    const movement = createHarvestSessionStockMovement({
      actorUid: "operator-1",
      session: harvestSession({}),
      updatedAt: "server-time"
    });

    expect(() => calculateOperationalStock([movement, movement], "season-1")).toThrow(
      "zduplikowany ruch"
    );
    expect(() =>
      calculateOperationalStock(
        [
          { ...movement, weightImpactG: Number.MAX_SAFE_INTEGER },
          {
            ...movement,
            id: "harvest-session-session-2",
            sourceId: "session-2",
            weightImpactG: 1
          }
        ],
        "season-1"
      )
    ).toThrow("bezpieczny zakres");
  });

  it("decodes only complete documents with a deterministic id", () => {
    const movement = createSaleStockMovement({
      actorUid: "admin-1",
      sale: saleDocument({}),
      updatedAt: "server-time"
    });

    expect(decodeOperationalStockMovement(movement.id, movement)).toEqual(movement);
    expect(
      decodeOperationalStockMovement("sale-other", {
        ...movement,
        id: "sale-other"
      })
    ).toBeNull();
    expect(
      decodeOperationalStockMovement(movement.id, {
        ...movement,
        weightImpactG: Number.MAX_SAFE_INTEGER + 1
      })
    ).toBeNull();
  });

  it("creates stable source ids", () => {
    expect(operationalStockMovementId("HARVEST_SESSION", "session-1")).toBe(
      "harvest-session-session-1"
    );
    expect(operationalStockMovementId("SALE", "sale-1")).toBe("sale-sale-1");
  });
});

function harvestSession(
  overrides: Partial<HarvestSessionDocument>
): HarvestSessionDocument {
  return {
    allowBatchQuantitySnapshot: true,
    amountDueGrosz: 12_500,
    businessDate: "2026-07-29",
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
    id: "session-1",
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
    revision: 2,
    seasonId: "season-1",
    status: "CLOSED",
    totalEntryCount: 1,
    totalQuantityMilli: 1000,
    totalWeightG: 12_500,
    unitLabelPluralSnapshot: "kilogramy",
    unitLabelSnapshot: "kilogram",
    updatedAtServer: "server-time",
    weightRequiredSnapshot: true,
    workerId: "worker-1",
    workerNameSnapshot: "Anna",
    ...overrides
  };
}

function saleDocument(overrides: Partial<SaleDocument>): SaleDocument {
  return {
    businessDate: "2026-07-29",
    calculationVersion: "1",
    cancellationReason: null,
    cancelledAt: null,
    cancelledBy: null,
    correctionDirection: null,
    createdAtServer: "server-time",
    createdBy: "admin-1",
    creationAttemptId: "attempt-1",
    entryType: "SALE",
    id: "sale-1",
    legacyImport: false,
    legacySourceRow: null,
    note: "Odbiorca",
    priceGroszPerKg: 1250,
    seasonId: "season-1",
    status: "ACTIVE",
    totalGrosz: 3750,
    weightG: 3000,
    ...overrides
  };
}
