import {
  ADMIN_PASSWORD_MIN_LENGTH,
  decodePasswordResetRequest,
  getAdminPasswordResetErrorMessage
} from "./passwordResetRequests";

describe("password reset requests", () => {
  it("decodes an administrator-visible request without a password field", () => {
    const request = decodePasswordResetRequest("picker-1", {
      displayName: "Anna Zbieracz",
      email: "anna@example.test",
      id: "picker-1",
      requestedAt: new Date("2026-08-17T09:00:00.000Z"),
      role: "PICKER",
      status: "PENDING",
      userUid: "picker-1"
    });

    expect(request).toEqual({
      displayName: "Anna Zbieracz",
      email: "anna@example.test",
      id: "picker-1",
      requestedAtIso: "2026-08-17T09:00:00.000Z",
      role: "PICKER",
      status: "PENDING",
      userUid: "picker-1"
    });
  });

  it("rejects a malformed request document", () => {
    expect(
      decodePasswordResetRequest("picker-1", {
        email: "anna@example.test",
        role: "PICKER",
        status: "PENDING",
        userUid: "picker-1"
      })
    ).toBeNull();
  });

  it("uses the PRD minimum password length and explains completed requests", () => {
    expect(ADMIN_PASSWORD_MIN_LENGTH).toBe(10);
    expect(
      getAdminPasswordResetErrorMessage({ code: "functions/failed-precondition" })
    ).toContain("już obsłużona");
  });
});
