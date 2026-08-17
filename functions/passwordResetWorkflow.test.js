import assert from "node:assert/strict";
import test from "node:test";

import {
  PASSWORD_RESET_NEUTRAL_RESULT,
  PasswordResetWorkflowError,
  completePasswordReset,
  submitPasswordResetRequest,
  validateAdministratorPassword
} from "./passwordResetWorkflow.js";

const targetProfile = {
  active: true,
  displayName: "Anna Zbieracz",
  registrationStatus: "APPROVED",
  role: "PICKER",
  uid: "picker-1"
};
const adminProfile = {
  active: true,
  displayName: "Karol Admin",
  registrationStatus: "APPROVED",
  role: "ADMIN",
  uid: "admin-1"
};

test("returns the same neutral response for an unknown e-mail", async () => {
  const requests = createRequestStore();
  const result = await submitPasswordResetRequest({
    accounts: {
      getProfile: async () => null,
      getUserByEmail: async () => {
        const error = new Error("Unknown user");
        error.code = "auth/user-not-found";
        throw error;
      }
    },
    emailInput: "nie-ma@example.test",
    requests
  });

  assert.deepEqual(result, PASSWORD_RESET_NEUTRAL_RESULT);
  assert.equal(requests.documents.size, 0);
});

test("records one pending request for an eligible account without changing its profile", async () => {
  const requests = createRequestStore();
  const profiles = new Map([[targetProfile.uid, targetProfile]]);
  const result = await submitPasswordResetRequest({
    accounts: {
      getProfile: async (uid) => profiles.get(uid) ?? null,
      getUserByEmail: async () => ({ email: "anna@example.test", uid: targetProfile.uid })
    },
    emailInput: " ANNA@example.test ",
    now: () => new Date("2026-08-17T09:00:00.000Z"),
    requests
  });

  assert.deepEqual(result, PASSWORD_RESET_NEUTRAL_RESULT);
  assert.deepEqual(requests.documents.get(targetProfile.uid), {
    completedAt: null,
    completedBy: null,
    displayName: "Anna Zbieracz",
    email: "anna@example.test",
    id: "picker-1",
    processingId: null,
    processingStartedAt: null,
    requestedAt: new Date("2026-08-17T09:00:00.000Z"),
    role: "PICKER",
    status: "PENDING",
    userUid: "picker-1"
  });
  assert.deepEqual(profiles.get(targetProfile.uid), targetProfile);
});

test("does not duplicate a pending password reset request", async () => {
  const requests = createRequestStore({
    "picker-1": { status: "PENDING", userUid: "picker-1" }
  });
  await submitPasswordResetRequest({
    accounts: {
      getProfile: async () => targetProfile,
      getUserByEmail: async () => ({ email: "anna@example.test", uid: "picker-1" })
    },
    emailInput: "anna@example.test",
    requests
  });

  assert.equal(requests.setCalls, 0);
});

test("lets only an active administrator set the new password and completes the request", async () => {
  const requests = createRequestStore({
    "picker-1": { status: "PENDING", userUid: "picker-1" }
  });
  const profiles = new Map([
    [adminProfile.uid, adminProfile],
    [targetProfile.uid, targetProfile]
  ]);
  const passwords = new Map();
  const result = await completePasswordReset({
    accounts: {
      getProfile: async (uid) => profiles.get(uid) ?? null,
      updatePassword: async (uid, password) => {
        passwords.set(uid, password);
      }
    },
    actorUid: "admin-1",
    newPassword: "nowe-haslo-123",
    requestIdInput: "picker-1",
    requests
  });

  assert.deepEqual(result, { completed: true });
  assert.equal(passwords.get("picker-1"), "nowe-haslo-123");
  assert.equal(requests.documents.get("picker-1").status, "COMPLETED");
  assert.equal(requests.documents.get("picker-1").completedBy, "admin-1");
  assert.deepEqual(profiles.get("picker-1"), targetProfile);
});

test("rejects a non-administrator and short administrator password", async () => {
  const requests = createRequestStore({
    "picker-1": { status: "PENDING", userUid: "picker-1" }
  });

  await assert.rejects(
    completePasswordReset({
      accounts: {
        getProfile: async () => targetProfile,
        updatePassword: async () => undefined
      },
      actorUid: "picker-1",
      newPassword: "nowe-haslo-123",
      requestIdInput: "picker-1",
      requests
    }),
    (error) =>
      error instanceof PasswordResetWorkflowError && error.code === "permission-denied"
  );
  assert.throws(
    () => validateAdministratorPassword("za-krot"),
    (error) =>
      error instanceof PasswordResetWorkflowError && error.code === "invalid-argument"
  );
});

test("returns a claimed request to pending when Authentication rejects the password update", async () => {
  const requests = createRequestStore({
    "picker-1": { status: "PENDING", userUid: "picker-1" }
  });

  await assert.rejects(
    completePasswordReset({
      accounts: {
        getProfile: async () => adminProfile,
        updatePassword: async () => {
          throw new Error("Authentication unavailable");
        }
      },
      actorUid: "admin-1",
      newPassword: "nowe-haslo-123",
      requestIdInput: "picker-1",
      requests
    }),
    /Authentication unavailable/
  );
  assert.equal(requests.documents.get("picker-1").status, "PENDING");
});

function createRequestStore(initialDocuments = {}) {
  const documents = new Map(
    Object.entries(initialDocuments).map(([id, document]) => [id, { ...document }])
  );

  return {
    documents,
    setCalls: 0,
    async get(id) {
      return documents.get(id) ?? null;
    },
    async set(id, document) {
      this.setCalls += 1;
      documents.set(id, document);
    },
    async claim(id) {
      const document = documents.get(id);

      if (!document || document.status !== "PENDING") {
        return null;
      }

      const processingId = "processing-1";
      documents.set(id, { ...document, processingId, status: "PROCESSING" });
      return { ...document, processingId };
    },
    async complete(id, processingId, actorUid) {
      const document = documents.get(id);
      assert.equal(document?.processingId, processingId);
      documents.set(id, {
        ...document,
        completedBy: actorUid,
        processingId: null,
        status: "COMPLETED"
      });
    },
    async release(id, processingId) {
      const document = documents.get(id);

      if (document?.processingId === processingId) {
        documents.set(id, { ...document, processingId: null, status: "PENDING" });
      }
    }
  };
}
