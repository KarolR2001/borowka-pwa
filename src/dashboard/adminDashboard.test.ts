import { buildAdminDashboard, type AdminDashboardResult } from "./adminDashboard";
import type { SaleDocument } from "../sales/saleStockPreflight";

describe("admin dashboard", () => {
  it("calculates season stock, settlements, revenue and local warnings", () => {
    const result = dashboard();

    expect(result.invalidDocumentCounts).toEqual({
      payments: 0,
      sales: 0,
      seasons: 0,
      sessions: 0,
      workers: 0
    });
    expect(result.seasons).toHaveLength(1);
    expect(result.seasons[0]).toMatchObject({
      id: "season-1",
      metrics: {
        accruedGrosz: 15_000,
        activeWorkerCount: 2,
        availableWeightG: 12_000,
        confirmedHarvestWeightG: 15_000,
        dueGrosz: 10_000,
        inProgressHarvestWeightG: 2000,
        openSessionCount: 1,
        paidGrosz: 5000,
        resultAfterHarvestCostGrosz: -11_250,
        reviewRequiredSessionCount: 1,
        revenueGrosz: 3750,
        soldWeightG: 3000
      },
      warnings: [
        "Biezace urzadzenie ma lokalne zapisy oczekujace: 1.",
        "Synchronizacja wymaga dzialania dla 1 dokumentow."
      ]
    });
    expect(result.localSyncSummary).toMatchObject({
      actionableErrorCount: 1,
      pendingSyncCount: 1
    });
  });

  it("surfaces negative stock, overpayment and invalid sources", () => {
    const result = dashboard({
      paymentDocuments: [
        {
          data: paymentDocument({ amountGrosz: 5000 }),
          id: "payment-1"
        }
      ],
      saleDocuments: [
        { data: saleDocument({ id: "sale-1", weightG: 3000 }), id: "sale-1" },
        { data: { id: "invalid-sale" }, id: "invalid-sale" }
      ],
      sessionDocuments: [
        {
          data: sessionDocument({
            amountDueGrosz: 1000,
            id: "closed-1",
            status: "CLOSED",
            totalWeightG: 1000
          }),
          id: "closed-1"
        }
      ],
      syncDocuments: []
    });

    expect(result.seasons[0]?.warnings).toEqual([
      "Stan dostepnych kilogramow jest ujemny i wymaga korekty.",
      "Wyplacona kwota przekracza naliczenia i wymaga kontroli.",
      "Pominieto nieprawidlowe dokumenty zrodlowe: 1."
    ]);
  });
});

function dashboard(
  overrides: Partial<Parameters<typeof buildAdminDashboard>[0]> = {}
): AdminDashboardResult {
  return buildAdminDashboard({
    paymentDocuments: [{ data: paymentDocument({ amountGrosz: 5000 }), id: "payment-1" }],
    refreshedAtIso: "2026-07-29T08:00:00.000Z",
    saleDocuments: [
      { data: saleDocument({ id: "sale-1", weightG: 4000 }), id: "sale-1" },
      {
        data: saleDocument({
          correctionDirection: "INCREASE_STOCK",
          entryType: "CORRECTION",
          id: "correction-1",
          note: "Zwrot do stanu",
          totalGrosz: 1250,
          weightG: 1000
        }),
        id: "correction-1"
      },
      {
        data: saleDocument({
          cancellationReason: "Bledna masa",
          cancelledAt: "cancelled",
          cancelledBy: "admin-1",
          id: "sale-cancelled",
          status: "CANCELLED",
          totalGrosz: 2500,
          weightG: 2000
        }),
        id: "sale-cancelled"
      }
    ],
    seasonDocuments: [{ data: seasonDocument(), id: "season-1" }],
    sessionDocuments: [
      {
        data: sessionDocument({
          amountDueGrosz: 10_000,
          id: "closed-1",
          status: "CLOSED",
          totalWeightG: 10_000
        }),
        id: "closed-1"
      },
      {
        data: sessionDocument({
          amountDueGrosz: 5000,
          id: "paid-1",
          status: "PAID",
          totalWeightG: 5000
        }),
        id: "paid-1"
      },
      {
        data: sessionDocument({
          amountDueGrosz: null,
          id: "open-1",
          status: "OPEN",
          totalWeightG: 2000
        }),
        id: "open-1"
      },
      {
        data: sessionDocument({
          amountDueGrosz: 1000,
          id: "review-1",
          status: "REVIEW_REQUIRED",
          totalWeightG: 1000
        }),
        id: "review-1"
      }
    ],
    syncDocuments: [
      {
        id: "entry-pending",
        kind: "HARVEST_ENTRY",
        pendingSync: true
      },
      {
        id: "entry-rejected",
        kind: "HARVEST_ENTRY",
        rejectedReason: "Odrzucony zapis"
      }
    ],
    workerDocuments: [
      { data: workerDocument("worker-1", true), id: "worker-1" },
      { data: workerDocument("worker-2", true), id: "worker-2" },
      { data: workerDocument("worker-3", false), id: "worker-3" }
    ],
    ...overrides
  });
}

function seasonDocument() {
  return {
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
  };
}

function sessionDocument({
  amountDueGrosz,
  id,
  status,
  totalWeightG
}: {
  amountDueGrosz: number | null;
  id: string;
  status: "CLOSED" | "OPEN" | "PAID" | "REVIEW_REQUIRED";
  totalWeightG: number;
}) {
  return {
    allowBatchQuantitySnapshot: true,
    amountDueGrosz,
    businessDate: "2026-07-28",
    calculationBasisSnapshot: "WEIGHT",
    calculationVersion: "1",
    cancellationReason: null,
    cancelledAt: null,
    cancelledBy: null,
    closedAtDevice: status === "OPEN" ? null : "closed-device",
    closedAtServer: status === "OPEN" ? null : "closed-server",
    closedBy: status === "OPEN" ? null : "admin-1",
    createdAtDevice: "created-device",
    createdAtServer: "created-server",
    createdBy: "admin-1",
    createdDeviceId: "device-admin",
    id,
    legacyImport: false,
    legacySourceRows: [],
    note: null,
    paidAt: status === "PAID" ? "paid" : null,
    paymentId: status === "PAID" ? "payment-1" : null,
    planIdSnapshot: "plan-1",
    planNameSnapshot: "Za kilogram",
    quantityPrecisionSnapshot: 3,
    rateGroszSnapshot: 1000,
    rateVersionIdSnapshot: "rate-1",
    revision: 1,
    seasonId: "season-1",
    status,
    totalEntryCount: 1,
    totalQuantityMilli: 1000,
    totalWeightG,
    unitLabelPluralSnapshot: "kilogramy",
    unitLabelSnapshot: "kilogram",
    updatedAtServer: "updated",
    weightRequiredSnapshot: true,
    workerId: "worker-1",
    workerNameSnapshot: "Anna"
  };
}

function saleDocument(overrides: Partial<SaleDocument> & { id: string }): SaleDocument {
  const entryType = overrides.entryType ?? "SALE";
  const weightG = overrides.weightG ?? 4000;
  const totalGrosz = overrides.totalGrosz ?? Math.floor((weightG * 1250 + 500) / 1000);

  return {
    businessDate: "2026-07-29",
    calculationVersion: "1",
    cancellationReason: null,
    cancelledAt: null,
    cancelledBy: null,
    correctionDirection: null,
    createdAtServer: "created",
    createdBy: "admin-1",
    creationAttemptId: `attempt-${overrides.id}`,
    entryType,
    legacyImport: false,
    legacySourceRow: null,
    note: entryType === "CORRECTION" ? "Powod korekty" : null,
    priceGroszPerKg: 1250,
    seasonId: "season-1",
    status: "ACTIVE",
    totalGrosz,
    weightG,
    ...overrides
  };
}

function paymentDocument({ amountGrosz }: { amountGrosz: number }) {
  return {
    amountGrosz,
    cancellationReason: null,
    cancelledAt: null,
    cancelledBy: null,
    creationAttemptId: "attempt-payment-1",
    createdAtServer: "created",
    createdBy: "admin-1",
    id: "payment-1",
    legacyImport: false,
    note: null,
    paidBusinessDate: "2026-07-29",
    paymentMethod: "CASH",
    seasonId: "season-1",
    sessionId: "paid-1",
    status: "ACTIVE",
    workerId: "worker-1",
    workerNameSnapshot: "Anna"
  };
}

function workerDocument(id: string, active: boolean) {
  return {
    active,
    archivedAt: active ? null : "archived",
    createdAt: "created",
    createdBy: "admin-1",
    currentPlanId: "plan-1",
    currentRateVersionId: "rate-1",
    displayName: id,
    emailContact: null,
    id,
    legacyName: null,
    linkedUserUid: null,
    normalizedName: id,
    notes: null,
    phone: null,
    updatedAt: "updated"
  };
}
