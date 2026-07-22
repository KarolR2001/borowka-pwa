import { createInitialDomainSeed } from "../domain/domainConfiguration";
import type { UserProfile } from "../domain/identity";
import {
  buildHarvestSessionDashboard,
  decodeHarvestEntry,
  decodeHarvestSession
} from "./harvestSessionDashboard";
import {
  prepareOpenHarvestSession,
  type HarvestSessionDocument
} from "./openHarvestSession";

const createdAt = new Date("2026-07-17T08:00:00.000Z");
const seed = createInitialDomainSeed({ createdAt });
const operatorProfile: UserProfile = {
  uid: "operator-1",
  email: "operator@example.test",
  displayName: "Operator Test",
  role: "OPERATOR",
  workerId: null,
  active: true,
  registrationStatus: "APPROVED",
  offlineConsent: true
};

describe("harvestSessionDashboard", () => {
  it("decodes valid harvest session and entry documents", () => {
    const session = createSession("session-1");
    const entry = createEntry(session, 1);

    expect(decodeHarvestSession("session-1", session)).toMatchObject({
      status: "FOUND",
      session: {
        id: "session-1",
        workerNameSnapshot: "Anna Test"
      }
    });
    expect(decodeHarvestEntry("entry-01", entry)).toMatchObject({
      status: "FOUND",
      entry: {
        id: "entry-01",
        sessionId: "session-1",
        quantityMilli: 1000
      }
    });
  });

  it("builds active session view from entries as source of truth", () => {
    const session = createSession("session-1");
    const result = buildHarvestSessionDashboard({
      sessionDocuments: [{ id: session.id, data: session }],
      entryDocuments: [
        { id: "entry-01", data: createEntry(session, 1) },
        { id: "entry-02", data: createEntry(session, 2) },
        {
          id: "entry-cancelled",
          data: createEntry(session, 3, {
            id: "entry-cancelled",
            status: "CANCELLED",
            cancellationReason: "Pomylka wagi"
          })
        }
      ],
      seasonDocuments: [{ id: seed.seasons[0].id, data: seed.seasons[0] }],
      actorProfile: operatorProfile,
      isOnline: true
    });

    expect(result.invalidSessions).toEqual([]);
    expect(result.invalidEntries).toEqual([]);
    expect(result.openSessions).toHaveLength(1);
    expect(result.closedSessions).toEqual([]);
    expect(result.selectedSessionId).toBe("session-1");
    expect(result.selectedSessionView).toMatchObject({
      seasonName: "Sezon testowy 2026",
      estimatedAmountGrosz: 2000,
      pendingWriteCount: 0,
      canAddEntry: true,
      canCloseSession: true,
      session: {
        totalEntryCount: 2,
        totalQuantityMilli: 2000,
        totalWeightG: 2000
      }
    });
    expect(result.selectedSessionView?.entries).toHaveLength(3);
    expect(result.selectedSessionView?.entries[0]).toMatchObject({
      id: "entry-01",
      createdAtLabel: "10:01"
    });
  });

  it("selects requested open session and reports invalid documents", () => {
    const firstSession = createSession("session-1");
    const secondSession = createSession("session-2", {
      workerId: "worker-bartek-test",
      workerNameSnapshot: "Bartek Test",
      planIdSnapshot: "plan-quantity-ubianka",
      planNameSnapshot: "Za ubianke",
      calculationBasisSnapshot: "QUANTITY",
      unitLabelSnapshot: "ubianka",
      rateVersionIdSnapshot: "rate-worker-bartek-test-2026-07-01",
      rateGroszSnapshot: 1500,
      weightRequiredSnapshot: false,
      quantityPrecisionSnapshot: 1
    });
    const result = buildHarvestSessionDashboard({
      sessionDocuments: [
        { id: firstSession.id, data: firstSession },
        { id: secondSession.id, data: secondSession },
        { id: "broken-session", data: { ...firstSession, id: "other-id" } }
      ],
      entryDocuments: [{ id: "broken-entry", data: { id: "broken-entry" } }],
      seasonDocuments: [{ id: "broken-season", data: { id: "broken-season" } }],
      selectedSessionId: "session-2",
      isOnline: false
    });

    expect(result.selectedSessionId).toBe("session-2");
    expect(result.selectedSessionView?.session.workerNameSnapshot).toBe("Bartek Test");
    expect(result.selectedSessionView?.isOnline).toBe(false);
    expect(result.invalidSessions).toEqual([
      { id: "broken-session", reason: "Sesja ma niezgodny identyfikator." }
    ]);
    expect(result.invalidEntries).toEqual([
      { id: "broken-entry", reason: "Wpis nie ma wymaganych danych." }
    ]);
    expect(result.invalidSeasons).toEqual([
      { id: "broken-season", reason: "Sezon nie ma wymaganych danych." }
    ]);
  });

  it("returns closed sessions separately for admin reopen flow", () => {
    const openSession = createSession("session-open");
    const closedSession = createSession("session-closed", {
      status: "CLOSED",
      amountDueGrosz: 1000,
      closedAtDevice: "2026-07-17T10:00:00.000Z",
      closedAtServer: "2026-07-17T10:00:01.000Z",
      closedBy: "operator-1",
      revision: 2
    });
    const result = buildHarvestSessionDashboard({
      sessionDocuments: [
        { id: openSession.id, data: openSession },
        { id: closedSession.id, data: closedSession }
      ],
      entryDocuments: [],
      seasonDocuments: [{ id: seed.seasons[0].id, data: seed.seasons[0] }],
      actorProfile: { uid: "admin-1", role: "ADMIN" },
      isOnline: true
    });

    expect(result.openSessions.map((session) => session.id)).toEqual(["session-open"]);
    expect(result.closedSessions.map((session) => session.id)).toEqual([
      "session-closed"
    ]);
    expect(result.selectedSessionId).toBe("session-open");
  });
});

function createSession(
  id: string,
  overrides: Partial<HarvestSessionDocument> = {}
): HarvestSessionDocument {
  const prepared = prepareOpenHarvestSession({
    actorProfile: operatorProfile,
    id,
    season: seed.seasons[0],
    worker: seed.workers[0],
    plans: seed.settlementPlans,
    rateVersions: seed.workerRateVersions,
    businessDate: "2026-07-17",
    existingSessions: [],
    isOnline: true,
    createdDeviceId: "device-1",
    createdAtDevice: createdAt
  });

  if (prepared.status !== "CREATED") {
    throw new Error("Expected session creation.");
  }

  return {
    ...prepared.session,
    createdAtServer: createdAt,
    ...overrides
  };
}

function createEntry(
  session: HarvestSessionDocument,
  sequenceNumber: number,
  overrides: Record<string, unknown> = {}
) {
  const id = `entry-${String(sequenceNumber).padStart(2, "0")}`;

  return {
    id,
    sessionId: session.id,
    seasonId: session.seasonId,
    workerId: session.workerId,
    businessDate: session.businessDate,
    status: "ACTIVE",
    sequenceNumber,
    quantityMilli: 1000,
    weightG: 1000,
    amountPreviewGrosz: 1000,
    stockWeightG: 1000,
    pendingSync: false,
    createdBy: operatorProfile.uid,
    createdDeviceId: "device-1",
    createdAtDevice: `2026-07-17T08:${String(sequenceNumber).padStart(2, "0")}:00.000Z`,
    createdAtServer: createdAt,
    replacesEntryId: null,
    cancellationReason: null,
    cancelledBy: null,
    cancelledAtServer: null,
    revision: 1,
    ...overrides
  };
}
