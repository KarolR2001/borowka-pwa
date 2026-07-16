import { createRegistrationInvitationDraft } from "../invitations/registrationInvitations";
import {
  createUsedRegistrationInvitationUpdate,
  createUserProfileFromRegistrationInvitation,
  validateInvitedRegistrationInput
} from "./invitedRegistration";

const validInput = {
  email: "operator@example.test",
  displayName: "Operator Test",
  password: "secret-password",
  passwordConfirmation: "secret-password",
  acceptsPrerelease: true
};

const invitation = createRegistrationInvitationDraft({
  id: "invite-operator",
  email: "operator@example.test",
  displayName: "Operator Test",
  targetRole: "OPERATOR",
  workerId: null,
  createdBy: "admin-1",
  createdAt: "2026-07-16T08:00:00.000Z"
});

describe("invited registration", () => {
  it("validates registration input", () => {
    expect(validateInvitedRegistrationInput(validInput)).toBeNull();
    expect(
      validateInvitedRegistrationInput({
        ...validInput,
        passwordConfirmation: "different-password"
      })
    ).toBe("Hasla musza byc takie same.");
    expect(
      validateInvitedRegistrationInput({
        ...validInput,
        acceptsPrerelease: false
      })
    ).toBe("Potwierdz, ze konto wymaga prerejestracji administratora.");
  });

  it("creates approved profile from pending invitation", () => {
    expect(
      createUserProfileFromRegistrationInvitation({
        uid: "operator-uid",
        email: "Operator@Example.TEST",
        invitation
      })
    ).toEqual({
      uid: "operator-uid",
      email: "operator@example.test",
      displayName: "Operator Test",
      role: "OPERATOR",
      workerId: null,
      active: true,
      registrationStatus: "APPROVED",
      offlineConsent: false,
      registrationInvitationId: "invite-operator"
    });
  });

  it("rejects invitation assigned to another email", () => {
    expect(() =>
      createUserProfileFromRegistrationInvitation({
        uid: "operator-uid",
        email: "other@example.test",
        invitation
      })
    ).toThrow("Zaproszenie jest przypisane do innego e-maila.");
  });

  it("creates used invitation update payload", () => {
    expect(createUsedRegistrationInvitationUpdate("operator-uid", "now")).toEqual({
      status: "USED",
      usedBy: "operator-uid",
      usedAt: "now"
    });
  });
});
