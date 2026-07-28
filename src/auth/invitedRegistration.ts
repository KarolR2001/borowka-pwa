import { getFirebaseServices } from "../config/firebaseServices";
import { normalizeEmail, type UserProfile } from "../domain/identity";
import {
  REGISTRATION_INVITATIONS_COLLECTION,
  decodeRegistrationInvitation,
  type RegistrationInvitationDocument
} from "../invitations/registrationInvitations";

type FirebaseEnv = Record<string, string | boolean | undefined>;

export const INVITED_REGISTRATION_MIN_PASSWORD_LENGTH = 6;

export type InvitedRegistrationInput = {
  email: string;
  displayName: string;
  password: string;
  passwordConfirmation: string;
  acceptsPrerelease: boolean;
};

export type InvitedUserProfile = UserProfile & {
  registrationInvitationId: string;
};

export type UsedInvitationUpdate = {
  status: "USED";
  usedBy: string;
  usedAt: unknown;
};

export async function registerInvitedUser(
  env: FirebaseEnv,
  input: InvitedRegistrationInput
): Promise<void> {
  const validationError = validateInvitedRegistrationInput(input);

  if (validationError) {
    throw new Error(validationError);
  }

  const email = normalizeEmail(input.email);
  const [{ auth }, authSdk] = await Promise.all([
    getFirebaseServices(env),
    import("firebase/auth")
  ]);
  const credentials = await authSdk.createUserWithEmailAndPassword(
    auth,
    email,
    input.password
  );

  await authSdk.updateProfile(credentials.user, {
    displayName: input.displayName.trim()
  });

  await claimRegistrationInvitationForUser(env, {
    uid: credentials.user.uid,
    email
  });
}

export async function claimRegistrationInvitationForUser(
  env: FirebaseEnv,
  user: { uid: string; email: string }
): Promise<RegistrationInvitationDocument> {
  const { firestore } = await getFirebaseServices(env);
  const { Timestamp, collection, doc, getDocs, limit, query, where, writeBatch } =
    await import("firebase/firestore");
  const email = normalizeEmail(user.email);
  const invitationsQuery = query(
    collection(firestore, REGISTRATION_INVITATIONS_COLLECTION),
    where("emailNormalized", "==", email),
    where("status", "==", "PENDING"),
    limit(1)
  );
  const snapshot = await getDocs(invitationsQuery);

  if (snapshot.empty) {
    throw new Error("Brak aktywnego zaproszenia dla tego e-maila.");
  }

  const invitationSnapshot = snapshot.docs[0];
  const decoded = decodeRegistrationInvitation(
    invitationSnapshot.id,
    invitationSnapshot.data()
  );

  if (decoded.status === "INVALID") {
    throw new Error(decoded.reason);
  }

  const profile = createUserProfileFromRegistrationInvitation({
    uid: user.uid,
    email,
    invitation: decoded.invitation
  });
  const usedAt = Timestamp.now();
  const batch = writeBatch(firestore);

  batch.set(doc(firestore, "users", user.uid), profile);
  batch.update(
    doc(firestore, REGISTRATION_INVITATIONS_COLLECTION, decoded.invitation.id),
    createUsedRegistrationInvitationUpdate(user.uid, usedAt)
  );
  await batch.commit();

  return decoded.invitation;
}

export function validateInvitedRegistrationInput(
  input: InvitedRegistrationInput
): string | null {
  if (!normalizeEmail(input.email).includes("@")) {
    return "Podaj poprawny e-mail.";
  }

  if (!input.displayName.trim()) {
    return "Podaj imie i nazwisko lub nazwe.";
  }

  if (input.password.length < INVITED_REGISTRATION_MIN_PASSWORD_LENGTH) {
    return `Haslo musi miec co najmniej ${String(
      INVITED_REGISTRATION_MIN_PASSWORD_LENGTH
    )} znakow.`;
  }

  if (input.password !== input.passwordConfirmation) {
    return "Hasla musza byc takie same.";
  }

  if (!input.acceptsPrerelease) {
    return "Potwierdz, ze konto wymaga prerejestracji administratora.";
  }

  return null;
}

export function createUserProfileFromRegistrationInvitation({
  uid,
  email,
  invitation
}: {
  uid: string;
  email: string;
  invitation: RegistrationInvitationDocument;
}): InvitedUserProfile {
  const emailNormalized = normalizeEmail(email);

  if (invitation.status !== "PENDING") {
    throw new Error("Zaproszenie nie jest aktywne.");
  }

  if (invitation.emailNormalized !== emailNormalized) {
    throw new Error("Zaproszenie jest przypisane do innego e-maila.");
  }

  return {
    uid,
    email: invitation.emailNormalized,
    displayName: invitation.displayName,
    role: invitation.targetRole,
    workerId: invitation.workerId,
    active: true,
    registrationStatus: "APPROVED",
    offlineConsent: false,
    registrationInvitationId: invitation.id
  };
}

export function createUsedRegistrationInvitationUpdate(
  uid: string,
  usedAt: unknown
): UsedInvitationUpdate {
  return {
    status: "USED",
    usedBy: uid,
    usedAt
  };
}

export function getInvitedRegistrationErrorMessage(error: unknown): string {
  const code = getFirebaseErrorCode(error);

  if (code === "auth/email-already-in-use") {
    return "Konto dla tego e-maila juz istnieje. Wroc do logowania albo resetu hasla.";
  }

  if (code === "auth/weak-password") {
    return `Haslo musi miec co najmniej ${String(
      INVITED_REGISTRATION_MIN_PASSWORD_LENGTH
    )} znakow.`;
  }

  if (code === "auth/invalid-email") {
    return "Podaj poprawny e-mail.";
  }

  if (error instanceof Error && error.message) {
    return error.message;
  }

  return "Nie udalo sie zarejestrowac konta z zaproszenia.";
}

function getFirebaseErrorCode(error: unknown): string | null {
  if (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    typeof error.code === "string"
  ) {
    return error.code;
  }

  return null;
}
