import {
  createInitialDomainSeed,
  type WorkerDocument
} from "../domain/domainConfiguration";
import type { UserProfile } from "../domain/identity";
import type { CalculableHarvestEntry } from "./harvestSessionCalculation";
import {
  harvestSessionCancelAuditSummary,
  prepareCancelHarvestSession
} from "./cancelHarvestSession";
import { prepareCloseHarvestSessionOnline } from "./closeHarvestSession";
import {
  prepareOpenHarvestSession,
  type HarvestSessionDocument
} from "./openHarvestSession";

const createdAt = "2026-07-17T10:00:00.000Z";
const closedAt = "2026-07-17T12:00:00.000Z";
const cancelledAt = "2026-07-17T14:00:00.000Z";
const seed = createInitialDomainSeed({ createdAt });

const adminProfile: UserProfile = {
  uid: "admin-1",
  email: "admin@example.test",
  displayName: "Admin",
  role: "ADMIN",
  active: true,
  registrationStatus: "APPROVED",
  offlineConsent: true
};

const operatorProfile: UserProfile = {
  ...adminProfile,
  uid: "operator-1",
  role: "OPERATOR"
};

function createOpenSession(
  worker: WorkerDocument = seed.workers[0],
  overrides: Partial<HarvestSessionDocument> = {}
): HarvestSessionDocument {
  const opened = prepareOpenHarvestSession({
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

  if (opened.status !== "CREATED") {
    throw new Error("Expected created session.");
  }

  return {
    ...opened.session,
    ...overrides
  };
}

function createClosedSession(
  overrides: Partial<HarvestSessionDocument> = {}
): HarvestSessionDocument {
  const openSession = createOpenSession();
  const closed = prepareCloseHarvestSessionOnline({
    actorProfile: operatorProfile,
    session: openSession,
    entries: [activeEntry("entry-1", 1000), activeEntry("entry-2", 1495)],
    season: seed.seasons[0],
    worker: seed.workers[0],
    rateVersion: seed.workerRateVersions[0],
    isOnline: true,
    pendingWriteCount: 0,
    confirmationAccepted: true,
    closedAtDevice: closedAt,
    closedAtServer: "server-close-time",
    auditId: "audit-close-1",
    deviceId: "device-1"
  });

  return {
    ...closed.session,
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

function defaultInput(
  overrides: Partial<Parameters<typeof prepareCancelHarvestSession>[0]> = {}
): Parameters<typeof prepareCancelHarvestSession>[0] {
  return {
    actorProfile: adminProfile,
    session: createClosedSession(),
    isOnline: true,
    hasActivePayment: false,
    pendingWriteCount: 0,
    reason: "Duplikat sesji.",
    cancelledAtDevice: cancelledAt,
    cancelledAtServer: "server-cancel-time",
    auditId: "audit-cancel-1",
    deviceId: "device-1",
    ...overrides
  };
}

describe("cancel harvest session", () => {
  it("prepares admin cancellation while preserving historical totals", () => {
    const result = prepareCancelHarvestSession(defaultInput());

    expect(result.status).toBe("CANCELLED");
    expect(result.session).toMatchObject({
      status: "CANCELLED",
      totalEntryCount: 2,
      totalQuantityMilli: 2495,
      totalWeightG: 2495,
      amountDueGrosz: 2495,
      cancelledAt: "server-cancel-time",
      cancelledBy: "admin-1",
      cancellationReason: "Duplikat sesji.",
      updatedAtServer: "server-cancel-time",
      revision: 3
    });
    expect(result.sessionUpdate).toEqual({
      status: "CANCELLED",
      cancelledAt: "server-cancel-time",
      cancelledBy: "admin-1",
      cancellationReason: "Duplikat sesji.",
      updatedAtServer: "server-cancel-time",
      revision: 3
    });
    expect(result.confirmationSummary).toMatchObject({
      workerName: "Anna Test",
      businessDate: "2026-07-17",
      sourceStatus: "CLOSED",
      amountDueGrosz: 2495,
      totalEntryCount: 2,
      removesFromSettlementSums: true,
      leavesEntriesHistorical: true,
      pendingWriteCount: 0,
      reason: "Duplikat sesji."
    });
    expect(result.auditEvent).toMatchObject({
      id: "audit-cancel-1",
      actorUid: "admin-1",
      actorRoleSnapshot: "ADMIN",
      action: "HARVEST_SESSION_CANCELLED",
      entityType: "HARVEST_SESSION",
      entityId: result.session.id,
      businessDate: "2026-07-17",
      reason: "Duplikat sesji.",
      createdAtDevice: cancelledAt,
      createdAtServer: "server-cancel-time",
      deviceId: "device-1",
      beforeSummary: {
        status: "CLOSED",
        amountDueGrosz: 2495,
        revision: 2
      },
      afterSummary: {
        status: "CANCELLED",
        amountDueGrosz: 2495,
        revision: 3
      }
    });
  });

  it("cancels open sessions without creating official amount", () => {
    const result = prepareCancelHarvestSession(
      defaultInput({
        session: createOpenSession()
      })
    );

    expect(result.session).toMatchObject({
      status: "CANCELLED",
      amountDueGrosz: null,
      revision: 2
    });
    expect(result.confirmationSummary).toMatchObject({
      sourceStatus: "OPEN",
      amountDueGrosz: null
    });
  });

  it("blocks operator, offline and missing reason attempts", () => {
    expect(() =>
      prepareCancelHarvestSession(defaultInput({ actorProfile: operatorProfile }))
    ).toThrow("Ta rola nie moze wykonac przejscia statusu sesji.");
    expect(() => prepareCancelHarvestSession(defaultInput({ isOnline: false }))).toThrow(
      "Przejscie statusu sesji wymaga aktywnego polaczenia."
    );
    expect(() => prepareCancelHarvestSession(defaultInput({ reason: " " }))).toThrow(
      "Anulowanie sesji wymaga powodu."
    );
    expect(() => prepareCancelHarvestSession(defaultInput({ reason: "x" }))).toThrow(
      "Powod anulowania sesji jest za krotki."
    );
  });

  it("blocks paid sessions, active payment and pending local writes", () => {
    expect(() =>
      prepareCancelHarvestSession(defaultInput({ hasActivePayment: true }))
    ).toThrow("Aktywna wyplata blokuje to przejscie statusu sesji.");
    expect(() =>
      prepareCancelHarvestSession(
        defaultInput({
          session: createClosedSession({ paymentId: "payment-1" })
        })
      )
    ).toThrow("Sesja z identyfikatorem wyplaty wymaga anulowania wyplaty.");
    expect(() =>
      prepareCancelHarvestSession(defaultInput({ pendingWriteCount: 1 }))
    ).toThrow("Nie mozna anulowac sesji z oczekujacymi zapisami.");
  });

  it("blocks invalid source status and missing cancel timestamps", () => {
    expect(() =>
      prepareCancelHarvestSession(
        defaultInput({
          session: {
            ...createClosedSession(),
            status: "PAID"
          }
        })
      )
    ).toThrow("Przejscie statusu sesji nie jest dozwolone z tego statusu.");
    expect(() =>
      prepareCancelHarvestSession(defaultInput({ cancelledAtDevice: null }))
    ).toThrow("Anulowanie sesji wymaga czasu urzadzenia.");
  });

  it("summarizes cancellation audit fields", () => {
    expect(harvestSessionCancelAuditSummary(createClosedSession())).toMatchObject({
      status: "CLOSED",
      totalEntryCount: 2,
      totalQuantityMilli: 2495,
      totalWeightG: 2495,
      amountDueGrosz: 2495,
      calculationVersion: "1",
      closedBy: "operator-1",
      paymentId: null,
      revision: 2
    });
  });
});
