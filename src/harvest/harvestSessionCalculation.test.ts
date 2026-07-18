import {
  HARVEST_SESSION_CALCULATION_VERSION,
  type HarvestSessionDocument
} from "./openHarvestSession";
import {
  appendActiveHarvestEntryToSessionTotals,
  calculateEntryAmountPreviewGrosz,
  calculateHarvestSessionAmountDueGrosz,
  calculateHarvestSessionTotals,
  calculateRoundedGroszFromMilli,
  type CalculableHarvestEntry
} from "./harvestSessionCalculation";

const weightSession = {
  calculationBasisSnapshot: "WEIGHT",
  rateGroszSnapshot: 1000
} satisfies Pick<
  HarvestSessionDocument,
  "calculationBasisSnapshot" | "rateGroszSnapshot"
>;

const quantitySession = {
  calculationBasisSnapshot: "QUANTITY",
  rateGroszSnapshot: 1500
} satisfies Pick<
  HarvestSessionDocument,
  "calculationBasisSnapshot" | "rateGroszSnapshot"
>;

function activeEntry(
  id: string,
  quantityMilli: number,
  weightG: number | null = quantityMilli
): CalculableHarvestEntry {
  return {
    id,
    status: "ACTIVE",
    quantityMilli,
    weightG
  };
}

function cancelledEntry(
  id: string,
  quantityMilli: number,
  weightG: number | null = quantityMilli
): CalculableHarvestEntry {
  return {
    id,
    status: "CANCELLED",
    quantityMilli,
    weightG
  };
}

describe("harvest session calculation", () => {
  it("covers CALC-001 and CALC-002 for weight sessions", () => {
    expect(
      calculateHarvestSessionTotals({
        session: weightSession,
        entries: [activeEntry("entry-1", 1000), activeEntry("entry-2", 2000)]
      })
    ).toMatchObject({
      calculationVersion: HARVEST_SESSION_CALCULATION_VERSION,
      calculationBasis: "WEIGHT",
      activeEntryCount: 2,
      totalQuantityMilli: 3000,
      totalWeightG: 3000,
      amountDueGrosz: 3000
    });
    expect(
      calculateHarvestSessionTotals({
        session: weightSession,
        entries: [activeEntry("entry-1", 1495), activeEntry("entry-2", 2000)]
      })
    ).toMatchObject({
      totalWeightG: 3495,
      amountDueGrosz: 3495
    });
  });

  it("covers CALC-003 and rounds half grosz up once with integer arithmetic", () => {
    expect(calculateRoundedGroszFromMilli(500, 333)).toBe(167);
    expect(
      calculateHarvestSessionTotals({
        session: {
          ...weightSession,
          rateGroszSnapshot: 333
        },
        entries: [activeEntry("entry-1", 250), activeEntry("entry-2", 250)]
      }).amountDueGrosz
    ).toBe(167);
    expect(
      calculateEntryAmountPreviewGrosz(
        {
          ...weightSession,
          rateGroszSnapshot: 333
        },
        {
          quantityMilli: 500,
          weightG: 500
        }
      )
    ).toBe(167);
  });

  it("covers CALC-004, CALC-005 and CALC-006 for quantity sessions", () => {
    expect(
      calculateHarvestSessionTotals({
        session: quantitySession,
        entries: [activeEntry("entry-1", 1000), activeEntry("entry-2", 2000)]
      })
    ).toMatchObject({
      calculationBasis: "QUANTITY",
      activeEntryCount: 2,
      totalQuantityMilli: 3000,
      amountDueGrosz: 4500
    });
    expect(
      calculateHarvestSessionTotals({
        session: quantitySession,
        entries: [activeEntry("entry-1", 500)]
      }).amountDueGrosz
    ).toBe(750);
    expect(
      calculateHarvestSessionTotals({
        session: quantitySession,
        entries: [activeEntry("entry-1", 3000, 8700)]
      })
    ).toMatchObject({
      totalQuantityMilli: 3000,
      totalWeightG: 8700,
      amountDueGrosz: 4500
    });
  });

  it("covers CALC-007 and CALC-008 by summing only active entries", () => {
    expect(
      calculateHarvestSessionTotals({
        session: weightSession,
        entries: [
          activeEntry("entry-1", 1000),
          activeEntry("entry-2", 1200),
          activeEntry("entry-3", 800),
          cancelledEntry("entry-4", 1000)
        ]
      })
    ).toMatchObject({
      activeEntryCount: 3,
      skippedCancelledEntryCount: 1,
      totalQuantityMilli: 3000,
      totalWeightG: 3000,
      amountDueGrosz: 3000
    });
  });

  it("covers CALC-009 and CALC-010 by using only session rate snapshot", () => {
    const entries = [activeEntry("entry-1", 1000)];

    expect(
      calculateHarvestSessionTotals({
        session: {
          ...weightSession,
          rateGroszSnapshot: 1000
        },
        entries
      }).amountDueGrosz
    ).toBe(1000);
    expect(
      calculateHarvestSessionTotals({
        session: {
          ...weightSession,
          rateGroszSnapshot: 1200
        },
        entries
      }).amountDueGrosz
    ).toBe(1200);
  });

  it("covers CALC-011 and CALC-012 for missing weight", () => {
    expect(
      calculateHarvestSessionTotals({
        session: quantitySession,
        entries: [activeEntry("entry-1", 1000, null)]
      })
    ).toMatchObject({
      totalQuantityMilli: 1000,
      totalWeightG: 0,
      missingWeightEntryCount: 1,
      amountDueGrosz: 1500
    });
    expect(() =>
      calculateHarvestSessionTotals({
        session: weightSession,
        entries: [activeEntry("entry-1", 1000, null)]
      })
    ).toThrow("Plan wagowy wymaga wagi kazdego aktywnego wpisu.");
  });

  it("rounds once at session level instead of summing entry previews", () => {
    const session = {
      calculationBasisSnapshot: "WEIGHT",
      rateGroszSnapshot: 1001
    } satisfies Pick<
      HarvestSessionDocument,
      "calculationBasisSnapshot" | "rateGroszSnapshot"
    >;
    const firstPreview = calculateEntryAmountPreviewGrosz(session, {
      quantityMilli: 333,
      weightG: 333
    });
    const secondPreview = calculateEntryAmountPreviewGrosz(session, {
      quantityMilli: 333,
      weightG: 333
    });

    expect(firstPreview + secondPreview).toBe(666);
    expect(
      calculateHarvestSessionTotals({
        session,
        entries: [activeEntry("entry-1", 333), activeEntry("entry-2", 333)]
      }).amountDueGrosz
    ).toBe(667);
  });

  it("rejects zero session rate because the MVP has no free plan enabled", () => {
    const zeroRateSession = {
      ...weightSession,
      rateGroszSnapshot: 0
    };

    expect(() =>
      calculateHarvestSessionTotals({
        session: zeroRateSession,
        entries: [activeEntry("entry-1", 1000)]
      })
    ).toThrow("Stawka sesji musi byc wieksza od zera.");
    expect(() =>
      calculateEntryAmountPreviewGrosz(zeroRateSession, {
        quantityMilli: 1000,
        weightG: 1000
      })
    ).toThrow("Stawka sesji musi byc wieksza od zera.");
    expect(() =>
      calculateHarvestSessionAmountDueGrosz(zeroRateSession, {
        totalQuantityMilli: 1000,
        totalWeightG: 1000
      })
    ).toThrow("Stawka sesji musi byc wieksza od zera.");
    expect(() => calculateRoundedGroszFromMilli(1000, 0)).toThrow(
      "Stawka sesji musi byc wieksza od zera."
    );
  });

  it("calculates a very large but safe allowed session exactly", () => {
    const entries = Array.from({ length: 1000 }, (_, index) =>
      activeEntry(`entry-${String(index + 1)}`, 9_000_000_000, 9_000_000_000)
    );

    const totals = calculateHarvestSessionTotals({
      session: weightSession,
      entries
    });

    expect(totals).toMatchObject({
      activeEntryCount: 1000,
      totalQuantityMilli: 9_000_000_000_000,
      totalWeightG: 9_000_000_000_000,
      amountDueGrosz: 9_000_000_000_000
    });
    expect(Number.isSafeInteger(totals.amountDueGrosz)).toBe(true);
  });

  it("appends one active entry to existing session totals", () => {
    expect(
      appendActiveHarvestEntryToSessionTotals({
        session: weightSession,
        currentTotals: {
          activeEntryCount: 2,
          totalQuantityMilli: 2500,
          totalWeightG: 2500
        },
        entry: activeEntry("entry-3", 500)
      })
    ).toMatchObject({
      activeEntryCount: 3,
      totalQuantityMilli: 3000,
      totalWeightG: 3000,
      amountDueGrosz: 3000
    });
  });

  it("validates safe numeric ranges and unknown statuses", () => {
    expect(() =>
      calculateHarvestSessionTotals({
        session: weightSession,
        entries: [activeEntry("entry-1", 0, 0)]
      })
    ).toThrow("Ilosc aktywnego wpisu musi byc wieksza od zera.");
    expect(() =>
      calculateHarvestSessionAmountDueGrosz(weightSession, {
        totalQuantityMilli: 0,
        totalWeightG: Number.MAX_SAFE_INTEGER + 1
      })
    ).toThrow("Suma wagi sesji ma nieprawidlowy zakres.");
    expect(() =>
      calculateHarvestSessionTotals({
        session: weightSession,
        entries: [
          {
            ...activeEntry("entry-1", 1000),
            status: "UNKNOWN" as "ACTIVE"
          }
        ]
      })
    ).toThrow("Nieznany status wpisu do obliczen sesji.");
    expect(() =>
      calculateHarvestSessionTotals({
        session: {
          ...weightSession,
          rateGroszSnapshot: Number.MAX_SAFE_INTEGER
        },
        entries: [activeEntry("entry-1", Number.MAX_SAFE_INTEGER)]
      })
    ).toThrow("Kwota sesji przekracza bezpieczny zakres.");
  });
});
