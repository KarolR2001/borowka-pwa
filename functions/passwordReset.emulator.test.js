import assert from "node:assert/strict";
import test from "node:test";

import { getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";

const projectId = process.env.GCLOUD_PROJECT ?? "demo-borowka-pwa-dev";
const authEmulatorHost = process.env.FIREBASE_AUTH_EMULATOR_HOST ?? "127.0.0.1:9099";
const functionsEmulatorHost = process.env.FUNCTIONS_EMULATOR_HOST ?? "127.0.0.1:5001";
const runId = globalThis.crypto.randomUUID().replaceAll("-", "");
const adminEmail = `reset-admin-${runId}@example.test`;
const targetEmail = `reset-target-${runId}@example.test`;
const oldPassword = "old-password-123";
const newPassword = "new-password-123";

process.env.FIREBASE_AUTH_EMULATOR_HOST = authEmulatorHost;
process.env.FIRESTORE_EMULATOR_HOST ??= "127.0.0.1:8080";

if (getApps().length === 0) {
  initializeApp({ projectId });
}

const auth = getAuth();
const firestore = getFirestore();
let adminUid = "";
let targetUid = "";

test.after(async () => {
  await Promise.all([
    adminUid ? firestore.collection("users").doc(adminUid).delete() : Promise.resolve(),
    targetUid ? firestore.collection("users").doc(targetUid).delete() : Promise.resolve(),
    targetUid
      ? firestore.collection("passwordResetRequests").doc(targetUid).delete()
      : Promise.resolve(),
    adminUid ? auth.deleteUser(adminUid).catch(() => undefined) : Promise.resolve(),
    targetUid ? auth.deleteUser(targetUid).catch(() => undefined) : Promise.resolve()
  ]);
});

test("runs an administrator password reset through Auth, Firestore and callable Functions", async () => {
  const [admin, target] = await Promise.all([
    auth.createUser({ email: adminEmail, password: "admin-password-123" }),
    auth.createUser({ email: targetEmail, password: oldPassword })
  ]);
  adminUid = admin.uid;
  targetUid = target.uid;

  const adminProfile = profileDocument({
    displayName: "Administrator testowy",
    email: adminEmail,
    role: "ADMIN",
    uid: adminUid,
    workerId: null
  });
  const targetProfile = profileDocument({
    displayName: "Zbieracz testowy",
    email: targetEmail,
    role: "PICKER",
    uid: targetUid,
    workerId: "worker-test"
  });
  await Promise.all([
    firestore.collection("users").doc(adminUid).set(adminProfile),
    firestore.collection("users").doc(targetUid).set(targetProfile)
  ]);

  const knownAccount = await callCallable("requestPasswordReset", { email: targetEmail });
  const unknownAccount = await callCallable("requestPasswordReset", {
    email: `missing-${runId}@example.test`
  });

  assert.deepEqual(knownAccount.result, { accepted: true });
  assert.deepEqual(unknownAccount.result, { accepted: true });

  const pendingRequest = await firestore
    .collection("passwordResetRequests")
    .doc(targetUid)
    .get();
  assert.equal(pendingRequest.exists, true);
  assert.deepEqual(
    pick(pendingRequest.data(), ["displayName", "email", "role", "status", "userUid"]),
    {
      displayName: "Zbieracz testowy",
      email: targetEmail,
      role: "PICKER",
      status: "PENDING",
      userUid: targetUid
    }
  );
  assert.equal("newPassword" in pendingRequest.data(), false);

  const adminToken = await signInWithPassword(adminEmail, "admin-password-123");
  const completed = await callCallable(
    "completePasswordReset",
    { newPassword, requestId: targetUid },
    adminToken
  );
  assert.deepEqual(completed.result, { completed: true });

  await assert.rejects(signInWithPassword(targetEmail, oldPassword));
  const targetToken = await signInWithPassword(targetEmail, newPassword);
  assert.equal(typeof targetToken, "string");

  const completedRequest = await firestore
    .collection("passwordResetRequests")
    .doc(targetUid)
    .get();
  assert.equal(completedRequest.data().status, "COMPLETED");
  assert.equal(completedRequest.data().completedBy, adminUid);
  assert.equal("newPassword" in completedRequest.data(), false);

  const targetProfileAfterReset = await firestore
    .collection("users")
    .doc(targetUid)
    .get();
  assert.deepEqual(targetProfileAfterReset.data(), targetProfile);
});

async function callCallable(functionName, data, idToken = null) {
  const response = await fetch(
    `http://${functionsEmulatorHost}/${projectId}/europe-central2/${functionName}`,
    {
      body: JSON.stringify({ data }),
      headers: {
        ...(idToken ? { Authorization: `Bearer ${idToken}` } : {}),
        "Content-Type": "application/json"
      },
      method: "POST"
    }
  );
  const payload = await response.json();

  if (!response.ok) {
    throw new Error(`Callable ${functionName} failed: ${JSON.stringify(payload)}`);
  }

  return payload;
}

async function signInWithPassword(email, password) {
  const response = await fetch(
    `http://${authEmulatorHost}/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=test-key`,
    {
      body: JSON.stringify({ email, password, returnSecureToken: true }),
      headers: { "Content-Type": "application/json" },
      method: "POST"
    }
  );
  const payload = await response.json();

  if (!response.ok || typeof payload.idToken !== "string") {
    throw new Error(`Authentication failed: ${JSON.stringify(payload)}`);
  }

  return payload.idToken;
}

function profileDocument({ displayName, email, role, uid, workerId }) {
  return {
    active: true,
    displayName,
    email,
    offlineConsent: false,
    registrationStatus: "APPROVED",
    role,
    uid,
    workerId
  };
}

function pick(source, keys) {
  return Object.fromEntries(keys.map((key) => [key, source[key]]));
}
