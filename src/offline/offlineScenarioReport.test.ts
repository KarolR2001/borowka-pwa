import {
  OFFLINE_SCENARIO_IDS,
  createOfflineScenarioReport,
  type OfflineScenarioExecutionInput
} from "./offlineScenarioReport";

describe("offline scenario report", () => {
  it("orders and summarizes complete OFF-T01-OFF-T06 evidence", () => {
    const report = createOfflineScenarioReport({
      generatedAtIso: "2026-07-28T10:00:00.000Z",
      executions: [...OFFLINE_SCENARIO_IDS].reverse().map((id) => createExecution(id))
    });

    expect(report.status).toBe("PASS");
    expect(report.format).toEqual({
      name: "BOROWKA_OFFLINE_SCENARIO_REPORT",
      version: 1
    });
    expect(report.summary).toEqual({
      failed: 0,
      passed: 6,
      skipped: 0,
      total: 6
    });
    expect(report.executions.map((execution) => execution.id)).toEqual(
      OFFLINE_SCENARIO_IDS
    );
  });

  it("uses FAIL before PARTIAL and preserves explicit skipped evidence", () => {
    const partial = createOfflineScenarioReport({
      generatedAtIso: "2026-07-28T10:00:00.000Z",
      executions: OFFLINE_SCENARIO_IDS.map((id) =>
        createExecution(id, id === "OFF-T06" ? "SKIPPED" : "PASS")
      )
    });
    const failed = createOfflineScenarioReport({
      generatedAtIso: "2026-07-28T10:00:00.000Z",
      executions: OFFLINE_SCENARIO_IDS.map((id) =>
        createExecution(
          id,
          id === "OFF-T05" ? "FAIL" : id === "OFF-T06" ? "SKIPPED" : "PASS"
        )
      )
    });

    expect(partial.status).toBe("PARTIAL");
    expect(partial.summary.skipped).toBe(1);
    expect(failed.status).toBe("FAIL");
    expect(failed.summary).toMatchObject({ failed: 1, skipped: 1 });
  });

  it("rejects incomplete, duplicate and invalid scenario evidence", () => {
    expect(() =>
      createOfflineScenarioReport({
        generatedAtIso: "2026-07-28T10:00:00.000Z",
        executions: OFFLINE_SCENARIO_IDS.slice(0, 5).map((id) => createExecution(id))
      })
    ).toThrow("Raport offline nie zawiera scenariuszy: OFF-T06.");

    expect(() =>
      createOfflineScenarioReport({
        generatedAtIso: "2026-07-28T10:00:00.000Z",
        executions: [
          ...OFFLINE_SCENARIO_IDS.map((id) => createExecution(id)),
          createExecution("OFF-T01")
        ]
      })
    ).toThrow("Raport offline zawiera duplikat scenariusza OFF-T01.");

    expect(() =>
      createOfflineScenarioReport({
        generatedAtIso: "2026-07-28T10:00:00.000Z",
        executions: OFFLINE_SCENARIO_IDS.map((id) => ({
          ...createExecution(id),
          statusSnapshots: id === "OFF-T03" ? [] : ["status"]
        }))
      })
    ).toThrow("Raport wymaga co najmniej jednego zrzutu statusu.");
  });
});

function createExecution(
  id: (typeof OFFLINE_SCENARIO_IDS)[number],
  result: OfflineScenarioExecutionInput["result"] = "PASS"
): OfflineScenarioExecutionInput {
  return {
    appVersion: "0.1.0",
    browser: "Firebase JS SDK",
    conflictResult: id === "OFF-T01" ? "NONE" : "EXPECTED_POLICY_APPLIED",
    deviceModel: "Firestore Emulator",
    entryCount: id === "OFF-T01" ? 10 : 1,
    firestoreDocumentCount: id === "OFF-T01" ? 11 : 2,
    id,
    offlineDurationMinutes: 5,
    result,
    stateAfter: "SERVER_CONFIRMED",
    stateBefore: "LOCAL_PENDING",
    statusSnapshots: [`${id}:LOCAL_PENDING`, `${id}:SERVER_CONFIRMED`],
    system: "Linux CI"
  };
}
