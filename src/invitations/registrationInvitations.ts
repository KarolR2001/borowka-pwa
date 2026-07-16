import {
  isInvitationStatus,
  isUserRole,
  normalizeEmail,
  roleRequiresWorkerId,
  type InvitationStatus,
  type UserRole
} from "../domain/identity";

export const REGISTRATION_INVITATIONS_COLLECTION = "registrationInvitations";

export type RegistrationInvitationDocument = {
  id: string;
  emailNormalized: string;
  displayName: string;
  targetRole: UserRole;
  workerId: string | null;
  status: InvitationStatus;
  createdBy: string;
  createdAt: unknown;
  usedBy: string | null;
  usedAt: unknown;
  expiresAt: unknown;
};

export type RegistrationInvitationDraftInput = {
  id: string;
  email: string;
  displayName: string;
  targetRole: UserRole;
  workerId?: string | null;
  createdBy: string;
  createdAt: unknown;
  expiresAt?: unknown;
};

export type RegistrationInvitationDecodeResult =
  | {
      status: "FOUND";
      invitation: RegistrationInvitationDocument;
    }
  | {
      status: "INVALID";
      reason: string;
    };

export function createRegistrationInvitationDraft(
  input: RegistrationInvitationDraftInput
): RegistrationInvitationDocument {
  const workerId = normalizeOptionalId(input.workerId);

  if (roleRequiresWorkerId(input.targetRole) && !workerId) {
    throw new Error("Zaproszenie dla roli PICKER wymaga workerId.");
  }

  return {
    id: input.id.trim(),
    emailNormalized: normalizeEmail(input.email),
    displayName: input.displayName.trim(),
    targetRole: input.targetRole,
    workerId,
    status: "PENDING",
    createdBy: input.createdBy,
    createdAt: input.createdAt,
    usedBy: null,
    usedAt: null,
    expiresAt: input.expiresAt ?? null
  };
}

export function decodeRegistrationInvitation(
  expectedId: string,
  data: unknown
): RegistrationInvitationDecodeResult {
  if (!isRecord(data)) {
    return invalidInvitation("Zaproszenie ma nieprawidlowy format.");
  }

  const id = readRequiredString(data, "id");
  const emailNormalized = readRequiredString(data, "emailNormalized");
  const displayName = readRequiredString(data, "displayName");
  const targetRole = data.targetRole;
  const status = data.status;
  const createdBy = readRequiredString(data, "createdBy");
  const workerId = data.workerId;
  const usedBy = data.usedBy;

  if (!id || id !== expectedId) {
    return invalidInvitation("Zaproszenie ma niezgodny identyfikator.");
  }

  if (!emailNormalized || normalizeEmail(emailNormalized) !== emailNormalized) {
    return invalidInvitation("Zaproszenie ma nieprawidlowy e-mail.");
  }

  if (!displayName || !createdBy) {
    return invalidInvitation("Zaproszenie nie ma wymaganych danych.");
  }

  if (!isUserRole(targetRole)) {
    return invalidInvitation("Zaproszenie ma nieznana role.");
  }

  if (!isInvitationStatus(status)) {
    return invalidInvitation("Zaproszenie ma nieznany status.");
  }

  if (workerId !== null && typeof workerId !== "string") {
    return invalidInvitation("Zaproszenie ma nieprawidlowe powiazanie workerId.");
  }

  if (roleRequiresWorkerId(targetRole) && !workerId) {
    return invalidInvitation("Zaproszenie dla roli PICKER wymaga workerId.");
  }

  if (usedBy !== null && typeof usedBy !== "string") {
    return invalidInvitation("Zaproszenie ma nieprawidlowe powiazanie usedBy.");
  }

  return {
    status: "FOUND",
    invitation: {
      id,
      emailNormalized,
      displayName,
      targetRole,
      workerId,
      status,
      createdBy,
      createdAt: data.createdAt,
      usedBy,
      usedAt: data.usedAt ?? null,
      expiresAt: data.expiresAt ?? null
    }
  };
}

export function canCancelRegistrationInvitation(
  invitation: RegistrationInvitationDocument
): boolean {
  return invitation.status === "PENDING";
}

function invalidInvitation(reason: string): RegistrationInvitationDecodeResult {
  return {
    status: "INVALID",
    reason
  };
}

function normalizeOptionalId(value: string | null | undefined): string | null {
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
  return typeof value === "object" && value !== null;
}
