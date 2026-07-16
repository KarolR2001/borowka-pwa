import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { PASSWORD_RESET_CONFIRMATION, type AuthSessionState } from "../auth/authSession";
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

  it("shows active profile state and sign out action", async () => {
    const user = userEvent.setup();
    const signOut = vi.fn<AuthSessionApi["signOut"]>().mockResolvedValue(undefined);

    render(<App authSessionApi={createAuthSessionApi(activeAdminState, { signOut })} />);

    await user.click(screen.getByRole("button", { name: /logowanie/i }));

    expect(screen.getByRole("heading", { name: "Admin Test" })).toBeInTheDocument();
    expect(screen.getAllByText("Administrator").length).toBeGreaterThan(0);

    await user.click(screen.getByRole("button", { name: "Wyloguj" }));

    await waitFor(() => {
      expect(signOut).toHaveBeenCalled();
    });
  });
});
