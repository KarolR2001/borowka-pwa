import { getFirebaseServices } from "../config/firebaseServices";
import {
  SEASONS_COLLECTION,
  WORKERS_COLLECTION,
  type SeasonDocument
} from "../domain/domainConfiguration";
import type { UserProfile } from "../domain/identity";
import { decodeHarvestSession } from "../harvest/harvestSessionDashboard";
import { HARVEST_SESSIONS_COLLECTION } from "../harvest/harvestSessionState";
import type { HarvestSessionDocument } from "../harvest/openHarvestSession";
import { PAYMENTS_COLLECTION } from "../payments/pendingPayments";
import { decodePaymentDocument, type PaymentDocument } from "../payments/paymentWrite";
import { decodeSeason } from "../seasons/seasons";
import { decodeWorker } from "../workers/workerDirectory";

type FirebaseEnv = Record<string, string | boolean | undefined>;

type RawDocument = {
  data: unknown;
  id: string;
};

export type PickerDashboardInput = {
  actorProfile: UserProfile;
  isOnline: boolean;
  selectedSeasonId?: string | null;
};

export type PickerDashboardSeason = Pick<
  SeasonDocument,
  "id" | "name" | "status" | "isDefault" | "startDate"
>;

export type PickerDashboardQuantity = {
  planId: string;
  planName: string;
  quantityPrecision: number;
  sessionCount: number;
  totalQuantityMilli: number;
  unitLabelPlural: string;
};

export type PickerDashboardResult = {
  accruedAmountGrosz: number;
  dataSource: "SERVER" | "CACHE";
  invalidPaymentCount: number;
  invalidSeasonCount: number;
  invalidSessionCount: number;
  invalidWorker: boolean;
  paidAmountGrosz: number;
  quantities: PickerDashboardQuantity[];
  refreshedAtIso: string;
  remainingAmountGrosz: number;
  selectedSeasonId: string | null;
  selectedSeasonName: string | null;
  seasons: PickerDashboardSeason[];
  sessionCounts: {
    closed: number;
    open: number;
    paid: number;
  };
  totalWeightG: number;
  userName: string;
  workerId: string;
  workerName: string | null;
};

export async function loadPickerDashboard(
  env: FirebaseEnv,
  input: PickerDashboardInput
): Promise<PickerDashboardResult> {
  const workerId = assertPickerProfile(input.actorProfile);
  const { firestore } = await getFirebaseServices(env);
  const {
    collection,
    doc,
    getDoc,
    getDocFromCache,
    getDocs,
    getDocsFromCache,
    orderBy,
    query,
    where
  } = await import("firebase/firestore");
  const readDocument = input.isOnline ? getDoc : getDocFromCache;
  const readDocuments = input.isOnline ? getDocs : getDocsFromCache;

  const [workerSnapshot, sessionSnapshot, paymentSnapshot, seasonSnapshot] =
    await Promise.all([
      readDocument(doc(firestore, WORKERS_COLLECTION, workerId)),
      readDocuments(
        query(
          collection(firestore, HARVEST_SESSIONS_COLLECTION),
          where("workerId", "==", workerId),
          orderBy("businessDate", "desc"),
          orderBy("createdAtServer", "desc")
        )
      ),
      readDocuments(
        query(
          collection(firestore, PAYMENTS_COLLECTION),
          where("workerId", "==", workerId)
        )
      ),
      readDocuments(collection(firestore, SEASONS_COLLECTION))
    ]);

  const fromCache =
    workerSnapshot.metadata.fromCache ||
    sessionSnapshot.metadata.fromCache ||
    paymentSnapshot.metadata.fromCache ||
    seasonSnapshot.metadata.fromCache;

  return buildPickerDashboard({
    actorProfile: input.actorProfile,
    dataSource: fromCache ? "CACHE" : "SERVER",
    paymentDocuments: toRawDocuments(paymentSnapshot.docs),
    refreshedAtIso: new Date().toISOString(),
    seasonDocuments: toRawDocuments(seasonSnapshot.docs),
    selectedSeasonId: input.selectedSeasonId,
    sessionDocuments: toRawDocuments(sessionSnapshot.docs),
    workerDocument: workerSnapshot.exists()
      ? {
          data: workerSnapshot.data({ serverTimestamps: "estimate" }),
          id: workerSnapshot.id
        }
      : null
  });
}

export function buildPickerDashboard({
  actorProfile,
  dataSource,
  paymentDocuments,
  refreshedAtIso,
  seasonDocuments,
  selectedSeasonId,
  sessionDocuments,
  workerDocument
}: {
  actorProfile: UserProfile;
  dataSource: PickerDashboardResult["dataSource"];
  paymentDocuments: readonly RawDocument[];
  refreshedAtIso: string;
  seasonDocuments: readonly RawDocument[];
  selectedSeasonId?: string | null;
  sessionDocuments: readonly RawDocument[];
  workerDocument: RawDocument | null;
}): PickerDashboardResult {
  const workerId = assertPickerProfile(actorProfile);
  const sessions: HarvestSessionDocument[] = [];
  const payments: PaymentDocument[] = [];
  const seasons: SeasonDocument[] = [];
  let invalidSessionCount = 0;
  let invalidPaymentCount = 0;
  let invalidSeasonCount = 0;

  for (const document of sessionDocuments) {
    const decoded = decodeHarvestSession(document.id, document.data);

    if (decoded.status === "FOUND" && decoded.session.workerId === workerId) {
      sessions.push(decoded.session);
    } else {
      invalidSessionCount += 1;
    }
  }

  for (const document of paymentDocuments) {
    const decoded = decodePaymentDocument(document.id, document.data);

    if (decoded?.workerId === workerId) {
      payments.push(decoded);
    } else {
      invalidPaymentCount += 1;
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

  const sortedSeasons = sortSeasons(seasons);
  const effectiveSeasonId = chooseSeasonId(
    sortedSeasons,
    sessions,
    selectedSeasonId ?? null
  );
  const selectedSeason =
    sortedSeasons.find((season) => season.id === effectiveSeasonId) ?? null;
  const selectedSessions = sessions.filter(
    (session) =>
      session.seasonId === effectiveSeasonId &&
      (session.status === "OPEN" ||
        session.status === "CLOSED" ||
        session.status === "PAID")
  );
  const selectedPayments = payments.filter(
    (payment) => payment.seasonId === effectiveSeasonId && payment.status === "ACTIVE"
  );
  const sessionCounts = {
    closed: selectedSessions.filter((session) => session.status === "CLOSED").length,
    open: selectedSessions.filter((session) => session.status === "OPEN").length,
    paid: selectedSessions.filter((session) => session.status === "PAID").length
  };
  const accruedAmountGrosz = safeSum(
    selectedSessions
      .filter((session) => session.status === "CLOSED" || session.status === "PAID")
      .map((session) => session.amountDueGrosz ?? 0)
  );
  const paidAmountGrosz = safeSum(selectedPayments.map((payment) => payment.amountGrosz));
  const workerDecode = workerDocument
    ? decodeWorker(workerDocument.id, workerDocument.data)
    : null;
  const worker =
    workerDecode?.status === "FOUND" &&
    workerDecode.worker.id === workerId &&
    workerDecode.worker.linkedUserUid === actorProfile.uid
      ? workerDecode.worker
      : null;

  return {
    accruedAmountGrosz,
    dataSource,
    invalidPaymentCount,
    invalidSeasonCount,
    invalidSessionCount,
    invalidWorker: worker === null,
    paidAmountGrosz,
    quantities: summarizeQuantities(selectedSessions),
    refreshedAtIso: normalizeIsoTimestamp(refreshedAtIso),
    remainingAmountGrosz: safeDifference(accruedAmountGrosz, paidAmountGrosz),
    selectedSeasonId: effectiveSeasonId,
    selectedSeasonName: selectedSeason?.name ?? null,
    seasons: sortedSeasons.map(({ id, name, status, isDefault, startDate }) => ({
      id,
      name,
      status,
      isDefault,
      startDate
    })),
    sessionCounts,
    totalWeightG: safeSum(selectedSessions.map((session) => session.totalWeightG)),
    userName: actorProfile.displayName,
    workerId,
    workerName: worker?.displayName ?? null
  };
}

function summarizeQuantities(
  sessions: readonly HarvestSessionDocument[]
): PickerDashboardQuantity[] {
  const summaries = new Map<string, PickerDashboardQuantity>();

  for (const session of sessions) {
    if (session.calculationBasisSnapshot !== "QUANTITY") {
      continue;
    }

    const key = [
      session.planIdSnapshot,
      session.unitLabelPluralSnapshot,
      String(session.quantityPrecisionSnapshot)
    ].join("\u0000");
    const current = summaries.get(key);

    if (current) {
      current.sessionCount += 1;
      current.totalQuantityMilli = safeSum([
        current.totalQuantityMilli,
        session.totalQuantityMilli
      ]);
    } else {
      summaries.set(key, {
        planId: session.planIdSnapshot,
        planName: session.planNameSnapshot,
        quantityPrecision: session.quantityPrecisionSnapshot,
        sessionCount: 1,
        totalQuantityMilli: session.totalQuantityMilli,
        unitLabelPlural: session.unitLabelPluralSnapshot
      });
    }
  }

  return [...summaries.values()].sort((left, right) =>
    left.planName.localeCompare(right.planName, "pl")
  );
}

function chooseSeasonId(
  seasons: readonly SeasonDocument[],
  sessions: readonly HarvestSessionDocument[],
  requestedId: string | null
): string | null {
  if (requestedId && seasons.some((season) => season.id === requestedId)) {
    return requestedId;
  }

  const defaultSeason = seasons.find(
    (season) => season.isDefault && season.status === "OPEN"
  );
  if (defaultSeason) {
    return defaultSeason.id;
  }

  const firstOpenSeason = seasons.find((season) => season.status === "OPEN");
  if (firstOpenSeason) {
    return firstOpenSeason.id;
  }

  const sessionSeasonId = sessions[0]?.seasonId;
  if (sessionSeasonId && seasons.some((season) => season.id === sessionSeasonId)) {
    return sessionSeasonId;
  }

  return seasons[0]?.id ?? null;
}

function sortSeasons(seasons: readonly SeasonDocument[]): SeasonDocument[] {
  return [...seasons].sort((left, right) => {
    if (left.isDefault !== right.isDefault) {
      return left.isDefault ? -1 : 1;
    }

    if (left.status !== right.status) {
      return left.status === "OPEN" ? -1 : right.status === "OPEN" ? 1 : 0;
    }

    return (
      right.startDate.localeCompare(left.startDate) ||
      left.name.localeCompare(right.name, "pl")
    );
  });
}

function assertPickerProfile(profile: UserProfile): string {
  if (
    profile.role !== "PICKER" ||
    !profile.active ||
    profile.registrationStatus !== "APPROVED" ||
    !profile.workerId
  ) {
    throw new Error("Pulpit zbieracza wymaga aktywnego profilu z workerId.");
  }

  return profile.workerId;
}

function safeSum(values: readonly number[]): number {
  let total = 0;

  for (const value of values) {
    if (!Number.isSafeInteger(value)) {
      throw new Error("Podsumowanie zawiera nieprawidlowa wartosc liczbowa.");
    }

    total += value;
    if (!Number.isSafeInteger(total)) {
      throw new Error("Podsumowanie przekracza bezpieczny zakres liczbowy.");
    }
  }

  return total;
}

function safeDifference(left: number, right: number): number {
  const result = left - right;

  if (!Number.isSafeInteger(result)) {
    throw new Error("Saldo przekracza bezpieczny zakres liczbowy.");
  }

  return result;
}

function normalizeIsoTimestamp(value: string): string {
  const timestamp = new Date(value);

  if (Number.isNaN(timestamp.getTime())) {
    throw new Error("Pulpit ma nieprawidlowa date odswiezenia.");
  }

  return timestamp.toISOString();
}

function toRawDocuments(
  documents: readonly {
    data: (options?: { serverTimestamps?: "estimate" }) => unknown;
    id: string;
  }[]
): RawDocument[] {
  return documents.map((document) => ({
    data: document.data({ serverTimestamps: "estimate" }),
    id: document.id
  }));
}
