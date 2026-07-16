import { getFirebaseServices } from "../config/firebaseServices";
import {
  INVITATION_STATUSES,
  USER_ROLES,
  isInvitationStatus,
  isUserRole,
  normalizeEmail,
  roleRequiresWorkerId,
  type InvitationStatus,
  type UserRole
} from "../domain/identity";

export const REGISTRATION_INVITATIONS_COLLECTION = "registrationInvitations";

type FirebaseEnv = Record<string, string | boolean | undefined>;

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

export type RegistrationInvitationDocumentSnapshot = {
  id: string;
  data: unknown;
};

export type InvalidRegistrationInvitation = {
  id: string;
  reason: string;
};

export type RegistrationInvitationDirectoryResult = {
  invitations: RegistrationInvitationDocument[];
  invalidInvitations: InvalidRegistrationInvitation[];
};

export type RegistrationInvitationFilters = {
  search: string;
  targetRole: UserRole | "ALL";
  status: InvitationStatus | "ALL";
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

export type CreateRegistrationInvitationInput = {
  email: string;
  displayName: string;
  targetRole: UserRole;
  workerId?: string | null;
  createdBy: string;
  expiresAt?: Date | null;
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

export const defaultRegistrationInvitationFilters: RegistrationInvitationFilters = {
  search: "",
  targetRole: "ALL",
  status: "ALL"
};

export async function listRegistrationInvitations(
  env: FirebaseEnv
): Promise<RegistrationInvitationDirectoryResult> {
  const { firestore } = await getFirebaseServices(env);
  const { collection, getDocs } = await import("firebase/firestore/lite");
  const snapshot = await getDocs(
    collection(firestore, REGISTRATION_INVITATIONS_COLLECTION)
  );
  const documents = snapshot.docs.map((documentSnapshot) => ({
    id: documentSnapshot.id,
    data: documentSnapshot.data()
  }));

  return decodeRegistrationInvitationDocuments(documents);
}

export async function createRegistrationInvitation(
  env: FirebaseEnv,
  input: CreateRegistrationInvitationInput
): Promise<RegistrationInvitationDocument> {
  const { firestore } = await getFirebaseServices(env);
  const { Timestamp, doc, setDoc } = await import("firebase/firestore/lite");
  const id = createRegistrationInvitationId();
  const invitation = createRegistrationInvitationDraft({
    id,
    email: input.email,
    displayName: input.displayName,
    targetRole: input.targetRole,
    workerId: input.workerId,
    createdBy: input.createdBy,
    createdAt: Timestamp.now(),
    expiresAt: input.expiresAt ? Timestamp.fromDate(input.expiresAt) : null
  });

  await setDoc(doc(firestore, REGISTRATION_INVITATIONS_COLLECTION, id), invitation);

  return invitation;
}

export async function cancelRegistrationInvitation(
  env: FirebaseEnv,
  invitationId: string
): Promise<void> {
  const { firestore } = await getFirebaseServices(env);
  const { doc, updateDoc } = await import("firebase/firestore/lite");

  await updateDoc(doc(firestore, REGISTRATION_INVITATIONS_COLLECTION, invitationId), {
    status: "CANCELLED"
  });
}

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
    createdBy: input.createdBy.trim(),
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

export function decodeRegistrationInvitationDocuments(
  documents: RegistrationInvitationDocumentSnapshot[]
): RegistrationInvitationDirectoryResult {
  const invitations: RegistrationInvitationDocument[] = [];
  const invalidInvitations: InvalidRegistrationInvitation[] = [];

  for (const document of documents) {
    const decoded = decodeRegistrationInvitation(document.id, document.data);

    if (decoded.status === "FOUND") {
      invitations.push(decoded.invitation);
    } else {
      invalidInvitations.push({
        id: document.id,
        reason: decoded.reason
      });
    }
  }

  return {
    invitations: sortRegistrationInvitations(invitations),
    invalidInvitations: invalidInvitations.sort((left, right) =>
      left.id.localeCompare(right.id, "pl")
    )
  };
}

export function filterRegistrationInvitations(
  invitations: RegistrationInvitationDocument[],
  filters: RegistrationInvitationFilters
): RegistrationInvitationDocument[] {
  const search = normalizeEmail(filters.search);

  return sortRegistrationInvitations(
    invitations.filter((invitation) => {
      if (filters.targetRole !== "ALL" && invitation.targetRole !== filters.targetRole) {
        return false;
      }

      if (filters.status !== "ALL" && invitation.status !== filters.status) {
        return false;
      }

      if (!search) {
        return true;
      }

      return searchableInvitationText(invitation).includes(search);
    })
  );
}

export function sortRegistrationInvitations(
  invitations: RegistrationInvitationDocument[]
): RegistrationInvitationDocument[] {
  return [...invitations].sort((left, right) => {
    const statusDiff =
      invitationSortGroup(left.status) - invitationSortGroup(right.status);

    if (statusDiff !== 0) {
      return statusDiff;
    }

    const nameDiff = left.displayName.localeCompare(right.displayName, "pl", {
      sensitivity: "base"
    });

    if (nameDiff !== 0) {
      return nameDiff;
    }

    const emailDiff = left.emailNormalized.localeCompare(right.emailNormalized, "pl", {
      sensitivity: "base"
    });

    if (emailDiff !== 0) {
      return emailDiff;
    }

    return left.id.localeCompare(right.id, "pl");
  });
}

export function isRegistrationInvitationRoleFilter(
  value: string
): value is RegistrationInvitationFilters["targetRole"] {
  return value === "ALL" || USER_ROLES.includes(value as UserRole);
}

export function isRegistrationInvitationStatusFilter(
  value: string
): value is RegistrationInvitationFilters["status"] {
  return value === "ALL" || INVITATION_STATUSES.includes(value as InvitationStatus);
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

function createRegistrationInvitationId(): string {
  if ("randomUUID" in globalThis.crypto) {
    return globalThis.crypto.randomUUID();
  }

  return `invite-${String(Date.now())}-${Math.random().toString(36).slice(2)}`;
}

function invitationSortGroup(status: InvitationStatus): number {
  switch (status) {
    case "PENDING":
      return 0;
    case "USED":
      return 1;
    case "CANCELLED":
      return 2;
    case "EXPIRED":
      return 3;
  }
}

function searchableInvitationText(invitation: RegistrationInvitationDocument): string {
  return normalizeEmail(
    [
      invitation.id,
      invitation.emailNormalized,
      invitation.displayName,
      invitation.targetRole,
      invitation.status,
      invitation.workerId ?? ""
    ].join(" ")
  );
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
