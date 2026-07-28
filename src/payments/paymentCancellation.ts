import {
  AUDIT_EVENTS_COLLECTION,
  createAuditEventDraft,
  type AuditEventDocument
} from "../audit/auditEvents";
import { getFirebaseServices } from "../config/firebaseServices";
import type { UserProfile } from "../domain/identity";
import { decodeHarvestSession } from "../harvest/harvestSessionDashboard";
import { HARVEST_SESSIONS_COLLECTION } from "../harvest/harvestSessionState";
import type { HarvestSessionDocument } from "../harvest/openHarvestSession";
import { decodePaymentDocument, type PaymentDocument } from "./paymentWrite";
import { PAYMENTS_COLLECTION } from "./pendingPayments";

type FirebaseEnv = Record<string, string | boolean | undefined>;

export const PAYMENT_CANCELLATION_REASON_MIN_LENGTH = 3;
export const PAYMENT_CANCELLATION_REASON_MAX_LENGTH = 300;

export type CancelPaymentInput = {
  actorProfile: UserProfile;
  confirmed: boolean;
  deviceId: string;
  expectedSessionRevision: number;
  isOnline: boolean;
  paymentId: string;
  reason: string;
};

export type PaymentCancellationUpdate = Pick<
  PaymentDocument,
  "status" | "cancelledAt" | "cancelledBy" | "cancellationReason"
>;

export type CancelledPaymentSessionUpdate = Pick<
  HarvestSessionDocument,
  "status" | "paidAt" | "paymentId" | "updatedAtServer" | "revision"
>;

export type PreparedPaymentCancellation = {
  auditEvent: AuditEventDocument;
  cancelledPayment: PaymentDocument;
  closedSession: HarvestSessionDocument;
  paymentUpdate: PaymentCancellationUpdate;
  sessionUpdate: CancelledPaymentSessionUpdate;
};

export type PaymentCancellationResult = {
  auditId: string;
  cancelledPayment: PaymentDocument;
  message: string;
  sessionRevision: number;
  status: "CANCELLED";
};

export async function cancelPayment(
  env: FirebaseEnv,
  input: CancelPaymentInput
): Promise<PaymentCancellationResult> {
  assertCancellationActor(input.actorProfile);

  if (!input.isOnline) {
    throw new Error("Anulowanie wyplaty wymaga aktywnego polaczenia.");
  }

  const paymentId = requiredText(
    input.paymentId,
    "Anulowanie wymaga identyfikatora wyplaty."
  );
  const deviceId = requiredText(
    input.deviceId,
    "Anulowanie wymaga identyfikatora urzadzenia."
  );
  const { firestore } = await getFirebaseServices(env);
  const { Timestamp, doc, getDocFromServer, runTransaction, serverTimestamp } =
    await import("firebase/firestore");
  const paymentRef = doc(firestore, PAYMENTS_COLLECTION, paymentId);
  const auditId = createPaymentCancellationAuditId(paymentId);
  const auditRef = doc(firestore, AUDIT_EVENTS_COLLECTION, auditId);

  const sourceSessionId = await runTransaction(firestore, async (transaction) => {
    const paymentSnapshot = await transaction.get(paymentRef);

    if (!paymentSnapshot.exists()) {
      throw new Error("Nie znaleziono wyplaty do anulowania.");
    }

    const payment = decodePaymentDocument(paymentSnapshot.id, paymentSnapshot.data());

    if (!payment) {
      throw new Error("Wyplata ma nieprawidlowy format.");
    }

    const sourceSessionRef = doc(
      firestore,
      HARVEST_SESSIONS_COLLECTION,
      payment.sessionId
    );
    const sessionSnapshot = await transaction.get(sourceSessionRef);

    if (!sessionSnapshot.exists()) {
      throw new Error("Nie znaleziono sesji zrodlowej wyplaty.");
    }

    const decodedSession = decodeHarvestSession(
      sessionSnapshot.id,
      sessionSnapshot.data()
    );

    if (decodedSession.status !== "FOUND") {
      throw new Error(decodedSession.reason);
    }

    const committedAt = serverTimestamp();
    const prepared = preparePaymentCancellation({
      ...input,
      auditId,
      cancelledAt: committedAt,
      createdAtDevice: Timestamp.now(),
      createdAtServer: committedAt,
      deviceId,
      payment,
      paymentId,
      session: decodedSession.session,
      updatedAtServer: committedAt
    });

    transaction.update(paymentRef, prepared.paymentUpdate);
    transaction.update(sourceSessionRef, prepared.sessionUpdate);
    transaction.set(auditRef, prepared.auditEvent);
    return payment.sessionId;
  });
  const sourceSessionRef = doc(firestore, HARVEST_SESSIONS_COLLECTION, sourceSessionId);

  const [paymentSnapshot, sessionSnapshot, auditSnapshot] = await Promise.all([
    getDocFromServer(paymentRef),
    getDocFromServer(sourceSessionRef),
    getDocFromServer(auditRef)
  ]);
  const payment = paymentSnapshot.exists()
    ? decodePaymentDocument(paymentSnapshot.id, paymentSnapshot.data())
    : null;
  const session = sessionSnapshot.exists()
    ? decodeHarvestSession(sessionSnapshot.id, sessionSnapshot.data())
    : null;

  if (
    payment?.status !== "CANCELLED" ||
    payment.cancelledBy !== input.actorProfile.uid ||
    session?.status !== "FOUND" ||
    session.session.status !== "CLOSED" ||
    session.session.paymentId !== null ||
    session.session.paidAt !== null ||
    !auditSnapshot.exists()
  ) {
    throw new Error(
      "Serwer nie potwierdzil pelnego anulowania. Odswiez historie przed ponowieniem."
    );
  }

  return {
    auditId,
    cancelledPayment: payment,
    message: `Anulowano wyplate dla ${payment.workerNameSnapshot}. Sesja ponownie oczekuje na rozliczenie.`,
    sessionRevision: session.session.revision,
    status: "CANCELLED"
  };
}

export function preparePaymentCancellation({
  actorProfile,
  auditId,
  cancelledAt,
  confirmed,
  createdAtDevice,
  createdAtServer,
  deviceId,
  expectedSessionRevision,
  isOnline,
  payment,
  paymentId,
  reason,
  session,
  updatedAtServer
}: CancelPaymentInput & {
  auditId: string;
  cancelledAt: unknown;
  createdAtDevice: unknown;
  createdAtServer: unknown;
  payment: PaymentDocument;
  session: HarvestSessionDocument;
  updatedAtServer: unknown;
}): PreparedPaymentCancellation {
  assertCancellationActor(actorProfile);

  if (!isOnline) {
    throw new Error("Anulowanie wyplaty wymaga aktywnego polaczenia.");
  }

  if (!confirmed) {
    throw new Error("Potwierdz skutki anulowania wyplaty.");
  }

  const normalizedPaymentId = requiredText(
    paymentId,
    "Anulowanie wymaga identyfikatora wyplaty."
  );
  const normalizedReason = reason.trim();

  if (
    normalizedReason.length < PAYMENT_CANCELLATION_REASON_MIN_LENGTH ||
    normalizedReason.length > PAYMENT_CANCELLATION_REASON_MAX_LENGTH
  ) {
    throw new Error(
      `Powod anulowania musi miec od ${String(
        PAYMENT_CANCELLATION_REASON_MIN_LENGTH
      )} do ${String(PAYMENT_CANCELLATION_REASON_MAX_LENGTH)} znakow.`
    );
  }

  if (
    !Number.isSafeInteger(expectedSessionRevision) ||
    expectedSessionRevision !== session.revision
  ) {
    throw new Error(
      "Sesja zmienila sie po otwarciu wyplaty. Sprawdz nowsze operacje i odswiez dane."
    );
  }

  if (
    payment.id !== normalizedPaymentId ||
    payment.status !== "ACTIVE" ||
    session.id !== payment.sessionId ||
    session.status !== "PAID" ||
    session.paymentId !== payment.id ||
    session.paidAt === null
  ) {
    throw new Error(
      "Wyplata nie jest juz aktywnym rozliczeniem tej sesji. Odswiez historie."
    );
  }

  if (
    session.seasonId !== payment.seasonId ||
    session.workerId !== payment.workerId ||
    session.amountDueGrosz !== payment.amountGrosz
  ) {
    throw new Error("Dane wyplaty i sesji zrodlowej sa niespojne.");
  }

  const revision = incrementRevision(session.revision);
  const paymentUpdate: PaymentCancellationUpdate = {
    cancellationReason: normalizedReason,
    cancelledAt,
    cancelledBy: actorProfile.uid,
    status: "CANCELLED"
  };
  const sessionUpdate: CancelledPaymentSessionUpdate = {
    paidAt: null,
    paymentId: null,
    revision,
    status: "CLOSED",
    updatedAtServer
  };
  const cancelledPayment = { ...payment, ...paymentUpdate };
  const closedSession = { ...session, ...sessionUpdate };
  const auditEvent = createAuditEventDraft({
    id: requiredText(auditId, "Anulowanie wymaga identyfikatora audytu."),
    action: "PAYMENT_CANCELLED",
    actorRoleSnapshot: actorProfile.role,
    actorUid: actorProfile.uid,
    afterSummary: paymentAuditSummary(cancelledPayment),
    beforeSummary: paymentAuditSummary(payment),
    businessDate: payment.paidBusinessDate,
    createdAtDevice,
    createdAtServer,
    deviceId,
    entityId: payment.id,
    entityType: "PAYMENT",
    reason: normalizedReason
  });

  return {
    auditEvent,
    cancelledPayment,
    closedSession,
    paymentUpdate,
    sessionUpdate
  };
}

export function createPaymentCancellationAuditId(paymentId: string): string {
  return `payment-cancelled-${requiredText(
    paymentId,
    "Anulowanie wymaga identyfikatora wyplaty."
  )}`;
}

function paymentAuditSummary(payment: PaymentDocument) {
  return {
    amountGrosz: payment.amountGrosz,
    paymentId: payment.id,
    sessionId: payment.sessionId,
    status: payment.status,
    workerId: payment.workerId
  };
}

function assertCancellationActor(profile: UserProfile): void {
  if (
    profile.role !== "ADMIN" ||
    !profile.active ||
    profile.registrationStatus !== "APPROVED"
  ) {
    throw new Error("Wyplate moze anulowac tylko aktywny administrator.");
  }
}

function requiredText(value: string, message: string): string {
  const normalized = value.trim();

  if (!normalized) {
    throw new Error(message);
  }

  return normalized;
}

function incrementRevision(revision: number): number {
  if (
    !Number.isSafeInteger(revision) ||
    revision < 1 ||
    revision >= Number.MAX_SAFE_INTEGER
  ) {
    throw new Error("Sesja ma nieprawidlowa rewizje.");
  }

  return revision + 1;
}
