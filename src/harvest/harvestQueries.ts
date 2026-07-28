import {
  HARVEST_ENTRIES_COLLECTION,
  HARVEST_SESSIONS_COLLECTION,
  HARVEST_SESSION_STATUSES,
  type HarvestSessionStatus
} from "./harvestSessionState";

export type HarvestQueryId =
  | "todayHarvestSessions"
  | "openHarvestSessions"
  | "harvestSessionsForWorker"
  | "harvestSessionsForSeason"
  | "harvestSessionsByStatus"
  | "harvestEntriesForSession"
  | "pickerOwnHarvestEntriesForSession"
  | "pickerOwnHarvestSessions"
  | "operatorCreatedHarvestSessions"
  | "reviewRequiredHarvestSessions";

export type HarvestQueryCollection =
  typeof HARVEST_SESSIONS_COLLECTION | typeof HARVEST_ENTRIES_COLLECTION;

export type HarvestQueryOperator = "==";
export type HarvestQueryOrderDirection = "ASCENDING" | "DESCENDING";
export type HarvestQueryListenerScope =
  "SESSION_LIST" | "SESSION_DETAIL_ENTRIES" | "PICKER_OWN_SESSION_LIST" | "REVIEW_QUEUE";

export type HarvestQueryFilter = {
  fieldPath: string;
  op: HarvestQueryOperator;
  value: string;
};

export type HarvestQueryOrder = {
  fieldPath: string;
  direction: HarvestQueryOrderDirection;
};

export type HarvestQueryIndexField = {
  fieldPath: string;
  order: HarvestQueryOrderDirection;
};

export type HarvestQueryIndexRequirement = {
  collectionGroup: HarvestQueryCollection;
  fields: readonly HarvestQueryIndexField[];
  queryIds: readonly HarvestQueryId[];
};

export type HarvestQueryDefinition = {
  id: HarvestQueryId;
  collection: HarvestQueryCollection;
  filters: readonly HarvestQueryFilter[];
  orderBy: readonly HarvestQueryOrder[];
  defaultLimit: number;
  listenerScope: HarvestQueryListenerScope;
  indexRequirement: HarvestQueryIndexRequirement;
};

const DEFAULT_SESSION_LIST_LIMIT = 100;
const DEFAULT_ENTRY_LIST_LIMIT = 500;
const DEFAULT_REVIEW_QUEUE_LIMIT = 50;

export const HARVEST_QUERY_INDEX_REQUIREMENTS = [
  {
    collectionGroup: HARVEST_SESSIONS_COLLECTION,
    fields: [
      { fieldPath: "businessDate", order: "ASCENDING" },
      { fieldPath: "createdAtServer", order: "DESCENDING" }
    ],
    queryIds: ["todayHarvestSessions"]
  },
  {
    collectionGroup: HARVEST_SESSIONS_COLLECTION,
    fields: [
      { fieldPath: "status", order: "ASCENDING" },
      { fieldPath: "businessDate", order: "DESCENDING" },
      { fieldPath: "createdAtServer", order: "DESCENDING" }
    ],
    queryIds: ["openHarvestSessions", "harvestSessionsByStatus"]
  },
  {
    collectionGroup: HARVEST_SESSIONS_COLLECTION,
    fields: [
      { fieldPath: "workerId", order: "ASCENDING" },
      { fieldPath: "businessDate", order: "DESCENDING" },
      { fieldPath: "createdAtServer", order: "DESCENDING" }
    ],
    queryIds: ["harvestSessionsForWorker", "pickerOwnHarvestSessions"]
  },
  {
    collectionGroup: HARVEST_SESSIONS_COLLECTION,
    fields: [
      { fieldPath: "seasonId", order: "ASCENDING" },
      { fieldPath: "businessDate", order: "DESCENDING" },
      { fieldPath: "createdAtServer", order: "DESCENDING" }
    ],
    queryIds: ["harvestSessionsForSeason"]
  },
  {
    collectionGroup: HARVEST_SESSIONS_COLLECTION,
    fields: [
      { fieldPath: "createdBy", order: "ASCENDING" },
      { fieldPath: "businessDate", order: "DESCENDING" },
      { fieldPath: "createdAtServer", order: "DESCENDING" }
    ],
    queryIds: ["operatorCreatedHarvestSessions"]
  },
  {
    collectionGroup: HARVEST_SESSIONS_COLLECTION,
    fields: [
      { fieldPath: "status", order: "ASCENDING" },
      { fieldPath: "updatedAtServer", order: "DESCENDING" },
      { fieldPath: "businessDate", order: "DESCENDING" }
    ],
    queryIds: ["reviewRequiredHarvestSessions"]
  },
  {
    collectionGroup: HARVEST_ENTRIES_COLLECTION,
    fields: [
      { fieldPath: "sessionId", order: "ASCENDING" },
      { fieldPath: "sequenceNumber", order: "ASCENDING" }
    ],
    queryIds: ["harvestEntriesForSession"]
  },
  {
    collectionGroup: HARVEST_ENTRIES_COLLECTION,
    fields: [
      { fieldPath: "workerId", order: "ASCENDING" },
      { fieldPath: "sessionId", order: "ASCENDING" },
      { fieldPath: "sequenceNumber", order: "ASCENDING" }
    ],
    queryIds: ["pickerOwnHarvestEntriesForSession"]
  }
] as const satisfies readonly HarvestQueryIndexRequirement[];

export function todayHarvestSessionsQuery(
  businessDate: string,
  limit = DEFAULT_SESSION_LIST_LIMIT
): HarvestQueryDefinition {
  return queryDefinition({
    id: "todayHarvestSessions",
    collection: HARVEST_SESSIONS_COLLECTION,
    filters: [
      {
        fieldPath: "businessDate",
        op: "==",
        value: normalizeBusinessDate(businessDate)
      }
    ],
    orderBy: [{ fieldPath: "createdAtServer", direction: "DESCENDING" }],
    defaultLimit: normalizeLimit(limit),
    listenerScope: "SESSION_LIST"
  });
}

export function openHarvestSessionsQuery(
  limit = DEFAULT_SESSION_LIST_LIMIT
): HarvestQueryDefinition {
  return harvestSessionsByStatusQuery("OPEN", limit, "openHarvestSessions");
}

export function harvestSessionsForWorkerQuery(
  workerId: string,
  limit = DEFAULT_SESSION_LIST_LIMIT
): HarvestQueryDefinition {
  return queryDefinition({
    id: "harvestSessionsForWorker",
    collection: HARVEST_SESSIONS_COLLECTION,
    filters: [{ fieldPath: "workerId", op: "==", value: normalizeId(workerId) }],
    orderBy: [
      { fieldPath: "businessDate", direction: "DESCENDING" },
      { fieldPath: "createdAtServer", direction: "DESCENDING" }
    ],
    defaultLimit: normalizeLimit(limit),
    listenerScope: "SESSION_LIST"
  });
}

export function harvestSessionsForSeasonQuery(
  seasonId: string,
  limit = DEFAULT_SESSION_LIST_LIMIT
): HarvestQueryDefinition {
  return queryDefinition({
    id: "harvestSessionsForSeason",
    collection: HARVEST_SESSIONS_COLLECTION,
    filters: [{ fieldPath: "seasonId", op: "==", value: normalizeId(seasonId) }],
    orderBy: [
      { fieldPath: "businessDate", direction: "DESCENDING" },
      { fieldPath: "createdAtServer", direction: "DESCENDING" }
    ],
    defaultLimit: normalizeLimit(limit),
    listenerScope: "SESSION_LIST"
  });
}

export function harvestSessionsByStatusQuery(
  status: HarvestSessionStatus,
  limit = DEFAULT_SESSION_LIST_LIMIT,
  id: Extract<
    HarvestQueryId,
    "openHarvestSessions" | "harvestSessionsByStatus"
  > = "harvestSessionsByStatus"
): HarvestQueryDefinition {
  return queryDefinition({
    id,
    collection: HARVEST_SESSIONS_COLLECTION,
    filters: [{ fieldPath: "status", op: "==", value: normalizeStatus(status) }],
    orderBy: [
      { fieldPath: "businessDate", direction: "DESCENDING" },
      { fieldPath: "createdAtServer", direction: "DESCENDING" }
    ],
    defaultLimit: normalizeLimit(limit),
    listenerScope: "SESSION_LIST"
  });
}

export function harvestEntriesForSessionQuery(
  sessionId: string,
  limit = DEFAULT_ENTRY_LIST_LIMIT
): HarvestQueryDefinition {
  return queryDefinition({
    id: "harvestEntriesForSession",
    collection: HARVEST_ENTRIES_COLLECTION,
    filters: [{ fieldPath: "sessionId", op: "==", value: normalizeId(sessionId) }],
    orderBy: [{ fieldPath: "sequenceNumber", direction: "ASCENDING" }],
    defaultLimit: normalizeLimit(limit),
    listenerScope: "SESSION_DETAIL_ENTRIES"
  });
}

export function pickerOwnHarvestEntriesForSessionQuery(
  workerId: string,
  sessionId: string,
  limit = DEFAULT_ENTRY_LIST_LIMIT
): HarvestQueryDefinition {
  return queryDefinition({
    id: "pickerOwnHarvestEntriesForSession",
    collection: HARVEST_ENTRIES_COLLECTION,
    filters: [
      { fieldPath: "workerId", op: "==", value: normalizeId(workerId) },
      { fieldPath: "sessionId", op: "==", value: normalizeId(sessionId) }
    ],
    orderBy: [{ fieldPath: "sequenceNumber", direction: "ASCENDING" }],
    defaultLimit: normalizeLimit(limit),
    listenerScope: "SESSION_DETAIL_ENTRIES"
  });
}

export function pickerOwnHarvestSessionsQuery(
  workerId: string,
  limit = DEFAULT_SESSION_LIST_LIMIT
): HarvestQueryDefinition {
  return {
    ...harvestSessionsForWorkerQuery(workerId, limit),
    id: "pickerOwnHarvestSessions",
    listenerScope: "PICKER_OWN_SESSION_LIST",
    indexRequirement: findIndexRequirement("pickerOwnHarvestSessions")
  };
}

export function operatorCreatedHarvestSessionsQuery(
  operatorUid: string,
  limit = DEFAULT_SESSION_LIST_LIMIT
): HarvestQueryDefinition {
  return queryDefinition({
    id: "operatorCreatedHarvestSessions",
    collection: HARVEST_SESSIONS_COLLECTION,
    filters: [{ fieldPath: "createdBy", op: "==", value: normalizeId(operatorUid) }],
    orderBy: [
      { fieldPath: "businessDate", direction: "DESCENDING" },
      { fieldPath: "createdAtServer", direction: "DESCENDING" }
    ],
    defaultLimit: normalizeLimit(limit),
    listenerScope: "SESSION_LIST"
  });
}

export function reviewRequiredHarvestSessionsQuery(
  limit = DEFAULT_REVIEW_QUEUE_LIMIT
): HarvestQueryDefinition {
  return queryDefinition({
    id: "reviewRequiredHarvestSessions",
    collection: HARVEST_SESSIONS_COLLECTION,
    filters: [{ fieldPath: "status", op: "==", value: "REVIEW_REQUIRED" }],
    orderBy: [
      { fieldPath: "updatedAtServer", direction: "DESCENDING" },
      { fieldPath: "businessDate", direction: "DESCENDING" }
    ],
    defaultLimit: normalizeLimit(limit),
    listenerScope: "REVIEW_QUEUE"
  });
}

export function listHarvestQueryDefinitions(): HarvestQueryDefinition[] {
  return [
    todayHarvestSessionsQuery("2026-07-17"),
    openHarvestSessionsQuery(),
    harvestSessionsForWorkerQuery("worker-anna-test"),
    harvestSessionsForSeasonQuery("season-2026-test"),
    harvestSessionsByStatusQuery("CLOSED"),
    harvestEntriesForSessionQuery("session-1"),
    pickerOwnHarvestEntriesForSessionQuery("worker-anna-test", "session-1"),
    pickerOwnHarvestSessionsQuery("worker-anna-test"),
    operatorCreatedHarvestSessionsQuery("operator-1"),
    reviewRequiredHarvestSessionsQuery()
  ];
}

function queryDefinition(
  input: Omit<HarvestQueryDefinition, "indexRequirement">
): HarvestQueryDefinition {
  return {
    ...input,
    indexRequirement: findIndexRequirement(input.id)
  };
}

function findIndexRequirement(queryId: HarvestQueryId): HarvestQueryIndexRequirement {
  const indexRequirement = HARVEST_QUERY_INDEX_REQUIREMENTS.find((candidate) =>
    candidate.queryIds.some((candidateQueryId) => candidateQueryId === queryId)
  );

  if (!indexRequirement) {
    throw new Error(`Brak indeksu dla zapytania harvest: ${queryId}.`);
  }

  return indexRequirement;
}

function normalizeBusinessDate(value: string): string {
  const normalized = normalizeId(value);

  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) {
    throw new Error("Zapytanie harvest wymaga daty biznesowej YYYY-MM-DD.");
  }

  return normalized;
}

function normalizeStatus(status: HarvestSessionStatus): HarvestSessionStatus {
  if (!HARVEST_SESSION_STATUSES.includes(status)) {
    throw new Error("Zapytanie harvest wymaga znanego statusu sesji.");
  }

  return status;
}

function normalizeLimit(value: number): number {
  if (!Number.isSafeInteger(value) || value <= 0 || value > 1000) {
    throw new Error("Limit zapytania harvest musi byc liczba 1-1000.");
  }

  return value;
}

function normalizeId(value: string): string {
  const normalized = value.trim();

  if (!normalized) {
    throw new Error("Zapytanie harvest wymaga identyfikatora.");
  }

  return normalized;
}
