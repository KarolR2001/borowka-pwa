import { createInitialDomainSeed } from "../domain/domainConfiguration";
import type { UserProfile } from "../domain/identity";
import {
  buildOpenHarvestSessionConfiguration,
  prepareRuntimeOpenHarvestSession,
  selectDefaultOpenHarvestSeason
} from "./openHarvestSessionRuntime";
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
const adminProfile: UserProfile = {
  ...operatorProfile,
  uid: "admin-1",
  role: "ADMIN"
};

describe("openHarvestSessionRuntime", () => {
  it("builds opening configuration from active documents and reports invalid ones", () => {
    const session = createSession("session-1");
    const configuration = buildOpenHarvestSessionConfiguration({
      seasonDocuments: [
        { id: seed.seasons[0].id, data: seed.seasons[0] },
        {
          id: "closed-season",
          data: {
            ...seed.seasons[0],
            id: "closed-season",
            status: "CLOSED",
            isDefault: false
          }
        },
        { id: "broken-season", data: { id: "broken-season" } }
      ],
      workerDocuments: [
        { id: seed.workers[0].id, data: seed.workers[0] },
        {
          id: "archived-worker",
          data: { ...seed.workers[0], id: "archived-worker", active: false }
        },
        { id: "broken-worker", data: { id: "broken-worker" } }
      ],
      planDocuments: [
        { id: seed.settlementPlans[0].id, data: seed.settlementPlans[0] },
        {
          id: "archived-plan",
          data: { ...seed.settlementPlans[0], id: "archived-plan", active: false }
        }
      ],
      rateVersionDocuments: [
        { id: seed.workerRateVersions[0].id, data: seed.workerRateVersions[0] },
        {
          id: "inactive-rate",
          data: { ...seed.workerRateVersions[0], id: "inactive-rate", active: false }
        }
      ],
      sessionDocuments: [
        { id: session.id, data: session },
        { id: "broken-session", data: { ...session, id: "other-id" } }
      ]
    });

    expect(configuration.seasons).toHaveLength(1);
    expect(configuration.workers).toHaveLength(1);
    expect(configuration.plans).toHaveLength(1);
    expect(configuration.rateVersions).toHaveLength(1);
    expect(configuration.openSessions).toEqual([
      {
        id: "session-1",
        workerId: "worker-anna-test",
        businessDate: "2026-07-17",
        status: "OPEN"
      }
    ]);
    expect(selectDefaultOpenHarvestSeason(configuration)?.id).toBe(seed.seasons[0].id);
    expect(configuration.invalidSeasons).toEqual([
      { id: "broken-season", reason: "Sezon nie ma wymaganych danych." }
    ]);
    expect(configuration.invalidWorkers).toEqual([
      { id: "broken-worker", reason: "Zbieracz nie ma wymaganych danych." }
    ]);
    expect(configuration.invalidSessions).toEqual([
      { id: "broken-session", reason: "Sesja ma niezgodny identyfikator." }
    ]);
  });

  it("prepares a new open session from runtime configuration", () => {
    const configuration = buildOpenHarvestSessionConfiguration({
      seasonDocuments: [{ id: seed.seasons[0].id, data: seed.seasons[0] }],
      workerDocuments: [{ id: seed.workers[0].id, data: seed.workers[0] }],
      planDocuments: [{ id: seed.settlementPlans[0].id, data: seed.settlementPlans[0] }],
      rateVersionDocuments: [
        { id: seed.workerRateVersions[0].id, data: seed.workerRateVersions[0] }
      ],
      sessionDocuments: []
    });
    const prepared = prepareRuntimeOpenHarvestSession(configuration, {
      actorProfile: operatorProfile,
      id: "session-new",
      seasonId: seed.seasons[0].id,
      workerId: seed.workers[0].id,
      businessDate: "2026-07-17",
      note: "  poranny zbior  ",
      isOnline: true,
      createdDeviceId: "device-1",
      createdAtDevice: createdAt
    });

    expect(prepared.status).toBe("CREATED");
    if (prepared.status !== "CREATED") {
      throw new Error("Expected session creation.");
    }

    expect(prepared.session).toMatchObject({
      id: "session-new",
      seasonId: seed.seasons[0].id,
      workerId: seed.workers[0].id,
      workerNameSnapshot: "Anna Test",
      businessDate: "2026-07-17",
      status: "OPEN",
      planIdSnapshot: "plan-weight-kg",
      rateVersionIdSnapshot: "rate-worker-anna-test-2026-07-01",
      note: "poranny zbior",
      createdBy: "operator-1"
    });
    expect(prepared.auditAction).toBe("HARVEST_SESSION_CREATED");
  });

  it("returns existing same-day session for operator and allows admin second session with reason", () => {
    const existingSession = createSession("session-existing");
    const configuration = buildOpenHarvestSessionConfiguration({
      seasonDocuments: [{ id: seed.seasons[0].id, data: seed.seasons[0] }],
      workerDocuments: [{ id: seed.workers[0].id, data: seed.workers[0] }],
      planDocuments: [{ id: seed.settlementPlans[0].id, data: seed.settlementPlans[0] }],
      rateVersionDocuments: [
        { id: seed.workerRateVersions[0].id, data: seed.workerRateVersions[0] }
      ],
      sessionDocuments: [{ id: existingSession.id, data: existingSession }]
    });
    const operatorResult = prepareRuntimeOpenHarvestSession(configuration, {
      actorProfile: operatorProfile,
      id: "session-operator-second",
      seasonId: seed.seasons[0].id,
      workerId: seed.workers[0].id,
      businessDate: "2026-07-17",
      isOnline: true,
      createdDeviceId: "device-1",
      createdAtDevice: createdAt
    });
    const adminResult = prepareRuntimeOpenHarvestSession(configuration, {
      actorProfile: adminProfile,
      id: "session-admin-second",
      seasonId: seed.seasons[0].id,
      workerId: seed.workers[0].id,
      businessDate: "2026-07-17",
      secondSessionReason: "Drugi etap dnia.",
      isOnline: true,
      createdDeviceId: "device-1",
      createdAtDevice: createdAt
    });

    expect(operatorResult).toMatchObject({
      status: "CONTINUE_EXISTING",
      canCreateSecondSession: false
    });
    expect(adminResult.status).toBe("CREATED");
    if (adminResult.status !== "CREATED") {
      throw new Error("Expected admin second session creation.");
    }

    expect(adminResult.duplicateMode).toBe("SECOND_SESSION_CONFIRMED");
    expect(adminResult.reason).toBe("Drugi etap dnia.");
  });
});

function createSession(id: string): HarvestSessionDocument {
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
    createdAtServer: createdAt
  };
}
