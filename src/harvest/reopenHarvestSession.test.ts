import {
  createInitialDomainSeed,
  type WorkerDocument
} from "../domain/domainConfiguration";
import type { UserProfile } from "../domain/identity";
import type { CalculableHarvestEntry } from "./harvestSessionCalculation";
import { prepareCloseHarvestSessionOnline } from "./closeHarvestSession";
import {
  harvestSessionReopenAuditSummary,
  prepareReopenHarvestSession
} from "./reopenHarvestSession";
import {
  prepareOpenHarvestSession,
  type HarvestSessionDocument
} from "./openHarvestSession";

const createdAt = "2026-07-17T10:00:00.000Z";
const closedAt = "2026-07-17T12:00:00.000Z";
const reopenedAt = "2026-07-17T13:00:00.000Z";
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

function createClosedSession(
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

  const closed = prepareCloseHarvestSessionOnline({
    actorProfile: operatorProfile,
    session: opened.session,
    entries: [activeEntry("entry-1", 1000), activeEntry("entry-2", 1495)],
    season: seed.seasons[0],
    worker,
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
  overrides: Partial<Parameters<typeof prepareReopenHarvestSession>[0]> = {}
): Parameters<typeof prepareReopenHarvestSession>[0] {
  return {
    actorProfile: adminProfile,
    session: createClosedSession(),
    isOnline: true,
    hasActivePayment: false,
    pendingWriteCount: 0,
    reason: "Korekta blednego wpisu.",
    reopenedAtDevice: reopenedAt,
    reopenedAtServer: "server-reopen-time",
    auditId: "audit-reopen-1",
    deviceId: "device-1",
    ...overrides
  };
}

describe("reopen harvest session", () => {
  it("prepares admin online reopen with warning summary and audit event", () => {
    const result = prepareReopenHarvestSession(defaultInput());

    expect(result.status).toBe("REOPENED");
    expect(result.session).toMatchObject({
      status: "OPEN",
      amountDueGrosz: null,
      closedAtDevice: null,
      closedAtServer: null,
      closedBy: null,
      updatedAtServer: "server-reopen-time",
      revision: 3
    });
    expect(result.sessionUpdate).toEqual({
      status: "OPEN",
      amountDueGrosz: null,
      closedAtDevice: null,
      closedAtServer: null,
      closedBy: null,
      updatedAtServer: "server-reopen-time",
      revision: 3
    });
    expect(result.confirmationSummary).toMatchObject({
      workerName: "Anna Test",
      businessDate: "2026-07-17",
      previousAmountDueGrosz: 2495,
      totalEntryCount: 2,
      totalQuantityMilli: 2495,
      totalWeightG: 2495,
      reportsMayChange: true,
      pendingWriteCount: 0,
      reason: "Korekta blednego wpisu."
    });
    expect(result.auditEvent).toMatchObject({
      id: "audit-reopen-1",
      actorUid: "admin-1",
      actorRoleSnapshot: "ADMIN",
      action: "HARVEST_SESSION_REOPENED",
      entityType: "HARVEST_SESSION",
      entityId: result.session.id,
      businessDate: "2026-07-17",
      reason: "Korekta blednego wpisu.",
      createdAtDevice: reopenedAt,
      createdAtServer: "server-reopen-time",
      deviceId: "device-1",
      beforeSummary: {
        status: "CLOSED",
        amountDueGrosz: 2495,
        revision: 2
      },
      afterSummary: {
        status: "OPEN",
        amountDueGrosz: null,
        revision: 3
      }
    });
  });

  it("blocks operator, offline and missing reason attempts", () => {
    expect(() =>
      prepareReopenHarvestSession(defaultInput({ actorProfile: operatorProfile }))
    ).toThrow("Ta rola nie moze wykonac przejscia statusu sesji.");
    expect(() => prepareReopenHarvestSession(defaultInput({ isOnline: false }))).toThrow(
      "Przejscie statusu sesji wymaga aktywnego polaczenia."
    );
    expect(() => prepareReopenHarvestSession(defaultInput({ reason: " " }))).toThrow(
      "Ponowne otwarcie sesji wymaga powodu."
    );
    expect(() => prepareReopenHarvestSession(defaultInput({ reason: "a" }))).toThrow(
      "Powod ponownego otwarcia jest za krotki."
    );
  });

  it("blocks paid sessions, active payment and wrong source status", () => {
    expect(() =>
      prepareReopenHarvestSession(
        defaultInput({
          hasActivePayment: true
        })
      )
    ).toThrow("Aktywna wyplata blokuje to przejscie statusu sesji.");
    expect(() =>
      prepareReopenHarvestSession(
        defaultInput({
          session: createClosedSession(undefined, {
            paymentId: "payment-1"
          })
        })
      )
    ).toThrow("Sesja z identyfikatorem wyplaty wymaga anulowania wyplaty.");
    expect(() =>
      prepareReopenHarvestSession(
        defaultInput({
          session: {
            ...createClosedSession(),
            status: "PAID"
          }
        })
      )
    ).toThrow("Przejscie statusu sesji nie jest dozwolone z tego statusu.");
  });

  it("blocks pending local writes and malformed closed sessions", () => {
    expect(() =>
      prepareReopenHarvestSession(defaultInput({ pendingWriteCount: 1 }))
    ).toThrow("Nie mozna ponownie otworzyc sesji z oczekujacymi zapisami.");
    expect(() =>
      prepareReopenHarvestSession(
        defaultInput({
          session: createClosedSession(undefined, {
            amountDueGrosz: null
          })
        })
      )
    ).toThrow("Ponowne otwarcie wymaga oficjalnej kwoty zamknietej sesji.");
    expect(() =>
      prepareReopenHarvestSession(
        defaultInput({
          reopenedAtDevice: null
        })
      )
    ).toThrow("Ponowne otwarcie wymaga czasu urzadzenia.");
  });

  it("summarizes reopen audit fields with previous amount preserved", () => {
    expect(harvestSessionReopenAuditSummary(createClosedSession())).toMatchObject({
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
