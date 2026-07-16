import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import type { AuthSessionState } from "../auth/authSession";
import type { UserProfile } from "../domain/identity";
import {
  AdminUserDirectoryPanel,
  type UserDirectoryApi
} from "./AdminUserDirectoryPanel";

const adminState: AuthSessionState = {
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

const operatorState: AuthSessionState = {
  ...adminState,
  profile: {
    ...adminState.profile,
    role: "OPERATOR"
  },
  access: {
    status: "READY",
    role: "OPERATOR"
  }
};

const signedOutState: AuthSessionState = {
  status: "SIGNED_OUT",
  message: "Uzytkownik nie jest zalogowany."
};

const profile = ({
  uid,
  ...overrides
}: Partial<UserProfile> & { uid: string }): UserProfile => ({
  uid,
  email: `${uid}@example.test`,
  displayName: uid,
  role: "PICKER",
  workerId: "worker-1",
  active: true,
  registrationStatus: "APPROVED",
  offlineConsent: false,
  ...overrides
});

const env = {};

describe("AdminUserDirectoryPanel", () => {
  it("requires a signed-in administrator", () => {
    render(<AdminUserDirectoryPanel authState={signedOutState} env={env} />);

    expect(screen.getByText("Logowanie wymagane")).toBeInTheDocument();
  });

  it("blocks non-admin profiles", () => {
    render(<AdminUserDirectoryPanel authState={operatorState} env={env} />);

    expect(screen.getByText("Brak dostepu")).toBeInTheDocument();
  });

  it("loads profiles for administrator and renders invalid documents", async () => {
    const list = vi.fn<UserDirectoryApi["list"]>().mockResolvedValue({
      profiles: [
        profile({
          uid: "admin-1",
          displayName: "Admin Test",
          role: "ADMIN",
          workerId: null
        }),
        profile({
          uid: "picker-1",
          displayName: "Anna Zbieracz",
          role: "PICKER",
          workerId: "worker-anna"
        })
      ],
      invalidProfiles: [
        {
          id: "broken-1",
          reason: "Profil uzytkownika ma nieznana role."
        }
      ]
    });

    render(
      <AdminUserDirectoryPanel
        authState={adminState}
        env={env}
        userDirectoryApi={{ list }}
      />
    );

    await waitFor(() => {
      expect(list).toHaveBeenCalled();
    });
    expect(screen.getByText("Admin Test")).toBeInTheDocument();
    expect(screen.getByText("Anna Zbieracz")).toBeInTheDocument();
    expect(screen.getByText("broken-1")).toBeInTheDocument();
  });

  it("filters rendered profiles by selected role", async () => {
    const user = userEvent.setup();
    const list = vi.fn<UserDirectoryApi["list"]>().mockResolvedValue({
      profiles: [
        profile({
          uid: "admin-1",
          displayName: "Admin Test",
          role: "ADMIN",
          workerId: null
        }),
        profile({
          uid: "picker-1",
          displayName: "Anna Zbieracz",
          role: "PICKER",
          workerId: "worker-anna"
        })
      ],
      invalidProfiles: []
    });

    render(
      <AdminUserDirectoryPanel
        authState={adminState}
        env={env}
        userDirectoryApi={{ list }}
      />
    );

    await screen.findByText("Anna Zbieracz");
    await user.selectOptions(screen.getByLabelText("Rola"), "PICKER");

    expect(screen.queryByText("Admin Test")).not.toBeInTheDocument();
    expect(screen.getByText("Anna Zbieracz")).toBeInTheDocument();
  });
});
