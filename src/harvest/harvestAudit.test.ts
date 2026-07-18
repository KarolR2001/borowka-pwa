import { createInitialDomainSeed } from "../domain/domainConfiguration";
import type { UserProfile } from "../domain/identity";
import type { CorrectableHarvestEntry } from "./harvestEntryCorrection";
import {
  HARVEST_OPERATION_AUDIT_ACTIONS,
  createHarvestEntryCorrectionAuditEvents,
  createHarvestOperationAuditEventDraft,
  harvestAuditEntityTypeForAction,
  harvestEntryAuditSummary,
  harvestSessionAuditSummary,
  isHarvestAuditReasonRequired,
  resolveHarvestSessionCloseAuditAction
} from "./harvestAudit";
import {
  prepareOpenHarvestSession,
  type HarvestSessionDocument
} from "./openHarvestSession";

const createdAt = "2026-07-17T10:00:00.000Z";
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

function createSession(
  overrides: Partial<HarvestSessionDocument> = {}
): HarvestSessionDocument {
  const result = prepareOpenHarvestSession({
    actorProfile: adminProfile,
    id: "session-1",
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

  if (result.status !== "CREATED") {
    throw new Error("Expected created session.");
  }

  return {
    ...result.session,
    ...overrides
  };
}

function entry(
  overrides: Partial<CorrectableHarvestEntry> = {}
): CorrectableHarvestEntry {
  return {
    id: "entry-1",
    sequenceNumber: 1,
    sessionId: "session-1",
    seasonId: "season-2026-test",
    workerId: "worker-anna-test",
    businessDate: "2026-07-17",
    status: "ACTIVE",
    pendingSync: false,
    createdBy: "operator-1",
    createdDeviceId: "device-1",
    quantityMilli: 1000,
    weightG: 1000,
    ...overrides
  };
}

describe("harvest operation audit contract", () => {
  it("lists MVP harvest audit actions and maps them to entity types", () => {
    expect(HARVEST_OPERATION_AUDIT_ACTIONS).toEqual([
      "HARVEST_SESSION_CREATED",
      "HARVEST_SESSION_CLOSED",
      "HARVEST_SESSION_RECLOSED",
      "HARVEST_SESSION_REOPENED",
      "HARVEST_SESSION_CANCELLED",
      "HARVEST_SESSION_MARKED_REVIEW_REQUIRED",
      "HARVEST_SESSION_REVIEW_RESOLVED",
      "HARVEST_ENTRY_CREATED",
      "HARVEST_ENTRY_CANCELLED"
    ]);
    expect(harvestAuditEntityTypeForAction("HARVEST_SESSION_CREATED")).toBe(
      "HARVEST_SESSION"
    );
    expect(harvestAuditEntityTypeForAction("HARVEST_ENTRY_CANCELLED")).toBe(
      "HARVEST_ENTRY"
    );
    expect(isHarvestAuditReasonRequired("HARVEST_ENTRY_CANCELLED")).toBe(true);
    expect(isHarvestAuditReasonRequired("HARVEST_ENTRY_CREATED")).toBe(false);
  });

  it("creates session audit events with a Rules-compatible summary", () => {
    const session = createSession();
    const event = createHarvestOperationAuditEventDraft({
      id: "audit-session-created",
      actorProfile: adminProfile,
      action: "HARVEST_SESSION_CREATED",
      entityId: session.id,
      businessDate: session.businessDate,
      beforeSummary: null,
      afterSummary: harvestSessionAuditSummary(session),
      createdAtDevice: createdAt,
      createdAtServer: "server-time",
      deviceId: "device-1"
    });

    expect(event).toMatchObject({
      id: "audit-session-created",
      actorUid: "admin-1",
      actorRoleSnapshot: "ADMIN",
      action: "HARVEST_SESSION_CREATED",
      entityType: "HARVEST_SESSION",
      entityId: "session-1",
      businessDate: "2026-07-17",
      reason: null,
      afterSummary: {
        status: "OPEN",
        seasonId: "season-2026-test",
        workerId: "worker-anna-test",
        planId: "plan-weight-kg",
        rateVersionId: "rate-worker-anna-test-2026-07-01",
        rateGroszPerUnit: 1000,
        totalEntryCount: 0,
        amountDueGrosz: null,
        revision: 1
      }
    });
    expect(event.afterSummary).not.toHaveProperty("rateGrosz");
  });

  it("distinguishes first close from a later reclose", () => {
    expect(resolveHarvestSessionCloseAuditAction(createSession())).toBe(
      "HARVEST_SESSION_CLOSED"
    );
    expect(resolveHarvestSessionCloseAuditAction(createSession({ revision: 3 }))).toBe(
      "HARVEST_SESSION_RECLOSED"
    );
  });

  it("requires reasons for cancellation and review-related harvest audit actions", () => {
    expect(() =>
      createHarvestOperationAuditEventDraft({
        id: "audit-cancel",
        actorProfile: adminProfile,
        action: "HARVEST_SESSION_CANCELLED",
        entityId: "session-1",
        businessDate: "2026-07-17",
        beforeSummary: harvestSessionAuditSummary(createSession()),
        afterSummary: harvestSessionAuditSummary(
          createSession({
            status: "CANCELLED",
            revision: 2
          })
        ),
        reason: " ",
        createdAtDevice: createdAt,
        createdAtServer: "server-time",
        deviceId: "device-1"
      })
    ).toThrow("Audyt operacji zbioru wymaga powodu.");
  });

  it("creates paired entry audit events for correction by cancel and replacement", () => {
    const originalEntry = entry();
    const cancelledEntry = {
      ...originalEntry,
      status: "CANCELLED" as const,
      cancellationReason: "Bledna waga",
      cancelledBy: "admin-1"
    };
    const replacementEntry = {
      ...originalEntry,
      id: "entry-2",
      sequenceNumber: 2,
      pendingSync: true,
      createdBy: "admin-1",
      quantityMilli: 1250,
      weightG: 1250,
      replacesEntryId: "entry-1"
    };

    const [cancelEvent, replacementEvent] = createHarvestEntryCorrectionAuditEvents({
      cancellationAuditId: "audit-entry-cancel",
      replacementAuditId: "audit-entry-replacement",
      actorProfile: adminProfile,
      entryBeforeCancellation: originalEntry,
      entryAfterCancellation: cancelledEntry,
      replacementEntry,
      reason: " Bledna waga w potwierdzonym wpisie ",
      createdAtDevice: createdAt,
      createdAtServer: "server-time",
      deviceId: "device-1"
    });

    expect(cancelEvent).toMatchObject({
      action: "HARVEST_ENTRY_CANCELLED",
      entityType: "HARVEST_ENTRY",
      entityId: "entry-1",
      reason: "Bledna waga w potwierdzonym wpisie",
      beforeSummary: harvestEntryAuditSummary(originalEntry),
      afterSummary: {
        entryId: "entry-1",
        status: "CANCELLED",
        cancelledBy: "admin-1"
      }
    });
    expect(replacementEvent).toMatchObject({
      action: "HARVEST_ENTRY_CREATED",
      entityType: "HARVEST_ENTRY",
      entityId: "entry-2",
      reason: "Bledna waga w potwierdzonym wpisie",
      beforeSummary: null,
      afterSummary: {
        entryId: "entry-2",
        status: "ACTIVE",
        quantityMilli: 1250,
        replacesEntryId: "entry-1"
      }
    });
  });
});
