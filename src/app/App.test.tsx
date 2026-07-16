import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { PASSWORD_RESET_CONFIRMATION, type AuthSessionState } from "../auth/authSession";
import type { RegistrationInvitationsApi } from "../invitations/AdminRegistrationInvitationsPanel";
import type { UserDirectoryApi } from "../users/AdminUserDirectoryPanel";
import { App, type AuthSessionApi } from "./App";

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
  updateOfflineConsent: () => Promise.resolve(),
  signOut: () => Promise.resolve(),
  ...overrides
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

    render(
      <App
        authSessionApi={createAuthSessionApi(activeAdminState)}
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
    });
    expect(screen.getByRole("heading", { name: "Lista kont" })).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Prerejestracja kont" })
    ).toBeInTheDocument();
    expect(screen.getByText("Admin Test")).toBeInTheDocument();
  });
});
