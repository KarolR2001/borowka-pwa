import {
  canCancelRegistrationInvitation,
  createRegistrationInvitationDraft,
  decodeRegistrationInvitation,
  decodeRegistrationInvitationDocuments,
  defaultRegistrationInvitationFilters,
  filterRegistrationInvitations,
  sortRegistrationInvitations,
  type RegistrationInvitationDocument
} from "./registrationInvitations";

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

describe("registration invitations", () => {
  it("creates normalized pending invitation drafts", () => {
    expect(
      createRegistrationInvitationDraft({
        id: "invite-1",
        email: "  USER@Example.TEST ",
        displayName: " User Test ",
        targetRole: "OPERATOR",
        workerId: null,
        createdBy: "admin-1",
        createdAt: "2026-07-16T08:00:00.000Z"
      })
    ).toMatchObject({
      id: "invite-1",
      emailNormalized: "user@example.test",
      displayName: "User Test",
      targetRole: "OPERATOR",
      workerId: null,
      status: "PENDING",
      createdBy: "admin-1",
      usedBy: null,
      usedAt: null,
      expiresAt: null
    });
  });

  it("requires workerId for picker invitations", () => {
    expect(() =>
      createRegistrationInvitationDraft({
        id: "invite-1",
        email: "picker@example.test",
        displayName: "Picker Test",
        targetRole: "PICKER",
        workerId: null,
        createdBy: "admin-1",
        createdAt: "2026-07-16T08:00:00.000Z"
      })
    ).toThrow("Zaproszenie dla roli PICKER wymaga workerId.");
  });

  it("decodes valid invitation documents", () => {
    const invitation = createRegistrationInvitationDraft({
      id: "invite-1",
      email: "operator@example.test",
      displayName: "Operator Test",
      targetRole: "OPERATOR",
      createdBy: "admin-1",
      createdAt: "2026-07-16T08:00:00.000Z"
    });

    expect(decodeRegistrationInvitation("invite-1", invitation)).toEqual({
      status: "FOUND",
      invitation
    });
  });

  it("rejects mismatched id and malformed picker invitation", () => {
    const invitation = createRegistrationInvitationDraft({
      id: "invite-1",
      email: "operator@example.test",
      displayName: "Operator Test",
      targetRole: "OPERATOR",
      createdBy: "admin-1",
      createdAt: "2026-07-16T08:00:00.000Z"
    });

    expect(decodeRegistrationInvitation("other-id", invitation)).toMatchObject({
      status: "INVALID",
      reason: "Zaproszenie ma niezgodny identyfikator."
    });
    expect(
      decodeRegistrationInvitation("invite-1", {
        ...invitation,
        targetRole: "PICKER"
      })
    ).toMatchObject({
      status: "INVALID",
      reason: "Zaproszenie dla roli PICKER wymaga workerId."
    });
  });

  it("allows cancellation only for pending invitations", () => {
    const invitation = createRegistrationInvitationDraft({
      id: "invite-1",
      email: "operator@example.test",
      displayName: "Operator Test",
      targetRole: "OPERATOR",
      createdBy: "admin-1",
      createdAt: "2026-07-16T08:00:00.000Z"
    });

    expect(canCancelRegistrationInvitation(invitation)).toBe(true);
    expect(
      canCancelRegistrationInvitation({
        ...invitation,
        status: "USED"
      })
    ).toBe(false);
  });

  it("sorts and filters invitation lists", () => {
    const invitations = [
      invitation({
        id: "cancelled-1",
        displayName: "Cancelled Test",
        status: "CANCELLED"
      }),
      invitation({
        id: "picker-1",
        emailNormalized: "anna@example.test",
        displayName: "Anna Zbieracz",
        targetRole: "PICKER",
        workerId: "worker-anna"
      }),
      invitation({
        id: "used-1",
        displayName: "Used Test",
        status: "USED"
      })
    ];

    expect(sortRegistrationInvitations(invitations).map((item) => item.id)).toEqual([
      "picker-1",
      "used-1",
      "cancelled-1"
    ]);
    expect(
      filterRegistrationInvitations(invitations, {
        ...defaultRegistrationInvitationFilters,
        targetRole: "PICKER"
      }).map((item) => item.id)
    ).toEqual(["picker-1"]);
    expect(
      filterRegistrationInvitations(invitations, {
        ...defaultRegistrationInvitationFilters,
        search: "worker-anna"
      }).map((item) => item.id)
    ).toEqual(["picker-1"]);
  });

  it("separates invalid invitation documents", () => {
    const decoded = decodeRegistrationInvitationDocuments([
      {
        id: "invite-1",
        data: invitation({
          id: "invite-1",
          displayName: "Operator Test"
        })
      },
      {
        id: "broken-1",
        data: {
          id: "different-id",
          emailNormalized: "broken@example.test"
        }
      }
    ]);

    expect(decoded.invitations.map((item) => item.id)).toEqual(["invite-1"]);
    expect(decoded.invalidInvitations).toEqual([
      {
        id: "broken-1",
        reason: "Zaproszenie ma niezgodny identyfikator."
      }
    ]);
  });
});
