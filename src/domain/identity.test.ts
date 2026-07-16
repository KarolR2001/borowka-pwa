import {
  getIdentityAccessState,
  invitationStatusLabel,
  isInvitationStatus,
  isRegistrationStatus,
  isUserRole,
  normalizeEmail,
  roleRequiresWorkerId,
  type UserProfile
} from "./identity";

const approvedProfile: UserProfile = {
  uid: "user-1",
  email: "user@example.test",
  displayName: "User Test",
  role: "OPERATOR",
  workerId: null,
  active: true,
  registrationStatus: "APPROVED",
  offlineConsent: false
};

describe("identity domain", () => {
  it("normalizes email used by invitations", () => {
    expect(normalizeEmail("  USER@Example.TEST ")).toBe("user@example.test");
  });

  it("recognizes supported roles and statuses", () => {
    expect(isUserRole("ADMIN")).toBe(true);
    expect(isUserRole("OWNER")).toBe(false);
    expect(isRegistrationStatus("APPROVED")).toBe(true);
    expect(isRegistrationStatus("PENDING")).toBe(false);
    expect(isInvitationStatus("PENDING")).toBe(true);
    expect(isInvitationStatus("APPROVED")).toBe(false);
    expect(invitationStatusLabel("CANCELLED")).toBe("Anulowane");
  });

  it("requires workerId for picker profiles only", () => {
    expect(roleRequiresWorkerId("PICKER")).toBe(true);
    expect(roleRequiresWorkerId("ADMIN")).toBe(false);
    expect(roleRequiresWorkerId("OPERATOR")).toBe(false);
  });

  it("detects missing and blocked profiles", () => {
    expect(getIdentityAccessState(undefined)).toMatchObject({
      status: "MISSING_PROFILE"
    });
    expect(
      getIdentityAccessState({
        ...approvedProfile,
        active: false,
        registrationStatus: "BLOCKED"
      })
    ).toMatchObject({ status: "BLOCKED" });
  });

  it("rejects picker profile without workerId", () => {
    expect(
      getIdentityAccessState({
        ...approvedProfile,
        role: "PICKER",
        workerId: null
      })
    ).toMatchObject({ status: "INVALID_PICKER_PROFILE" });
  });

  it("accepts approved active profile", () => {
    expect(getIdentityAccessState(approvedProfile)).toEqual({
      status: "READY",
      role: "OPERATOR"
    });
  });
});
