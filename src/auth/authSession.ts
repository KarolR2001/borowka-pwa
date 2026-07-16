import type { User as FirebaseAuthUser } from "firebase/auth";
import type { Firestore } from "firebase/firestore/lite";

import {
  getFirebaseServices,
  getFirebaseServicesStatus
} from "../config/firebaseServices";
import {
  getIdentityAccessState,
  isRegistrationStatus,
  isUserRole,
  normalizeEmail,
  type IdentityAccessState,
  type UserProfile
} from "../domain/identity";

type FirebaseEnv = Record<string, string | boolean | undefined>;

export const PASSWORD_RESET_CONFIRMATION =
  "Jesli konto istnieje, wyslalismy link resetujacy haslo. Sprawdz skrzynke i spam.";

export type AuthenticatedUser = {
  uid: string;
  email: string | null;
  displayName: string | null;
};

export type UserProfileReadResult =
  | {
      status: "FOUND";
      profile: UserProfile;
    }
  | {
      status: "MISSING";
    }
  | {
      status: "INVALID";
      reason: string;
    };

export type AuthSessionState =
  | {
      status: "CONFIGURATION_REQUIRED";
      message: string;
    }
  | {
      status: "LOADING";
      message: string;
    }
  | {
      status: "SIGNED_OUT";
      message: string;
    }
  | {
      status: "PROFILE_LOADING";
      message: string;
      user: AuthenticatedUser;
    }
  | {
      status: "READY";
      message: string;
      user: AuthenticatedUser;
      profile: UserProfile;
      access: IdentityAccessState;
    }
  | {
      status: "MISSING_PROFILE";
      message: string;
      user: AuthenticatedUser;
      access: IdentityAccessState;
    }
  | {
      status: "BLOCKED" | "PENDING_APPROVAL" | "INVALID_PICKER_PROFILE";
      message: string;
      user: AuthenticatedUser;
      profile: UserProfile;
      access: IdentityAccessState;
    }
  | {
      status: "INVALID_PROFILE";
      message: string;
      user: AuthenticatedUser;
    }
  | {
      status: "PROFILE_UNAVAILABLE";
      message: string;
      user: AuthenticatedUser;
    }
  | {
      status: "ERROR";
      message: string;
    };

export type AuthSessionListener = (state: AuthSessionState) => void;

export function getInitialAuthSessionState(env: FirebaseEnv): AuthSessionState {
  const servicesStatus = getFirebaseServicesStatus(env);

  if (!servicesStatus.ready) {
    return {
      status: "CONFIGURATION_REQUIRED",
      message: servicesStatus.message
    };
  }

  return {
    status: "LOADING",
    message: "Sprawdzanie sesji logowania."
  };
}

export async function subscribeToAuthSession(
  env: FirebaseEnv,
  listener: AuthSessionListener
): Promise<() => void> {
  const initialState = getInitialAuthSessionState(env);

  if (initialState.status === "CONFIGURATION_REQUIRED") {
    listener(initialState);
    return () => undefined;
  }

  const [{ auth, firestore }, { onAuthStateChanged }] = await Promise.all([
    getFirebaseServices(env),
    import("firebase/auth")
  ]);

  let revision = 0;

  const unsubscribe = onAuthStateChanged(
    auth,
    (firebaseUser) => {
      const currentRevision = (revision += 1);

      if (!firebaseUser) {
        listener({
          status: "SIGNED_OUT",
          message: "Uzytkownik nie jest zalogowany."
        });
        return;
      }

      const user = toAuthenticatedUser(firebaseUser);

      listener({
        status: "PROFILE_LOADING",
        message: "Pobieranie profilu aplikacji.",
        user
      });

      void resolveAuthenticatedSession(firestore, user)
        .then((state) => {
          if (currentRevision === revision) {
            listener(state);
          }
        })
        .catch((error: unknown) => {
          if (currentRevision === revision) {
            listener({
              status: "PROFILE_UNAVAILABLE",
              message: getProfileReadErrorMessage(error),
              user
            });
          }
        });
    },
    (error) => {
      listener({
        status: "ERROR",
        message: getAuthStateErrorMessage(error)
      });
    }
  );

  return () => {
    revision += 1;
    unsubscribe();
  };
}

export async function signInWithEmailPassword(
  env: FirebaseEnv,
  credentials: { email: string; password: string }
): Promise<void> {
  const email = normalizeEmail(credentials.email);
  const { auth } = await getReadyFirebaseServices(env);
  const { signInWithEmailAndPassword } = await import("firebase/auth");

  await signInWithEmailAndPassword(auth, email, credentials.password);
}

export async function requestPasswordResetEmail(
  env: FirebaseEnv,
  emailInput: string
): Promise<void> {
  const email = normalizeEmail(emailInput);
  const { auth } = await getReadyFirebaseServices(env);
  const { sendPasswordResetEmail } = await import("firebase/auth");

  try {
    await sendPasswordResetEmail(auth, email);
  } catch (error: unknown) {
    if (isNetworkError(error)) {
      throw error;
    }

    const code = getFirebaseErrorCode(error);

    if (code === "auth/user-not-found" || code === "auth/invalid-email") {
      return;
    }

    throw error;
  }
}

export async function signOutCurrentUser(env: FirebaseEnv): Promise<void> {
  const { auth } = await getReadyFirebaseServices(env);
  const { signOut } = await import("firebase/auth");

  await signOut(auth);
}

export async function readUserProfile(
  firestore: Firestore,
  uid: string
): Promise<UserProfileReadResult> {
  const { doc, getDoc } = await import("firebase/firestore/lite");
  const snapshot = await getDoc(doc(firestore, "users", uid));

  if (!snapshot.exists()) {
    return {
      status: "MISSING"
    };
  }

  return decodeUserProfile(uid, snapshot.data());
}

export function decodeUserProfile(
  expectedUid: string,
  data: unknown
): UserProfileReadResult {
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

export async function resolveAuthenticatedSession(
  firestore: Firestore,
  user: AuthenticatedUser
): Promise<AuthSessionState> {
  const readResult = await readUserProfile(firestore, user.uid);

  if (readResult.status === "MISSING") {
    const access = {
      status: "MISSING_PROFILE",
      reason: "Konto nie ma jeszcze profilu aplikacji."
    } as const;

    return {
      status: "MISSING_PROFILE",
      message: access.reason,
      user,
      access
    };
  }

  if (readResult.status === "INVALID") {
    return {
      status: "INVALID_PROFILE",
      message: readResult.reason,
      user
    };
  }

  const access = getIdentityAccessState(readResult.profile);

  if (access.status === "READY") {
    return {
      status: "READY",
      message: "Profil aplikacji jest aktywny.",
      user,
      profile: readResult.profile,
      access
    };
  }

  if (access.status === "MISSING_PROFILE") {
    return {
      status: "MISSING_PROFILE",
      message: access.reason,
      user,
      access
    };
  }

  return {
    status: access.status,
    message: access.reason,
    user,
    profile: readResult.profile,
    access
  };
}

export function getLoginErrorMessage(error: unknown): string {
  if (isNetworkError(error)) {
    return "Brak polaczenia z Firebase. Sprobuj ponownie po odzyskaniu internetu.";
  }

  return "Nie udalo sie zalogowac. Sprawdz dane i polaczenie.";
}

export function getPasswordResetErrorMessage(error: unknown): string {
  if (isNetworkError(error)) {
    return "Brak polaczenia z Firebase. Reset hasla wymaga internetu.";
  }

  return "Nie udalo sie wyslac resetu hasla. Sprobuj ponownie pozniej.";
}

export function getProfileReadErrorMessage(error: unknown): string {
  if (isNetworkError(error)) {
    return "Nie udalo sie pobrac profilu. Sprawdz polaczenie.";
  }

  if (getFirebaseErrorCode(error) === "permission-denied") {
    return "Brak dostepu do profilu aplikacji.";
  }

  return "Nie udalo sie pobrac profilu aplikacji.";
}

function getAuthStateErrorMessage(error: unknown): string {
  if (isNetworkError(error)) {
    return "Utracono polaczenie z Firebase Authentication.";
  }

  return "Nie udalo sie sprawdzic sesji logowania.";
}

async function getReadyFirebaseServices(env: FirebaseEnv) {
  const status = getFirebaseServicesStatus(env);

  if (!status.ready) {
    throw new Error(status.message);
  }

  return getFirebaseServices(env);
}

function toAuthenticatedUser(user: FirebaseAuthUser): AuthenticatedUser {
  return {
    uid: user.uid,
    email: user.email,
    displayName: user.displayName
  };
}

function invalidProfile(reason: string): UserProfileReadResult {
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

function isNetworkError(error: unknown): boolean {
  const code = getFirebaseErrorCode(error);

  return code === "auth/network-request-failed" || code === "unavailable";
}

function getFirebaseErrorCode(error: unknown): string | null {
  if (!isRecord(error)) {
    return null;
  }

  const code = error.code;

  return typeof code === "string" ? code : null;
}
