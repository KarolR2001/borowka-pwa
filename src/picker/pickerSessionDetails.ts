import { getFirebaseServices } from "../config/firebaseServices";
import type { UserProfile } from "../domain/identity";
import {
  decodeHarvestEntry,
  decodeHarvestSession,
  type HarvestEntryDocument
} from "../harvest/harvestSessionDashboard";
import {
  HARVEST_ENTRIES_COLLECTION,
  HARVEST_SESSIONS_COLLECTION,
  type HarvestSessionStatus
} from "../harvest/harvestSessionState";
import type { SettlementCalculationBasis } from "../domain/domainConfiguration";
import { PAYMENTS_COLLECTION } from "../payments/pendingPayments";
import { decodePaymentDocument, type PaymentDocument } from "../payments/paymentWrite";
import type { PaymentMethod } from "../payments/paymentConfirmation";

type FirebaseEnv = Record<string, string | boolean | undefined>;
type RawDocument = { data: unknown; id: string };

export type PickerSessionDetailsInput = {
  actorProfile: UserProfile;
  isOnline: boolean;
  sessionId: string;
};

export type PickerSessionEntryDetails = {
  cancellationReason: string | null;
  id: string;
  kind: "ORIGINAL" | "CORRECTION";
  quantityMilli: number;
  replacesEntryId: string | null;
  sequenceNumber: number;
  status: "ACTIVE" | "CANCELLED";
  weightG: number | null;
};

export type PickerSessionPaymentDetails = {
  amountGrosz: number;
  paidBusinessDate: string;
  paymentMethod: PaymentMethod;
  status: "ACTIVE";
};

export type PickerSessionDetailsResult = {
  activeEntryCount: number;
  amountDueGrosz: number | null;
  businessDate: string;
  calculationBasis: SettlementCalculationBasis;
  dataSource: "SERVER" | "CACHE";
  entries: PickerSessionEntryDetails[];
  invalidEntryCount: number;
  invalidPayment: boolean;
  payment: PickerSessionPaymentDetails | null;
  planName: string;
  quantityPrecision: number;
  rateGrosz: number;
  seasonId: string;
  sessionId: string;
  status: HarvestSessionStatus;
  totalQuantityMilli: number;
  totalWeightG: number;
  unitLabel: string;
  unitLabelPlural: string;
};

export async function loadPickerSessionDetails(
  env: FirebaseEnv,
  input: PickerSessionDetailsInput
): Promise<PickerSessionDetailsResult> {
  const workerId = assertPickerProfile(input.actorProfile);
  const sessionId = normalizeId(input.sessionId);
  const { firestore } = await getFirebaseServices(env);
  const {
    collection,
    doc,
    getDoc,
    getDocFromCache,
    getDocs,
    getDocsFromCache,
    limit,
    orderBy,
    query,
    where
  } = await import("firebase/firestore");
  const readDocument = input.isOnline ? getDoc : getDocFromCache;
  const readDocuments = input.isOnline ? getDocs : getDocsFromCache;
  const sessionSnapshot = await readDocument(
    doc(firestore, HARVEST_SESSIONS_COLLECTION, sessionId)
  );

  if (!sessionSnapshot.exists()) {
    throw new Error("Nie znaleziono wybranej sesji.");
  }

  const decodedSession = decodeHarvestSession(
    sessionSnapshot.id,
    sessionSnapshot.data({ serverTimestamps: "estimate" })
  );

  if (decodedSession.status !== "FOUND" || decodedSession.session.workerId !== workerId) {
    throw new Error("Sesja nie nalezy do aktywnego profilu pickera.");
  }

  const paymentId = decodedSession.session.paymentId;
  const [entrySnapshot, paymentSnapshot] = await Promise.all([
    readDocuments(
      query(
        collection(firestore, HARVEST_ENTRIES_COLLECTION),
        where("workerId", "==", workerId),
        where("sessionId", "==", sessionId),
        orderBy("sequenceNumber", "asc"),
        limit(500)
      )
    ),
    paymentId
      ? readDocument(doc(firestore, PAYMENTS_COLLECTION, paymentId))
      : Promise.resolve(null)
  ]);
  const fromCache =
    sessionSnapshot.metadata.fromCache ||
    entrySnapshot.metadata.fromCache ||
    paymentSnapshot?.metadata.fromCache === true;

  return buildPickerSessionDetails({
    actorProfile: input.actorProfile,
    dataSource: fromCache ? "CACHE" : "SERVER",
    entryDocuments: entrySnapshot.docs.map((snapshot) => ({
      data: snapshot.data({ serverTimestamps: "estimate" }),
      id: snapshot.id
    })),
    paymentDocument:
      paymentSnapshot?.exists() === true
        ? {
            data: paymentSnapshot.data({ serverTimestamps: "estimate" }),
            id: paymentSnapshot.id
          }
        : null,
    sessionDocument: {
      data: sessionSnapshot.data({ serverTimestamps: "estimate" }),
      id: sessionSnapshot.id
    }
  });
}

export function buildPickerSessionDetails({
  actorProfile,
  dataSource,
  entryDocuments,
  paymentDocument,
  sessionDocument
}: {
  actorProfile: UserProfile;
  dataSource: PickerSessionDetailsResult["dataSource"];
  entryDocuments: readonly RawDocument[];
  paymentDocument: RawDocument | null;
  sessionDocument: RawDocument;
}): PickerSessionDetailsResult {
  const workerId = assertPickerProfile(actorProfile);
  const decodedSession = decodeHarvestSession(sessionDocument.id, sessionDocument.data);

  if (decodedSession.status !== "FOUND" || decodedSession.session.workerId !== workerId) {
    throw new Error("Sesja nie nalezy do aktywnego profilu pickera.");
  }

  const entries: HarvestEntryDocument[] = [];
  let invalidEntryCount = 0;

  for (const document of entryDocuments) {
    const decoded = decodeHarvestEntry(document.id, document.data);

    if (
      decoded.status === "FOUND" &&
      decoded.entry.workerId === workerId &&
      decoded.entry.sessionId === decodedSession.session.id
    ) {
      entries.push(decoded.entry);
    } else {
      invalidEntryCount += 1;
    }
  }

  const decodedPayment = paymentDocument
    ? decodePaymentDocument(paymentDocument.id, paymentDocument.data)
    : null;
  const payment = validActivePayment(
    decodedPayment,
    decodedSession.session.id,
    workerId,
    decodedSession.session.paymentId
  )
    ? toPaymentDetails(decodedPayment)
    : null;
  const invalidPayment =
    (decodedSession.session.paymentId !== null && payment === null) ||
    (decodedSession.session.paymentId === null && paymentDocument !== null);

  return {
    activeEntryCount: decodedSession.session.totalEntryCount,
    amountDueGrosz: decodedSession.session.amountDueGrosz,
    businessDate: decodedSession.session.businessDate,
    calculationBasis: decodedSession.session.calculationBasisSnapshot,
    dataSource,
    entries: entries
      .sort((left, right) => left.sequenceNumber - right.sequenceNumber)
      .map((entry) => ({
        cancellationReason: entry.cancellationReason,
        id: entry.id,
        kind: entry.replacesEntryId ? "CORRECTION" : "ORIGINAL",
        quantityMilli: entry.quantityMilli,
        replacesEntryId: entry.replacesEntryId,
        sequenceNumber: entry.sequenceNumber,
        status: entry.status,
        weightG: entry.weightG
      })),
    invalidEntryCount,
    invalidPayment,
    payment,
    planName: decodedSession.session.planNameSnapshot,
    quantityPrecision: decodedSession.session.quantityPrecisionSnapshot,
    rateGrosz: decodedSession.session.rateGroszSnapshot,
    seasonId: decodedSession.session.seasonId,
    sessionId: decodedSession.session.id,
    status: decodedSession.session.status,
    totalQuantityMilli: decodedSession.session.totalQuantityMilli,
    totalWeightG: decodedSession.session.totalWeightG,
    unitLabel: decodedSession.session.unitLabelSnapshot,
    unitLabelPlural: decodedSession.session.unitLabelPluralSnapshot
  };
}

function validActivePayment(
  payment: PaymentDocument | null,
  sessionId: string,
  workerId: string,
  expectedPaymentId: string | null
): payment is PaymentDocument & { status: "ACTIVE" } {
  return (
    payment !== null &&
    payment.status === "ACTIVE" &&
    payment.id === expectedPaymentId &&
    payment.sessionId === sessionId &&
    payment.workerId === workerId
  );
}

function toPaymentDetails(
  payment: PaymentDocument & { status: "ACTIVE" }
): PickerSessionPaymentDetails {
  return {
    amountGrosz: payment.amountGrosz,
    paidBusinessDate: payment.paidBusinessDate,
    paymentMethod: payment.paymentMethod,
    status: payment.status
  };
}

function assertPickerProfile(profile: UserProfile): string {
  if (
    profile.role !== "PICKER" ||
    !profile.active ||
    profile.registrationStatus !== "APPROVED" ||
    !profile.workerId
  ) {
    throw new Error("Szczegoly sesji wymagaja aktywnego profilu pickera.");
  }

  return profile.workerId;
}

function normalizeId(value: string): string {
  const normalized = value.trim();

  if (!normalized || normalized.length > 200 || normalized.includes("/")) {
    throw new Error("Szczegoly sesji wymagaja prawidlowego ID.");
  }

  return normalized;
}
