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
import {
  dashboardPeriodQueryConstraints,
  OPERATOR_OPEN_SESSION_LIMIT,
  OPERATOR_RECENT_SESSION_LIMIT
} from "./dashboardReadStrategy";

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
  lastServerSyncIso: string | null;
  refreshedAtIso: string;
  stock: {
    dataSource: "SERVER" | "CACHE" | "LOCAL_SNAPSHOT" | "UNAVAILABLE";
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
  const {
    collection,
    count,
    getAggregateFromServer,
    getDocs,
    getDocsFromCache,
    limit,
    orderBy,
    query,
    sum,
    where
  } = await import("firebase/firestore");
  const readQuery = input.isOnline ? getDocs : getDocsFromCache;
  const seasonSnapshot = await readQuery(
    query(collection(firestore, SEASONS_COLLECTION), where("status", "==", "OPEN"))
  );
  const seasonDocuments = toRawDocuments(seasonSnapshot.docs);
  const activeSeason = selectActiveSeason(seasonDocuments);
  const businessDate = input.businessDate ?? currentWarsawBusinessDate();
  const period = resolveDashboardPeriod(
    input.periodSelection ?? DEFAULT_OPERATOR_DASHBOARD_PERIOD,
    {
      seasonEndDate: activeSeason?.endDate,
      seasonStartDate: activeSeason?.startDate,
      todayBusinessDate: businessDate
    }
  );
  let openSessionDocuments: RawDocument[] = [];
  let ownSessionDocuments: RawDocument[] = [];
  let movementDocuments: RawDocument[] = [];
  let movementFromCache = !input.isOnline;
  let stockAggregate: { availableWeightG: number; movementCount: number } | null = null;
  let ownClosedSessionCount: number | null = null;
  let ownOpenSessionCount: number | null = null;

  if (activeSeason) {
    const sessions = collection(firestore, HARVEST_SESSIONS_COLLECTION);
    const movements = collection(firestore, OPERATIONAL_STOCK_MOVEMENTS_COLLECTION);
    const openSessionsQuery = query(
      sessions,
      where("seasonId", "==", activeSeason.id),
      where("status", "==", "OPEN"),
      orderBy("businessDate", "desc"),
      orderBy("createdAtServer", "desc"),
      limit(OPERATOR_OPEN_SESSION_LIMIT)
    );
    const ownPeriodConstraints = dashboardPeriodQueryConstraints(
      "businessDate",
      period,
      where
    );
    const ownRecentQuery = query(
      sessions,
      where("createdBy", "==", input.actorProfile.uid),
      where("seasonId", "==", activeSeason.id),
      ...ownPeriodConstraints,
      orderBy("businessDate", "desc"),
      orderBy("createdAtServer", "desc"),
      ...(input.isOnline ? [limit(OPERATOR_RECENT_SESSION_LIMIT)] : [])
    );

    if (input.isOnline) {
      const [
        openSnapshot,
        ownRecentSnapshot,
        stockSnapshot,
        ownClosedSnapshot,
        ownOpenSnapshot
      ] = await Promise.all([
        getDocs(openSessionsQuery),
        getDocs(ownRecentQuery),
        getAggregateFromServer(
          query(movements, where("seasonId", "==", activeSeason.id)),
          { availableWeightG: sum("weightImpactG"), movementCount: count() }
        ),
        getAggregateFromServer(
          query(
            sessions,
            where("createdBy", "==", input.actorProfile.uid),
            where("seasonId", "==", activeSeason.id),
            where("status", "in", ["CLOSED", "PAID"]),
            ...ownPeriodConstraints
          ),
          { ownClosedSessionCount: count() }
        ),
        getAggregateFromServer(
          query(
            sessions,
            where("createdBy", "==", input.actorProfile.uid),
            where("seasonId", "==", activeSeason.id),
            where("status", "==", "OPEN")
          ),
          { ownOpenSessionCount: count() }
        )
      ]);
      const stockData = stockSnapshot.data();
      stockAggregate = {
        availableWeightG: stockData.availableWeightG,
        movementCount: stockData.movementCount
      };
      assertAggregateInteger(stockAggregate.availableWeightG);
      assertAggregateInteger(stockAggregate.movementCount);
      ownClosedSessionCount = ownClosedSnapshot.data().ownClosedSessionCount;
      ownOpenSessionCount = ownOpenSnapshot.data().ownOpenSessionCount;
      openSessionDocuments = toRawDocuments(openSnapshot.docs);
      ownSessionDocuments = toRawDocuments(ownRecentSnapshot.docs);
      movementFromCache = false;
    } else {
      const [openSnapshot, ownRecentSnapshot, ownOpenSnapshot, movementSnapshot] =
        await Promise.all([
          getDocsFromCache(openSessionsQuery),
          getDocsFromCache(ownRecentQuery),
          getDocsFromCache(
            query(
              sessions,
              where("createdBy", "==", input.actorProfile.uid),
              where("seasonId", "==", activeSeason.id),
              where("status", "==", "OPEN")
            )
          ),
          getDocsFromCache(query(movements, where("seasonId", "==", activeSeason.id)))
        ]);
      openSessionDocuments = toRawDocuments(openSnapshot.docs);
      ownSessionDocuments = toRawDocuments(ownRecentSnapshot.docs);
      ownClosedSessionCount = ownSessionDocuments.filter((document) => {
        const decoded = decodeHarvestSession(document.id, document.data);
        return (
          decoded.status === "FOUND" &&
          (decoded.session.status === "CLOSED" || decoded.session.status === "PAID")
        );
      }).length;
      ownOpenSessionCount = toRawDocuments(ownOpenSnapshot.docs).filter((document) => {
        const decoded = decodeHarvestSession(document.id, document.data);
        return (
          decoded.status === "FOUND" &&
          decoded.session.createdBy === input.actorProfile.uid &&
          decoded.session.seasonId === activeSeason.id &&
          decoded.session.status === "OPEN"
        );
      }).length;
      movementDocuments = movementSnapshot.docs.map((snapshot) => ({
        data: snapshot.data({ serverTimestamps: "estimate" }),
        hasPendingWrites: snapshot.metadata.hasPendingWrites,
        id: snapshot.id
      }));
      movementFromCache = true;
    }
  }

  return buildOperatorDashboard({
    actorUid: input.actorProfile.uid,
    businessDate,
    isOnline: input.isOnline,
    metricOverrides: {
      ownClosedSessionCount,
      ownOpenSessionCount
    },
    movementDocuments,
    movementFromCache,
    openSessionDocuments,
    ownSessionDocuments,
    periodSelection: input.periodSelection,
    refreshedAtIso: new Date().toISOString(),
    seasonDocuments,
    stockAggregate,
    syncDocuments: input.syncDocuments
  });
}

export function buildOperatorDashboard({
  actorUid,
  businessDate,
  isOnline,
  metricOverrides = {},
  movementDocuments,
  movementFromCache,
  openSessionDocuments,
  ownSessionDocuments,
  periodSelection = DEFAULT_OPERATOR_DASHBOARD_PERIOD,
  refreshedAtIso,
  seasonDocuments,
  stockAggregate = null,
  syncDocuments
}: {
  actorUid: string;
  businessDate: string;
  isOnline: boolean;
  metricOverrides?: {
    ownClosedSessionCount?: number | null;
    ownOpenSessionCount?: number | null;
  };
  movementDocuments: readonly RawDocument[];
  movementFromCache: boolean;
  openSessionDocuments: readonly RawDocument[];
  ownSessionDocuments: readonly RawDocument[];
  periodSelection?: DashboardPeriodSelection;
  refreshedAtIso: string;
  seasonDocuments: readonly RawDocument[];
  stockAggregate?: {
    availableWeightG: number;
    movementCount: number;
  } | null;
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
  const conflicts = buildOperatorConflicts(syncSummary);
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

  const stockCalculation =
    stockAggregate ??
    (activeSeason ? calculateOperationalStock(movements, activeSeason.id) : null);
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
      ownClosedSessionCount:
        metricOverrides.ownClosedSessionCount ??
        ownSessionsInPeriod.filter(
          (session) => session.status === "CLOSED" || session.status === "PAID"
        ).length,
      conflictCount: conflicts.length,
      localPendingCount: syncSummary.localSavedCount + syncSummary.pendingSyncCount,
      openSessionCount: openSessions.length,
      ownOpenSessionCount:
        metricOverrides.ownOpenSessionCount ??
        ownSessions.filter((session) => session.status === "OPEN").length
    },
    openSessions: openSessions.map(toSafeSession),
    ownRecentSessions: ownSessionsInPeriod.slice(0, 8).map(toSafeSession),
    period,
    lastServerSyncIso: isOnline ? refreshedAtIso : syncSummary.lastSuccessfulSyncIso,
    refreshedAtIso,
    stock: {
      dataSource: stockDataSource,
      invalidMovementCount,
      movementCount: stockCalculation?.movementCount ?? 0,
      pendingMovementCount
    }
  };
}

export function hydrateOperatorDashboardSnapshot(
  result: OperatorDashboardResult,
  syncDocuments: readonly SyncDocumentMetadataInput[]
): OperatorDashboardResult {
  const syncSummary = summarizeSyncDocumentMetadata(syncDocuments);
  const conflicts = buildOperatorConflicts(syncSummary);

  return {
    ...result,
    conflicts,
    connection: "OFFLINE",
    lastServerSyncIso:
      result.lastServerSyncIso ??
      (result.connection === "ONLINE"
        ? result.refreshedAtIso
        : syncSummary.lastSuccessfulSyncIso),
    metrics: {
      ...result.metrics,
      conflictCount: conflicts.length,
      localPendingCount: syncSummary.localSavedCount + syncSummary.pendingSyncCount
    },
    stock: {
      ...result.stock,
      dataSource: result.activeSeason ? "LOCAL_SNAPSHOT" : "UNAVAILABLE",
      pendingMovementCount: 0
    }
  };
}

export function prepareOperatorDashboardSnapshot(
  result: OperatorDashboardResult
): OperatorDashboardResult {
  return hydrateOperatorDashboardSnapshot(result, []);
}

export function isOperatorDashboardSnapshot(
  value: unknown
): value is OperatorDashboardResult {
  if (
    !isRecord(value) ||
    !isActiveSeason(value.activeSeason) ||
    !Array.isArray(value.conflicts) ||
    !value.conflicts.every(isOperatorConflict) ||
    (value.connection !== "ONLINE" && value.connection !== "OFFLINE") ||
    !isOperatorMetrics(value.metrics) ||
    !Array.isArray(value.openSessions) ||
    !value.openSessions.every(isOperatorSession) ||
    !Array.isArray(value.ownRecentSessions) ||
    !value.ownRecentSessions.every(isOperatorSession) ||
    !isDashboardPeriod(value.period) ||
    !isNullableIso(value.lastServerSyncIso) ||
    typeof value.refreshedAtIso !== "string" ||
    Number.isNaN(Date.parse(value.refreshedAtIso)) ||
    !isOperatorStock(value.stock)
  ) {
    return false;
  }

  return true;
}

function buildOperatorConflicts(
  syncSummary: ReturnType<typeof summarizeSyncDocumentMetadata>
): OperatorDashboardResult["conflicts"] {
  return syncSummary.documents
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

function assertAggregateInteger(value: number): void {
  if (!Number.isSafeInteger(value)) {
    throw new Error("Agregat pulpitu operatora zawiera nieprawidlowa wartosc.");
  }
}

function isActiveSeason(
  value: unknown
): value is OperatorDashboardResult["activeSeason"] {
  return (
    value === null ||
    (isRecord(value) && typeof value.id === "string" && typeof value.name === "string")
  );
}

function isOperatorConflict(
  value: unknown
): value is OperatorDashboardResult["conflicts"][number] {
  return (
    isRecord(value) &&
    typeof value.detail === "string" &&
    typeof value.id === "string" &&
    typeof value.label === "string"
  );
}

function isOperatorMetrics(value: unknown): boolean {
  return (
    isRecord(value) &&
    (value.availableWeightG === null || isSafeInteger(value.availableWeightG)) &&
    [
      value.conflictCount,
      value.localPendingCount,
      value.openSessionCount,
      value.ownClosedSessionCount,
      value.ownOpenSessionCount
    ].every(isNonNegativeSafeInteger)
  );
}

function isOperatorSession(value: unknown): boolean {
  return (
    isRecord(value) &&
    typeof value.businessDate === "string" &&
    typeof value.id === "string" &&
    ["CANCELLED", "CLOSED", "OPEN", "PAID", "REVIEW_REQUIRED"].includes(
      String(value.status)
    ) &&
    typeof value.workerName === "string"
  );
}

function isDashboardPeriod(value: unknown): boolean {
  return (
    isRecord(value) &&
    value.dateBasis === "BUSINESS_DATE" &&
    (value.fromDate === null || typeof value.fromDate === "string") &&
    typeof value.label === "string" &&
    ["TODAY", "CURRENT_WEEK", "CURRENT_MONTH", "SEASON", "CUSTOM"].includes(
      String(value.preset)
    ) &&
    (value.toDate === null || typeof value.toDate === "string")
  );
}

function isOperatorStock(value: unknown): boolean {
  return (
    isRecord(value) &&
    ["SERVER", "CACHE", "LOCAL_SNAPSHOT", "UNAVAILABLE"].includes(
      String(value.dataSource)
    ) &&
    [value.invalidMovementCount, value.movementCount, value.pendingMovementCount].every(
      isNonNegativeSafeInteger
    )
  );
}

function isNullableIso(value: unknown): boolean {
  return (
    value === null || (typeof value === "string" && !Number.isNaN(Date.parse(value)))
  );
}

function isNonNegativeSafeInteger(value: unknown): boolean {
  return isSafeInteger(value) && value >= 0;
}

function isSafeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function requiredText(value: string, message: string): string {
  const normalized = value.trim();
  if (!normalized) {
    throw new Error(message);
  }
  return normalized;
}
