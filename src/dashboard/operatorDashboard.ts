import { getFirebaseServices } from "../config/firebaseServices";
import { SEASONS_COLLECTION, type SeasonDocument } from "../domain/domainConfiguration";
import type { UserProfile } from "../domain/identity";
import { decodeHarvestSession } from "../harvest/harvestSessionDashboard";
import { HARVEST_SESSIONS_COLLECTION } from "../harvest/harvestSessionState";
import type { HarvestSessionDocument } from "../harvest/openHarvestSession";
import {
  summarizeSyncDocumentMetadata,
  type SyncDocumentMetadataInput
} from "../offline/pendingWriteMetadata";
import { decodeSeason } from "../seasons/seasons";
import {
  calculateOperationalStock,
  decodeOperationalStockMovement,
  OPERATIONAL_STOCK_MOVEMENTS_COLLECTION,
  type OperationalStockMovementDocument
} from "../stock/operationalStockMovement";
import {
  businessDateMatchesPeriod,
  currentWarsawBusinessDate,
  resolveDashboardPeriod,
  type DashboardPeriodSelection,
  type ResolvedDashboardPeriod
} from "./dashboardPeriod";

type FirebaseEnv = Record<string, string | boolean | undefined>;

export const DEFAULT_OPERATOR_DASHBOARD_PERIOD: DashboardPeriodSelection = {
  customFromDate: "",
  customToDate: "",
  preset: "TODAY"
};

type RawDocument = {
  data: unknown;
  hasPendingWrites?: boolean;
  id: string;
};

export type OperatorDashboardSession = {
  businessDate: string;
  id: string;
  status: HarvestSessionDocument["status"];
  workerName: string;
};

export type OperatorDashboardResult = {
  activeSeason: {
    id: string;
    name: string;
  } | null;
  conflicts: {
    detail: string;
    id: string;
    label: string;
  }[];
  connection: "ONLINE" | "OFFLINE";
  metrics: {
    availableWeightG: number | null;
    conflictCount: number;
    localPendingCount: number;
    openSessionCount: number;
    ownClosedSessionCount: number;
    ownOpenSessionCount: number;
  };
  openSessions: OperatorDashboardSession[];
  ownRecentSessions: OperatorDashboardSession[];
  period: ResolvedDashboardPeriod;
  refreshedAtIso: string;
  stock: {
    dataSource: "SERVER" | "CACHE" | "UNAVAILABLE";
    invalidMovementCount: number;
    movementCount: number;
    pendingMovementCount: number;
  };
};

export type LoadOperatorDashboardInput = {
  actorProfile: UserProfile;
  businessDate?: string;
  isOnline: boolean;
  periodSelection?: DashboardPeriodSelection;
  syncDocuments: readonly SyncDocumentMetadataInput[];
};

export async function loadOperatorDashboard(
  env: FirebaseEnv,
  input: LoadOperatorDashboardInput
): Promise<OperatorDashboardResult> {
  assertOperator(input.actorProfile);
  const { firestore } = await getFirebaseServices(env);
  const { collection, getDocs, getDocsFromCache, limit, orderBy, query, where } =
    await import("firebase/firestore");
  const readQuery = input.isOnline ? getDocs : getDocsFromCache;
  const [seasonSnapshot, openSessionSnapshot, ownSessionSnapshot] = await Promise.all([
    readQuery(
      query(collection(firestore, SEASONS_COLLECTION), where("status", "==", "OPEN"))
    ),
    readQuery(
      query(
        collection(firestore, HARVEST_SESSIONS_COLLECTION),
        where("status", "==", "OPEN"),
        orderBy("businessDate", "desc"),
        orderBy("createdAtServer", "desc"),
        limit(100)
      )
    ),
    readQuery(
      query(
        collection(firestore, HARVEST_SESSIONS_COLLECTION),
        where("createdBy", "==", input.actorProfile.uid),
        orderBy("businessDate", "desc"),
        orderBy("createdAtServer", "desc")
      )
    )
  ]);
  const seasonDocuments = toRawDocuments(seasonSnapshot.docs);
  const activeSeason = selectActiveSeason(seasonDocuments);
  let movementDocuments: RawDocument[] = [];
  let movementFromCache = !input.isOnline;

  if (activeSeason) {
    const movementSnapshot = await readQuery(
      query(
        collection(firestore, OPERATIONAL_STOCK_MOVEMENTS_COLLECTION),
        where("seasonId", "==", activeSeason.id)
      )
    );
    movementDocuments = movementSnapshot.docs.map((snapshot) => ({
      data: snapshot.data({ serverTimestamps: "estimate" }),
      hasPendingWrites: snapshot.metadata.hasPendingWrites,
      id: snapshot.id
    }));
    movementFromCache = movementSnapshot.metadata.fromCache;
  }

  return buildOperatorDashboard({
    actorUid: input.actorProfile.uid,
    businessDate: input.businessDate ?? currentWarsawBusinessDate(),
    isOnline: input.isOnline,
    movementDocuments,
    movementFromCache,
    openSessionDocuments: toRawDocuments(openSessionSnapshot.docs),
    ownSessionDocuments: toRawDocuments(ownSessionSnapshot.docs),
    periodSelection: input.periodSelection,
    refreshedAtIso: new Date().toISOString(),
    seasonDocuments,
    syncDocuments: input.syncDocuments
  });
}

export function buildOperatorDashboard({
  actorUid,
  businessDate,
  isOnline,
  movementDocuments,
  movementFromCache,
  openSessionDocuments,
  ownSessionDocuments,
  periodSelection = DEFAULT_OPERATOR_DASHBOARD_PERIOD,
  refreshedAtIso,
  seasonDocuments,
  syncDocuments
}: {
  actorUid: string;
  businessDate: string;
  isOnline: boolean;
  movementDocuments: readonly RawDocument[];
  movementFromCache: boolean;
  openSessionDocuments: readonly RawDocument[];
  ownSessionDocuments: readonly RawDocument[];
  periodSelection?: DashboardPeriodSelection;
  refreshedAtIso: string;
  seasonDocuments: readonly RawDocument[];
  syncDocuments: readonly SyncDocumentMetadataInput[];
}): OperatorDashboardResult {
  assertBusinessDate(businessDate);
  assertIso(refreshedAtIso);
  const normalizedActorUid = requiredText(
    actorUid,
    "Pulpit operatora wymaga identyfikatora uzytkownika."
  );
  const activeSeason = selectActiveSeason(seasonDocuments);
  const sessions = decodeUniqueSessions([
    ...openSessionDocuments,
    ...ownSessionDocuments
  ]);
  const openSessions = sessions
    .filter((session) => session.status === "OPEN")
    .sort(compareSessions);
  const ownSessions = sessions
    .filter((session) => session.createdBy === normalizedActorUid)
    .sort(compareSessions);
  const period = resolveDashboardPeriod(periodSelection, {
    seasonEndDate: activeSeason?.endDate,
    seasonStartDate: activeSeason?.startDate,
    todayBusinessDate: businessDate
  });
  const ownSessionsInPeriod = ownSessions.filter(
    (session) =>
      session.seasonId === activeSeason?.id &&
      businessDateMatchesPeriod(session.businessDate, period)
  );
  const syncSummary = summarizeSyncDocumentMetadata(syncDocuments);
  const conflicts = syncSummary.documents
    .filter(
      (document) => document.status === "REJECTED" || document.status === "REMOTE_CHANGED"
    )
    .map((document) => ({
      detail:
        document.status === "REJECTED"
          ? "Operacja wymaga sprawdzenia w centrum synchronizacji."
          : "Dokument zostal zmieniony na innym urzadzeniu.",
      id: document.id,
      label: document.label
    }));
  const movements: OperationalStockMovementDocument[] = [];
  let invalidMovementCount = 0;
  let pendingMovementCount = 0;

  for (const document of movementDocuments) {
    const decoded = decodeOperationalStockMovement(document.id, document.data);

    if (!decoded) {
      invalidMovementCount += 1;
      continue;
    }

    movements.push(decoded);
    if (document.hasPendingWrites === true) {
      pendingMovementCount += 1;
    }
  }

  const stockCalculation = activeSeason
    ? calculateOperationalStock(movements, activeSeason.id)
    : null;
  const stockDataSource = activeSeason
    ? movementFromCache || !isOnline
      ? "CACHE"
      : "SERVER"
    : "UNAVAILABLE";

  return {
    activeSeason: activeSeason
      ? {
          id: activeSeason.id,
          name: activeSeason.name
        }
      : null,
    conflicts,
    connection: isOnline ? "ONLINE" : "OFFLINE",
    metrics: {
      availableWeightG:
        invalidMovementCount > 0 || !stockCalculation
          ? null
          : stockCalculation.availableWeightG,
      ownClosedSessionCount: ownSessionsInPeriod.filter(
        (session) => session.status === "CLOSED" || session.status === "PAID"
      ).length,
      conflictCount: conflicts.length,
      localPendingCount: syncSummary.localSavedCount + syncSummary.pendingSyncCount,
      openSessionCount: openSessions.length,
      ownOpenSessionCount: ownSessions.filter((session) => session.status === "OPEN")
        .length
    },
    openSessions: openSessions.map(toSafeSession),
    ownRecentSessions: ownSessionsInPeriod.slice(0, 8).map(toSafeSession),
    period,
    refreshedAtIso,
    stock: {
      dataSource: stockDataSource,
      invalidMovementCount,
      movementCount: stockCalculation?.movementCount ?? 0,
      pendingMovementCount
    }
  };
}

function selectActiveSeason(documents: readonly RawDocument[]): SeasonDocument | null {
  const seasons: SeasonDocument[] = [];

  for (const document of documents) {
    const decoded = decodeSeason(document.id, document.data);
    if (decoded.status === "FOUND" && decoded.season.status === "OPEN") {
      seasons.push(decoded.season);
    }
  }

  return (
    seasons.find((season) => season.isDefault) ??
    seasons
      .sort(
        (left, right) =>
          right.startDate.localeCompare(left.startDate) ||
          left.name.localeCompare(right.name, "pl")
      )
      .at(0) ??
    null
  );
}

function decodeUniqueSessions(
  documents: readonly RawDocument[]
): HarvestSessionDocument[] {
  const sessions = new Map<string, HarvestSessionDocument>();

  for (const document of documents) {
    if (sessions.has(document.id)) {
      continue;
    }

    const decoded = decodeHarvestSession(document.id, document.data);
    if (decoded.status === "FOUND") {
      sessions.set(document.id, decoded.session);
    }
  }

  return [...sessions.values()];
}

function toSafeSession(session: HarvestSessionDocument): OperatorDashboardSession {
  return {
    businessDate: session.businessDate,
    id: session.id,
    status: session.status,
    workerName: session.workerNameSnapshot
  };
}

function compareSessions(
  left: HarvestSessionDocument,
  right: HarvestSessionDocument
): number {
  return (
    right.businessDate.localeCompare(left.businessDate) ||
    compareUnknownTimestamp(right.createdAtServer, left.createdAtServer) ||
    left.id.localeCompare(right.id)
  );
}

function compareUnknownTimestamp(left: unknown, right: unknown): number {
  return timestampMillis(left) - timestampMillis(right);
}

function timestampMillis(value: unknown): number {
  if (isTimestampLike(value)) {
    const result = value.toMillis();
    return typeof result === "number" && Number.isFinite(result) ? result : 0;
  }

  if (value instanceof Date) {
    return value.getTime();
  }

  if (typeof value === "string") {
    const parsed = Date.parse(value);
    return Number.isNaN(parsed) ? 0 : parsed;
  }

  return 0;
}

function isTimestampLike(value: unknown): value is { toMillis: () => unknown } {
  return (
    typeof value === "object" &&
    value !== null &&
    "toMillis" in value &&
    typeof value.toMillis === "function"
  );
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

function assertOperator(profile: UserProfile): void {
  if (
    profile.role !== "OPERATOR" ||
    !profile.active ||
    profile.registrationStatus !== "APPROVED"
  ) {
    throw new Error("Pulpit operatora wymaga aktywnego operatora.");
  }
}

function assertBusinessDate(value: string): void {
  const parsed = Date.parse(`${value}T00:00:00.000Z`);
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(value) ||
    Number.isNaN(parsed) ||
    new Date(parsed).toISOString().slice(0, 10) !== value
  ) {
    throw new Error("Pulpit operatora wymaga poprawnej daty biznesowej.");
  }
}

function assertIso(value: string): void {
  if (Number.isNaN(Date.parse(value))) {
    throw new Error("Pulpit operatora wymaga poprawnego czasu odswiezenia.");
  }
}

function requiredText(value: string, message: string): string {
  const normalized = value.trim();
  if (!normalized) {
    throw new Error(message);
  }
  return normalized;
}
