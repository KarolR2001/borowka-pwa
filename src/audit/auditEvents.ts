import { getFirebaseServices } from "../config/firebaseServices";
import { USER_ROLES, type UserProfile, type UserRole } from "../domain/identity";

export const AUDIT_EVENTS_COLLECTION = "auditEvents";

export const AUDIT_ACTIONS = [
  "USER_ROLE_CHANGED",
  "USER_WORKER_LINK_CHANGED",
  "USER_BLOCKED",
  "USER_REACTIVATED",
  "REGISTRATION_INVITATION_CREATED",
  "REGISTRATION_INVITATION_CANCELLED",
  "REGISTRATION_INVITATION_EXPIRED",
  "SEASON_CREATED",
  "SEASON_OPENED",
  "SEASON_CLOSED",
  "SEASON_REOPENED",
  "SEASON_ARCHIVED",
  "SEASON_DEFAULT_CHANGED",
  "SETTLEMENT_PLAN_CREATED",
  "SETTLEMENT_PLAN_UPDATED",
  "SETTLEMENT_PLAN_ARCHIVED",
  "WORKER_CREATED",
  "WORKER_ARCHIVED",
  "WORKER_RATE_CHANGED",
  "HARVEST_SESSION_CREATED",
  "HARVEST_SESSION_CLOSED",
  "HARVEST_SESSION_RECLOSED",
  "HARVEST_SESSION_REOPENED",
  "HARVEST_SESSION_CANCELLED",
  "HARVEST_SESSION_MARKED_REVIEW_REQUIRED",
  "HARVEST_SESSION_REVIEW_RESOLVED",
  "HARVEST_SESSION_PAID",
  "PAYMENT_CANCELLED",
  "HARVEST_ENTRY_CREATED",
  "HARVEST_ENTRY_CANCELLED"
] as const;

export const AUDIT_ENTITY_TYPES = [
  "USER_PROFILE",
  "REGISTRATION_INVITATION",
  "SEASON",
  "SETTLEMENT_PLAN",
  "WORKER",
  "HARVEST_SESSION",
  "HARVEST_ENTRY",
  "PAYMENT"
] as const;

type FirebaseEnv = Record<string, string | boolean | undefined>;

export type AuditAction = (typeof AUDIT_ACTIONS)[number];
export type AuditEntityType = (typeof AUDIT_ENTITY_TYPES)[number];
export type AuditSummaryValue = string | number | boolean | null;
export type AuditSummary = Record<string, AuditSummaryValue>;

export type AuditEventDocument = {
  id: string;
  actorUid: string;
  actorRoleSnapshot: UserRole;
  action: AuditAction;
  entityType: AuditEntityType;
  entityId: string;
  businessDate: string | null;
  beforeSummary: AuditSummary | null;
  afterSummary: AuditSummary | null;
  reason: string | null;
  createdAtDevice: unknown;
  createdAtServer: unknown;
  deviceId: string;
};

export type AuditEventDraftInput = {
  id: string;
  actorUid: string;
  actorRoleSnapshot: UserRole;
  action: AuditAction;
  entityType: AuditEntityType;
  entityId: string;
  businessDate?: string | null;
  beforeSummary?: AuditSummary | null;
  afterSummary?: AuditSummary | null;
  reason?: string | null;
  createdAtDevice: unknown;
  createdAtServer: unknown;
  deviceId: string;
};

export type CreateAuditEventInput = {
  actorProfile: UserProfile;
  action: AuditAction;
  entityType: AuditEntityType;
  entityId: string;
  businessDate?: string | null;
  beforeSummary?: AuditSummary | null;
  afterSummary?: AuditSummary | null;
  reason?: string | null;
  deviceId: string;
};

export type AuditEventDecodeResult =
  | {
      status: "FOUND";
      event: AuditEventDocument;
    }
  | {
      status: "INVALID";
      reason: string;
    };

export async function createAuditEvent(
  env: FirebaseEnv,
  input: CreateAuditEventInput
): Promise<AuditEventDocument> {
  const { firestore } = await getFirebaseServices(env);
  const { Timestamp, doc, serverTimestamp, setDoc } = await import("firebase/firestore");
  const id = createAuditEventId();
  const event = createAuditEventDraft({
    id,
    actorUid: input.actorProfile.uid,
    actorRoleSnapshot: input.actorProfile.role,
    action: input.action,
    entityType: input.entityType,
    entityId: input.entityId,
    businessDate: input.businessDate,
    beforeSummary: input.beforeSummary,
    afterSummary: input.afterSummary,
    reason: input.reason,
    createdAtDevice: Timestamp.now(),
    createdAtServer: serverTimestamp(),
    deviceId: input.deviceId
  });

  await setDoc(doc(firestore, AUDIT_EVENTS_COLLECTION, id), event);

  return event;
}

export function createAuditEventDraft(input: AuditEventDraftInput): AuditEventDocument {
  const id = requiredTrimmed(input.id, "Zdarzenie audytowe wymaga id.");
  const actorUid = requiredTrimmed(input.actorUid, "Zdarzenie audytowe wymaga aktora.");
  const entityId = requiredTrimmed(
    input.entityId,
    "Zdarzenie audytowe wymaga identyfikatora obiektu."
  );
  const deviceId = requiredTrimmed(
    input.deviceId,
    "Zdarzenie audytowe wymaga identyfikatora urzadzenia."
  );

  if (!isAuditAction(input.action)) {
    throw new Error("Zdarzenie audytowe ma nieznana akcje.");
  }

  if (!isAuditEntityType(input.entityType)) {
    throw new Error("Zdarzenie audytowe ma nieznany typ obiektu.");
  }

  if (!USER_ROLES.includes(input.actorRoleSnapshot)) {
    throw new Error("Zdarzenie audytowe ma nieznana role aktora.");
  }

  return {
    id,
    actorUid,
    actorRoleSnapshot: input.actorRoleSnapshot,
    action: input.action,
    entityType: input.entityType,
    entityId,
    businessDate: optionalTrimmed(input.businessDate),
    beforeSummary: normalizeAuditSummary(input.beforeSummary),
    afterSummary: normalizeAuditSummary(input.afterSummary),
    reason: optionalTrimmed(input.reason),
    createdAtDevice: input.createdAtDevice,
    createdAtServer: input.createdAtServer,
    deviceId
  };
}

export function decodeAuditEvent(
  expectedId: string,
  data: unknown
): AuditEventDecodeResult {
  if (!isRecord(data)) {
    return invalidAuditEvent("Zdarzenie audytowe ma nieprawidlowy format.");
  }

  const id = readRequiredString(data, "id");
  const actorUid = readRequiredString(data, "actorUid");
  const actorRoleSnapshot = data.actorRoleSnapshot;
  const action = data.action;
  const entityType = data.entityType;
  const entityId = readRequiredString(data, "entityId");
  const deviceId = readRequiredString(data, "deviceId");
  const beforeSummary = decodeAuditSummary(data.beforeSummary);
  const afterSummary = decodeAuditSummary(data.afterSummary);

  if (!id || id !== expectedId) {
    return invalidAuditEvent("Zdarzenie audytowe ma niezgodny identyfikator.");
  }

  if (!actorUid || !entityId || !deviceId) {
    return invalidAuditEvent("Zdarzenie audytowe nie ma wymaganych danych.");
  }

  if (!USER_ROLES.includes(actorRoleSnapshot as UserRole)) {
    return invalidAuditEvent("Zdarzenie audytowe ma nieznana role aktora.");
  }

  if (!isAuditAction(action)) {
    return invalidAuditEvent("Zdarzenie audytowe ma nieznana akcje.");
  }

  if (!isAuditEntityType(entityType)) {
    return invalidAuditEvent("Zdarzenie audytowe ma nieznany typ obiektu.");
  }

  if (data.businessDate !== null && typeof data.businessDate !== "string") {
    return invalidAuditEvent("Zdarzenie audytowe ma nieprawidlowa date biznesowa.");
  }

  if (data.reason !== null && typeof data.reason !== "string") {
    return invalidAuditEvent("Zdarzenie audytowe ma nieprawidlowy powod.");
  }

  if (beforeSummary.status === "INVALID") {
    return beforeSummary;
  }

  if (afterSummary.status === "INVALID") {
    return afterSummary;
  }

  return {
    status: "FOUND",
    event: {
      id,
      actorUid,
      actorRoleSnapshot: actorRoleSnapshot as UserRole,
      action,
      entityType,
      entityId,
      businessDate: data.businessDate ?? null,
      beforeSummary: beforeSummary.summary,
      afterSummary: afterSummary.summary,
      reason: data.reason ?? null,
      createdAtDevice: data.createdAtDevice,
      createdAtServer: data.createdAtServer,
      deviceId
    }
  };
}

export function isAuditAction(value: unknown): value is AuditAction {
  return AUDIT_ACTIONS.includes(value as AuditAction);
}

export function isAuditEntityType(value: unknown): value is AuditEntityType {
  return AUDIT_ENTITY_TYPES.includes(value as AuditEntityType);
}

function normalizeAuditSummary(summary: AuditSummary | null | undefined) {
  if (!summary) {
    return null;
  }

  const normalized: AuditSummary = {};

  for (const [key, value] of Object.entries(summary)) {
    if (!isAuditSummaryValue(value)) {
      throw new Error("Podsumowanie audytu ma nieobslugiwany typ wartosci.");
    }

    normalized[key.trim()] = typeof value === "string" ? value.trim() : value;
  }

  return Object.keys(normalized).length > 0 ? normalized : null;
}

function decodeAuditSummary(
  summary: unknown
):
  | { status: "FOUND"; summary: AuditSummary | null }
  | { status: "INVALID"; reason: string } {
  if (summary === null || summary === undefined) {
    return {
      status: "FOUND",
      summary: null
    };
  }

  if (!isRecord(summary)) {
    return {
      status: "INVALID",
      reason: "Podsumowanie audytu ma nieprawidlowy format."
    };
  }

  const decoded: AuditSummary = {};

  for (const [key, value] of Object.entries(summary)) {
    if (!isAuditSummaryValue(value)) {
      return {
        status: "INVALID",
        reason: "Podsumowanie audytu ma nieobslugiwany typ wartosci."
      };
    }

    decoded[key] = value;
  }

  return {
    status: "FOUND",
    summary: decoded
  };
}

function isAuditSummaryValue(value: unknown): value is AuditSummaryValue {
  return (
    value === null ||
    typeof value === "string" ||
    typeof value === "boolean" ||
    (typeof value === "number" && Number.isFinite(value))
  );
}

function invalidAuditEvent(reason: string): AuditEventDecodeResult {
  return {
    status: "INVALID",
    reason
  };
}

export function createAuditEventId(): string {
  if ("randomUUID" in globalThis.crypto) {
    return globalThis.crypto.randomUUID();
  }

  return `audit-${String(Date.now())}-${Math.random().toString(36).slice(2)}`;
}

function requiredTrimmed(value: string, message: string): string {
  const trimmed = value.trim();

  if (!trimmed) {
    throw new Error(message);
  }

  return trimmed;
}

function optionalTrimmed(value: string | null | undefined): string | null {
  if (value === null || value === undefined) {
    return null;
  }

  const trimmed = value.trim();

  return trimmed.length > 0 ? trimmed : null;
}

function readRequiredString(data: Record<string, unknown>, key: string): string | null {
  const value = data[key];

  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();

  return trimmed.length > 0 ? trimmed : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
