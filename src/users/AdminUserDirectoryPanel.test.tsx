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

  it("does not offer the current admin as a role change target", async () => {
    const list = vi.fn<UserDirectoryApi["list"]>().mockResolvedValue({
      profiles: [
        profile({
          uid: "admin-1",
          displayName: "Admin Test",
          role: "ADMIN",
          workerId: null
        }),
        profile({
          uid: "operator-1",
          displayName: "Operator Test",
          role: "OPERATOR",
          workerId: null
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

    await screen.findByText("Operator Test");

    const profileSelect = screen.getByLabelText("Profil");
    expect(profileSelect).toBeInstanceOf(HTMLSelectElement);

    if (!(profileSelect instanceof HTMLSelectElement)) {
      throw new Error("Pole profilu powinno byc lista wyboru.");
    }

    expect(Array.from(profileSelect.options).map((option) => option.value)).toEqual([
      "operator-1"
    ]);
  });

  it("submits role and worker link changes with confirmation", async () => {
    const user = userEvent.setup();
    const operatorProfile = profile({
      uid: "operator-1",
      displayName: "Operator Test",
      role: "OPERATOR",
      workerId: null
    });
    const list = vi
      .fn<UserDirectoryApi["list"]>()
      .mockResolvedValueOnce({
        profiles: [
          profile({
            uid: "admin-1",
            displayName: "Admin Test",
            role: "ADMIN",
            workerId: null
          }),
          operatorProfile
        ],
        invalidProfiles: []
      })
      .mockResolvedValueOnce({
        profiles: [
          profile({
            uid: "admin-1",
            displayName: "Admin Test",
            role: "ADMIN",
            workerId: null
          }),
          {
            ...operatorProfile,
            role: "PICKER",
            workerId: "worker-operator"
          }
        ],
        invalidProfiles: []
      });
    const updateRoleAndWorker = vi
      .fn<NonNullable<UserDirectoryApi["updateRoleAndWorker"]>>()
      .mockResolvedValue(undefined);

    render(
      <AdminUserDirectoryPanel
        authState={adminState}
        env={env}
        userDirectoryApi={{ list, updateRoleAndWorker }}
      />
    );

    await screen.findByText("Operator Test");
    await user.selectOptions(screen.getByLabelText("Nowa rola"), "PICKER");
    await user.type(screen.getByLabelText("workerId"), "worker-operator");
    await user.type(screen.getByLabelText("Powod"), "Przypisanie zbieracza");
    await user.click(screen.getByLabelText("Potwierdzam zmiane roli i powiazania"));
    await user.click(screen.getByRole("button", { name: "Zapisz zmiane" }));

    await waitFor(() => {
      expect(updateRoleAndWorker).toHaveBeenCalled();
    });
    const [, input] = updateRoleAndWorker.mock.calls[0];

    expect(input).toMatchObject({
      actorProfile: adminState.profile,
      targetUid: "operator-1",
      targetRole: "PICKER",
      targetWorkerId: "worker-operator",
      reason: "Przypisanie zbieracza"
    });
    expect(input.deviceId).toEqual(expect.any(String));
    await waitFor(() => {
      expect(list).toHaveBeenCalledTimes(2);
    });
    expect(
      screen.getByText("Zmieniono role lub powiazanie profilu.")
    ).toBeInTheDocument();
  });
});
