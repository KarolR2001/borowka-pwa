import {
  buildPendingPaymentDirectory,
  defaultPendingPaymentFilters,
  filterPendingPaymentSessions
} from "./pendingPayments";

describe("pending payment directory", () => {
  it("lists oldest eligible sessions and preserves cancelled payment history", () => {
    const result = buildPendingPaymentDirectory({
      isOnline: true,
      sessionDocuments: [
        sessionDocument("session-new", {
          businessDate: "2026-07-20",
          workerId: "worker-b",
          workerNameSnapshot: "Barbara"
        }),
        sessionDocument("session-old", {
          businessDate: "2026-07-18",
          workerId: "worker-a",
          workerNameSnapshot: "Anna"
        })
      ],
      seasonDocuments: [seasonDocument()],
      paymentDocuments: [
        {
          id: "cancelled-session-old",
          data: {
            id: "cancelled-session-old",
            sessionId: "session-old",
            status: "CANCELLED"
          }
        }
      ],
      syncDocuments: []
    });

    expect(result.sessions.map((session) => session.sessionId)).toEqual([
      "session-old",
      "session-new"
    ]);
    expect(result.sessions[0]).toMatchObject({
      paymentHistory: "CANCELLED",
      seasonName: "Sezon 2026",
      syncStatus: "SYNCED"
    });
  });

  it("excludes active payments, missing official amounts and pending documents", () => {
    const result = buildPendingPaymentDirectory({
      isOnline: false,
      sessionDocuments: [
        sessionDocument("session-active"),
        sessionDocument("session-missing", { amountDueGrosz: null }),
        sessionDocument("session-pending")
      ],
      seasonDocuments: [seasonDocument()],
      paymentDocuments: [
        {
          id: "session-active",
          data: {
            id: "session-active",
            sessionId: "session-active",
            status: "ACTIVE"
          }
        }
      ],
      syncDocuments: [
        {
          id: "entry-pending",
          kind: "HARVEST_ENTRY",
          pendingSync: true,
          sessionId: "session-pending"
        }
      ]
    });

    expect(result.sessions).toEqual([]);
    expect(result.excluded).toEqual({
      activePaymentCount: 1,
      missingAmountCount: 1,
      pendingSynchronizationCount: 1
    });
  });

  it("filters by season, worker, plan, date and amount", () => {
    const result = buildPendingPaymentDirectory({
      isOnline: true,
      sessionDocuments: [
        sessionDocument("session-a", {
          amountDueGrosz: 10_000,
          businessDate: "2026-07-18"
        }),
        sessionDocument("session-b", {
          amountDueGrosz: 20_000,
          businessDate: "2026-07-20",
          planIdSnapshot: "plan-b",
          workerId: "worker-b"
        })
      ],
      seasonDocuments: [seasonDocument()],
      paymentDocuments: [],
      syncDocuments: []
    });

    expect(
      filterPendingPaymentSessions(result.sessions, {
        ...defaultPendingPaymentFilters,
        fromDate: "2026-07-19",
        maxAmountGrosz: 25_000,
        minAmountGrosz: 15_000,
        planId: "plan-b",
        seasonId: "season-2026",
        toDate: "2026-07-21",
        workerId: "worker-b"
      }).map((session) => session.sessionId)
    ).toEqual(["session-b"]);
  });
});

function sessionDocument(id: string, overrides: Record<string, unknown> = {}) {
  return {
    id,
    data: {
      id,
      seasonId: "season-2026",
      workerId: "worker-a",
      workerNameSnapshot: "Anna",
      businessDate: "2026-07-18",
      status: "CLOSED",
      planIdSnapshot: "plan-a",
      planNameSnapshot: "Za kilogram",
      calculationBasisSnapshot: "WEIGHT",
      unitLabelSnapshot: "kilogram",
      unitLabelPluralSnapshot: "kilogramy",
      rateVersionIdSnapshot: "rate-a",
      rateGroszSnapshot: 1000,
      weightRequiredSnapshot: true,
      quantityPrecisionSnapshot: 3,
      allowBatchQuantitySnapshot: true,
      totalEntryCount: 2,
      totalQuantityMilli: 2000,
      totalWeightG: 5000,
      amountDueGrosz: 5000,
      calculationVersion: "1",
      note: null,
      createdBy: "operator-1",
      createdDeviceId: "device-1",
      createdAtDevice: null,
      createdAtServer: null,
      updatedAtServer: null,
      closedAtDevice: "2026-07-18T12:00:00.000Z",
      closedAtServer: "2026-07-18T12:01:00.000Z",
      closedBy: "operator-1",
      paidAt: null,
      paymentId: null,
      cancelledAt: null,
      cancelledBy: null,
      cancellationReason: null,
      revision: 2,
      legacyImport: false,
      legacySourceRows: [],
      ...overrides
    }
  };
}

function seasonDocument() {
  return {
    id: "season-2026",
    data: {
      id: "season-2026",
      name: "Sezon 2026",
      startDate: "2026-07-01",
      endDate: "2026-09-30",
      status: "OPEN",
      isDefault: true,
      createdAt: null,
      createdBy: "admin-1",
      closedAt: null,
      closedBy: null,
      reopenedAt: null
    }
  };
}
