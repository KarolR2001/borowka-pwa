export const PASSWORD_RESET_MIN_LENGTH = 10;
export const PASSWORD_RESET_REQUESTS_COLLECTION = "passwordResetRequests";
export const PASSWORD_RESET_NEUTRAL_RESULT = Object.freeze({ accepted: true });

const PENDING = "PENDING";
const PROCESSING = "PROCESSING";

export class PasswordResetWorkflowError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

export function normalizePasswordResetEmail(value) {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

export function validateAdministratorPassword(value) {
  if (typeof value !== "string" || value.length < PASSWORD_RESET_MIN_LENGTH) {
    throw new PasswordResetWorkflowError(
      "invalid-argument",
      `Hasło musi mieć co najmniej ${String(PASSWORD_RESET_MIN_LENGTH)} znaków.`
    );
  }
}

export async function submitPasswordResetRequest({
  accounts,
  emailInput,
  now = () => new Date(),
  requests
}) {
  const email = normalizePasswordResetEmail(emailInput);

  if (!isEmailAddress(email)) {
    return PASSWORD_RESET_NEUTRAL_RESULT;
  }

  const account = await findAccountByEmail(accounts, email);

  if (!account) {
    return PASSWORD_RESET_NEUTRAL_RESULT;
  }

  const profile = await accounts.getProfile(account.uid);

  if (!isResettableProfile(profile, account.uid)) {
    return PASSWORD_RESET_NEUTRAL_RESULT;
  }

  const existingRequest = await requests.get(account.uid);

  if (existingRequest?.status === PENDING || existingRequest?.status === PROCESSING) {
    return PASSWORD_RESET_NEUTRAL_RESULT;
  }

  await requests.set(
    account.uid,
    createPasswordResetRequestDocument({ account, now: now(), profile })
  );

  return PASSWORD_RESET_NEUTRAL_RESULT;
}

export async function completePasswordReset({
  accounts,
  actorUid,
  newPassword,
  requests,
  requestIdInput
}) {
  const requestId = validateRequestId(requestIdInput);
  validateAdministratorPassword(newPassword);
  const actorProfile = await accounts.getProfile(actorUid);

  if (!isActiveAdministrator(actorProfile, actorUid)) {
    throw new PasswordResetWorkflowError(
      "permission-denied",
      "Zmiana hasła wymaga aktywnego administratora."
    );
  }

  const claimedRequest = await requests.claim(requestId);

  if (!claimedRequest) {
    throw new PasswordResetWorkflowError(
      "failed-precondition",
      "Ta prośba nie oczekuje już na zmianę hasła."
    );
  }

  try {
    await accounts.updatePassword(claimedRequest.userUid, newPassword);
    await requests.complete(requestId, claimedRequest.processingId, actorUid);
  } catch (error) {
    await requests.release(requestId, claimedRequest.processingId);
    throw error;
  }

  return { completed: true };
}

export function createPasswordResetRequestDocument({ account, now, profile }) {
  return {
    completedAt: null,
    completedBy: null,
    displayName: profile.displayName,
    email: account.email,
    id: account.uid,
    processingId: null,
    processingStartedAt: null,
    requestedAt: now,
    role: profile.role,
    status: PENDING,
    userUid: account.uid
  };
}

function isEmailAddress(value) {
  return (
    value.includes("@") &&
    value.indexOf("@") > 0 &&
    value.lastIndexOf("@") < value.length - 1
  );
}

async function findAccountByEmail(accounts, email) {
  try {
    return await accounts.getUserByEmail(email);
  } catch (error) {
    if (error && typeof error === "object" && error.code === "auth/user-not-found") {
      return null;
    }

    throw error;
  }
}

function isResettableProfile(profile, uid) {
  return (
    profile &&
    profile.uid === uid &&
    profile.active === true &&
    profile.registrationStatus === "APPROVED" &&
    isUserRole(profile.role) &&
    typeof profile.displayName === "string"
  );
}

function isActiveAdministrator(profile, uid) {
  return isResettableProfile(profile, uid) && profile.role === "ADMIN";
}

function isUserRole(value) {
  return value === "ADMIN" || value === "OPERATOR" || value === "PICKER";
}

function validateRequestId(value) {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.length > 128 ||
    value.includes("/")
  ) {
    throw new PasswordResetWorkflowError(
      "invalid-argument",
      "Nieprawidłowy identyfikator prośby."
    );
  }

  return value;
}
