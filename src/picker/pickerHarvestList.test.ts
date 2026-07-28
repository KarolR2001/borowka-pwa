import type { UserProfile } from "../domain/identity";
import {
  buildPickerHarvestList,
  defaultPickerHarvestFilters,
  filterPickerHarvestItems,
  loadPickerHarvestList
} from "./pickerHarvestList";

const pickerProfile: UserProfile = {
  active: true,
  displayName: "Anna Konto",
  email: "anna@example.test",
  offlineConsent: true,
  registrationStatus: "APPROVED",
  role: "PICKER",
  uid: "picker-anna",
  workerId: "worker-anna"
};

describe("picker harvest list", () => {
  it("builds newest-first own sessions with season and meaningful sync state", () => {
    const result = buildPickerHarvestList({
      actorProfile: pickerProfile,
      dataSource: "CACHE",
      refreshedAtIso: "2026-07-29T08:00:00.000Z",
      seasonDocuments: [
        seasonDocument("season-2026", "Sezon 2026", "2026-07-01"),
        seasonDocument("season-2025", "Sezon 2025", "2025-07-01")
      ],
      sessionDocuments: [
        sessionDocument("session-closed", {
          amountDueGrosz: 5000,
          businessDate: "2026-07-27",
          status: "CLOSED"
        }),
        sessionDocument("session-paid", {
          amountDueGrosz: 7000,
          businessDate: "2026-07-28",
          status: "PAID"
        }),
        sessionDocument("session-open", {
          businessDate: "2026-07-29",
          status: "OPEN"
        }),
        sessionDocument("foreign-session", {
          workerId: "worker-other"
        }),
        { id: "broken-session", data: { id: "broken-session" } }
      ],
      syncDocuments: [
        {
          id: "entry-local",
          kind: "HARVEST_ENTRY",
          pendingSync: true,
          sessionId: "session-open"
        },
        {
          id: "session-paid",
          kind: "HARVEST_SESSION",
          pendingSync: false
        }
      ]
    });

    expect(result).toMatchObject({
      dataSource: "CACHE",
      invalidSeasonCount: 0,
      invalidSessionCount: 2,
      refreshedAtIso: "2026-07-29T08:00:00.000Z"
    });
    expect(result.items.map((item) => item.sessionId)).toEqual([
      "session-open",
      "session-paid",
      "session-closed"
    ]);
    expect(result.items[0]).toMatchObject({
      seasonName: "Sezon 2026",
      status: "OPEN",
      syncIssue: "Oczekuje synchronizacji"
    });
    expect(result.items[1]?.syncIssue).toBeNull();
  });

  it("filters by season, date range and every session status", () => {
    const items = buildPickerHarvestList({
      actorProfile: pickerProfile,
      dataSource: "SERVER",
      refreshedAtIso: "2026-07-29T08:00:00.000Z",
      seasonDocuments: [
        seasonDocument("season-2026", "Sezon 2026", "2026-07-01"),
        seasonDocument("season-2025", "Sezon 2025", "2025-07-01")
      ],
      sessionDocuments: [
        sessionDocument("open", { businessDate: "2026-07-29", status: "OPEN" }),
        sessionDocument("closed", {
          businessDate: "2026-07-28",
          status: "CLOSED"
        }),
        sessionDocument("paid", { businessDate: "2026-07-27", status: "PAID" }),
        sessionDocument("cancelled", {
          businessDate: "2026-07-26",
          status: "CANCELLED"
        }),
        sessionDocument("review", {
          businessDate: "2026-07-25",
          status: "REVIEW_REQUIRED"
        }),
        sessionDocument("old", {
          businessDate: "2025-07-20",
          seasonId: "season-2025",
          status: "PAID"
        })
      ],
      syncDocuments: []
    }).items;

    expect(
      filterPickerHarvestItems(items, {
        fromDate: "2026-07-26",
        seasonId: "season-2026",
        status: "CANCELLED",
        toDate: "2026-07-28"
      }).map((item) => item.sessionId)
    ).toEqual(["cancelled"]);
    expect(
      filterPickerHarvestItems(items, {
        ...defaultPickerHarvestFilters,
        status: "REVIEW_REQUIRED"
      }).map((item) => item.sessionId)
    ).toEqual(["review"]);
    expect(
      filterPickerHarvestItems(items, {
        ...defaultPickerHarvestFilters,
        fromDate: "2026-07-30",
        toDate: "2026-07-01"
      })
    ).toEqual([]);
  });

  it("rejects a non-picker before initializing Firebase", async () => {
    await expect(
      loadPickerHarvestList(
        {},
        {
          actorProfile: { ...pickerProfile, role: "OPERATOR", workerId: null },
          isOnline: true,
          syncDocuments: []
        }
      )
    ).rejects.toThrow("Moje zbiory wymagaja aktywnego profilu pickera z workerId.");
  });
});

function seasonDocument(id: string, name: string, startDate: string) {
  return {
    id,
    data: {
      closedAt: null,
      closedBy: null,
      createdAt: "created-at",
      createdBy: "admin-1",
      endDate: null,
      id,
      isDefault: id === "season-2026",
      name,
      reopenedAt: null,
      startDate,
      status: id === "season-2026" ? "OPEN" : "CLOSED"
    }
  };
}

function sessionDocument(id: string, overrides: Record<string, unknown> = {}) {
  return {
    id,
    data: {
      allowBatchQuantitySnapshot: true,
      amountDueGrosz: null,
      businessDate: "2026-07-29",
      calculationBasisSnapshot: "QUANTITY",
      calculationVersion: "1",
      cancellationReason: null,
      cancelledAt: null,
      cancelledBy: null,
      closedAtDevice: null,
      closedAtServer: null,
      closedBy: null,
      createdAtDevice: "2026-07-29T08:00:00.000Z",
      createdAtServer: "2026-07-29T08:00:01.000Z",
      createdBy: "operator-1",
      createdDeviceId: "device-1",
      id,
      legacyImport: false,
      legacySourceRows: [],
      note: null,
      paidAt: null,
      paymentId: null,
      planIdSnapshot: "plan-ubianka",
      planNameSnapshot: "Za ubianke",
      quantityPrecisionSnapshot: 1,
      rateGroszSnapshot: 1500,
      rateVersionIdSnapshot: "rate-1",
      revision: 1,
      seasonId: "season-2026",
      status: "OPEN",
      totalEntryCount: 2,
      totalQuantityMilli: 2000,
      totalWeightG: 8000,
      unitLabelPluralSnapshot: "ubianki",
      unitLabelSnapshot: "ubianka",
      updatedAtServer: null,
      weightRequiredSnapshot: false,
      workerId: "worker-anna",
      workerNameSnapshot: "Anna Zbieracz",
      ...overrides
    }
  };
}
