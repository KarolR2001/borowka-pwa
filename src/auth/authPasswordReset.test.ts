const mocks = vi.hoisted(() => ({
  getFirebaseFunctions: vi.fn(),
  httpsCallable: vi.fn()
}));

vi.mock("../config/firebaseServices", () => ({
  getFirebaseFunctions: mocks.getFirebaseFunctions,
  getFirebaseServices: vi.fn(),
  getFirebaseServicesStatus: vi.fn(() => ({ ready: true }))
}));

vi.mock("firebase/functions", () => ({
  httpsCallable: mocks.httpsCallable
}));

import {
  PASSWORD_RESET_CONFIRMATION,
  getPasswordResetErrorMessage,
  requestPasswordReset
} from "./authSession";

describe("administrator password reset request", () => {
  beforeEach(() => {
    mocks.getFirebaseFunctions.mockReset();
    mocks.httpsCallable.mockReset();
  });

  it("sends a normalized e-mail to the callable request endpoint", async () => {
    const functions = {};
    const call = vi.fn().mockResolvedValue({ data: { accepted: true } });
    mocks.getFirebaseFunctions.mockResolvedValue(functions);
    mocks.httpsCallable.mockReturnValue(call);

    await requestPasswordReset({}, " ADMIN@EXAMPLE.TEST ");

    expect(mocks.httpsCallable).toHaveBeenCalledWith(functions, "requestPasswordReset");
    expect(call).toHaveBeenCalledWith({ email: "admin@example.test" });
  });

  it("keeps the requester confirmation neutral and names the administrator process", () => {
    expect(PASSWORD_RESET_CONFIRMATION).toContain("Jesli konto istnieje");
    expect(PASSWORD_RESET_CONFIRMATION).toContain("administratorowi");
    expect(PASSWORD_RESET_CONFIRMATION).not.toContain("nie istnieje");
  });

  it("explains that an unavailable callable endpoint requires an internet connection", () => {
    expect(getPasswordResetErrorMessage({ code: "functions/unavailable" })).toContain(
      "wymaga internetu"
    );
  });
});
