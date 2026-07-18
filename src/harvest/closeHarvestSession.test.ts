import {
  createInitialDomainSeed,
  type SeasonDocument,
  type WorkerDocument,
  type WorkerRateVersionDocument
} from "../domain/domainConfiguration";
import type { UserProfile } from "../domain/identity";
import type { CalculableHarvestEntry } from "./harvestSessionCalculation";
import {
  harvestSessionCloseAuditSummary,
  prepareCloseHarvestSessionOnline
} from "./closeHarvestSession";
import {
  HARVEST_SESSION_CALCULATION_VERSION,
  prepareOpenHarvestSession,
  type HarvestSessionDocument
} from "./openHarvestSession";

const createdAt = "2026-07-17T10:00:00.000Z";
const closedAt = "2026-07-17T12:00:00.000Z";
const seed = createInitialDomainSeed({ createdAt });

const operatorProfile: UserProfile = {
  uid: "operator-1",
  email: "operator@example.test",
  displayName: "Operator",
  role: "OPERATOR",
  active: true,
  registrationStatus: "APPROVED",
  offlineConsent: true
};

const pickerProfile: UserProfile = {
  ...operatorProfile,
  uid: "picker-1",
  role: "PICKER",
  workerId: "worker-anna-test"
};

function createSession(
  worker: WorkerDocument = seed.workers[0],
  overrides: Partial<HarvestSessionDocument> = {}
): HarvestSessionDocument {
  const result = prepareOpenHarvestSession({
    actorProfile: operatorProfile,
    id: `session-${worker.id}`,
    season: seed.seasons[0],
    worker,
    plans: seed.settlementPlans,
    rateVersions: seed.workerRateVersions,
    businessDate: "2026-07-17",
    existingSessions: [],
    isOnline: true,
    createdDeviceId: "device-1",
    createdAtDevice: createdAt
  });

  if (result.status !== "CREATED") {
    throw new Error("Expected created session.");
  }

  return {
    ...result.session,
    ...overrides
  };
}

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

function cancelledEntry(id: string): CalculableHarvestEntry {
  return {
    id,
    status: "CANCELLED",
    quantityMilli: 1000,
    weightG: 1000
  };
}

function defaultInput(
  overrides: Partial<Parameters<typeof prepareCloseHarvestSessionOnline>[0]> = {}
): Parameters<typeof prepareCloseHarvestSessionOnline>[0] {
  const session = createSession();

  return {
    actorProfile: operatorProfile,
    session,
    entries: [activeEntry("entry-1", 1000), activeEntry("entry-2", 1495)],
    season: seed.seasons[0],
    worker: seed.workers[0],
    rateVersion: seed.workerRateVersions[0],
    isOnline: true,
    pendingWriteCount: 0,
    confirmationAccepted: true,
    closedAtDevice: closedAt,
    closedAtServer: "server-time",
    auditId: "audit-session-close-1",
    deviceId: "device-1",
    ...overrides
  };
}

describe("close harvest session online", () => {
  it("prepares one logical close write with official totals and audit event", () => {
    const result = prepareCloseHarvestSessionOnline(
      defaultInput({
        entries: [
          activeEntry("entry-1", 1000),
          activeEntry("entry-2", 1495),
          cancelledEntry("entry-3")
        ]
      })
    );

    expect(result.status).toBe("CLOSED");
    expect(result.session).toMatchObject({
      status: "CLOSED",
      totalEntryCount: 2,
      totalQuantityMilli: 2495,
      totalWeightG: 2495,
      amountDueGrosz: 2495,
      calculationVersion: HARVEST_SESSION_CALCULATION_VERSION,
      closedAtDevice: closedAt,
      closedAtServer: "server-time",
      closedBy: "operator-1",
      updatedAtServer: "server-time",
      revision: 2
    });
    expect(result.sessionUpdate).toEqual({
      status: "CLOSED",
      totalEntryCount: 2,
      totalQuantityMilli: 2495,
      totalWeightG: 2495,
      amountDueGrosz: 2495,
      calculationVersion: HARVEST_SESSION_CALCULATION_VERSION,
      closedAtDevice: closedAt,
      closedAtServer: "server-time",
      closedBy: "operator-1",
      updatedAtServer: "server-time",
      revision: 2
    });
    expect(result.confirmationSummary).toMatchObject({
      workerName: "Anna Test",
      businessDate: "2026-07-17",
      planName: "Za kilogram",
      rateGrosz: 1000,
      calculationBasis: "WEIGHT",
      totalEntryCount: 2,
      amountDueGrosz: 2495,
      skippedCancelledEntryCount: 1,
      pendingWriteCount: 0
    });
    expect(result.auditEvent).toMatchObject({
      id: "audit-session-close-1",
      actorUid: "operator-1",
      actorRoleSnapshot: "OPERATOR",
      action: "HARVEST_SESSION_CLOSED",
      entityType: "HARVEST_SESSION",
      entityId: result.session.id,
      businessDate: "2026-07-17",
      reason: null,
      createdAtDevice: closedAt,
      createdAtServer: "server-time",
      deviceId: "device-1",
      afterSummary: {
        status: "CLOSED",
        totalEntryCount: 2,
        amountDueGrosz: 2495,
        revision: 2
      }
    });
    expect(result.beforeSummary).toMatchObject({
      status: "OPEN",
      amountDueGrosz: null,
      revision: 1
    });
  });

  it("blocks close without confirmation, online state or allowed role", () => {
    expect(() =>
      prepareCloseHarvestSessionOnline(defaultInput({ confirmationAccepted: false }))
    ).toThrow("Zamkniecie sesji wymaga potwierdzenia podsumowania.");
    expect(() =>
      prepareCloseHarvestSessionOnline(defaultInput({ isOnline: false }))
    ).toThrow("Przejscie statusu sesji wymaga aktywnego polaczenia.");
    expect(() =>
      prepareCloseHarvestSessionOnline(defaultInput({ actorProfile: pickerProfile }))
    ).toThrow("Ta rola nie moze wykonac przejscia statusu sesji.");
  });

  it("blocks empty sessions and pending local writes", () => {
    expect(() => prepareCloseHarvestSessionOnline(defaultInput({ entries: [] }))).toThrow(
      "Nie mozna zamknac pustej sesji."
    );
    expect(() =>
      prepareCloseHarvestSessionOnline(defaultInput({ pendingWriteCount: 1 }))
    ).toThrow("Nie mozna zamknac sesji z oczekujacymi zapisami.");
  });

  it("validates season and worker context before official close", () => {
    expect(() =>
      prepareCloseHarvestSessionOnline(
        defaultInput({
          season: {
            ...seed.seasons[0],
            status: "CLOSED"
          } satisfies SeasonDocument
        })
      )
    ).toThrow("Sesje mozna zamknac tylko w otwartym sezonie.");
    expect(() =>
      prepareCloseHarvestSessionOnline(
        defaultInput({
          worker: {
            ...seed.workers[0],
            active: false
          } satisfies WorkerDocument
        })
      )
    ).toThrow("Nie mozna zamknac sesji nieaktywnego zbieracza.");
  });

  it("validates rate version snapshot consistency", () => {
    expect(() =>
      prepareCloseHarvestSessionOnline(defaultInput({ rateVersion: null }))
    ).toThrow("Brak wersji stawki zapisanej w sesji.");
    expect(() =>
      prepareCloseHarvestSessionOnline(
        defaultInput({
          rateVersion: {
            ...seed.workerRateVersions[0],
            rateGroszPerUnit: 1200
          } satisfies WorkerRateVersionDocument
        })
      )
    ).toThrow("Wersja stawki nie zgadza sie ze snapshotem sesji.");
    expect(() =>
      prepareCloseHarvestSessionOnline(
        defaultInput({
          rateVersion: {
            ...seed.workerRateVersions[0],
            validTo: "2026-07-16"
          } satisfies WorkerRateVersionDocument
        })
      )
    ).toThrow("Snapshot stawki nie obowiazuje w dacie sesji.");
  });

  it("blocks missing weight in weight sessions through the shared calculator", () => {
    expect(() =>
      prepareCloseHarvestSessionOnline(
        defaultInput({
          entries: [activeEntry("entry-1", 1000, null)]
        })
      )
    ).toThrow("Plan wagowy wymaga wagi kazdego aktywnego wpisu.");
  });

  it("summarizes harvest session close audit fields", () => {
    expect(harvestSessionCloseAuditSummary(createSession())).toMatchObject({
      status: "OPEN",
      totalEntryCount: 0,
      totalQuantityMilli: 0,
      totalWeightG: 0,
      amountDueGrosz: null,
      calculationVersion: "1",
      closedBy: null,
      revision: 1
    });
  });
});
