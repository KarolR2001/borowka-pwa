import { getFirebaseServices } from "../config/firebaseServices";
import { SEASONS_COLLECTION, type SeasonDocument } from "../domain/domainConfiguration";
import type { UserProfile } from "../domain/identity";
import { decodeHarvestSession } from "../harvest/harvestSessionDashboard";
import {
  HARVEST_SESSIONS_COLLECTION,
  type HarvestSessionStatus
} from "../harvest/harvestSessionState";
import { PAYMENTS_COLLECTION, type PaymentStatus } from "../payments/pendingPayments";
import type { PaymentMethod } from "../payments/paymentConfirmation";
import { decodePaymentDocument } from "../payments/paymentWrite";
import { decodeSeason } from "../seasons/seasons";

type FirebaseEnv = Record<string, string | boolean | undefined>;
type RawDocument = { data: unknown; id: string };

export type PickerPaymentListInput = {
  actorProfile: UserProfile;
  isOnline: boolean;
};

export type PickerPaymentListItem = {
  amountGrosz: number;
  id: string;
  paidBusinessDate: string;
  paymentMethod: PaymentMethod;
  seasonId: string;
  seasonName: string;
  sessionBusinessDate: string | null;
  sessionId: string;
  status: PaymentStatus;
};

export type PickerPaymentSessionSummary = {
  amountDueGrosz: number | null;
  businessDate: string;
  seasonId: string;
  sessionId: string;
  status: HarvestSessionStatus;
};

export type PickerPaymentListResult = {
  dataSource: "SERVER" | "CACHE";
  invalidPaymentCount: number;
  invalidSeasonCount: number;
  invalidSessionCount: number;
  missingSourceSessionCount: number;
  payments: PickerPaymentListItem[];
  refreshedAtIso: string;
  seasons: Pick<SeasonDocument, "id" | "name">[];
  sessions: PickerPaymentSessionSummary[];
};

export type PickerPaymentStatusFilter = PaymentStatus | "ALL";

export type PickerPaymentFilters = {
  fromDate: string;
  seasonId: string;
  status: PickerPaymentStatusFilter;
  toDate: string;
};

export const defaultPickerPaymentFilters: PickerPaymentFilters = {
  fromDate: "",
  seasonId: "",
  status: "ALL",
  toDate: ""
};

export type PickerPaymentPeriodSummary = {
  accruedAmountGrosz: number;
  activePaymentCount: number;
  cancelledAmountGrosz: number;
  cancelledPaymentCount: number;
  paidAmountGrosz: number;
  remainingAmountGrosz: number;
};

export async function loadPickerPaymentList(
  env: FirebaseEnv,
  input: PickerPaymentListInput
): Promise<PickerPaymentListResult> {
  const workerId = assertPickerProfile(input.actorProfile);
  const { firestore } = await getFirebaseServices(env);
  const { collection, getDocs, getDocsFromCache, orderBy, query, where } =
    await import("firebase/firestore");
  const readDocuments = input.isOnline ? getDocs : getDocsFromCache;
  const [paymentSnapshot, sessionSnapshot, seasonSnapshot] = await Promise.all([
    readDocuments(
      query(
        collection(firestore, PAYMENTS_COLLECTION),
        where("workerId", "==", workerId),
        orderBy("paidBusinessDate", "desc")
      )
    ),
    readDocuments(
      query(
        collection(firestore, HARVEST_SESSIONS_COLLECTION),
        where("workerId", "==", workerId),
        orderBy("businessDate", "desc"),
        orderBy("createdAtServer", "desc")
      )
    ),
    readDocuments(collection(firestore, SEASONS_COLLECTION))
  ]);

  return buildPickerPaymentList({
    actorProfile: input.actorProfile,
    dataSource:
      paymentSnapshot.metadata.fromCache ||
      sessionSnapshot.metadata.fromCache ||
      seasonSnapshot.metadata.fromCache
        ? "CACHE"
        : "SERVER",
    paymentDocuments: toRawDocuments(paymentSnapshot.docs),
    refreshedAtIso: new Date().toISOString(),
    seasonDocuments: toRawDocuments(seasonSnapshot.docs),
    sessionDocuments: toRawDocuments(sessionSnapshot.docs)
  });
}

export function buildPickerPaymentList({
  actorProfile,
  dataSource,
  paymentDocuments,
  refreshedAtIso,
  seasonDocuments,
  sessionDocuments
}: {
  actorProfile: UserProfile;
  dataSource: PickerPaymentListResult["dataSource"];
  paymentDocuments: readonly RawDocument[];
  refreshedAtIso: string;
  seasonDocuments: readonly RawDocument[];
  sessionDocuments: readonly RawDocument[];
}): PickerPaymentListResult {
  const workerId = assertPickerProfile(actorProfile);
  const sessionMap = new Map<string, PickerPaymentSessionSummary>();
  const seasons: SeasonDocument[] = [];
  let invalidSessionCount = 0;
  let invalidSeasonCount = 0;

  for (const document of sessionDocuments) {
    const decoded = decodeHarvestSession(document.id, document.data);

    if (decoded.status === "FOUND" && decoded.session.workerId === workerId) {
      sessionMap.set(decoded.session.id, {
        amountDueGrosz: decoded.session.amountDueGrosz,
        businessDate: decoded.session.businessDate,
        seasonId: decoded.session.seasonId,
        sessionId: decoded.session.id,
        status: decoded.session.status
      });
    } else {
      invalidSessionCount += 1;
    }
  }

  for (const document of seasonDocuments) {
    const decoded = decodeSeason(document.id, document.data);

    if (decoded.status === "FOUND") {
      seasons.push(decoded.season);
    } else {
      invalidSeasonCount += 1;
    }
  }

  const seasonNames = new Map(seasons.map((season) => [season.id, season.name]));
  const payments: PickerPaymentListItem[] = [];
  let invalidPaymentCount = 0;
  let missingSourceSessionCount = 0;

  for (const document of paymentDocuments) {
    const payment = decodePaymentDocument(document.id, document.data);

    if (payment?.workerId !== workerId) {
      invalidPaymentCount += 1;
      continue;
    }

    const sourceSession = sessionMap.get(payment.sessionId);
    const validSourceSession =
      sourceSession?.seasonId === payment.seasonId ? sourceSession : null;

    if (!validSourceSession) {
      missingSourceSessionCount += 1;
    }

    payments.push({
      amountGrosz: payment.amountGrosz,
      id: payment.id,
      paidBusinessDate: payment.paidBusinessDate,
      paymentMethod: payment.paymentMethod,
      seasonId: payment.seasonId,
      seasonName: seasonNames.get(payment.seasonId) ?? payment.seasonId,
      sessionBusinessDate: validSourceSession?.businessDate ?? null,
      sessionId: payment.sessionId,
      status: payment.status
    });
  }

  return {
    dataSource,
    invalidPaymentCount,
    invalidSeasonCount,
    invalidSessionCount,
    missingSourceSessionCount,
    payments: payments.sort(
      (left, right) =>
        right.paidBusinessDate.localeCompare(left.paidBusinessDate) ||
        right.id.localeCompare(left.id)
    ),
    refreshedAtIso: normalizeIsoTimestamp(refreshedAtIso),
    seasons: [...seasons]
      .sort(
        (left, right) =>
          right.startDate.localeCompare(left.startDate) ||
          left.name.localeCompare(right.name, "pl")
      )
      .map(({ id, name }) => ({ id, name })),
    sessions: [...sessionMap.values()].sort(
      (left, right) =>
        right.businessDate.localeCompare(left.businessDate) ||
        right.sessionId.localeCompare(left.sessionId)
    )
  };
}

export function filterPickerPaymentItems(
  payments: readonly PickerPaymentListItem[],
  filters: PickerPaymentFilters
): PickerPaymentListItem[] {
  const { fromDate, toDate } = normalizePeriod(filters);

  return payments.filter(
    (payment) =>
      (!filters.seasonId || payment.seasonId === filters.seasonId) &&
      (filters.status === "ALL" || payment.status === filters.status) &&
      (!fromDate ||
        (payment.sessionBusinessDate !== null &&
          payment.sessionBusinessDate >= fromDate)) &&
      (!toDate ||
        (payment.sessionBusinessDate !== null && payment.sessionBusinessDate <= toDate))
  );
}

export function summarizePickerPaymentPeriod(
  result: Pick<PickerPaymentListResult, "payments" | "sessions">,
  filters: PickerPaymentFilters
): PickerPaymentPeriodSummary {
  const { fromDate, toDate } = normalizePeriod(filters);
  const sessions = result.sessions.filter(
    (session) =>
      (!filters.seasonId || session.seasonId === filters.seasonId) &&
      (!fromDate || session.businessDate >= fromDate) &&
      (!toDate || session.businessDate <= toDate) &&
      (session.status === "CLOSED" || session.status === "PAID")
  );
  const sessionSeasons = new Map(
    sessions.map((session) => [session.sessionId, session.seasonId])
  );
  const payments = result.payments.filter(
    (payment) => sessionSeasons.get(payment.sessionId) === payment.seasonId
  );
  const activePayments = payments.filter((payment) => payment.status === "ACTIVE");
  const cancelledPayments = payments.filter((payment) => payment.status === "CANCELLED");
  const accruedAmountGrosz = safeSum(
    sessions.map((session) => session.amountDueGrosz ?? 0)
  );
  const paidAmountGrosz = safeSum(activePayments.map((payment) => payment.amountGrosz));

  return {
    accruedAmountGrosz,
    activePaymentCount: activePayments.length,
    cancelledAmountGrosz: safeSum(
      cancelledPayments.map((payment) => payment.amountGrosz)
    ),
    cancelledPaymentCount: cancelledPayments.length,
    paidAmountGrosz,
    remainingAmountGrosz: safeDifference(accruedAmountGrosz, paidAmountGrosz)
  };
}

function normalizePeriod(filters: PickerPaymentFilters): {
  fromDate: string;
  toDate: string;
} {
  const fromDate = normalizeOptionalDate(filters.fromDate);
  const toDate = normalizeOptionalDate(filters.toDate);

  if (fromDate && toDate && fromDate > toDate) {
    return { fromDate: "9999-12-31", toDate: "0000-01-01" };
  }

  return { fromDate, toDate };
}

function normalizeOptionalDate(value: string): string {
  const normalized = value.trim();

  if (!normalized) {
    return "";
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) {
    throw new Error("Filtr wyplat zawiera nieprawidlowa date.");
  }

  return normalized;
}

function assertPickerProfile(profile: UserProfile): string {
  if (
    profile.role !== "PICKER" ||
    !profile.active ||
    profile.registrationStatus !== "APPROVED" ||
    !profile.workerId
  ) {
    throw new Error("Moje wyplaty wymagaja aktywnego profilu pickera z workerId.");
  }

  return profile.workerId;
}

function safeSum(values: readonly number[]): number {
  let total = 0;

  for (const value of values) {
    if (!Number.isSafeInteger(value)) {
      throw new Error("Podsumowanie wyplat zawiera nieprawidlowa kwote.");
    }

    total += value;
    if (!Number.isSafeInteger(total)) {
      throw new Error("Podsumowanie wyplat przekracza bezpieczny zakres.");
    }
  }

  return total;
}

function safeDifference(left: number, right: number): number {
  const result = left - right;

  if (!Number.isSafeInteger(result)) {
    throw new Error("Saldo wyplat przekracza bezpieczny zakres.");
  }

  return result;
}

function normalizeIsoTimestamp(value: string): string {
  const timestamp = new Date(value);

  if (Number.isNaN(timestamp.getTime())) {
    throw new Error("Lista wyplat ma nieprawidlowa date odswiezenia.");
  }

  return timestamp.toISOString();
}

function toRawDocuments(
  documents: readonly {
    data(options?: { serverTimestamps?: "estimate" }): unknown;
    id: string;
  }[]
): RawDocument[] {
  return documents.map((document) => ({
    data: document.data({ serverTimestamps: "estimate" }),
    id: document.id
  }));
}
