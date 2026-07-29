import {
  activeSaleRevenueImpact,
  buildAdminSaleDirectory,
  defaultSaleDirectoryFilters,
  filterAdminSales,
  summarizeAdminSales
} from "./saleDirectory";
import type { SaleDocument } from "./saleStockPreflight";

describe("sale directory", () => {
  it("decodes, enriches and sorts all valid historical operations", () => {
    const result = directory();

    expect(result).toMatchObject({
      invalidSaleCount: 1,
      invalidSeasonCount: 0,
      invalidUserCount: 0
    });
    expect(result.sales.map((sale) => sale.id)).toEqual([
      "sale-cancelled",
      "correction-decrease",
      "correction-increase",
      "sale-active"
    ]);
    expect(result.sales[0]).toMatchObject({
      authorName: "Administrator",
      cancellationReason: "Bledna masa",
      cancelledAtIso: "2026-07-30T10:00:00.000Z",
      cancelledByName: "Administrator",
      seasonName: "Sezon 2026"
    });
  });

  it("filters by season, date, type, status and author", () => {
    const sales = directory().sales;

    expect(
      filterAdminSales(sales, {
        ...defaultSaleDirectoryFilters,
        authorUid: "admin-1",
        entryType: "CORRECTION",
        fromDate: "2026-07-28",
        seasonId: "season-1",
        status: "ACTIVE",
        toDate: "2026-07-29"
      }).map((sale) => sale.id)
    ).toEqual(["correction-decrease", "correction-increase"]);
    expect(
      filterAdminSales(sales, {
        ...defaultSaleDirectoryFilters,
        status: "CANCELLED"
      }).map((sale) => sale.id)
    ).toEqual(["sale-cancelled"]);
  });

  it("sums only active revenue with correction direction signs", () => {
    const sales = directory().sales;

    expect(summarizeAdminSales(sales)).toEqual({
      activeCount: 3,
      activeRevenueGrosz: 5000,
      cancelledCount: 1,
      correctionCount: 2,
      importedCount: 1,
      ordinarySaleCount: 2,
      totalCount: 4
    });
    expect(activeSaleRevenueImpact(sales[0])).toBe(0);
  });
});

function directory() {
  return buildAdminSaleDirectory({
    saleDocuments: [
      { data: saleDocument({ id: "sale-active" }), id: "sale-active" },
      {
        data: saleDocument({
          businessDate: "2026-07-28",
          correctionDirection: "INCREASE_STOCK",
          entryType: "CORRECTION",
          id: "correction-increase",
          note: "Zwrot do stanu",
          totalGrosz: 1250,
          weightG: 1000
        }),
        id: "correction-increase"
      },
      {
        data: saleDocument({
          businessDate: "2026-07-29",
          correctionDirection: "DECREASE_STOCK",
          entryType: "CORRECTION",
          id: "correction-decrease",
          legacyImport: true,
          note: "Dodatkowy rozchod",
          totalGrosz: 2500,
          weightG: 2000
        }),
        id: "correction-decrease"
      },
      {
        data: saleDocument({
          businessDate: "2026-07-30",
          cancellationReason: "Bledna masa",
          cancelledAt: "2026-07-30T10:00:00.000Z",
          cancelledBy: "admin-1",
          id: "sale-cancelled",
          status: "CANCELLED"
        }),
        id: "sale-cancelled"
      },
      { data: { id: "invalid" }, id: "invalid" }
    ],
    seasonDocuments: [
      {
        data: {
          closedAt: null,
          closedBy: null,
          createdAt: "created",
          createdBy: "admin-1",
          endDate: "2026-09-30",
          id: "season-1",
          isDefault: true,
          name: "Sezon 2026",
          reopenedAt: null,
          startDate: "2026-07-01",
          status: "OPEN"
        },
        id: "season-1"
      }
    ],
    userDocuments: [
      {
        data: {
          active: true,
          displayName: "Administrator",
          email: "admin@example.test",
          offlineConsent: false,
          registrationStatus: "APPROVED",
          role: "ADMIN",
          uid: "admin-1",
          workerId: null
        },
        id: "admin-1"
      }
    ]
  });
}

function saleDocument(overrides: Partial<SaleDocument> & { id: string }): SaleDocument {
  const entryType = overrides.entryType ?? "SALE";

  return {
    businessDate: "2026-07-27",
    calculationVersion: "1",
    cancellationReason: null,
    cancelledAt: null,
    cancelledBy: null,
    correctionDirection: null,
    createdAtServer: `${overrides.businessDate ?? "2026-07-27"}T08:00:00.000Z`,
    createdBy: "admin-1",
    creationAttemptId: `attempt-${overrides.id}`,
    entryType,
    legacyImport: false,
    legacySourceRow: null,
    note: entryType === "CORRECTION" ? "Powod korekty" : "Odbiorca A",
    priceGroszPerKg: 1250,
    seasonId: "season-1",
    status: "ACTIVE",
    totalGrosz: 3750,
    weightG: 3000,
    ...overrides
  };
}
