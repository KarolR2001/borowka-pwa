import {
  AUDIT_EVENTS_COLLECTION,
  createAuditEventDraft,
  type AuditEventDocument
} from "../audit/auditEvents";
import { getFirebaseServices } from "../config/firebaseServices";
import type { UserProfile } from "../domain/identity";
import { decodeHarvestSession } from "../harvest/harvestSessionDashboard";
import {
  assertHarvestSessionTransitionAllowed,
  HARVEST_SESSIONS_COLLECTION
} from "../harvest/harvestSessionState";
import { harvestSessionAuditSummary } from "../harvest/harvestAudit";
import type { HarvestSessionDocument } from "../harvest/openHarvestSession";
import {
  PAYMENT_METHODS,
  PAYMENT_NOTE_MAX_LENGTH,
  type PaymentMethod,
  type PreparedPaymentConfirmation
} from "./paymentConfirmation";
import { createPaymentId } from "./paymentIdentity";
import { PAYMENTS_COLLECTION } from "./pendingPayments";

type FirebaseEnv = Record<string, string | boolean | undefined>;

export type PaymentDocument = {
  amountGrosz: number;
  cancellationReason: string | null;
  cancelledAt: unknown;
  cancelledBy: string | null;
  creationAttemptId: string | null;
  createdAtServer: unknown;
  createdBy: string;
  id: string;
  legacyImport: boolean;
  note: string | null;
  paidBusinessDate: string;
  paymentMethod: PaymentMethod;
  seasonId: string;
  sessionId: string;
  status: "ACTIVE" | "CANCELLED";
  workerId: string;
  workerNameSnapshot: string;
};

export type PaymentSessionUpdate = Pick<
  HarvestSessionDocument,
  "status" | "paidAt" | "paymentId" | "updatedAtServer" | "revision"
>;

export type PreparedPaymentWrite = {
  auditEvent: AuditEventDocument;
  paidSession: HarvestSessionDocument;
  payment: PaymentDocument;
  sessionUpdate: PaymentSessionUpdate;
};

export type CreatePaymentInput = {
  actorProfile: UserProfile;
  confirmation: PreparedPaymentConfirmation;
  deviceId: string;
  isOnline: boolean;
};

type PaymentWriteResultBase = {
  auditId: string;
  message: string;
  payment: PaymentDocument;
  sessionRevision: number;
};

export type PaymentConfirmedResult = PaymentWriteResultBase & {
  confirmationSource: "SERVER_READ_AFTER_COMMIT" | "SERVER_RECONCILIATION";
  status: "CONFIRMED";
};

export type PaymentAlreadyPaidResult = PaymentWriteResultBase & {
  confirmationSource: "SERVER_EXISTING_PAYMENT";
  existingPaymentCreatedAtIso: string | null;
  existingPaymentCreatedBy: string;
  status: "ALREADY_PAID";
};

export type PaymentWriteResult = PaymentConfirmedResult | PaymentAlreadyPaidResult;

export class PaymentWriteUncertainError extends Error {
  constructor() {
    super(
      "Nie mozna potwierdzic wyniku wyplaty. Po odzyskaniu polaczenia odswiez liste przed ponowieniem."
    );
    this.name = "PaymentWriteUncertainError";
  }
}

class PaymentWriteValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PaymentWriteValidationError";
  }
}

class PaymentWriteNotFoundError extends Error {
  constructor() {
    super("Serwer nie potwierdzil zapisu wyplaty.");
    this.name = "PaymentWriteNotFoundError";
  }
}

export async function createPayment(
  env: FirebaseEnv,
  input: CreatePaymentInput
): Promise<PaymentWriteResult> {
  assertPaymentActor(input.actorProfile);

  if (!input.isOnline) {
    throw new PaymentWriteValidationError("Wyplata wymaga aktywnego polaczenia.");
  }

  const deviceId = normalizeRequiredText(
    input.deviceId,
    "Wyplata wymaga identyfikatora urzadzenia."
  );
  const { firestore } = await getFirebaseServices(env);
  const { Timestamp, doc, getDocFromServer, runTransaction, serverTimestamp } =
    await import("firebase/firestore");
  const creationAttemptId = createPaymentAttemptId();
  const paymentRef = doc(firestore, PAYMENTS_COLLECTION, input.confirmation.paymentId);
  const sessionRef = doc(
    firestore,
    HARVEST_SESSIONS_COLLECTION,
    input.confirmation.sessionId
  );
  const auditId = createPaymentAuditId(input.confirmation.paymentId);
  const auditRef = doc(firestore, AUDIT_EVENTS_COLLECTION, auditId);
  let transactionError: unknown = null;

  try {
    await runTransaction(firestore, async (transaction) => {
      const [sessionSnapshot, paymentSnapshot] = await Promise.all([
        transaction.get(sessionRef),
        transaction.get(paymentRef)
      ]);

      if (!sessionSnapshot.exists()) {
        throw new PaymentWriteValidationError("Nie znaleziono sesji do wyplaty.");
      }

      if (paymentSnapshot.exists()) {
        throw new PaymentWriteValidationError(
          "Dokument wyplaty dla tej sesji juz istnieje. Odswiez liste."
        );
      }

      const decodedSession = decodeHarvestSession(
        sessionSnapshot.id,
        sessionSnapshot.data()
      );

      if (decodedSession.status !== "FOUND") {
        throw new PaymentWriteValidationError(decodedSession.reason);
      }

      const createdAtDevice = Timestamp.now();
      const committedAtServer = serverTimestamp();
      const prepared = preparePaymentWrite({
        actorProfile: input.actorProfile,
        auditId,
        confirmation: input.confirmation,
        creationAttemptId,
        createdAtDevice,
        createdAtServer: committedAtServer,
        deviceId,
        isOnline: input.isOnline,
        paidAt: committedAtServer,
        session: decodedSession.session
      });

      transaction.set(paymentRef, prepared.payment);
      transaction.update(sessionRef, prepared.sessionUpdate);
      transaction.set(auditRef, prepared.auditEvent);
    });
  } catch (error) {
    transactionError = error;
  }

  try {
    const serverState = await readAcceptedPaymentFromServer({
      auditId,
      auditRef,
      getDocFromServer,
      paymentRef,
      sessionRef
    });

    if (transactionError === null) {
      if (
        !paymentMatchesConfirmation(
          serverState,
          input.confirmation,
          input.actorProfile.uid,
          creationAttemptId
        )
      ) {
        throw new PaymentWriteUncertainError();
      }

      return confirmedPaymentResult(serverState, "SERVER_READ_AFTER_COMMIT");
    }

    if (
      !(transactionError instanceof PaymentWriteValidationError) &&
      paymentMatchesConfirmation(
        serverState,
        input.confirmation,
        input.actorProfile.uid,
        creationAttemptId
      )
    ) {
      return confirmedPaymentResult(serverState, "SERVER_RECONCILIATION");
    }

    return alreadyPaidResult(serverState);
  } catch (confirmationError) {
    if (transactionError instanceof PaymentWriteValidationError) {
      throw transactionError;
    }

    if (
      transactionError !== null &&
      confirmationError instanceof PaymentWriteNotFoundError
    ) {
      throw new PaymentWriteValidationError(
        transactionError instanceof Error
          ? transactionError.message
          : "Firestore odrzucil zapis wyplaty."
      );
    }

    throw new PaymentWriteUncertainError();
  }
}

export function preparePaymentWrite({
  actorProfile,
  auditId,
  confirmation,
  creationAttemptId,
  createdAtDevice,
  createdAtServer,
  deviceId,
  isOnline,
  paidAt,
  session
}: {
  actorProfile: UserProfile;
  auditId: string;
  confirmation: PreparedPaymentConfirmation;
  creationAttemptId: string;
  createdAtDevice: unknown;
  createdAtServer: unknown;
  deviceId: string;
  isOnline: boolean;
  paidAt: unknown;
  session: HarvestSessionDocument;
}): PreparedPaymentWrite {
  assertPaymentActor(actorProfile);
  const actorUid = normalizeRequiredText(actorProfile.uid, "Wyplata wymaga aktora.");
  const normalizedCreationAttemptId = normalizeRequiredText(
    creationAttemptId,
    "Wyplata wymaga identyfikatora proby zapisu."
  );
  const normalizedDeviceId = normalizeRequiredText(
    deviceId,
    "Wyplata wymaga identyfikatora urzadzenia."
  );
  assertKnownValue(createdAtDevice, "Audyt wyplaty wymaga czasu urzadzenia.");
  assertKnownValue(createdAtServer, "Wyplata wymaga czasu serwera.");
  assertKnownValue(paidAt, "Sesja wymaga czasu wyplaty.");

  assertHarvestSessionTransitionAllowed({
    type: "MARK_PAID",
    actorRole: actorProfile.role,
    fromStatus: session.status,
    isOnline,
    paymentId: confirmation.paymentId
  });

  if (
    !Number.isSafeInteger(confirmation.expectedSessionRevision) ||
    confirmation.expectedSessionRevision !== session.revision
  ) {
    throw new PaymentWriteValidationError(
      "Sesja zmienila sie po kontroli kwalifikacji. Sprawdz warunki ponownie."
    );
  }

  if (session.paymentId !== null || session.paidAt !== null) {
    throw new PaymentWriteValidationError("Sesja ma juz powiazanie z wyplata.");
  }

  if (
    confirmation.paymentId !==
      createPaymentId(session.id, confirmation.expectedSessionRevision + 1) ||
    confirmation.sessionId !== session.id ||
    confirmation.seasonId !== session.seasonId ||
    confirmation.workerId !== session.workerId ||
    confirmation.workerNameSnapshot !== session.workerNameSnapshot
  ) {
    throw new PaymentWriteValidationError(
      "Dane potwierdzenia nie odpowiadaja aktualnej sesji."
    );
  }

  if (
    session.amountDueGrosz === null ||
    confirmation.amountGrosz !== session.amountDueGrosz
  ) {
    throw new PaymentWriteValidationError(
      "Kwota wyplaty nie odpowiada oficjalnej naleznosci sesji."
    );
  }

  if (!isBusinessDate(confirmation.paidBusinessDate)) {
    throw new PaymentWriteValidationError("Wyplata ma nieprawidlowa date biznesowa.");
  }

  if (!PAYMENT_METHODS.includes(confirmation.paymentMethod)) {
    throw new PaymentWriteValidationError("Wyplata ma nieprawidlowa metode.");
  }

  if (
    confirmation.note !== null &&
    (confirmation.note !== confirmation.note.trim() ||
      confirmation.note.length === 0 ||
      confirmation.note.length > PAYMENT_NOTE_MAX_LENGTH)
  ) {
    throw new PaymentWriteValidationError("Wyplata ma nieprawidlowa notatke.");
  }

  const revision = incrementRevision(session.revision);
  const payment: PaymentDocument = {
    amountGrosz: confirmation.amountGrosz,
    cancellationReason: null,
    cancelledAt: null,
    cancelledBy: null,
    creationAttemptId: normalizedCreationAttemptId,
    createdAtServer,
    createdBy: actorUid,
    id: confirmation.paymentId,
    legacyImport: false,
    note: confirmation.note,
    paidBusinessDate: confirmation.paidBusinessDate,
    paymentMethod: confirmation.paymentMethod,
    seasonId: session.seasonId,
    sessionId: session.id,
    status: "ACTIVE",
    workerId: session.workerId,
    workerNameSnapshot: session.workerNameSnapshot
  };
  const sessionUpdate: PaymentSessionUpdate = {
    paidAt,
    paymentId: payment.id,
    revision,
    status: "PAID",
    updatedAtServer: paidAt
  };
  const paidSession: HarvestSessionDocument = {
    ...session,
    ...sessionUpdate
  };
  const auditEvent = createAuditEventDraft({
    id: normalizeRequiredText(auditId, "Wyplata wymaga identyfikatora audytu."),
    actorUid,
    actorRoleSnapshot: actorProfile.role,
    action: "HARVEST_SESSION_PAID",
    entityType: "HARVEST_SESSION",
    entityId: session.id,
    businessDate: confirmation.paidBusinessDate,
    beforeSummary: harvestSessionAuditSummary(session),
    afterSummary: harvestSessionAuditSummary(paidSession),
    reason: null,
    createdAtDevice,
    createdAtServer,
    deviceId: normalizedDeviceId
  });

  return {
    auditEvent,
    paidSession,
    payment,
    sessionUpdate
  };
}

export function decodePaymentDocument(
  expectedId: string,
  data: unknown
): PaymentDocument | null {
  if (!isRecord(data)) {
    return null;
  }

  const cancellationReason = readNullableText(data.cancellationReason);
  const cancelledBy = readNullableText(data.cancelledBy);
  const note = readNullableText(data.note);
  const creationAttemptId =
    data.creationAttemptId === undefined
      ? null
      : readRequiredText(data.creationAttemptId);

  if (
    cancellationReason === undefined ||
    cancelledBy === undefined ||
    note === undefined
  ) {
    return null;
  }

  if (!isPaymentStatus(data.status)) {
    return null;
  }

  const payment: PaymentDocument = {
    amountGrosz: readNonNegativeInteger(data.amountGrosz) ?? -1,
    cancellationReason,
    cancelledAt: data.cancelledAt ?? null,
    cancelledBy,
    creationAttemptId,
    createdAtServer: data.createdAtServer ?? null,
    createdBy: readRequiredText(data.createdBy),
    id: readRequiredText(data.id),
    legacyImport: data.legacyImport === true,
    note,
    paidBusinessDate: readRequiredText(data.paidBusinessDate),
    paymentMethod: data.paymentMethod as PaymentMethod,
    seasonId: readRequiredText(data.seasonId),
    sessionId: readRequiredText(data.sessionId),
    status: data.status,
    workerId: readRequiredText(data.workerId),
    workerNameSnapshot: readRequiredText(data.workerNameSnapshot)
  };

  if (
    payment.id !== expectedId ||
    !payment.sessionId ||
    (data.creationAttemptId !== undefined && !payment.creationAttemptId) ||
    payment.amountGrosz < 0 ||
    !payment.createdBy ||
    payment.createdAtServer === null ||
    !payment.seasonId ||
    !payment.workerId ||
    !payment.workerNameSnapshot ||
    !isBusinessDate(payment.paidBusinessDate) ||
    !PAYMENT_METHODS.includes(payment.paymentMethod) ||
    typeof data.legacyImport !== "boolean"
  ) {
    return null;
  }

  return payment;
}

export function createPaymentAuditId(paymentId: string): string {
  return `payment-created-${normalizeRequiredText(
    paymentId,
    "Audyt wyplaty wymaga identyfikatora wyplaty."
  )}`;
}

type AcceptedPaymentServerState = {
  auditId: string;
  payment: PaymentDocument;
  sessionRevision: number;
};

async function readAcceptedPaymentFromServer({
  auditId,
  auditRef,
  getDocFromServer,
  paymentRef,
  sessionRef
}: {
  auditId: string;
  auditRef: unknown;
  getDocFromServer: (reference: never) => Promise<{
    data: () => unknown;
    exists: () => boolean;
    id: string;
  }>;
  paymentRef: unknown;
  sessionRef: unknown;
}): Promise<AcceptedPaymentServerState> {
  let snapshots;

  try {
    snapshots = await Promise.all([
      getDocFromServer(paymentRef as never),
      getDocFromServer(sessionRef as never),
      getDocFromServer(auditRef as never)
    ]);
  } catch {
    throw new PaymentWriteUncertainError();
  }

  const [paymentSnapshot, sessionSnapshot, auditSnapshot] = snapshots;

  if (!paymentSnapshot.exists() || !sessionSnapshot.exists() || !auditSnapshot.exists()) {
    throw new PaymentWriteNotFoundError();
  }

  const payment = decodePaymentDocument(paymentSnapshot.id, paymentSnapshot.data());
  const decodedSession = decodeHarvestSession(sessionSnapshot.id, sessionSnapshot.data());
  const auditData = auditSnapshot.data();

  if (
    payment?.status !== "ACTIVE" ||
    decodedSession.status !== "FOUND" ||
    decodedSession.session.status !== "PAID" ||
    decodedSession.session.paymentId !== payment.id ||
    decodedSession.session.amountDueGrosz !== payment.amountGrosz ||
    !isRecord(auditData) ||
    auditSnapshot.id !== auditId ||
    auditData.action !== "HARVEST_SESSION_PAID" ||
    auditData.actorUid !== payment.createdBy ||
    auditData.entityId !== payment.sessionId ||
    auditData.entityType !== "HARVEST_SESSION"
  ) {
    throw new PaymentWriteUncertainError();
  }

  return {
    auditId,
    payment,
    sessionRevision: decodedSession.session.revision
  };
}

function paymentMatchesConfirmation(
  serverState: AcceptedPaymentServerState,
  confirmation: PreparedPaymentConfirmation,
  expectedCreatedBy: string,
  expectedCreationAttemptId: string
): boolean {
  const { payment } = serverState;

  return (
    payment.id === confirmation.paymentId &&
    payment.amountGrosz === confirmation.amountGrosz &&
    payment.seasonId === confirmation.seasonId &&
    payment.workerId === confirmation.workerId &&
    payment.workerNameSnapshot === confirmation.workerNameSnapshot &&
    payment.paidBusinessDate === confirmation.paidBusinessDate &&
    payment.paymentMethod === confirmation.paymentMethod &&
    payment.note === confirmation.note &&
    payment.createdBy === expectedCreatedBy &&
    payment.creationAttemptId === expectedCreationAttemptId &&
    serverState.sessionRevision === confirmation.expectedSessionRevision + 1
  );
}

function confirmedPaymentResult(
  serverState: AcceptedPaymentServerState,
  confirmationSource: PaymentConfirmedResult["confirmationSource"]
): PaymentConfirmedResult {
  return {
    ...serverState,
    confirmationSource,
    message: `Firestore potwierdzil wyplate dla ${serverState.payment.workerNameSnapshot}.`,
    status: "CONFIRMED"
  };
}

function alreadyPaidResult(
  serverState: AcceptedPaymentServerState
): PaymentAlreadyPaidResult {
  const existingPaymentCreatedAtIso = paymentTimestampToIso(
    serverState.payment.createdAtServer
  );
  const createdAtLabel = existingPaymentCreatedAtIso
    ? new Intl.DateTimeFormat("pl-PL", {
        dateStyle: "short",
        timeStyle: "short",
        timeZone: "Europe/Warsaw"
      }).format(new Date(existingPaymentCreatedAtIso))
    : "o nieznanym czasie serwera";

  return {
    ...serverState,
    confirmationSource: "SERVER_EXISTING_PAYMENT",
    existingPaymentCreatedAtIso,
    existingPaymentCreatedBy: serverState.payment.createdBy,
    message: `Ta sesja zostala juz wyplacona przez ${serverState.payment.createdBy} ${createdAtLabel}. Lista zostala odswiezona.`,
    status: "ALREADY_PAID"
  };
}

export function paymentTimestampToIso(value: unknown): string | null {
  const date =
    value instanceof Date
      ? value
      : typeof value === "string"
        ? new Date(value)
        : isTimestampLike(value)
          ? value.toDate()
          : null;

  return date && !Number.isNaN(date.getTime()) ? date.toISOString() : null;
}

function createPaymentAttemptId(): string {
  const cryptoApi = globalThis.crypto as { randomUUID?: () => string } | undefined;

  if (typeof cryptoApi?.randomUUID === "function") {
    return cryptoApi.randomUUID();
  }

  return `payment-attempt-${String(Date.now())}-${Math.random().toString(36).slice(2)}`;
}

function assertPaymentActor(profile: UserProfile): void {
  if (
    profile.role !== "ADMIN" ||
    !profile.active ||
    profile.registrationStatus !== "APPROVED"
  ) {
    throw new PaymentWriteValidationError(
      "Wyplate moze zapisac tylko aktywny administrator."
    );
  }
}

function incrementRevision(revision: number): number {
  if (
    !Number.isSafeInteger(revision) ||
    revision < 1 ||
    revision >= Number.MAX_SAFE_INTEGER
  ) {
    throw new PaymentWriteValidationError("Sesja ma nieprawidlowa rewizje.");
  }

  return revision + 1;
}

function assertKnownValue(value: unknown, message: string): void {
  if (value === null || value === undefined) {
    throw new PaymentWriteValidationError(message);
  }
}

function normalizeRequiredText(value: string, message: string): string {
  const normalized = value.trim();

  if (!normalized) {
    throw new PaymentWriteValidationError(message);
  }

  return normalized;
}

function isBusinessDate(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);

  if (!match) {
    return false;
  }

  const date = new Date(
    Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]))
  );

  return (
    date.getUTCFullYear() === Number(match[1]) &&
    date.getUTCMonth() === Number(match[2]) - 1 &&
    date.getUTCDate() === Number(match[3])
  );
}

function readRequiredText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function readNullableText(value: unknown): string | null | undefined {
  if (value === null || value === undefined) {
    return null;
  }

  return typeof value === "string" ? value : undefined;
}

function readNonNegativeInteger(value: unknown): number | null {
  return Number.isSafeInteger(value) && Number(value) >= 0 ? Number(value) : null;
}

function isPaymentStatus(value: unknown): value is PaymentDocument["status"] {
  return value === "ACTIVE" || value === "CANCELLED";
}

function isTimestampLike(value: unknown): value is { toDate: () => Date } {
  return (
    typeof value === "object" &&
    value !== null &&
    "toDate" in value &&
    typeof value.toDate === "function"
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
