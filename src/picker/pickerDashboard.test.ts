import type { UserProfile } from "../domain/identity";
import { buildPickerDashboard, loadPickerDashboard } from "./pickerDashboard";

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

const secondPickerProfile: UserProfile = {
  ...pickerProfile,
  displayName: "Bartek Konto",
  email: "bartek@example.test",
  uid: "picker-bartek",
  workerId: "worker-bartek"
};

describe("picker dashboard", () => {
  it("summarizes only the picker's selected season and active payments", () => {
    const result = buildPickerDashboard({
      actorProfile: pickerProfile,
      dataSource: "SERVER",
      paymentDocuments: [
        paymentDocument("payment-active", { amountGrosz: 2250 }),
        paymentDocument("payment-cancelled", {
          amountGrosz: 4500,
          status: "CANCELLED"
        }),
        paymentDocument("payment-other-season", {
          amountGrosz: 1000,
          seasonId: "season-2025"
        })
      ],
      refreshedAtIso: "2026-07-28T18:30:00.000Z",
      seasonDocuments: [
        seasonDocument("season-2026", { isDefault: true }),
        seasonDocument("season-2025", {
          name: "Sezon 2025",
          startDate: "2025-07-01",
          status: "CLOSED"
        })
      ],
      sessionDocuments: [
        sessionDocument("session-open", {
          amountDueGrosz: null,
          status: "OPEN",
          totalQuantityMilli: 2500,
          totalWeightG: 2500
        }),
        sessionDocument("session-closed", {
          amountDueGrosz: 4500,
          calculationBasisSnapshot: "QUANTITY",
          planIdSnapshot: "plan-ubianka",
          planNameSnapshot: "Za ubianke",
          quantityPrecisionSnapshot: 1,
          status: "CLOSED",
          totalQuantityMilli: 3000,
          totalWeightG: 12_000,
          unitLabelPluralSnapshot: "ubianki"
        }),
        sessionDocument("session-paid", {
          amountDueGrosz: 2250,
          calculationBasisSnapshot: "QUANTITY",
          planIdSnapshot: "plan-ubianka",
          planNameSnapshot: "Za ubianke",
          quantityPrecisionSnapshot: 1,
          status: "PAID",
          totalQuantityMilli: 1500,
          totalWeightG: 5000,
          unitLabelPluralSnapshot: "ubianki"
        }),
        sessionDocument("session-cancelled", {
          amountDueGrosz: 9000,
          status: "CANCELLED",
          totalWeightG: 50_000
        }),
        sessionDocument("session-other-season", {
          amountDueGrosz: 1000,
          seasonId: "season-2025",
          status: "CLOSED",
          totalWeightG: 10_000
        })
      ],
      workerDocument: workerDocument()
    });

    expect(result).toMatchObject({
      accruedAmountGrosz: 6750,
      dataSource: "SERVER",
      invalidPaymentCount: 0,
      invalidSeasonCount: 0,
      invalidSessionCount: 0,
      invalidWorker: false,
      paidAmountGrosz: 2250,
      refreshedAtIso: "2026-07-28T18:30:00.000Z",
      remainingAmountGrosz: 4500,
      selectedSeasonId: "season-2026",
      selectedSeasonName: "Sezon 2026",
      sessionCounts: {
        closed: 1,
        open: 1,
        paid: 1
      },
      totalWeightG: 19_500,
      userName: "Anna Konto",
      workerId: "worker-anna",
      workerName: "Anna Zbieracz"
    });
    expect(result.quantities).toEqual([
      {
        planId: "plan-ubianka",
        planName: "Za ubianke",
        quantityPrecision: 1,
        sessionCount: 2,
        totalQuantityMilli: 4500,
        unitLabelPlural: "ubianki"
      }
    ]);
  });

  it("keeps quantities separated by plan and reports invalid or foreign documents", () => {
    const result = buildPickerDashboard({
      actorProfile: pickerProfile,
      dataSource: "CACHE",
      paymentDocuments: [
        paymentDocument("foreign-payment", { workerId: "worker-other" }),
        { id: "broken-payment", data: { id: "broken-payment" } }
      ],
      refreshedAtIso: "2026-07-28T18:30:00Z",
      seasonDocuments: [
        seasonDocument("season-2026", { isDefault: true }),
        { id: "broken-season", data: { id: "broken-season" } }
      ],
      sessionDocuments: [
        sessionDocument("session-a", {
          calculationBasisSnapshot: "QUANTITY",
          planIdSnapshot: "plan-a",
          planNameSnapshot: "Plan A",
          totalQuantityMilli: 1000
        }),
        sessionDocument("session-b", {
          calculationBasisSnapshot: "QUANTITY",
          planIdSnapshot: "plan-b",
          planNameSnapshot: "Plan B",
          totalQuantityMilli: 2000
        }),
        sessionDocument("foreign-session", { workerId: "worker-other" })
      ],
      workerDocument: workerDocument({
        linkedUserUid: "picker-other"
      })
    });

    expect(result.dataSource).toBe("CACHE");
    expect(result.quantities.map((quantity) => quantity.planId)).toEqual([
      "plan-a",
      "plan-b"
    ]);
    expect(result).toMatchObject({
      invalidPaymentCount: 2,
      invalidSeasonCount: 1,
      invalidSessionCount: 1,
      invalidWorker: true,
      workerName: null
    });
  });

  it("does not expose picker A cached data after picker B signs in on a shared device", () => {
    const result = buildPickerDashboard({
      actorProfile: secondPickerProfile,
      dataSource: "CACHE",
      paymentDocuments: [
        paymentDocument("payment-anna", {
          amountGrosz: 9000,
          sessionId: "session-anna"
        }),
        paymentDocument("payment-bartek", {
          amountGrosz: 3000,
          sessionId: "session-bartek",
          workerId: "worker-bartek",
          workerNameSnapshot: "Bartek Zbieracz"
        })
      ],
      refreshedAtIso: "2026-07-28T18:30:00.000Z",
      seasonDocuments: [
        seasonDocument("season-2026", {
          isDefault: true
        })
      ],
      sessionDocuments: [
        sessionDocument("session-anna", {
          amountDueGrosz: 9000,
          status: "PAID"
        }),
        sessionDocument("session-bartek", {
          amountDueGrosz: 3000,
          paymentId: "payment-bartek",
          status: "PAID",
          workerId: "worker-bartek",
          workerNameSnapshot: "Bartek Zbieracz"
        })
      ],
      workerDocument: workerDocument(
        {
          displayName: "Bartek Zbieracz",
          linkedUserUid: secondPickerProfile.uid,
          normalizedName: "bartek zbieracz"
        },
        "worker-bartek"
      )
    });

    expect(result).toMatchObject({
      accruedAmountGrosz: 3000,
      invalidPaymentCount: 1,
      invalidSessionCount: 1,
      paidAmountGrosz: 3000,
      remainingAmountGrosz: 0,
      workerId: "worker-bartek",
      workerName: "Bartek Zbieracz"
    });
    expect(JSON.stringify(result)).not.toContain("Anna Zbieracz");
  });

  it("does not accrue an OPEN session and accrues a CLOSED session as outstanding", () => {
    const openResult = dashboardFor({
      sessions: [
        sessionDocument("session-status", {
          amountDueGrosz: null,
          status: "OPEN"
        })
      ]
    });
    const closedResult = dashboardFor({
      sessions: [
        sessionDocument("session-status", {
          amountDueGrosz: 4500,
          status: "CLOSED"
        })
      ]
    });

    expect(openResult).toMatchObject({
      accruedAmountGrosz: 0,
      paidAmountGrosz: 0,
      remainingAmountGrosz: 0
    });
    expect(closedResult).toMatchObject({
      accruedAmountGrosz: 4500,
      paidAmountGrosz: 0,
      remainingAmountGrosz: 4500
    });
  });

  it("moves a PAID session amount between paid and outstanding when payment is cancelled", () => {
    const sessions = [
      sessionDocument("session-paid", {
        amountDueGrosz: 6000,
        paymentId: "session-paid--payment-r3",
        status: "PAID"
      })
    ];
    const activeResult = dashboardFor({
      payments: [
        paymentDocument("session-paid--payment-r3", {
          amountGrosz: 6000,
          sessionId: "session-paid",
          status: "ACTIVE"
        })
      ],
      sessions
    });
    const cancelledResult = dashboardFor({
      payments: [
        paymentDocument("session-paid--payment-r3", {
          amountGrosz: 6000,
          cancellationReason: "Korekta",
          cancelledAt: "2026-07-29T10:00:00.000Z",
          cancelledBy: "admin-1",
          sessionId: "session-paid",
          status: "CANCELLED"
        })
      ],
      sessions: [
        sessionDocument("session-paid", {
          amountDueGrosz: 6000,
          status: "CLOSED"
        })
      ]
    });

    expect(activeResult).toMatchObject({
      accruedAmountGrosz: 6000,
      paidAmountGrosz: 6000,
      remainingAmountGrosz: 0
    });
    expect(cancelledResult).toMatchObject({
      accruedAmountGrosz: 6000,
      paidAmountGrosz: 0,
      remainingAmountGrosz: 6000
    });
  });

  it("excludes CANCELLED sessions and sessions from another season", () => {
    const result = dashboardFor({
      sessions: [
        sessionDocument("session-current", {
          amountDueGrosz: 2500,
          status: "CLOSED"
        }),
        sessionDocument("session-cancelled", {
          amountDueGrosz: 7000,
          status: "CANCELLED"
        }),
        sessionDocument("session-other-season", {
          amountDueGrosz: 9000,
          seasonId: "season-2025",
          status: "CLOSED"
        })
      ]
    });

    expect(result).toMatchObject({
      accruedAmountGrosz: 2500,
      remainingAmountGrosz: 2500,
      sessionCounts: {
        closed: 1,
        open: 0,
        paid: 0
      }
    });
  });

  it("keeps different quantity units separate even for the same plan", () => {
    const result = dashboardFor({
      sessions: [
        sessionDocument("session-crates", {
          amountDueGrosz: 1000,
          calculationBasisSnapshot: "QUANTITY",
          planIdSnapshot: "plan-piecework",
          planNameSnapshot: "Akord",
          status: "CLOSED",
          totalQuantityMilli: 2000,
          unitLabelPluralSnapshot: "skrzynki",
          unitLabelSnapshot: "skrzynka"
        }),
        sessionDocument("session-baskets", {
          amountDueGrosz: 1500,
          calculationBasisSnapshot: "QUANTITY",
          planIdSnapshot: "plan-piecework",
          planNameSnapshot: "Akord",
          status: "CLOSED",
          totalQuantityMilli: 3000,
          unitLabelPluralSnapshot: "ubianki",
          unitLabelSnapshot: "ubianka"
        })
      ]
    });

    expect(result.quantities).toHaveLength(2);
    expect(
      result.quantities.map(({ totalQuantityMilli, unitLabelPlural }) => ({
        totalQuantityMilli,
        unitLabelPlural
      }))
    ).toEqual([
      {
        totalQuantityMilli: 2000,
        unitLabelPlural: "skrzynki"
      },
      {
        totalQuantityMilli: 3000,
        unitLabelPlural: "ubianki"
      }
    ]);
  });

  it("uses the stored historical amount for an imported session", () => {
    const result = dashboardFor({
      sessions: [
        sessionDocument("session-imported", {
          amountDueGrosz: 12_345,
          legacyImport: true,
          legacySourceRows: ["Arkusz1:42"],
          rateGroszSnapshot: 1000,
          status: "CLOSED",
          totalQuantityMilli: 1000
        })
      ]
    });

    expect(result).toMatchObject({
      accruedAmountGrosz: 12_345,
      remainingAmountGrosz: 12_345
    });
  });

  it("filters private sessions and payments by their business dates", () => {
    const result = dashboardFor({
      payments: [
        paymentDocument("payment-in-range", {
          amountGrosz: 2000,
          paidBusinessDate: "2026-07-28"
        }),
        paymentDocument("payment-outside", {
          amountGrosz: 9000,
          paidBusinessDate: "2026-07-27"
        })
      ],
      periodSelection: {
        customFromDate: "2026-07-28",
        customToDate: "2026-07-28",
        preset: "CUSTOM"
      },
      sessions: [
        sessionDocument("session-in-range", {
          amountDueGrosz: 5000,
          businessDate: "2026-07-28",
          status: "CLOSED",
          totalWeightG: 5000
        }),
        sessionDocument("session-outside", {
          amountDueGrosz: 7000,
          businessDate: "2026-07-27",
          status: "CLOSED",
          totalWeightG: 7000
        })
      ]
    });

    expect(result).toMatchObject({
      accruedAmountGrosz: 5000,
      paidAmountGrosz: 2000,
      remainingAmountGrosz: 3000,
      totalWeightG: 5000
    });
    expect(result.period).toMatchObject({
      dateBasis: "BUSINESS_DATE",
      fromDate: "2026-07-28",
      toDate: "2026-07-28"
    });
  });

  it("rejects an approved picker without workerId instead of returning data", async () => {
    await expect(
      loadPickerDashboard(
        {},
        {
          actorProfile: {
            ...pickerProfile,
            workerId: null
          },
          isOnline: true
        }
      )
    ).rejects.toThrow("Pulpit zbieracza wymaga aktywnego profilu z workerId.");
  });

  it("rejects a profile other than an approved picker before Firebase initialization", async () => {
    await expect(
      loadPickerDashboard(
        {},
        {
          actorProfile: {
            ...pickerProfile,
            role: "ADMIN",
            workerId: null
          },
          isOnline: true
        }
      )
    ).rejects.toThrow("Pulpit zbieracza wymaga aktywnego profilu z workerId.");
  });
});

function dashboardFor({
  payments = [],
  periodSelection,
  sessions
}: {
  payments?: ReturnType<typeof paymentDocument>[];
  periodSelection?: Parameters<typeof buildPickerDashboard>[0]["periodSelection"];
  sessions: ReturnType<typeof sessionDocument>[];
}) {
  return buildPickerDashboard({
    actorProfile: pickerProfile,
    dataSource: "SERVER",
    paymentDocuments: payments,
    periodSelection,
    refreshedAtIso: "2026-07-28T18:30:00.000Z",
    seasonDocuments: [
      seasonDocument("season-2026", { isDefault: true }),
      seasonDocument("season-2025", {
        name: "Sezon 2025",
        startDate: "2025-07-01",
        status: "CLOSED"
      })
    ],
    sessionDocuments: sessions,
    workerDocument: workerDocument()
  });
}

function seasonDocument(id: string, overrides: Record<string, unknown> = {}) {
  return {
    id,
    data: {
      closedAt: null,
      closedBy: null,
      createdAt: "2026-06-01T00:00:00.000Z",
      createdBy: "admin-1",
      endDate: "2026-09-30",
      id,
      isDefault: false,
      name: "Sezon 2026",
      reopenedAt: null,
      startDate: "2026-07-01",
      status: "OPEN",
      ...overrides
    }
  };
}

function workerDocument(overrides: Record<string, unknown> = {}, id = "worker-anna") {
  return {
    id,
    data: {
      active: true,
      archivedAt: null,
      createdAt: "2026-06-01T00:00:00.000Z",
      createdBy: "admin-1",
      currentPlanId: "plan-weight",
      currentRateVersionId: "rate-1",
      displayName: "Anna Zbieracz",
      emailContact: null,
      id,
      legacyName: null,
      linkedUserUid: "picker-anna",
      normalizedName: "anna zbieracz",
      notes: null,
      phone: null,
      updatedAt: "2026-06-01T00:00:00.000Z",
      ...overrides
    }
  };
}

function paymentDocument(id: string, overrides: Record<string, unknown> = {}) {
  return {
    id,
    data: {
      amountGrosz: 2250,
      cancellationReason: null,
      cancelledAt: null,
      cancelledBy: null,
      creationAttemptId: `attempt-${id}`,
      createdAtServer: "2026-07-28T12:00:00.000Z",
      createdBy: "admin-1",
      id,
      legacyImport: false,
      note: null,
      paidBusinessDate: "2026-07-28",
      paymentMethod: "CASH",
      seasonId: "season-2026",
      sessionId: "session-paid",
      status: "ACTIVE",
      workerId: "worker-anna",
      workerNameSnapshot: "Anna Zbieracz",
      ...overrides
    }
  };
}

function sessionDocument(id: string, overrides: Record<string, unknown> = {}) {
  return {
    id,
    data: {
      allowBatchQuantitySnapshot: true,
      amountDueGrosz: null,
      businessDate: "2026-07-28",
      calculationBasisSnapshot: "WEIGHT",
      calculationVersion: "1",
      cancellationReason: null,
      cancelledAt: null,
      cancelledBy: null,
      closedAtDevice: null,
      closedAtServer: null,
      closedBy: null,
      createdAtDevice: "2026-07-28T08:00:00.000Z",
      createdAtServer: "2026-07-28T08:00:01.000Z",
      createdBy: "operator-1",
      createdDeviceId: "device-1",
      id,
      legacyImport: false,
      legacySourceRows: [],
      note: null,
      paidAt: null,
      paymentId: null,
      planIdSnapshot: "plan-weight",
      planNameSnapshot: "Za kilogram",
      quantityPrecisionSnapshot: 3,
      rateGroszSnapshot: 1000,
      rateVersionIdSnapshot: "rate-1",
      revision: 1,
      seasonId: "season-2026",
      status: "OPEN",
      totalEntryCount: 1,
      totalQuantityMilli: 1000,
      totalWeightG: 1000,
      unitLabelPluralSnapshot: "kilogramy",
      unitLabelSnapshot: "kilogram",
      updatedAtServer: null,
      weightRequiredSnapshot: true,
      workerId: "worker-anna",
      workerNameSnapshot: "Anna Zbieracz",
      ...overrides
    }
  };
}
