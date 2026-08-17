import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import type { AuthSessionState } from "../auth/authSession";
import type { PasswordResetRequestsApi } from "./AdminPasswordResetRequestsPanel";
import { AdminPasswordResetRequestsPanel } from "./AdminPasswordResetRequestsPanel";

const adminState: AuthSessionState = {
  access: { role: "ADMIN", status: "READY" },
  message: "Profil aplikacji jest aktywny.",
  profile: {
    active: true,
    displayName: "Karol Admin",
    email: "admin@example.test",
    offlineConsent: false,
    registrationStatus: "APPROVED",
    role: "ADMIN",
    uid: "admin-1",
    workerId: null
  },
  status: "READY",
  user: { displayName: null, email: "admin@example.test", uid: "admin-1" }
};

const pendingResult = {
  invalidRequestCount: 0,
  requests: [
    {
      displayName: "Anna Zbieracz",
      email: "anna@example.test",
      id: "picker-1",
      requestedAtIso: "2026-08-17T09:00:00.000Z",
      role: "PICKER" as const,
      status: "PENDING" as const,
      userUid: "picker-1"
    }
  ]
};

describe("AdminPasswordResetRequestsPanel", () => {
  it("shows a pending request and lets an administrator assign a valid password", async () => {
    const user = userEvent.setup();
    const complete = vi.fn<PasswordResetRequestsApi["complete"]>().mockResolvedValue();
    const list = vi
      .fn<PasswordResetRequestsApi["list"]>()
      .mockResolvedValue(pendingResult);

    render(
      <AdminPasswordResetRequestsPanel
        api={{ complete, list }}
        authState={adminState}
        env={{}}
        isOnline
      />
    );

    await screen.findByText("Anna Zbieracz");
    await user.click(screen.getByRole("button", { name: "Nadaj hasło" }));
    await user.type(screen.getByLabelText("Nowe hasło"), "za-krot");
    await user.type(screen.getByLabelText("Powtórz nowe hasło"), "za-krot");
    await user.click(screen.getByRole("button", { name: "Nadaj nowe hasło" }));

    expect(
      screen.getByText("Hasło musi mieć co najmniej 10 znaków.")
    ).toBeInTheDocument();
    expect(complete).not.toHaveBeenCalled();

    await user.clear(screen.getByLabelText("Nowe hasło"));
    await user.clear(screen.getByLabelText("Powtórz nowe hasło"));
    await user.type(screen.getByLabelText("Nowe hasło"), "nowe-haslo-123");
    await user.type(screen.getByLabelText("Powtórz nowe hasło"), "nowe-haslo-123");
    await user.click(screen.getByRole("button", { name: "Nadaj nowe hasło" }));

    await waitFor(() => {
      expect(complete).toHaveBeenCalledWith(
        {},
        expect.objectContaining({
          newPassword: "nowe-haslo-123",
          requestId: "picker-1"
        })
      );
    });
    await waitFor(() => {
      expect(
        screen.queryByRole("dialog", { name: "Nadaj nowe hasło" })
      ).not.toBeInTheDocument();
    });
  });

  it("does not render for a non-administrator", () => {
    render(
      <AdminPasswordResetRequestsPanel
        authState={{
          ...adminState,
          access: { role: "OPERATOR", status: "READY" },
          profile: { ...adminState.profile, role: "OPERATOR" }
        }}
        env={{}}
        isOnline
      />
    );

    expect(screen.queryByLabelText("Prośby o zmianę hasła")).not.toBeInTheDocument();
  });
});
