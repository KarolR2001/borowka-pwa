import {
  createAuditEventDraft,
  decodeAuditEvent,
  isAuditAction,
  isAuditEntityType,
  type AuditEventDraftInput
} from "./auditEvents";

const baseAuditInput = (
  overrides: Partial<AuditEventDraftInput> = {}
): AuditEventDraftInput => ({
  id: "audit-1",
  actorUid: "admin-1",
  actorRoleSnapshot: "ADMIN",
  action: "USER_ROLE_CHANGED",
  entityType: "USER_PROFILE",
  entityId: "user-1",
  beforeSummary: {
    role: "PICKER",
    workerId: "worker-1"
  },
  afterSummary: {
    role: "OPERATOR",
    workerId: "worker-1"
  },
  reason: " Korekta roli po rozmowie ",
  createdAtDevice: "2026-07-16T08:00:00.000Z",
  createdAtServer: "server-time",
  deviceId: "device-1",
  ...overrides
});

describe("audit events", () => {
  it("creates normalized audit event drafts", () => {
    expect(createAuditEventDraft(baseAuditInput())).toEqual({
      id: "audit-1",
      actorUid: "admin-1",
      actorRoleSnapshot: "ADMIN",
      action: "USER_ROLE_CHANGED",
      entityType: "USER_PROFILE",
      entityId: "user-1",
      businessDate: null,
      beforeSummary: {
        role: "PICKER",
        workerId: "worker-1"
      },
      afterSummary: {
        role: "OPERATOR",
        workerId: "worker-1"
      },
      reason: "Korekta roli po rozmowie",
      createdAtDevice: "2026-07-16T08:00:00.000Z",
      createdAtServer: "server-time",
      deviceId: "device-1"
    });
  });

  it("rejects unsupported action, entity type and summary values", () => {
    expect(isAuditAction("USER_BLOCKED")).toBe(true);
    expect(isAuditAction("HARVEST_SESSION_CLOSED")).toBe(true);
    expect(isAuditAction("HARVEST_SESSION_REOPENED")).toBe(true);
    expect(isAuditAction("UNKNOWN")).toBe(false);
    expect(isAuditEntityType("USER_PROFILE")).toBe(true);
    expect(isAuditEntityType("HARVEST_SESSION")).toBe(true);
    expect(isAuditEntityType("SESSION")).toBe(false);

    expect(() =>
      createAuditEventDraft({
        ...baseAuditInput(),
        action: "UNKNOWN" as AuditEventDraftInput["action"]
      })
    ).toThrow("Zdarzenie audytowe ma nieznana akcje.");

    expect(() =>
      createAuditEventDraft({
        ...baseAuditInput(),
        beforeSummary: {
          nested: { value: "nie" } as never
        }
      })
    ).toThrow("Podsumowanie audytu ma nieobslugiwany typ wartosci.");
  });

  it("decodes valid audit documents", () => {
    const event = createAuditEventDraft(baseAuditInput());

    expect(decodeAuditEvent("audit-1", event)).toEqual({
      status: "FOUND",
      event
    });
  });

  it("rejects malformed audit documents", () => {
    const event = createAuditEventDraft(baseAuditInput());

    expect(decodeAuditEvent("other-id", event)).toMatchObject({
      status: "INVALID",
      reason: "Zdarzenie audytowe ma niezgodny identyfikator."
    });
    expect(
      decodeAuditEvent("audit-1", {
        ...event,
        actorRoleSnapshot: "OWNER"
      })
    ).toMatchObject({
      status: "INVALID",
      reason: "Zdarzenie audytowe ma nieznana role aktora."
    });
    expect(
      decodeAuditEvent("audit-1", {
        ...event,
        beforeSummary: ["bad"]
      })
    ).toMatchObject({
      status: "INVALID",
      reason: "Podsumowanie audytu ma nieprawidlowy format."
    });
  });
});
