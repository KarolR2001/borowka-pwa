import { getFirebaseServices } from "../config/firebaseServices";
import {
  REGISTRATION_STATUSES,
  USER_ROLES,
  decodeUserProfile,
  normalizeEmail,
  type RegistrationStatus,
  type UserProfile,
  type UserRole
} from "../domain/identity";

type FirebaseEnv = Record<string, string | boolean | undefined>;

export type UserDirectoryDocument = {
  id: string;
  data: unknown;
};

export type InvalidUserProfile = {
  id: string;
  reason: string;
};

export type UserDirectoryResult = {
  profiles: UserProfile[];
  invalidProfiles: InvalidUserProfile[];
};

export type UserDirectoryFilters = {
  search: string;
  role: UserRole | "ALL";
  registrationStatus: RegistrationStatus | "ALL";
  activity: "ALL" | "ACTIVE" | "INACTIVE";
};

export const defaultUserDirectoryFilters: UserDirectoryFilters = {
  search: "",
  role: "ALL",
  registrationStatus: "ALL",
  activity: "ALL"
};

export async function listUserDirectory(env: FirebaseEnv): Promise<UserDirectoryResult> {
  const { firestore } = await getFirebaseServices(env);
  const { collection, getDocs } = await import("firebase/firestore");
  const snapshot = await getDocs(collection(firestore, "users"));
  const documents = snapshot.docs.map((documentSnapshot) => ({
    id: documentSnapshot.id,
    data: documentSnapshot.data()
  }));

  return decodeUserDirectoryDocuments(documents);
}

export function decodeUserDirectoryDocuments(
  documents: UserDirectoryDocument[]
): UserDirectoryResult {
  const profiles: UserProfile[] = [];
  const invalidProfiles: InvalidUserProfile[] = [];

  for (const document of documents) {
    const decoded = decodeUserProfile(document.id, document.data);

    if (decoded.status === "FOUND") {
      profiles.push(decoded.profile);
    } else {
      invalidProfiles.push({
        id: document.id,
        reason: decoded.reason
      });
    }
  }

  return {
    profiles: sortUserProfiles(profiles),
    invalidProfiles: invalidProfiles.sort((left, right) =>
      left.id.localeCompare(right.id, "pl")
    )
  };
}

export function filterUserProfiles(
  profiles: UserProfile[],
  filters: UserDirectoryFilters
): UserProfile[] {
  const search = normalizeEmail(filters.search);

  return sortUserProfiles(
    profiles.filter((profile) => {
      if (filters.role !== "ALL" && profile.role !== filters.role) {
        return false;
      }

      if (
        filters.registrationStatus !== "ALL" &&
        profile.registrationStatus !== filters.registrationStatus
      ) {
        return false;
      }

      if (filters.activity === "ACTIVE" && !profile.active) {
        return false;
      }

      if (filters.activity === "INACTIVE" && profile.active) {
        return false;
      }

      if (!search) {
        return true;
      }

      return searchableProfileText(profile).includes(search);
    })
  );
}

export function sortUserProfiles(profiles: UserProfile[]): UserProfile[] {
  return [...profiles].sort((left, right) => {
    const groupDiff = profileSortGroup(left) - profileSortGroup(right);

    if (groupDiff !== 0) {
      return groupDiff;
    }

    const nameDiff = left.displayName.localeCompare(right.displayName, "pl", {
      sensitivity: "base"
    });

    if (nameDiff !== 0) {
      return nameDiff;
    }

    return left.email.localeCompare(right.email, "pl", {
      sensitivity: "base"
    });
  });
}

export function isUserDirectoryRoleFilter(
  value: string
): value is UserDirectoryFilters["role"] {
  return value === "ALL" || USER_ROLES.includes(value as UserRole);
}

export function isUserDirectoryStatusFilter(
  value: string
): value is UserDirectoryFilters["registrationStatus"] {
  return value === "ALL" || REGISTRATION_STATUSES.includes(value as RegistrationStatus);
}

export function isUserDirectoryActivityFilter(
  value: string
): value is UserDirectoryFilters["activity"] {
  return value === "ALL" || value === "ACTIVE" || value === "INACTIVE";
}

function profileSortGroup(profile: UserProfile): number {
  if (!profile.active || profile.registrationStatus !== "APPROVED") {
    return 3;
  }

  switch (profile.role) {
    case "ADMIN":
      return 0;
    case "OPERATOR":
      return 1;
    case "PICKER":
      return 2;
  }
}

function searchableProfileText(profile: UserProfile): string {
  return normalizeEmail(
    [
      profile.uid,
      profile.email,
      profile.displayName,
      profile.role,
      profile.registrationStatus,
      profile.workerId ?? ""
    ].join(" ")
  );
}
