import {
  PASSWORD_RESET_CONFIRMATION,
  decodeUserProfile,
  getInitialAuthSessionState,
  getLoginErrorMessage,
  getPasswordResetErrorMessage,
  getProfileReadErrorMessage
} from "./authSession";

const completeEnv = {
  VITE_APP_ENV: "development",
  VITE_USE_FIREBASE_EMULATORS: "false",
  VITE_FIREBASE_API_KEY: "dev-api-key",
  VITE_FIREBASE_AUTH_DOMAIN: "borowka-pwa-dev.firebaseapp.com",
  VITE_FIREBASE_PROJECT_ID: "borowka-pwa-dev",
  VITE_FIREBASE_STORAGE_BUCKET: "borowka-pwa-dev.appspot.com",
  VITE_FIREBASE_MESSAGING_SENDER_ID: "123456789",
  VITE_FIREBASE_APP_ID: "1:123456789:web:dev"
};

const validProfile = {
  uid: "user-1",
  email: "user@example.test",
  displayName: "User Test",
  role: "OPERATOR",
  workerId: null,
  active: true,
  registrationStatus: "APPROVED",
  offlineConsent: false
};

describe("auth session domain", () => {
  it("starts as configuration required when Firebase config is missing", () => {
    expect(getInitialAuthSessionState({})).toMatchObject({
      status: "CONFIGURATION_REQUIRED"
    });
  });

  it("starts session checking when Firebase config is complete", () => {
    expect(getInitialAuthSessionState(completeEnv)).toEqual({
      status: "LOADING",
      message: "Sprawdzanie sesji logowania."
    });
  });

  it("decodes a valid Firestore user profile", () => {
    expect(decodeUserProfile("user-1", validProfile)).toEqual({
      status: "FOUND",
      profile: validProfile
    });
  });

  it("rejects a profile with mismatched uid", () => {
    expect(decodeUserProfile("other-user", validProfile)).toMatchObject({
      status: "INVALID",
      reason: "Profil uzytkownika ma niezgodny identyfikator."
    });
  });

  it("rejects a profile with unsupported role or registration status", () => {
    expect(decodeUserProfile("user-1", { ...validProfile, role: "OWNER" })).toMatchObject(
      {
        status: "INVALID",
        reason: "Profil uzytkownika ma nieznana role."
      }
    );
    expect(
      decodeUserProfile("user-1", {
        ...validProfile,
        registrationStatus: "WAITING"
      })
    ).toMatchObject({
      status: "INVALID",
      reason: "Profil uzytkownika ma nieznany status rejestracji."
    });
  });

  it("keeps password reset confirmation neutral", () => {
    expect(PASSWORD_RESET_CONFIRMATION).not.toContain("nie istnieje");
    expect(PASSWORD_RESET_CONFIRMATION).toContain("Jesli konto istnieje");
  });

  it("maps authentication errors to user-safe messages", () => {
    expect(getLoginErrorMessage({ code: "auth/wrong-password" })).toBe(
      "Nie udalo sie zalogowac. Sprawdz dane i polaczenie."
    );
    expect(getPasswordResetErrorMessage({ code: "auth/network-request-failed" })).toBe(
      "Brak polaczenia z Firebase. Reset hasla wymaga internetu."
    );
    expect(getProfileReadErrorMessage({ code: "permission-denied" })).toBe(
      "Brak dostepu do profilu aplikacji."
    );
  });
});
