import { getFirebaseFunctions, getFirebaseServices } from "../config/firebaseServices";
import { isUserRole, type UserProfile, type UserRole } from "../domain/identity";

type FirebaseEnv = Record<string, string | boolean | undefined>;

export const PASSWORD_RESET_REQUESTS_COLLECTION = "passwordResetRequests";
export const ADMIN_PASSWORD_MIN_LENGTH = 10;

export type PasswordResetRequestStatus = "PENDING" | "PROCESSING" | "COMPLETED";

export type PasswordResetRequest = {
  id: string;
  userUid: string;
  email: string;
  displayName: string;
  role: UserRole;
  status: PasswordResetRequestStatus;
  requestedAtIso: string | null;
};

export type PasswordResetRequestsResult = {
  requests: PasswordResetRequest[];
  invalidRequestCount: number;
};

export type CompletePasswordResetInput = {
  actorProfile: UserProfile;
  requestId: string;
  newPassword: string;
};

export async function listPasswordResetRequests(
  env: FirebaseEnv,
  input: { actorProfile: UserProfile }
): Promise<PasswordResetRequestsResult> {
  assertActiveAdmin(input.actorProfile);
  const { firestore } = await getFirebaseServices(env);
  const { collection, getDocs } = await import("firebase/firestore");
  const snapshot = await getDocs(
    collection(firestore, PASSWORD_RESET_REQUESTS_COLLECTION)
  );
  const requests: PasswordResetRequest[] = [];
  let invalidRequestCount = 0;

  for (const documentSnapshot of snapshot.docs) {
    const request = decodePasswordResetRequest(
      documentSnapshot.id,
      documentSnapshot.data()
    );

    if (request) {
      requests.push(request);
    } else {
      invalidRequestCount += 1;
    }
  }

  return {
    invalidRequestCount,
    requests: requests.sort((left, right) => {
      if (left.status !== right.status) {
        return (
          passwordResetRequestOrder(left.status) - passwordResetRequestOrder(right.status)
        );
      }

      return (right.requestedAtIso ?? "").localeCompare(left.requestedAtIso ?? "");
    })
  };
}

export async function completePasswordResetRequest(
  env: FirebaseEnv,
  input: CompletePasswordResetInput
): Promise<void> {
  assertActiveAdmin(input.actorProfile);

  if (input.newPassword.length < ADMIN_PASSWORD_MIN_LENGTH) {
    throw new Error(
      `Hasło musi mieć co najmniej ${String(ADMIN_PASSWORD_MIN_LENGTH)} znaków.`
    );
  }

  const functions = await getFirebaseFunctions(env);
  const { httpsCallable } = await import("firebase/functions");
  const complete = httpsCallable(functions, "completePasswordReset");
  await complete({ newPassword: input.newPassword, requestId: input.requestId });
}

export function decodePasswordResetRequest(
  id: string,
  data: unknown
): PasswordResetRequest | null {
  if (!isRecord(data)) {
    return null;
  }

  const userUid = readRequiredString(data, "userUid");
  const email = readRequiredString(data, "email");
  const displayName = readRequiredString(data, "displayName");
  const role = data.role;
  const status = data.status;

  if (
    !id ||
    !userUid ||
    id !== userUid ||
    !email ||
    !displayName ||
    !isUserRole(role) ||
    !isPasswordResetRequestStatus(status)
  ) {
    return null;
  }

  return {
    displayName,
    email,
    id,
    requestedAtIso: timestampToIso(data.requestedAt),
    role,
    status,
    userUid
  };
}

export function getAdminPasswordResetErrorMessage(error: unknown): string {
  const code = getErrorCode(error);

  if (code === "functions/unavailable" || code === "unavailable") {
    return "Brak połączenia z serwerem. Nadanie hasła wymaga internetu.";
  }

  if (code === "functions/failed-precondition") {
    return "Ta prośba została już obsłużona. Odśwież listę.";
  }

  if (error instanceof Error && error.message) {
    return error.message;
  }

  return "Nie udało się nadać nowego hasła.";
}

function assertActiveAdmin(profile: UserProfile): void {
  if (
    profile.role !== "ADMIN" ||
    !profile.active ||
    profile.registrationStatus !== "APPROVED"
  ) {
    throw new Error("Operacja wymaga aktywnego administratora.");
  }
}

function isPasswordResetRequestStatus(
  value: unknown
): value is PasswordResetRequestStatus {
  return value === "PENDING" || value === "PROCESSING" || value === "COMPLETED";
}

function passwordResetRequestOrder(status: PasswordResetRequestStatus): number {
  switch (status) {
    case "PENDING":
      return 0;
    case "PROCESSING":
      return 1;
    case "COMPLETED":
      return 2;
  }
}

function timestampToIso(value: unknown): string | null {
  if (value instanceof Date && Number.isFinite(value.getTime())) {
    return value.toISOString();
  }

  if (isTimestampLike(value)) {
    const date = value.toDate();
    return date instanceof Date && Number.isFinite(date.getTime())
      ? date.toISOString()
      : null;
  }

  return null;
}

function isTimestampLike(value: unknown): value is { toDate: () => unknown } {
  return isRecord(value) && typeof value.toDate === "function";
}

function readRequiredString(data: Record<string, unknown>, key: string): string | null {
  const value = data[key];
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

function getErrorCode(error: unknown): string | null {
  return isRecord(error) && typeof error.code === "string" ? error.code : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
