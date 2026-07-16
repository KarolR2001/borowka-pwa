import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { PASSWORD_RESET_CONFIRMATION, type AuthSessionState } from "../auth/authSession";
import type { DeviceDirectoryApi } from "../devices/AdminDeviceDirectoryPanel";
import type { RegistrationInvitationsApi } from "../invitations/AdminRegistrationInvitationsPanel";
import type { UserDirectoryApi } from "../users/AdminUserDirectoryPanel";
import { App, type AuthSessionApi, type DeviceRegistryApi } from "./App";

const signedOutState: AuthSessionState = {
  status: "SIGNED_OUT",
  message: "Uzytkownik nie jest zalogowany."
};

const activeAdminState: AuthSessionState = {
  status: "READY",
  message: "Profil aplikacji jest aktywny.",
  user: {
    uid: "admin-1",
    email: "admin@example.test",
    displayName: null
  },
  profile: {
    uid: "admin-1",
    email: "admin@example.test",
    displayName: "Admin Test",
    role: "ADMIN",
    workerId: null,
    active: true,
    registrationStatus: "APPROVED",
    offlineConsent: false
  },
  access: {
    status: "READY",
    role: "ADMIN"
  }
};

const activePickerState: AuthSessionState = {
  status: "READY",
  message: "Profil aplikacji jest aktywny.",
  user: {
    uid: "picker-1",
    email: "picker@example.test",
    displayName: "Picker Test"
  },
  profile: {
    uid: "picker-1",
    email: "picker@example.test",
    displayName: "Picker Test",
    role: "PICKER",
    workerId: "worker-1",
    active: true,
    registrationStatus: "APPROVED",
    offlineConsent: false
  },
  access: {
    status: "READY",
    role: "PICKER"
  }
};

const activeOperatorState: AuthSessionState = {
  ...activeAdminState,
  profile: {
    ...activeAdminState.profile,
    role: "OPERATOR"
  },
  access: {
    status: "READY",
    role: "OPERATOR"
  }
};

const blockedPickerState: AuthSessionState = {
  status: "BLOCKED",
  message: "Konto jest zablokowane.",
  user: activePickerState.user,
  profile: {
    ...activePickerState.profile,
    active: false,
    registrationStatus: "BLOCKED"
  },
  access: {
    status: "BLOCKED",
    reason: "Konto jest zablokowane."
  }
};

const completeFirebaseEnv = {
  VITE_APP_ENV: "development",
  VITE_USE_FIREBASE_EMULATORS: "false",
  VITE_FIREBASE_API_KEY: "dev-api-key",
  VITE_FIREBASE_AUTH_DOMAIN: "borowka-pwa-dev.firebaseapp.com",
  VITE_FIREBASE_PROJECT_ID: "borowka-pwa-dev",
  VITE_FIREBASE_STORAGE_BUCKET: "borowka-pwa-dev.appspot.com",
  VITE_FIREBASE_MESSAGING_SENDER_ID: "123456789",
  VITE_FIREBASE_APP_ID: "1:123456789:web:dev"
};

const createAuthSessionApi = (
  initialState: AuthSessionState,
  overrides: Partial<AuthSessionApi> = {}
): AuthSessionApi => ({
  getInitialState: () => initialState,
  subscribe: (_env, listener) => {
    listener(initialState);
    return Promise.resolve(() => undefined);
  },
  signIn: () => Promise.resolve(),
  requestPasswordReset: () => Promise.resolve(),
  register: () => Promise.resolve(),
  refresh: () => Promise.resolve(initialState),
  updateOfflineConsent: () => Promise.resolve(),
  signOut: () => Promise.resolve(),
  ...overrides
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("App shell", () => {
  it("renders the product shell and diagnostics", async () => {
    const user = userEvent.setup();

    render(<App />);

    expect(screen.getByRole("heading", { name: "Borowka PWA" })).toBeInTheDocument();
    expect(screen.getByText("Firebase brak konfiguracji")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /diagnostyka/i }));

    expect(screen.getByRole("heading", { name: "Diagnostyka" })).toBeInTheDocument();
    expect(screen.getByText("Wersja aplikacji")).toBeInTheDocument();
  });

  it("submits email and password through the auth session API", async () => {
    const user = userEvent.setup();
    const signIn = vi.fn<AuthSessionApi["signIn"]>().mockResolvedValue(undefined);

    render(<App authSessionApi={createAuthSessionApi(signedOutState, { signIn })} />);

    await user.click(screen.getByRole("button", { name: /logowanie/i }));
    await user.type(screen.getByLabelText("E-mail"), "admin@example.test");
    await user.type(screen.getByLabelText("Haslo"), "secret-password");
    await user.click(screen.getByRole("button", { name: "Zaloguj" }));

    await waitFor(() => {
      expect(signIn).toHaveBeenCalledWith(expect.anything(), {
        email: "admin@example.test",
        password: "secret-password"
      });
    });
  });

  it("requests password reset with neutral confirmation", async () => {
    const user = userEvent.setup();
    const requestPasswordReset = vi
      .fn<AuthSessionApi["requestPasswordReset"]>()
      .mockResolvedValue(undefined);

    render(
      <App
        authSessionApi={createAuthSessionApi(signedOutState, {
          requestPasswordReset
        })}
      />
    );

    await user.click(screen.getByRole("button", { name: /logowanie/i }));
    await user.click(screen.getByRole("button", { name: "Nie pamietam hasla" }));
    await user.type(screen.getByLabelText("E-mail"), "admin@example.test");
    await user.click(screen.getByRole("button", { name: "Wyslij reset" }));

    await waitFor(() => {
      expect(requestPasswordReset).toHaveBeenCalledWith(
        expect.anything(),
        "admin@example.test"
      );
    });
    expect(screen.getByText(PASSWORD_RESET_CONFIRMATION)).toBeInTheDocument();
  });

  it("validates invited registration passwords", async () => {
    const user = userEvent.setup();
    const register = vi.fn<AuthSessionApi["register"]>().mockResolvedValue(undefined);

    render(<App authSessionApi={createAuthSessionApi(signedOutState, { register })} />);

    await user.click(screen.getByRole("button", { name: /logowanie/i }));
    await user.click(screen.getByRole("button", { name: "Zaloz konto" }));
    await user.type(screen.getByLabelText("E-mail"), "operator@example.test");
    await user.type(screen.getByLabelText("Imie i nazwisko"), "Operator Test");
    await user.type(screen.getByLabelText("Haslo"), "secret-password");
    await user.type(screen.getByLabelText("Powtorz haslo"), "different-password");
    await user.click(screen.getByLabelText("Akceptuje prerejestracje administratora"));
    await user.click(screen.getByRole("button", { name: "Zaloz konto" }));

    expect(register).not.toHaveBeenCalled();
    expect(screen.getByText("Hasla musza byc takie same.")).toBeInTheDocument();
  });

  it("submits invited registration through the auth session API", async () => {
    const user = userEvent.setup();
    const register = vi.fn<AuthSessionApi["register"]>().mockResolvedValue(undefined);

    render(<App authSessionApi={createAuthSessionApi(signedOutState, { register })} />);

    await user.click(screen.getByRole("button", { name: /logowanie/i }));
    await user.click(screen.getByRole("button", { name: "Zaloz konto" }));
    await user.type(screen.getByLabelText("E-mail"), "Operator@Example.TEST");
    await user.type(screen.getByLabelText("Imie i nazwisko"), "Operator Test");
    await user.type(screen.getByLabelText("Haslo"), "secret-password");
    await user.type(screen.getByLabelText("Powtorz haslo"), "secret-password");
    await user.click(screen.getByLabelText("Akceptuje prerejestracje administratora"));
    await user.click(screen.getByRole("button", { name: "Zaloz konto" }));

    await waitFor(() => {
      expect(register).toHaveBeenCalledWith(expect.anything(), {
        email: "Operator@Example.TEST",
        displayName: "Operator Test",
        password: "secret-password",
        passwordConfirmation: "secret-password",
        acceptsPrerelease: true
      });
    });
    expect(
      screen.getByText("Konto zostalo utworzone. Pobieram profil.")
    ).toBeInTheDocument();
  });

  it("refreshes the active profile immediately after invited picker registration", async () => {
    const user = userEvent.setup();
    const register = vi.fn<AuthSessionApi["register"]>().mockResolvedValue(undefined);
    const refresh = vi
      .fn<AuthSessionApi["refresh"]>()
      .mockResolvedValue(activePickerState);

    render(
      <App
        authSessionApi={createAuthSessionApi(signedOutState, {
          register,
          refresh
        })}
      />
    );

    await user.click(screen.getByRole("button", { name: /logowanie/i }));
    await user.click(screen.getByRole("button", { name: "Zaloz konto" }));
    await user.type(screen.getByLabelText("E-mail"), "picker@example.test");
    await user.type(screen.getByLabelText("Imie i nazwisko"), "Picker Test");
    await user.type(screen.getByLabelText("Haslo"), "secret-password");
    await user.type(screen.getByLabelText("Powtorz haslo"), "secret-password");
    await user.click(screen.getByLabelText("Akceptuje prerejestracje administratora"));
    await user.click(screen.getByRole("button", { name: "Zaloz konto" }));

    await waitFor(() => {
      expect(refresh).toHaveBeenCalledWith(expect.anything());
    });
    expect(screen.getByRole("heading", { name: "Picker Test" })).toBeInTheDocument();
    expect(screen.getAllByText("Zbieracz").length).toBeGreaterThan(0);
    expect(screen.getByText("worker-1")).toBeInTheDocument();
    expect(
      screen.getByText("Konto zostalo utworzone i profil jest aktywny.")
    ).toBeInTheDocument();
  });

  it("shows active profile state and sign out action", async () => {
    const user = userEvent.setup();
    const signOut = vi.fn<AuthSessionApi["signOut"]>().mockResolvedValue(undefined);

    render(<App authSessionApi={createAuthSessionApi(activeAdminState, { signOut })} />);

    await user.click(screen.getByRole("button", { name: /logowanie/i }));

    expect(screen.getByRole("heading", { name: "Admin Test" })).toBeInTheDocument();
    expect(screen.getAllByText("Administrator").length).toBeGreaterThan(0);
    expect(screen.getByText("Status konta")).toBeInTheDocument();
    expect(screen.getByText("zatwierdzone")).toBeInTheDocument();
    expect(screen.getByText("Powiazany zbieracz")).toBeInTheDocument();
    expect(screen.getByText("Zgoda offline")).toBeInTheDocument();
    expect(screen.getByText("brak zgody")).toBeInTheDocument();
    expect(screen.getByText("Identyfikator urzadzenia")).toBeInTheDocument();
    expect(screen.getByText("Wersja aplikacji")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Wyloguj" }));

    await waitFor(() => {
      expect(signOut).toHaveBeenCalled();
    });
  });

  it("refreshes the active profile on window focus to detect role changes", async () => {
    const refresh = vi
      .fn<AuthSessionApi["refresh"]>()
      .mockResolvedValue(activeOperatorState);

    render(
      <App
        authSessionApi={createAuthSessionApi(activeAdminState, {
          refresh
        })}
      />
    );

    await screen.findByText("Konto: Administrator");

    globalThis.dispatchEvent(new Event("focus"));

    await waitFor(() => {
      expect(refresh).toHaveBeenCalledWith(expect.anything());
    });
    expect(screen.getByText("Konto: Operator")).toBeInTheDocument();
  });

  it("refreshes the active profile on online event to detect account blocks", async () => {
    const refresh = vi
      .fn<AuthSessionApi["refresh"]>()
      .mockResolvedValue(blockedPickerState);

    render(
      <App
        authSessionApi={createAuthSessionApi(activePickerState, {
          refresh
        })}
      />
    );

    await screen.findByText("Konto: Zbieracz");

    globalThis.dispatchEvent(new Event("online"));

    await waitFor(() => {
      expect(refresh).toHaveBeenCalledWith(expect.anything());
    });
    expect(screen.getByText("Konto: zablokowane")).toBeInTheDocument();
  });

  it("registers the current device for an active profile", async () => {
    for (const [key, value] of Object.entries(completeFirebaseEnv)) {
      vi.stubEnv(key, value);
    }

    const register = vi.fn<DeviceRegistryApi["register"]>().mockResolvedValue(undefined);

    render(
      <App
        authSessionApi={createAuthSessionApi(activePickerState)}
        deviceRegistryApi={{ register }}
      />
    );

    await waitFor(() => {
      expect(register).toHaveBeenCalled();
    });
    const [, input] = register.mock.calls[0];

    expect(input).toMatchObject({
      userUid: "picker-1",
      trustedOfflineStorage: false
    });
    expect(input.deviceId).toEqual(expect.any(String));
    expect(input.deviceName).toEqual(expect.any(String));
  });

  it("updates offline consent from the user profile panel", async () => {
    const user = userEvent.setup();
    const updateOfflineConsent = vi
      .fn<AuthSessionApi["updateOfflineConsent"]>()
      .mockResolvedValue(undefined);

    render(
      <App
        authSessionApi={createAuthSessionApi(activeAdminState, {
          updateOfflineConsent
        })}
      />
    );

    await user.click(screen.getByRole("button", { name: /logowanie/i }));
    await user.click(screen.getByLabelText("Zgoda na trwale dane offline"));

    await waitFor(() => {
      expect(updateOfflineConsent).toHaveBeenCalledWith(
        expect.anything(),
        "admin-1",
        true
      );
    });
    expect(screen.getByText("Zgoda offline wlaczona.")).toBeInTheDocument();
    expect(screen.getByText("zgoda aktywna")).toBeInTheDocument();
  });

  it("renders administrator user directory from the admin tab", async () => {
    const user = userEvent.setup();
    const list = vi.fn<UserDirectoryApi["list"]>().mockResolvedValue({
      profiles: [
        {
          uid: "admin-1",
          email: "admin@example.test",
          displayName: "Admin Test",
          role: "ADMIN",
          workerId: null,
          active: true,
          registrationStatus: "APPROVED",
          offlineConsent: false
        }
      ],
      invalidProfiles: []
    });
    const listInvitations = vi
      .fn<RegistrationInvitationsApi["list"]>()
      .mockResolvedValue({
        invitations: [],
        invalidInvitations: []
      });
    const listDevices = vi.fn<DeviceDirectoryApi["list"]>().mockResolvedValue({
      devices: [],
      invalidDevices: []
    });

    render(
      <App
        authSessionApi={createAuthSessionApi(activeAdminState)}
        deviceDirectoryApi={{ list: listDevices }}
        userDirectoryApi={{ list }}
        registrationInvitationsApi={{
          list: listInvitations,
          create: vi.fn<RegistrationInvitationsApi["create"]>(),
          cancel: vi.fn<RegistrationInvitationsApi["cancel"]>()
        }}
      />
    );

    await user.click(screen.getByRole("button", { name: /^administrator$/i }));

    await waitFor(() => {
      expect(list).toHaveBeenCalled();
      expect(listInvitations).toHaveBeenCalled();
      expect(listDevices).toHaveBeenCalled();
    });
    expect(screen.getByRole("heading", { name: "Lista kont" })).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Prerejestracja kont" })
    ).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Lista urzadzen" })).toBeInTheDocument();
    expect(screen.getByText("Admin Test")).toBeInTheDocument();
  });
});
