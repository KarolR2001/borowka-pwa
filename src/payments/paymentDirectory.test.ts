import {
  buildAdminPaymentDirectory,
  createAdminPaymentCsv,
  createAdminPaymentCsvFilename,
  defaultPaymentDirectoryFilters,
  filterAdminPayments,
  listAdminPayments,
  summarizeAdminPayments
} from "./paymentDirectory";

describe("admin payment directory", () => {
  it("joins payment, season and source session while preserving financial history", () => {
    const result = createDirectory();

    expect(result).toMatchObject({
      invalidPaymentCount: 1,
      invalidSeasonCount: 0,
      invalidSessionCount: 0,
      missingSourceSessionCount: 1
    });
    expect(result.payments.map((payment) => payment.id)).toEqual([
      "session-imported",
      "session-cancelled",
      "session-active"
    ]);
    expect(result.payments[1]).toMatchObject({
      cancellationReason: "Bledna metoda",
      cancelledBy: "admin-2",
      createdBy: "admin-1",
      note: "Korekta po kontroli",
      seasonName: "Sezon 2026",
      sourceSession: {
        businessDate: "2026-07-19",
        planName: "Za kilogram",
        revision: 4,
        status: "CLOSED"
      },
      status: "CANCELLED",
      workerName: "Barbara"
    });
    expect(result.payments[0]?.sourceSession).toBeNull();
  });

  it("filters by season, worker, both date ranges, method and status", () => {
    const payments = createDirectory().payments;
    const filtered = filterAdminPayments(payments, {
      ...defaultPaymentDirectoryFilters,
      method: "BANK_TRANSFER",
      paidFromDate: "2026-07-20",
      paidToDate: "2026-07-21",
      seasonId: "season-2026",
      sessionFromDate: "2026-07-18",
      sessionToDate: "2026-07-20",
      status: "CANCELLED",
      workerId: "worker-b"
    });

    expect(filtered.map((payment) => payment.id)).toEqual(["session-cancelled"]);
    expect(
      filterAdminPayments(payments, {
        ...defaultPaymentDirectoryFilters,
        status: "IMPORTED"
      }).map((payment) => payment.id)
    ).toEqual(["session-imported"]);
  });

  it("sums only active payments while counting cancelled and imported records", () => {
    expect(summarizeAdminPayments(createDirectory().payments)).toEqual({
      activeAmountGrosz: 17_500,
      activeCount: 2,
      cancelledCount: 1,
      importedCount: 1,
      totalCount: 3
    });
  });

  it("exports a Polish Excel CSV without allowing formula injection", () => {
    const payments = createDirectory().payments.map((payment, index) =>
      index === 0 ? { ...payment, note: '=HYPERLINK("bad")' } : payment
    );
    const csv = createAdminPaymentCsv(payments);

    expect(csv.startsWith("\uFEFFsep=;\r\n")).toBe(true);
    expect(csv).toContain('"Kwota PLN"');
    expect(csv).toContain('"125,00"');
    expect(csv).toContain(`"'=HYPERLINK(""bad"")"`);
    expect(csv).toContain('"CANCELLED"');
    expect(createAdminPaymentCsvFilename("2026-07-28T16:00:00.000Z")).toBe(
      "borowka-wyplaty-2026-07-28T16-00-00-000Z.csv"
    );
  });

  it("rejects a non-admin before opening Firebase", async () => {
    await expect(
      listAdminPayments(
        {},
        {
          active: true,
          displayName: "Operator",
          email: "operator@example.test",
          offlineConsent: false,
          registrationStatus: "APPROVED",
          role: "OPERATOR",
          uid: "operator-1",
          workerId: null
        }
      )
    ).rejects.toThrow("Lista wyplat wymaga aktywnego administratora.");
  });
});

function createDirectory() {
  return buildAdminPaymentDirectory({
    paymentDocuments: [
      paymentDocument("session-active", {
        amountGrosz: 5000,
        paidBusinessDate: "2026-07-20"
      }),
      paymentDocument("session-cancelled", {
        amountGrosz: 7500,
        cancellationReason: "Bledna metoda",
        cancelledAt: "2026-07-22T10:00:00.000Z",
        cancelledBy: "admin-2",
        note: "Korekta po kontroli",
        paidBusinessDate: "2026-07-21",
        paymentMethod: "BANK_TRANSFER",
        status: "CANCELLED",
        workerId: "worker-b",
        workerNameSnapshot: "Barbara"
      }),
      paymentDocument("session-imported", {
        amountGrosz: 12_500,
        legacyImport: true,
        paidBusinessDate: "2026-07-22",
        workerId: "worker-c",
        workerNameSnapshot: "Celina"
      }),
      {
        data: { id: "invalid-payment" },
        id: "invalid-payment"
      }
    ],
    seasonDocuments: [seasonDocument()],
    sessionDocuments: [
      sessionDocument("session-active", {
        businessDate: "2026-07-18",
        status: "PAID"
      }),
      sessionDocument("session-cancelled", {
        businessDate: "2026-07-19",
        revision: 4,
        status: "CLOSED",
        workerId: "worker-b",
        workerNameSnapshot: "Barbara"
      })
    ]
  });
}

function paymentDocument(id: string, overrides: Record<string, unknown> = {}) {
  return {
    id,
    data: {
      amountGrosz: 5000,
      cancellationReason: null,
      cancelledAt: null,
      cancelledBy: null,
      creationAttemptId: "attempt-1",
      createdAtServer: "2026-07-20T12:00:00.000Z",
      createdBy: "admin-1",
      id,
      legacyImport: false,
      note: null,
      paidBusinessDate: "2026-07-20",
      paymentMethod: "CASH",
      seasonId: "season-2026",
      sessionId: id,
      status: "ACTIVE",
      workerId: "worker-a",
      workerNameSnapshot: "Anna",
      ...overrides
    }
  };
}

function sessionDocument(id: string, overrides: Record<string, unknown> = {}) {
  return {
    id,
    data: {
      allowBatchQuantitySnapshot: true,
      amountDueGrosz: 5000,
      businessDate: "2026-07-18",
      calculationBasisSnapshot: "WEIGHT",
      calculationVersion: "1",
      cancellationReason: null,
      cancelledAt: null,
      cancelledBy: null,
      closedAtDevice: "2026-07-18T12:00:00.000Z",
      closedAtServer: "2026-07-18T12:01:00.000Z",
      closedBy: "operator-1",
      createdAtDevice: null,
      createdAtServer: null,
      createdBy: "operator-1",
      createdDeviceId: "device-1",
      id,
      legacyImport: false,
      legacySourceRows: [],
      note: null,
      paidAt: "2026-07-20T12:00:00.000Z",
      paymentId: id,
      planIdSnapshot: "plan-a",
      planNameSnapshot: "Za kilogram",
      quantityPrecisionSnapshot: 3,
      rateGroszSnapshot: 1000,
      rateVersionIdSnapshot: "rate-a",
      revision: 3,
      seasonId: "season-2026",
      status: "PAID",
      totalEntryCount: 2,
      totalQuantityMilli: 2000,
      totalWeightG: 5000,
      unitLabelPluralSnapshot: "kilogramy",
      unitLabelSnapshot: "kilogram",
      updatedAtServer: null,
      weightRequiredSnapshot: true,
      workerId: "worker-a",
      workerNameSnapshot: "Anna",
      ...overrides
    }
  };
}

function seasonDocument() {
  return {
    id: "season-2026",
    data: {
      closedAt: null,
      closedBy: null,
      createdAt: null,
      createdBy: "admin-1",
      endDate: "2026-09-30",
      id: "season-2026",
      isDefault: true,
      name: "Sezon 2026",
      reopenedAt: null,
      startDate: "2026-07-01",
      status: "OPEN"
    }
  };
}
