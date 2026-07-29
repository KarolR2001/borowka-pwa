import { describe, expect, it } from "vitest";

import type { HarvestSessionStatus } from "../harvest/harvestSessionState";
import {
  evaluateHarvestSessionStockSource,
  evaluateSaleStockSource
} from "./stockSourceDefinition";

describe("stock source definition", () => {
  it.each(["CLOSED", "PAID"] satisfies HarvestSessionStatus[])(
    "adds totalWeightG from a %s session",
    (status) => {
      expect(
        evaluateHarvestSessionStockSource({
          status,
          totalWeightG: 12_345
        })
      ).toEqual({
        contributionG: 12_345,
        impact: "INCREASE",
        reason: "CONFIRMED_HARVEST"
      });
    }
  );

  it.each(["OPEN", "REVIEW_REQUIRED", "CANCELLED"] satisfies HarvestSessionStatus[])(
    "does not add stock from a %s session",
    (status) => {
      expect(
        evaluateHarvestSessionStockSource({
          status,
          totalWeightG: 12_345
        })
      ).toEqual({
        contributionG: 0,
        impact: "NONE",
        reason: "SESSION_NOT_CONFIRMED"
      });
    }
  );

  it("allows a confirmed session with no weighted entries to contribute zero grams", () => {
    expect(
      evaluateHarvestSessionStockSource({
        status: "CLOSED",
        totalWeightG: 0
      })
    ).toMatchObject({
      contributionG: 0,
      impact: "INCREASE"
    });
  });

  it("rejects an invalid session aggregate", () => {
    expect(() =>
      evaluateHarvestSessionStockSource({
        status: "CLOSED",
        totalWeightG: -1
      })
    ).toThrow("Suma wagi sesji musi byc nieujemna liczba calkowita gramow.");
  });

  it("subtracts an active ordinary sale", () => {
    expect(
      evaluateSaleStockSource({
        entryType: "SALE",
        status: "ACTIVE",
        weightG: 5000
      })
    ).toEqual({
      contributionG: -5000,
      impact: "DECREASE",
      reason: "ACTIVE_SALE"
    });
  });

  it.each(["SALE", "CORRECTION"] as const)(
    "ignores a cancelled %s document",
    (entryType) => {
      expect(
        evaluateSaleStockSource({
          correctionDirection: entryType === "CORRECTION" ? "DECREASE_STOCK" : null,
          entryType,
          status: "CANCELLED",
          weightG: 5000
        })
      ).toEqual({
        contributionG: 0,
        impact: "NONE",
        reason: "SALE_CANCELLED"
      });
    }
  );

  it.each([
    ["INCREASE_STOCK", 5000, "INCREASE"],
    ["DECREASE_STOCK", -5000, "DECREASE"]
  ] as const)(
    "applies an active %s correction explicitly",
    (correctionDirection, contributionG, impact) => {
      expect(
        evaluateSaleStockSource({
          correctionDirection,
          entryType: "CORRECTION",
          status: "ACTIVE",
          weightG: 5000
        })
      ).toEqual({
        contributionG,
        impact,
        reason: "ACTIVE_CORRECTION"
      });
    }
  );

  it.each(["ACTIVE", "CANCELLED"] as const)(
    "requires a direction for a %s correction",
    (status) => {
      expect(() =>
        evaluateSaleStockSource({
          entryType: "CORRECTION",
          status,
          weightG: 5000
        })
      ).toThrow("Korekta sprzedazy wymaga jawnego kierunku wplywu na stan.");
    }
  );

  it.each(["ACTIVE", "CANCELLED"] as const)(
    "rejects a correction direction on a %s ordinary sale",
    (status) => {
      expect(() =>
        evaluateSaleStockSource({
          correctionDirection: "INCREASE_STOCK",
          entryType: "SALE",
          status,
          weightG: 5000
        })
      ).toThrow("Zwykla sprzedaz nie moze miec kierunku korekty.");
    }
  );

  it.each([0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1])(
    "rejects invalid sale weight %s",
    (weightG) => {
      expect(() =>
        evaluateSaleStockSource({
          entryType: "SALE",
          status: "ACTIVE",
          weightG
        })
      ).toThrow("Masa operacji sprzedazy musi byc dodatnia liczba calkowita gramow.");
    }
  );
});
