import { getFirebaseServices } from "../config/firebaseServices";
import { SEASONS_COLLECTION, type SeasonDocument } from "../domain/domainConfiguration";
import type { UserProfile } from "../domain/identity";
import { decodeHarvestSession } from "../harvest/harvestSessionDashboard";
import {
  HARVEST_SESSIONS_COLLECTION,
  type HarvestSessionStatus
} from "../harvest/harvestSessionState";
import type { HarvestSessionDocument } from "../harvest/openHarvestSession";
import {
  evaluateSyncDocumentMetadata,
  type SyncDocumentMetadataInput
} from "../offline/pendingWriteMetadata";
import { decodeSeason } from "../seasons/seasons";

type FirebaseEnv = Record<string, string | boolean | undefined>;

type RawDocument = {
  data: unknown;
  id: string;
};

export type PickerHarvestListInput = {
  actorProfile: UserProfile;
  isOnline: boolean;
  syncDocuments: readonly SyncDocumentMetadataInput[];
};

export type PickerHarvestListItem = {
  amountDueGrosz: number | null;
  businessDate: string;
  calculationBasis: HarvestSessionDocument["calculationBasisSnapshot"];
  planName: string;
  quantityPrecision: number;
  seasonId: string;
  seasonName: string;
  sessionId: string;
  status: HarvestSessionStatus;
  syncIssue: string | null;
  totalEntryCount: number;
  totalQuantityMilli: number;
  totalWeightG: number;
  unitLabelPlural: string;
};

export type PickerHarvestListResult = {
  dataSource: "SERVER" | "CACHE";
  invalidSeasonCount: number;
  invalidSessionCount: number;
  items: PickerHarvestListItem[];
  refreshedAtIso: string;
  seasons: Pick<SeasonDocument, "id" | "name">[];
};

export type PickerHarvestStatusFilter = HarvestSessionStatus | "ALL";

export type PickerHarvestFilters = {
  fromDate: string;
  seasonId: string;
  status: PickerHarvestStatusFilter;
  toDate: string;
};

export const defaultPickerHarvestFilters: PickerHarvestFilters = {
  fromDate: "",
  seasonId: "",
  status: "ALL",
  toDate: ""
};

export async function loadPickerHarvestList(
  env: FirebaseEnv,
  input: PickerHarvestListInput
): Promise<PickerHarvestListResult> {
  const workerId = assertPickerProfile(input.actorProfile);
  const { firestore } = await getFirebaseServices(env);
  const { collection, getDocs, getDocsFromCache, orderBy, query, where } =
    await import("firebase/firestore");
  const readDocuments = input.isOnline ? getDocs : getDocsFromCache;
  const [sessionSnapshot, seasonSnapshot] = await Promise.all([
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

  return buildPickerHarvestList({
    actorProfile: input.actorProfile,
    dataSource:
      sessionSnapshot.metadata.fromCache || seasonSnapshot.metadata.fromCache
        ? "CACHE"
        : "SERVER",
    refreshedAtIso: new Date().toISOString(),
    seasonDocuments: toRawDocuments(seasonSnapshot.docs),
    sessionDocuments: toRawDocuments(sessionSnapshot.docs),
    syncDocuments: input.syncDocuments
  });
}

export function buildPickerHarvestList({
  actorProfile,
  dataSource,
  refreshedAtIso,
  seasonDocuments,
  sessionDocuments,
  syncDocuments
}: {
  actorProfile: UserProfile;
  dataSource: PickerHarvestListResult["dataSource"];
  refreshedAtIso: string;
  seasonDocuments: readonly RawDocument[];
  sessionDocuments: readonly RawDocument[];
  syncDocuments: readonly SyncDocumentMetadataInput[];
}): PickerHarvestListResult {
  const workerId = assertPickerProfile(actorProfile);
  const sessions: HarvestSessionDocument[] = [];
  const seasons: SeasonDocument[] = [];
  let invalidSessionCount = 0;
  let invalidSeasonCount = 0;

  for (const document of sessionDocuments) {
    const decoded = decodeHarvestSession(document.id, document.data);

    if (decoded.status === "FOUND" && decoded.session.workerId === workerId) {
      sessions.push(decoded.session);
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
  const items = sessions
    .map((session) => ({
      amountDueGrosz: session.amountDueGrosz,
      businessDate: session.businessDate,
      calculationBasis: session.calculationBasisSnapshot,
      planName: session.planNameSnapshot,
      quantityPrecision: session.quantityPrecisionSnapshot,
      seasonId: session.seasonId,
      seasonName: seasonNames.get(session.seasonId) ?? session.seasonId,
      sessionId: session.id,
      status: session.status,
      syncIssue: findSyncIssue(session.id, syncDocuments),
      totalEntryCount: session.totalEntryCount,
      totalQuantityMilli: session.totalQuantityMilli,
      totalWeightG: session.totalWeightG,
      unitLabelPlural: session.unitLabelPluralSnapshot
    }))
    .sort(
      (left, right) =>
        right.businessDate.localeCompare(left.businessDate) ||
        right.sessionId.localeCompare(left.sessionId)
    );

  return {
    dataSource,
    invalidSeasonCount,
    invalidSessionCount,
    items,
    refreshedAtIso: normalizeIsoTimestamp(refreshedAtIso),
    seasons: [...seasons]
      .sort(
        (left, right) =>
          right.startDate.localeCompare(left.startDate) ||
          left.name.localeCompare(right.name, "pl")
      )
      .map(({ id, name }) => ({ id, name }))
  };
}

export function filterPickerHarvestItems(
  items: readonly PickerHarvestListItem[],
  filters: PickerHarvestFilters
): PickerHarvestListItem[] {
  const fromDate = normalizeOptionalDate(filters.fromDate);
  const toDate = normalizeOptionalDate(filters.toDate);

  if (fromDate && toDate && fromDate > toDate) {
    return [];
  }

  return items.filter(
    (item) =>
      (!filters.seasonId || item.seasonId === filters.seasonId) &&
      (filters.status === "ALL" || item.status === filters.status) &&
      (!fromDate || item.businessDate >= fromDate) &&
      (!toDate || item.businessDate <= toDate)
  );
}

function findSyncIssue(
  sessionId: string,
  syncDocuments: readonly SyncDocumentMetadataInput[]
): string | null {
  const relevant = syncDocuments.filter(
    (document) =>
      (document.kind === "HARVEST_SESSION" && document.id === sessionId) ||
      document.sessionId === sessionId
  );
  const presentations = relevant.flatMap((document) => {
    try {
      return [evaluateSyncDocumentMetadata(document)];
    } catch {
      return [];
    }
  });

  if (presentations.some((document) => document.status === "REJECTED")) {
    return "Blad synchronizacji";
  }

  if (presentations.some((document) => document.status === "REMOTE_CHANGED")) {
    return "Zmiana na innym urzadzeniu";
  }

  if (
    presentations.some(
      (document) =>
        document.status === "PENDING_SYNC" || document.status === "LOCAL_SAVED"
    )
  ) {
    return "Oczekuje synchronizacji";
  }

  return null;
}

function assertPickerProfile(profile: UserProfile): string {
  if (
    profile.role !== "PICKER" ||
    !profile.active ||
    profile.registrationStatus !== "APPROVED" ||
    !profile.workerId
  ) {
    throw new Error("Moje zbiory wymagaja aktywnego profilu pickera z workerId.");
  }

  return profile.workerId;
}

function normalizeOptionalDate(value: string): string {
  const normalized = value.trim();

  if (!normalized) {
    return "";
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) {
    throw new Error("Filtr zawiera nieprawidlowa date.");
  }

  return normalized;
}

function normalizeIsoTimestamp(value: string): string {
  const timestamp = new Date(value);

  if (Number.isNaN(timestamp.getTime())) {
    throw new Error("Lista zbiorow ma nieprawidlowa date odswiezenia.");
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
