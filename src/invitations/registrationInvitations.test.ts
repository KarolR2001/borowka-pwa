import {
  canCancelRegistrationInvitation,
  createRegistrationInvitationDraft,
  decodeRegistrationInvitation
} from "./registrationInvitations";

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
});
