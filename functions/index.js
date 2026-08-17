import { getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { FieldValue, getFirestore } from "firebase-admin/firestore";
import { HttpsError, onCall } from "firebase-functions/v2/https";

import {
  PASSWORD_RESET_REQUESTS_COLLECTION,
  PasswordResetWorkflowError,
  completePasswordReset as completePasswordResetWorkflow,
  submitPasswordResetRequest
} from "./passwordResetWorkflow.js";

if (getApps().length === 0) {
  initializeApp();
}

const callableOptions = {
  maxInstances: 2,
  region: "europe-central2"
};

export const requestPasswordReset = onCall(callableOptions, async (request) => {
  try {
    return await submitPasswordResetRequest({
      accounts: createAccountStore(),
      emailInput: request.data?.email,
      requests: createPasswordResetRequestStore()
    });
  } catch {
    throw new HttpsError("internal", "Nie udało się przekazać prośby administratorowi.");
  }
});

export const completePasswordReset = onCall(callableOptions, async (request) => {
  if (!request.auth?.uid) {
    throw new HttpsError("unauthenticated", "Zaloguj się jako administrator.");
  }

  try {
    return await completePasswordResetWorkflow({
      accounts: createAccountStore(),
      actorUid: request.auth.uid,
      newPassword: request.data?.newPassword,
      requestIdInput: request.data?.requestId,
      requests: createPasswordResetRequestStore()
    });
  } catch (error) {
    if (error instanceof PasswordResetWorkflowError) {
      throw new HttpsError(error.code, error.message);
    }

    throw new HttpsError("internal", "Nie udało się nadać nowego hasła.");
  }
});

function createAccountStore() {
  const firestore = getFirestore();
  const auth = getAuth();

  return {
    async getProfile(uid) {
      const snapshot = await firestore.collection("users").doc(uid).get();
      return snapshot.exists ? snapshot.data() : null;
    },
    getUserByEmail(email) {
      return auth.getUserByEmail(email);
    },
    updatePassword(uid, password) {
      return auth.updateUser(uid, { password });
    }
  };
}

function createPasswordResetRequestStore() {
  const collection = getFirestore().collection(PASSWORD_RESET_REQUESTS_COLLECTION);

  return {
    async get(requestId) {
      const snapshot = await collection.doc(requestId).get();
      return snapshot.exists ? snapshot.data() : null;
    },
    set(requestId, document) {
      return collection.doc(requestId).set(document);
    },
    claim(requestId) {
      return collection.firestore.runTransaction(async (transaction) => {
        const reference = collection.doc(requestId);
        const snapshot = await transaction.get(reference);

        if (!snapshot.exists || snapshot.data().status !== "PENDING") {
          return null;
        }

        const processingId = globalThis.crypto.randomUUID();
        transaction.update(reference, {
          processingId,
          processingStartedAt: FieldValue.serverTimestamp(),
          status: "PROCESSING"
        });

        return { ...snapshot.data(), processingId };
      });
    },
    complete(requestId, processingId, actorUid) {
      return collection.firestore.runTransaction(async (transaction) => {
        const reference = collection.doc(requestId);
        const snapshot = await transaction.get(reference);

        if (
          !snapshot.exists ||
          snapshot.data().status !== "PROCESSING" ||
          snapshot.data().processingId !== processingId
        ) {
          throw new Error("Password reset request claim was lost.");
        }

        transaction.update(reference, {
          completedAt: FieldValue.serverTimestamp(),
          completedBy: actorUid,
          processingId: null,
          processingStartedAt: null,
          status: "COMPLETED"
        });
      });
    },
    async release(requestId, processingId) {
      await collection.firestore.runTransaction(async (transaction) => {
        const reference = collection.doc(requestId);
        const snapshot = await transaction.get(reference);

        if (
          !snapshot.exists ||
          snapshot.data().status !== "PROCESSING" ||
          snapshot.data().processingId !== processingId
        ) {
          return;
        }

        transaction.update(reference, {
          processingId: null,
          processingStartedAt: null,
          status: "PENDING"
        });
      });
    }
  };
}
