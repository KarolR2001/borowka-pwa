export const USER_ROLES = ["ADMIN", "OPERATOR", "PICKER"] as const;
export type UserRole = (typeof USER_ROLES)[number];

export const REGISTRATION_STATUSES = ["APPROVED", "REJECTED", "BLOCKED"] as const;
export type RegistrationStatus = (typeof REGISTRATION_STATUSES)[number];

export const INVITATION_STATUSES = ["PENDING", "USED", "CANCELLED", "EXPIRED"] as const;
export type InvitationStatus = (typeof INVITATION_STATUSES)[number];

export type UserProfile = {
  uid: string;
  email: string;
  displayName: string;
  role: UserRole;
  workerId?: string | null;
  active: boolean;
  registrationStatus: RegistrationStatus;
  offlineConsent: boolean;
};

export type UserProfileDecodeResult =
  | {
      status: "FOUND";
      profile: UserProfile;
    }
  | {
      status: "INVALID";
      reason: string;
    };

export type RegistrationInvitation = {
  id: string;
  emailNormalized: string;
  displayName: string;
  targetRole: UserRole;
  workerId?: string | null;
  status: InvitationStatus;
  createdBy: string;
  createdAt: string;
  usedBy?: string | null;
  usedAt?: string | null;
  expiresAt?: string | null;
};

export type IdentityAccessState =
  | {
      status: "READY";
      role: UserRole;
    }
  | {
      status:
        "MISSING_PROFILE" | "BLOCKED" | "PENDING_APPROVAL" | "INVALID_PICKER_PROFILE";
      reason: string;
    };

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function isUserRole(value: unknown): value is UserRole {
  return USER_ROLES.includes(value as UserRole);
}

export function isRegistrationStatus(value: unknown): value is RegistrationStatus {
  return REGISTRATION_STATUSES.includes(value as RegistrationStatus);
}

export function isInvitationStatus(value: unknown): value is InvitationStatus {
  return INVITATION_STATUSES.includes(value as InvitationStatus);
}

export function roleRequiresWorkerId(role: UserRole): boolean {
  return role === "PICKER";
}

export function decodeUserProfile(
  expectedUid: string,
  data: unknown
): UserProfileDecodeResult {
  if (!isRecord(data)) {
    return invalidProfile("Profil uzytkownika ma nieprawidlowy format.");
  }

  const uid = readRequiredString(data, "uid");
  const email = readRequiredString(data, "email");
  const displayName = readRequiredString(data, "displayName");
  const role = data.role;
  const registrationStatus = data.registrationStatus;
  const active = data.active;
  const offlineConsent = data.offlineConsent;
  const workerId = data.workerId;

  if (!uid || uid !== expectedUid) {
    return invalidProfile("Profil uzytkownika ma niezgodny identyfikator.");
  }

  if (!email || !displayName) {
    return invalidProfile("Profil uzytkownika nie ma wymaganych danych.");
  }

  if (!isUserRole(role)) {
    return invalidProfile("Profil uzytkownika ma nieznana role.");
  }

  if (!isRegistrationStatus(registrationStatus)) {
    return invalidProfile("Profil uzytkownika ma nieznany status rejestracji.");
  }

  if (typeof active !== "boolean") {
    return invalidProfile("Profil uzytkownika ma nieprawidlowy status aktywnosci.");
  }

  if (typeof offlineConsent !== "boolean") {
    return invalidProfile("Profil uzytkownika ma nieprawidlowa zgode offline.");
  }

  if (workerId !== undefined && workerId !== null && typeof workerId !== "string") {
    return invalidProfile("Profil uzytkownika ma nieprawidlowe powiazanie workerId.");
  }

  return {
    status: "FOUND",
    profile: {
      uid,
      email,
      displayName,
      role,
      workerId: workerId ?? null,
      active,
      registrationStatus,
      offlineConsent
    }
  };
}

export function getIdentityAccessState(
  profile: UserProfile | null | undefined
): IdentityAccessState {
  if (!profile) {
    return {
      status: "MISSING_PROFILE",
      reason: "Konto nie ma jeszcze profilu aplikacji."
    };
  }

  if (!profile.active || profile.registrationStatus === "BLOCKED") {
    return {
      status: "BLOCKED",
      reason: "Konto jest zablokowane."
    };
  }

  if (profile.registrationStatus !== "APPROVED") {
    return {
      status: "PENDING_APPROVAL",
      reason: "Konto nie zostalo jeszcze zatwierdzone."
    };
  }

  if (profile.role === "PICKER" && !profile.workerId) {
    return {
      status: "INVALID_PICKER_PROFILE",
      reason: "Profil zbieracza wymaga powiazania z workerId."
    };
  }

  return {
    status: "READY",
    role: profile.role
  };
}

export function userRoleLabel(role: UserRole): string {
  switch (role) {
    case "ADMIN":
      return "Administrator";
    case "OPERATOR":
      return "Operator";
    case "PICKER":
      return "Zbieracz";
  }
}

export function registrationStatusLabel(status: RegistrationStatus): string {
  switch (status) {
    case "APPROVED":
      return "Zatwierdzone";
    case "REJECTED":
      return "Odrzucone";
    case "BLOCKED":
      return "Zablokowane";
  }
}

function invalidProfile(reason: string): UserProfileDecodeResult {
  return {
    status: "INVALID",
    reason
  };
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
