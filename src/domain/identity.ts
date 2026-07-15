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
