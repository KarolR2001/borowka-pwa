import { waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auth: {},
  browserLocalPersistence: { type: "LOCAL" },
  onAuthStateChanged: vi.fn(() => vi.fn()),
  setPersistence: vi.fn(() => Promise.resolve()),
  signInWithEmailAndPassword: vi.fn(() => Promise.resolve())
}));

vi.mock("../config/firebaseServices", () => ({
  getFirebaseServices: vi.fn(() => Promise.resolve({ auth: mocks.auth, firestore: {} })),
  getFirebaseServicesStatus: vi.fn(() => ({ ready: true }))
}));

vi.mock("firebase/auth", () => ({
  browserLocalPersistence: mocks.browserLocalPersistence,
  onAuthStateChanged: mocks.onAuthStateChanged,
  setPersistence: mocks.setPersistence,
  signInWithEmailAndPassword: mocks.signInWithEmailAndPassword
}));

import { signInWithEmailPassword, subscribeToAuthSession } from "./authSession";

describe("auth session persistence", () => {
  beforeEach(() => {
    mocks.auth = {};
    mocks.onAuthStateChanged.mockClear();
    mocks.setPersistence.mockClear();
    mocks.signInWithEmailAndPassword.mockClear();
  });

  it("configures local persistence before observing the Firebase session", async () => {
    await subscribeToAuthSession({}, vi.fn());

    expect(mocks.setPersistence).toHaveBeenCalledWith(
      mocks.auth,
      mocks.browserLocalPersistence
    );
    expect(mocks.setPersistence.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.onAuthStateChanged.mock.invocationCallOrder[0] ?? Number.MAX_SAFE_INTEGER
    );
  });

  it("configures local persistence before password sign-in", async () => {
    await signInWithEmailPassword(
      {},
      {
        email: " ADMIN@EXAMPLE.TEST ",
        password: "secret"
      }
    );

    await waitFor(() => {
      expect(mocks.signInWithEmailAndPassword).toHaveBeenCalled();
    });
    expect(mocks.setPersistence).toHaveBeenCalledWith(
      mocks.auth,
      mocks.browserLocalPersistence
    );
    expect(mocks.setPersistence.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.signInWithEmailAndPassword.mock.invocationCallOrder[0] ??
        Number.MAX_SAFE_INTEGER
    );
    expect(mocks.signInWithEmailAndPassword).toHaveBeenCalledWith(
      mocks.auth,
      "admin@example.test",
      "secret"
    );
  });
});
