import { getFirebaseServices } from "../config/firebaseServices";
import { SEASONS_COLLECTION, type SeasonDocument } from "../domain/domainConfiguration";
import type { UserProfile } from "../domain/identity";
import { decodeHarvestSession } from "../harvest/harvestSessionDashboard";
import { HARVEST_SESSIONS_COLLECTION } from "../harvest/harvestSessionState";
import type { HarvestSessionDocument } from "../harvest/openHarvestSession";
import type { SyncDocumentMetadataInput } from "../offline/pendingWriteMetadata";
import { evaluateSyncDocumentMetadata } from "../offline/pendingWriteMetadata";
import { decodeSeason } from "../seasons/seasons";

export const PAYMENTS_COLLECTION = "payments";

type FirebaseEnv = Record<string, string | boolean | undefined>;

export type PaymentStatus = "ACTIVE" | "CANCELLED";

export type PaymentSummary = {
  id: string;
  sessionId: string;
  status: PaymentStatus;
};

export type PendingPaymentSyncStatus = "SYNCED" | "OFFLINE_SNAPSHOT";

export type PendingPaymentSession = {
  amountDueGrosz: number;
  businessDate: string;
  calculationBasis: HarvestSessionDocument["calculationBasisSnapshot"];
  closedAt: unknown;
  closedBy: string;
  paymentHistory: "NONE" | "CANCELLED";
  planId: string;
  planName: string;
  seasonId: string;
  seasonName: string;
  sessionId: string;
  syncStatus: PendingPaymentSyncStatus;
  totalEntryCount: number;
  totalQuantityMilli: number;
  totalWeightG: number;
  unitLabel: string;
  workerId: string;
  workerName: string;
};

export type PendingPaymentFilters = {
  fromDate: string;
  maxAmountGrosz: number | null;
  minAmountGrosz: number | null;
  planId: string;
  seasonId: string;
  toDate: string;
  workerId: string;
};

export const defaultPendingPaymentFilters: PendingPaymentFilters = {
  fromDate: "",
  maxAmountGrosz: null,
  minAmountGrosz: null,
  planId: "",
  seasonId: "",
  toDate: "",
  workerId: ""
};

export type PendingPaymentDirectoryResult = {
  excluded: {
    activePaymentCount: number;
    missingAmountCount: number;
    pendingSynchronizationCount: number;
  };
  invalidDocumentCount: number;
  sessions: PendingPaymentSession[];
};

export type PendingPaymentDirectoryInput = {
  actorProfile: UserProfile;
  isOnline: boolean;
  syncDocuments: readonly SyncDocumentMetadataInput[];
};

type RawDocument = {
  data: unknown;
  id: string;
};

export async function listPendingPaymentSessions(
  env: FirebaseEnv,
  input: PendingPaymentDirectoryInput
): Promise<PendingPaymentDirectoryResult> {
  assertAdmin(input.actorProfile);

  const { firestore } = await getFirebaseServices(env);
  const { collection, getDocs, getDocsFromCache, limit, orderBy, query, where } =
    await import("firebase/firestore");
  const readQuery = input.isOnline ? getDocs : getDocsFromCache;
  const [sessionSnapshot, seasonSnapshot, paymentSnapshot] = await Promise.all([
    readQuery(
      query(
        collection(firestore, HARVEST_SESSIONS_COLLECTION),
        where("status", "==", "CLOSED"),
        orderBy("businessDate", "desc"),
        orderBy("createdAtServer", "desc"),
        limit(250)
      )
    ),
    readQuery(query(collection(firestore, SEASONS_COLLECTION), limit(100))),
    readQuery(query(collection(firestore, PAYMENTS_COLLECTION), limit(500)))
  ]);

  return buildPendingPaymentDirectory({
    isOnline: input.isOnline,
    paymentDocuments: toRawDocuments(paymentSnapshot.docs),
    seasonDocuments: toRawDocuments(seasonSnapshot.docs),
    sessionDocuments: toRawDocuments(sessionSnapshot.docs),
    syncDocuments: input.syncDocuments
  });
}

export function buildPendingPaymentDirectory({
  isOnline,
  paymentDocuments,
  seasonDocuments,
  sessionDocuments,
  syncDocuments
}: {
  isOnline: boolean;
  paymentDocuments: readonly RawDocument[];
  seasonDocuments: readonly RawDocument[];
  sessionDocuments: readonly RawDocument[];
  syncDocuments: readonly SyncDocumentMetadataInput[];
}): PendingPaymentDirectoryResult {
  const sessions: HarvestSessionDocument[] = [];
  const seasons: SeasonDocument[] = [];
  const payments: PaymentSummary[] = [];
  let invalidDocumentCount = 0;

  for (const document of sessionDocuments) {
    const decoded = decodeHarvestSession(document.id, document.data);
    if (decoded.status === "FOUND") {
      sessions.push(decoded.session);
    } else {
      invalidDocumentCount += 1;
    }
  }

  for (const document of seasonDocuments) {
    const decoded = decodeSeason(document.id, document.data);
    if (decoded.status === "FOUND") {
      seasons.push(decoded.season);
    } else {
      invalidDocumentCount += 1;
    }
  }

  for (const document of paymentDocuments) {
    const decoded = decodePaymentSummary(document.id, document.data);
    if (decoded) {
      payments.push(decoded);
    } else {
      invalidDocumentCount += 1;
    }
  }

  const excluded = {
    activePaymentCount: 0,
    missingAmountCount: 0,
    pendingSynchronizationCount: 0
  };
  const eligible: PendingPaymentSession[] = [];

  for (const session of sessions) {
    if (session.status !== "CLOSED") {
      continue;
    }

    const sessionPayments = payments.filter(
      (payment) => payment.sessionId === session.id
    );

    if (
      session.paymentId !== null ||
      sessionPayments.some((payment) => payment.status === "ACTIVE")
    ) {
      excluded.activePaymentCount += 1;
      continue;
    }

    if (session.amountDueGrosz === null) {
      excluded.missingAmountCount += 1;
      continue;
    }

    if (hasPendingSessionDocuments(session.id, syncDocuments)) {
      excluded.pendingSynchronizationCount += 1;
      continue;
    }

    eligible.push({
      amountDueGrosz: session.amountDueGrosz,
      businessDate: session.businessDate,
      calculationBasis: session.calculationBasisSnapshot,
      closedAt: session.closedAtServer ?? session.closedAtDevice,
      closedBy: session.closedBy ?? "brak",
      paymentHistory: sessionPayments.some((payment) => payment.status === "CANCELLED")
        ? "CANCELLED"
        : "NONE",
      planId: session.planIdSnapshot,
      planName: session.planNameSnapshot,
      seasonId: session.seasonId,
      seasonName:
        seasons.find((season) => season.id === session.seasonId)?.name ??
        session.seasonId,
      sessionId: session.id,
      syncStatus: isOnline ? "SYNCED" : "OFFLINE_SNAPSHOT",
      totalEntryCount: session.totalEntryCount,
      totalQuantityMilli: session.totalQuantityMilli,
      totalWeightG: session.totalWeightG,
      unitLabel: session.unitLabelPluralSnapshot,
      workerId: session.workerId,
      workerName: session.workerNameSnapshot
    });
  }

  return {
    excluded,
    invalidDocumentCount,
    sessions: eligible.sort(comparePendingPayments)
  };
}

export function filterPendingPaymentSessions(
  sessions: readonly PendingPaymentSession[],
  filters: PendingPaymentFilters
): PendingPaymentSession[] {
  return sessions.filter(
    (session) =>
      (!filters.seasonId || session.seasonId === filters.seasonId) &&
      (!filters.workerId || session.workerId === filters.workerId) &&
      (!filters.planId || session.planId === filters.planId) &&
      (!filters.fromDate || session.businessDate >= filters.fromDate) &&
      (!filters.toDate || session.businessDate <= filters.toDate) &&
      (filters.minAmountGrosz === null ||
        session.amountDueGrosz >= filters.minAmountGrosz) &&
      (filters.maxAmountGrosz === null ||
        session.amountDueGrosz <= filters.maxAmountGrosz)
  );
}

export function decodePaymentSummary(
  expectedId: string,
  data: unknown
): PaymentSummary | null {
  if (!isRecord(data)) {
    return null;
  }

  const id = normalizeOptionalText(data.id);
  const sessionId = normalizeOptionalText(data.sessionId);
  const status = data.status;

  if (
    id !== expectedId ||
    !sessionId ||
    (status !== "ACTIVE" && status !== "CANCELLED")
  ) {
    return null;
  }

  return { id, sessionId, status };
}

function hasPendingSessionDocuments(
  sessionId: string,
  syncDocuments: readonly SyncDocumentMetadataInput[]
): boolean {
  return syncDocuments.some((document) => {
    if (document.id !== sessionId && document.sessionId !== sessionId) {
      return false;
    }

    return evaluateSyncDocumentMetadata(document).status !== "SYNCED";
  });
}

function comparePendingPayments(
  left: PendingPaymentSession,
  right: PendingPaymentSession
): number {
  return (
    left.businessDate.localeCompare(right.businessDate) ||
    left.workerName.localeCompare(right.workerName, "pl") ||
    left.sessionId.localeCompare(right.sessionId)
  );
}

function toRawDocuments(
  documents: readonly {
    data: (options?: { serverTimestamps?: "estimate" }) => unknown;
    id: string;
  }[]
): RawDocument[] {
  return documents.map((document) => ({
    id: document.id,
    data: document.data({ serverTimestamps: "estimate" })
  }));
}

function assertAdmin(profile: UserProfile): void {
  if (!profile.active || profile.role !== "ADMIN") {
    throw new Error("Lista sesji do wyplaty wymaga aktywnego administratora.");
  }
}

function normalizeOptionalText(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim();
  return normalized || null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
