import {
  createAuditEventDraft,
  createAuditEventId,
  type AuditAction,
  type AuditSummary
} from "../audit/auditEvents";
import { getFirebaseServices } from "../config/firebaseServices";
import {
  decodeUserProfile,
  isUserRole,
  roleRequiresWorkerId,
  type UserProfile,
  type UserRole
} from "../domain/identity";

type FirebaseEnv = Record<string, string | boolean | undefined>;

export type UserRoleAndWorkerUpdateInput = {
  actorProfile: UserProfile;
  targetUid: string;
  targetRole: UserRole;
  targetWorkerId?: string | null;
  reason: string;
  deviceId: string;
};

export type PrepareUserRoleAndWorkerUpdateInput = {
  actorProfile: UserProfile;
  targetProfile: UserProfile;
  targetRole: UserRole;
  targetWorkerId?: string | null;
  reason: string;
  deviceId: string;
  activeProfilesWithRequestedWorker?: UserProfile[];
};

export type PreparedUserRoleAndWorkerUpdate = {
  updatedProfile: UserProfile;
  auditAction: AuditAction;
  beforeSummary: AuditSummary;
  afterSummary: AuditSummary;
  reason: string;
  deviceId: string;
};

export async function updateUserRoleAndWorker(
  env: FirebaseEnv,
  input: UserRoleAndWorkerUpdateInput
): Promise<PreparedUserRoleAndWorkerUpdate> {
  const { firestore } = await getFirebaseServices(env);
  const { Timestamp, collection, doc, getDoc, getDocs, serverTimestamp, writeBatch } =
    await import("firebase/firestore/lite");
  const userRef = doc(firestore, "users", input.targetUid);
  const snapshot = await getDoc(userRef);

  if (!snapshot.exists()) {
    throw new Error("Profil uzytkownika nie istnieje.");
  }

  const decoded = decodeUserProfile(input.targetUid, snapshot.data());

  if (decoded.status === "INVALID") {
    throw new Error(decoded.reason);
  }

  const usersSnapshot = await getDocs(collection(firestore, "users"));
  const activeProfilesWithRequestedWorker: UserProfile[] = [];
  const requestedWorkerId = normalizeOptionalId(
    input.targetWorkerId === undefined ? decoded.profile.workerId : input.targetWorkerId
  );

  for (const userDocument of usersSnapshot.docs) {
    const decodedUser = decodeUserProfile(userDocument.id, userDocument.data());

    if (
      decodedUser.status === "FOUND" &&
      decodedUser.profile.active &&
      requestedWorkerId &&
      decodedUser.profile.workerId === requestedWorkerId
    ) {
      activeProfilesWithRequestedWorker.push(decodedUser.profile);
    }
  }

  const prepared = prepareUserRoleAndWorkerUpdate({
    actorProfile: input.actorProfile,
    targetProfile: decoded.profile,
    targetRole: input.targetRole,
    targetWorkerId: input.targetWorkerId,
    reason: input.reason,
    deviceId: input.deviceId,
    activeProfilesWithRequestedWorker
  });
  const auditId = createAuditEventId();
  const auditRef = doc(firestore, "auditEvents", auditId);
  const auditEvent = createAuditEventDraft({
    id: auditId,
    actorUid: input.actorProfile.uid,
    actorRoleSnapshot: input.actorProfile.role,
    action: prepared.auditAction,
    entityType: "USER_PROFILE",
    entityId: input.targetUid,
    beforeSummary: prepared.beforeSummary,
    afterSummary: prepared.afterSummary,
    reason: prepared.reason,
    createdAtDevice: Timestamp.now(),
    createdAtServer: serverTimestamp(),
    deviceId: prepared.deviceId
  });
  const batch = writeBatch(firestore);

  batch.update(userRef, {
    role: prepared.updatedProfile.role,
    workerId: prepared.updatedProfile.workerId
  });
  batch.set(auditRef, auditEvent);
  await batch.commit();

  return prepared;
}

export function prepareUserRoleAndWorkerUpdate(
  input: PrepareUserRoleAndWorkerUpdateInput
): PreparedUserRoleAndWorkerUpdate {
  const targetRole = input.targetRole;
  const reason = normalizeRequiredText(input.reason, "Podaj powod zmiany profilu.");
  const deviceId = normalizeRequiredText(
    input.deviceId,
    "Brak identyfikatora urzadzenia dla audytu."
  );

  if (!canAdministerUsers(input.actorProfile)) {
    throw new Error("Zmiana profilu wymaga aktywnego administratora.");
  }

  if (
    !input.targetProfile.active ||
    input.targetProfile.registrationStatus !== "APPROVED"
  ) {
    throw new Error("Zmiana roli wymaga aktywnego zatwierdzonego profilu.");
  }

  if (!isUserRole(targetRole)) {
    throw new Error("Nieznana rola uzytkownika.");
  }

  if (
    input.actorProfile.uid === input.targetProfile.uid &&
    input.targetProfile.role === "ADMIN" &&
    targetRole !== "ADMIN"
  ) {
    throw new Error("Administrator nie moze zmienic wlasnej roli.");
  }

  const targetWorkerId = normalizeOptionalId(
    input.targetWorkerId === undefined
      ? input.targetProfile.workerId
      : input.targetWorkerId
  );

  if (roleRequiresWorkerId(targetRole) && !targetWorkerId) {
    throw new Error("Rola Zbieracz wymaga workerId.");
  }

  const workerConflict = findActiveWorkerLinkConflict(
    input.activeProfilesWithRequestedWorker ?? [],
    input.targetProfile.uid,
    targetWorkerId
  );

  if (workerConflict) {
    throw new Error("Ten workerId jest juz przypisany do aktywnego konta.");
  }

  const updatedProfile = {
    ...input.targetProfile,
    role: targetRole,
    workerId: targetWorkerId
  };

  if (
    updatedProfile.role === input.targetProfile.role &&
    updatedProfile.workerId === input.targetProfile.workerId
  ) {
    throw new Error("Nie wybrano zmiany roli ani powiazania.");
  }

  return {
    updatedProfile,
    auditAction:
      updatedProfile.role !== input.targetProfile.role
        ? "USER_ROLE_CHANGED"
        : "USER_WORKER_LINK_CHANGED",
    beforeSummary: userProfileAuditSummary(input.targetProfile),
    afterSummary: userProfileAuditSummary(updatedProfile),
    reason,
    deviceId
  };
}

export function findActiveWorkerLinkConflict(
  profiles: UserProfile[],
  targetUid: string,
  workerId: string | null
): UserProfile | null {
  if (!workerId) {
    return null;
  }

  return (
    profiles.find(
      (profile) =>
        profile.uid !== targetUid && profile.active && profile.workerId === workerId
    ) ?? null
  );
}

function canAdministerUsers(profile: UserProfile): boolean {
  return (
    profile.role === "ADMIN" &&
    profile.active &&
    profile.registrationStatus === "APPROVED"
  );
}

function userProfileAuditSummary(profile: UserProfile): AuditSummary {
  return {
    uid: profile.uid,
    email: profile.email,
    displayName: profile.displayName,
    role: profile.role,
    workerId: profile.workerId ?? null,
    active: profile.active,
    registrationStatus: profile.registrationStatus,
    offlineConsent: profile.offlineConsent
  };
}

function normalizeRequiredText(value: string, message: string): string {
  const trimmed = value.trim();

  if (!trimmed) {
    throw new Error(message);
  }

  return trimmed;
}

function normalizeOptionalId(value: string | null | undefined): string | null {
  if (value === null || value === undefined) {
    return null;
  }

  const trimmed = value.trim();

  return trimmed.length > 0 ? trimmed : null;
}
