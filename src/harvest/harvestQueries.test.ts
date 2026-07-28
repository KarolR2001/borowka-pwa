import {
  HARVEST_QUERY_INDEX_REQUIREMENTS,
  harvestEntriesForSessionQuery,
  harvestSessionsByStatusQuery,
  harvestSessionsForSeasonQuery,
  harvestSessionsForWorkerQuery,
  listHarvestQueryDefinitions,
  openHarvestSessionsQuery,
  operatorCreatedHarvestSessionsQuery,
  pickerOwnHarvestEntriesForSessionQuery,
  pickerOwnHarvestSessionsQuery,
  reviewRequiredHarvestSessionsQuery,
  todayHarvestSessionsQuery
} from "./harvestQueries";

describe("harvest query contract", () => {
  it("covers every stage 5.19 query family", () => {
    expect(listHarvestQueryDefinitions().map((definition) => definition.id)).toEqual([
      "todayHarvestSessions",
      "openHarvestSessions",
      "harvestSessionsForWorker",
      "harvestSessionsForSeason",
      "harvestSessionsByStatus",
      "harvestEntriesForSession",
      "pickerOwnHarvestEntriesForSession",
      "pickerOwnHarvestSessions",
      "operatorCreatedHarvestSessions",
      "reviewRequiredHarvestSessions"
    ]);
  });

  it("builds session list queries with stable filters and order", () => {
    expect(todayHarvestSessionsQuery("2026-07-17")).toMatchObject({
      collection: "harvestSessions",
      filters: [{ fieldPath: "businessDate", op: "==", value: "2026-07-17" }],
      orderBy: [{ fieldPath: "createdAtServer", direction: "DESCENDING" }],
      defaultLimit: 100
    });
    expect(openHarvestSessionsQuery()).toMatchObject({
      filters: [{ fieldPath: "status", op: "==", value: "OPEN" }],
      orderBy: [
        { fieldPath: "businessDate", direction: "DESCENDING" },
        { fieldPath: "createdAtServer", direction: "DESCENDING" }
      ]
    });
    expect(harvestSessionsForWorkerQuery(" worker-1 ", 25)).toMatchObject({
      filters: [{ fieldPath: "workerId", op: "==", value: "worker-1" }],
      defaultLimit: 25
    });
    expect(harvestSessionsForSeasonQuery("season-1")).toMatchObject({
      filters: [{ fieldPath: "seasonId", op: "==", value: "season-1" }]
    });
    expect(harvestSessionsByStatusQuery("CLOSED")).toMatchObject({
      filters: [{ fieldPath: "status", op: "==", value: "CLOSED" }]
    });
  });

  it("builds picker, operator and review queue queries", () => {
    expect(pickerOwnHarvestSessionsQuery("worker-1")).toMatchObject({
      id: "pickerOwnHarvestSessions",
      listenerScope: "PICKER_OWN_SESSION_LIST",
      filters: [{ fieldPath: "workerId", op: "==", value: "worker-1" }]
    });
    expect(operatorCreatedHarvestSessionsQuery("operator-1")).toMatchObject({
      filters: [{ fieldPath: "createdBy", op: "==", value: "operator-1" }]
    });
    expect(reviewRequiredHarvestSessionsQuery()).toMatchObject({
      filters: [{ fieldPath: "status", op: "==", value: "REVIEW_REQUIRED" }],
      orderBy: [
        { fieldPath: "updatedAtServer", direction: "DESCENDING" },
        { fieldPath: "businessDate", direction: "DESCENDING" }
      ],
      defaultLimit: 50
    });
  });

  it("keeps harvest entry access scoped to a single session", () => {
    const query = harvestEntriesForSessionQuery("session-1");

    expect(query).toMatchObject({
      collection: "harvestEntries",
      filters: [{ fieldPath: "sessionId", op: "==", value: "session-1" }],
      orderBy: [{ fieldPath: "sequenceNumber", direction: "ASCENDING" }],
      listenerScope: "SESSION_DETAIL_ENTRIES"
    });
    expect(
      pickerOwnHarvestEntriesForSessionQuery(" worker-1 ", " session-1 ")
    ).toMatchObject({
      filters: [
        { fieldPath: "workerId", op: "==", value: "worker-1" },
        { fieldPath: "sessionId", op: "==", value: "session-1" }
      ],
      orderBy: [{ fieldPath: "sequenceNumber", direction: "ASCENDING" }]
    });
    expect(
      listHarvestQueryDefinitions()
        .filter((definition) => definition.collection === "harvestEntries")
        .every((definition) =>
          definition.filters.some((filter) => filter.fieldPath === "sessionId")
        )
    ).toBe(true);
  });

  it("has a matching composite index requirement for every query", () => {
    const indexedQueryIds = new Set(
      HARVEST_QUERY_INDEX_REQUIREMENTS.flatMap((requirement) => requirement.queryIds)
    );

    expect(
      listHarvestQueryDefinitions().every((definition) =>
        indexedQueryIds.has(definition.id)
      )
    ).toBe(true);
    expect(HARVEST_QUERY_INDEX_REQUIREMENTS).toHaveLength(8);
  });

  it("rejects unsafe query inputs", () => {
    expect(() => todayHarvestSessionsQuery("2026/07/17")).toThrow(
      "Zapytanie harvest wymaga daty biznesowej YYYY-MM-DD."
    );
    expect(() => harvestEntriesForSessionQuery(" ")).toThrow(
      "Zapytanie harvest wymaga identyfikatora."
    );
    expect(() => harvestSessionsForWorkerQuery("worker-1", 0)).toThrow(
      "Limit zapytania harvest musi byc liczba 1-1000."
    );
    expect(() => harvestSessionsByStatusQuery("UNKNOWN" as never)).toThrow(
      "Zapytanie harvest wymaga znanego statusu sesji."
    );
  });
});
