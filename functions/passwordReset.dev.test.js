import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";

if (process.env.PASSWORD_RESET_DEV_TEST !== "true") {
  throw new Error(
    "Set PASSWORD_RESET_DEV_TEST=true to run this Firebase development test."
  );
}

const developmentEnv = await readDevelopmentEnvironment();
const projectId = developmentEnv.VITE_FIREBASE_PROJECT_ID;
const apiKey = developmentEnv.VITE_FIREBASE_API_KEY;
const region = "europe-central2";
const callableBaseUrl = `https://${region}-${projectId}.cloudfunctions.net`;
const runId = globalThis.crypto.randomUUID().replaceAll("-", "");
const adminEmail = `reset-dev-admin-${runId}@example.test`;
const targetEmail = `reset-dev-target-${runId}@example.test`;
const oldPassword = "old-password-123";
const newPassword = "new-password-123";

if (getApps().length === 0) {
  initializeApp({ projectId });
}

const auth = getAuth();
const firestore = getFirestore();
let adminUid = "";
let targetUid = "";

test.after(async () => {
  await Promise.all([
    adminUid
      ? firestore
          .collection("users")
          .doc(adminUid)
          .delete()
          .catch(() => undefined)
      : undefined,
    targetUid
      ? firestore
          .collection("users")
          .doc(targetUid)
          .delete()
          .catch(() => undefined)
      : undefined,
    targetUid
      ? firestore
          .collection("passwordResetRequests")
          .doc(targetUid)
          .delete()
          .catch(() => undefined)
      : undefined,
    adminUid ? auth.deleteUser(adminUid).catch(() => undefined) : undefined,
    targetUid ? auth.deleteUser(targetUid).catch(() => undefined) : undefined
  ]);
});

test("verifies the administrator password reset flow on Firebase development", async () => {
  const [admin, target] = await Promise.all([
    auth.createUser({ email: adminEmail, password: "admin-password-123" }),
    auth.createUser({ email: targetEmail, password: oldPassword })
  ]);
  adminUid = admin.uid;
  targetUid = target.uid;

  const targetProfile = profileDocument({
    displayName: "Zbieracz testowy DEV",
    email: targetEmail,
    role: "PICKER",
    uid: targetUid,
    workerId: "worker-reset-dev"
  });
  await Promise.all([
    firestore
      .collection("users")
      .doc(adminUid)
      .set(
        profileDocument({
          displayName: "Administrator testowy DEV",
          email: adminEmail,
          role: "ADMIN",
          uid: adminUid,
          workerId: null
        })
      ),
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
  assert.equal(pendingRequest.data()?.status, "PENDING");
  assert.equal("newPassword" in (pendingRequest.data() ?? {}), false);

  const adminToken = await signInWithCustomToken(adminUid);
  const completed = await callCallable(
    "completePasswordReset",
    { newPassword, requestId: targetUid },
    adminToken
  );
  assert.deepEqual(completed.result, { completed: true });

  await assert.rejects(signInWithPassword(targetEmail, oldPassword));
  const targetToken = await signInWithPassword(targetEmail, newPassword);
  assert.equal(typeof targetToken, "string");
  const requestAfterReset = await firestore
    .collection("passwordResetRequests")
    .doc(targetUid)
    .get();
  assert.equal(requestAfterReset.data()?.status, "COMPLETED");
  assert.equal(requestAfterReset.data()?.completedBy, adminUid);
  assert.equal("newPassword" in (requestAfterReset.data() ?? {}), false);

  const targetProfileAfterReset = await firestore
    .collection("users")
    .doc(targetUid)
    .get();
  assert.deepEqual(targetProfileAfterReset.data(), targetProfile);
});

async function readDevelopmentEnvironment() {
  const source = await readFile(".env.development.local", "utf8");
  const values = Object.fromEntries(
    source
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith("#"))
      .map((line) => {
        const separator = line.indexOf("=");
        return [line.slice(0, separator), line.slice(separator + 1)];
      })
  );

  if (
    values.VITE_APP_ENV !== "development" ||
    values.VITE_FIREBASE_PROJECT_ID !== "borowka-pwa-dev" ||
    typeof values.VITE_FIREBASE_API_KEY !== "string" ||
    !values.VITE_FIREBASE_API_KEY
  ) {
    throw new Error("The local development environment configuration is incomplete.");
  }

  return values;
}

async function callCallable(functionName, data, idToken = null) {
  const response = await fetch(`${callableBaseUrl}/${functionName}`, {
    body: JSON.stringify({ data }),
    headers: {
      ...(idToken ? { Authorization: `Bearer ${idToken}` } : {}),
      "Content-Type": "application/json"
    },
    method: "POST"
  });
  const payload = await response.json();

  if (!response.ok) {
    throw new Error(`Callable ${functionName} failed: ${JSON.stringify(payload)}`);
  }

  return payload;
}

async function signInWithCustomToken(uid) {
  const token = await auth.createCustomToken(uid);
  const response = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=${apiKey}`,
    {
      body: JSON.stringify({ returnSecureToken: true, token }),
      headers: { "Content-Type": "application/json" },
      method: "POST"
    }
  );
  const payload = await response.json();

  if (!response.ok || typeof payload.idToken !== "string") {
    throw new Error(`Custom token sign-in failed: ${JSON.stringify(payload)}`);
  }

  return payload.idToken;
}

async function signInWithPassword(email, password) {
  const response = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${apiKey}`,
    {
      body: JSON.stringify({ email, password, returnSecureToken: true }),
      headers: { "Content-Type": "application/json" },
      method: "POST"
    }
  );
  const payload = await response.json();

  if (!response.ok || typeof payload.idToken !== "string") {
    throw new Error(`Password sign-in failed: ${JSON.stringify(payload)}`);
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
