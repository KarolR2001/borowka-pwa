import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import type { AuthSessionState } from "../auth/authSession";
import {
  AdminRegistrationInvitationsPanel,
  type RegistrationInvitationsApi
} from "./AdminRegistrationInvitationsPanel";
import {
  createRegistrationInvitationDraft,
  type RegistrationInvitationDocument
} from "./registrationInvitations";

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

const invitation = ({
  id,
  ...overrides
}: Partial<RegistrationInvitationDocument> & {
  id: string;
}): RegistrationInvitationDocument => ({
  ...createRegistrationInvitationDraft({
    id,
    email: `${id}@example.test`,
    displayName: id,
    targetRole: "OPERATOR",
    createdBy: "admin-1",
    createdAt: "2026-07-16T08:00:00.000Z"
  }),
  ...overrides
});

const env = {};

const createInvitationsApi = (
  overrides: Partial<RegistrationInvitationsApi> = {}
): RegistrationInvitationsApi => ({
  list: vi.fn<RegistrationInvitationsApi["list"]>().mockResolvedValue({
    invitations: [],
    invalidInvitations: []
  }),
  create: vi.fn<RegistrationInvitationsApi["create"]>().mockResolvedValue(
    invitation({
      id: "invite-new",
      emailNormalized: "operator@example.test",
      displayName: "Operator Test"
    })
  ),
  cancel: vi.fn<RegistrationInvitationsApi["cancel"]>().mockResolvedValue(undefined),
  ...overrides
});

describe("AdminRegistrationInvitationsPanel", () => {
  it("requires a signed-in administrator", () => {
    render(<AdminRegistrationInvitationsPanel authState={signedOutState} env={env} />);

    expect(screen.getByText("Logowanie wymagane")).toBeInTheDocument();
  });

  it("blocks non-admin profiles", () => {
    render(<AdminRegistrationInvitationsPanel authState={operatorState} env={env} />);

    expect(screen.getByText("Brak dostepu")).toBeInTheDocument();
  });

  it("loads invitations for administrator and renders invalid documents", async () => {
    const list = vi.fn<RegistrationInvitationsApi["list"]>().mockResolvedValue({
      invitations: [
        invitation({
          id: "invite-admin",
          displayName: "Admin Zaproszony",
          targetRole: "ADMIN"
        }),
        invitation({
          id: "invite-picker",
          displayName: "Anna Zbieracz",
          targetRole: "PICKER",
          workerId: "worker-anna"
        })
      ],
      invalidInvitations: [
        {
          id: "broken-1",
          reason: "Zaproszenie ma nieznana role."
        }
      ]
    });

    render(
      <AdminRegistrationInvitationsPanel
        authState={adminState}
        env={env}
        registrationInvitationsApi={createInvitationsApi({ list })}
      />
    );

    await waitFor(() => {
      expect(list).toHaveBeenCalled();
    });
    expect(screen.getByText("Admin Zaproszony")).toBeInTheDocument();
    expect(screen.getByText("Anna Zbieracz")).toBeInTheDocument();
    expect(screen.getByText("broken-1")).toBeInTheDocument();
  });

  it("filters rendered invitations by status", async () => {
    const user = userEvent.setup();
    const list = vi.fn<RegistrationInvitationsApi["list"]>().mockResolvedValue({
      invitations: [
        invitation({
          id: "invite-pending",
          displayName: "Oczekujace Zaproszenie"
        }),
        invitation({
          id: "invite-cancelled",
          displayName: "Anulowane Zaproszenie",
          status: "CANCELLED"
        })
      ],
      invalidInvitations: []
    });

    render(
      <AdminRegistrationInvitationsPanel
        authState={adminState}
        env={env}
        registrationInvitationsApi={createInvitationsApi({ list })}
      />
    );

    await screen.findByText("Oczekujace Zaproszenie");
    await user.selectOptions(screen.getByLabelText("Status"), "CANCELLED");

    expect(screen.queryByText("Oczekujace Zaproszenie")).not.toBeInTheDocument();
    expect(screen.getByText("Anulowane Zaproszenie")).toBeInTheDocument();
  });

  it("validates picker workerId before creating invitation", async () => {
    const user = userEvent.setup();
    const create = vi.fn<RegistrationInvitationsApi["create"]>().mockResolvedValue(
      invitation({
        id: "invite-picker",
        emailNormalized: "picker@example.test",
        displayName: "Picker Test"
      })
    );

    render(
      <AdminRegistrationInvitationsPanel
        authState={adminState}
        env={env}
        registrationInvitationsApi={createInvitationsApi({ create })}
      />
    );

    await screen.findByText("Brak zaproszen dla wybranych filtrow.");
    await user.type(screen.getByLabelText("E-mail"), "picker@example.test");
    await user.type(screen.getByLabelText("Nazwa"), "Picker Test");
    await user.selectOptions(screen.getByLabelText("Rola docelowa"), "PICKER");
    await user.click(screen.getByRole("button", { name: "Dodaj" }));

    expect(create).not.toHaveBeenCalled();
    expect(
      screen.getByText("Zaproszenie dla zbieracza wymaga workerId.")
    ).toBeInTheDocument();
  });

  it("creates invitation with the signed-in administrator as creator", async () => {
    const user = userEvent.setup();
    const create = vi.fn<RegistrationInvitationsApi["create"]>().mockResolvedValue(
      invitation({
        id: "invite-operator",
        emailNormalized: "operator@example.test",
        displayName: "Operator Test"
      })
    );

    render(
      <AdminRegistrationInvitationsPanel
        authState={adminState}
        env={env}
        registrationInvitationsApi={createInvitationsApi({ create })}
      />
    );

    await screen.findByText("Brak zaproszen dla wybranych filtrow.");
    await user.type(screen.getByLabelText("E-mail"), "Operator@Example.TEST");
    await user.type(screen.getByLabelText("Nazwa"), "Operator Test");
    await user.click(screen.getByRole("button", { name: "Dodaj" }));

    await waitFor(() => {
      expect(create).toHaveBeenCalledWith(expect.anything(), {
        email: "Operator@Example.TEST",
        displayName: "Operator Test",
        targetRole: "OPERATOR",
        workerId: null,
        createdBy: "admin-1"
      });
    });
    expect(
      screen.getByText("Dodano zaproszenie dla operator@example.test.")
    ).toBeInTheDocument();
  });

  it("cancels pending invitation", async () => {
    const user = userEvent.setup();
    const cancel = vi
      .fn<RegistrationInvitationsApi["cancel"]>()
      .mockResolvedValue(undefined);
    const pendingInvitation = invitation({
      id: "invite-picker",
      emailNormalized: "anna@example.test",
      displayName: "Anna Zbieracz",
      targetRole: "PICKER",
      workerId: "worker-anna"
    });
    const list = vi.fn<RegistrationInvitationsApi["list"]>().mockResolvedValue({
      invitations: [pendingInvitation],
      invalidInvitations: []
    });

    render(
      <AdminRegistrationInvitationsPanel
        authState={adminState}
        env={env}
        registrationInvitationsApi={createInvitationsApi({ cancel, list })}
      />
    );

    await screen.findByText("Anna Zbieracz");
    await user.click(
      screen.getByRole("button", {
        name: "Anuluj zaproszenie anna@example.test"
      })
    );

    await waitFor(() => {
      expect(cancel).toHaveBeenCalledWith(expect.anything(), "invite-picker");
    });
    expect(
      screen.getByText("Anulowano zaproszenie dla anna@example.test.")
    ).toBeInTheDocument();
  });
});
