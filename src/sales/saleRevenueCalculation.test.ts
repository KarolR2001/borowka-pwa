import {
  MAX_SALE_PRICE_GROSZ_PER_KG,
  MAX_SALE_WEIGHT_G,
  SALE_REVENUE_CALCULATION_VERSION,
  SALE_REVENUE_ROUNDING_RULE,
  calculateSaleRevenue
} from "./saleRevenueCalculation";

describe("sale revenue calculation", () => {
  it("calculates full kilograms from integer grams and grosze", () => {
    expect(calculateSaleRevenue({ weightG: 3000, priceGroszPerKg: 1250 })).toEqual({
      calculationVersion: SALE_REVENUE_CALCULATION_VERSION,
      exactNumeratorGroszGram: "3750000",
      priceGroszPerKg: 1250,
      remainderMilliGrosz: 0,
      roundingRule: SALE_REVENUE_ROUNDING_RULE,
      totalGrosz: 3750,
      weightG: 3000,
      wholeGroszBeforeRounding: 3750
    });
  });

  it("rounds exactly half a grosz up", () => {
    expect(calculateSaleRevenue({ weightG: 1, priceGroszPerKg: 499 }).totalGrosz).toBe(0);
    expect(calculateSaleRevenue({ weightG: 1, priceGroszPerKg: 500 })).toMatchObject({
      remainderMilliGrosz: 500,
      totalGrosz: 1,
      wholeGroszBeforeRounding: 0
    });
  });

  it("uses all grams before rounding once to a grosz", () => {
    expect(
      calculateSaleRevenue({ weightG: 12_345, priceGroszPerKg: 1550 })
    ).toMatchObject({
      exactNumeratorGroszGram: "19134750",
      remainderMilliGrosz: 750,
      totalGrosz: 19_135,
      wholeGroszBeforeRounding: 19_134
    });
    expect(calculateSaleRevenue({ weightG: 333, priceGroszPerKg: 1000 }).totalGrosz).toBe(
      333
    );
  });

  it("allows a zero price with an exact zero revenue", () => {
    expect(calculateSaleRevenue({ weightG: 1500, priceGroszPerKg: 0 })).toMatchObject({
      exactNumeratorGroszGram: "0",
      remainderMilliGrosz: 0,
      totalGrosz: 0
    });
  });

  it("rejects invalid input and values exceeding the document limits", () => {
    expect(() => calculateSaleRevenue({ weightG: 0, priceGroszPerKg: 1000 })).toThrow(
      "Masa sprzedazy musi byc dodatnia"
    );
    expect(() => calculateSaleRevenue({ weightG: 1000, priceGroszPerKg: -1 })).toThrow(
      "Cena sprzedazy musi byc nieujemna"
    );
    expect(() =>
      calculateSaleRevenue({
        weightG: MAX_SALE_WEIGHT_G + 1,
        priceGroszPerKg: 1
      })
    ).toThrow("Masa sprzedazy przekracza limit");
    expect(() =>
      calculateSaleRevenue({
        weightG: 1,
        priceGroszPerKg: MAX_SALE_PRICE_GROSZ_PER_KG + 1
      })
    ).toThrow("Cena sprzedazy przekracza limit");
  });
});
