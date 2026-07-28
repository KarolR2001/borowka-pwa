export const OFFLINE_SCENARIO_IDS = [
  "OFF-T01",
  "OFF-T02",
  "OFF-T03",
  "OFF-T04",
  "OFF-T05",
  "OFF-T06"
] as const;
export const OFFLINE_SCENARIO_REPORT_FORMAT = "BOROWKA_OFFLINE_SCENARIO_REPORT";
export const OFFLINE_SCENARIO_REPORT_VERSION = 1;

export type OfflineScenarioId = (typeof OFFLINE_SCENARIO_IDS)[number];
export type OfflineScenarioResult = "PASS" | "FAIL" | "SKIPPED";
export type OfflineScenarioReportStatus = "PASS" | "FAIL" | "PARTIAL";
const OFFLINE_SCENARIO_RESULTS: readonly OfflineScenarioResult[] = [
  "PASS",
  "FAIL",
  "SKIPPED"
];

export type OfflineScenarioExecutionInput = {
  appVersion: string;
  browser: string;
  conflictResult: string;
  deviceModel: string;
  entryCount: number;
  firestoreDocumentCount: number;
  id: OfflineScenarioId;
  offlineDurationMinutes: number;
  result: OfflineScenarioResult;
  stateAfter: string;
  stateBefore: string;
  statusSnapshots: readonly string[];
  system: string;
};

export type OfflineScenarioExecution = OfflineScenarioExecutionInput & {
  statusSnapshots: string[];
};

export type OfflineScenarioReport = {
  executions: OfflineScenarioExecution[];
  format: {
    name: typeof OFFLINE_SCENARIO_REPORT_FORMAT;
    version: typeof OFFLINE_SCENARIO_REPORT_VERSION;
  };
  generatedAtIso: string;
  status: OfflineScenarioReportStatus;
  summary: {
    failed: number;
    passed: number;
    skipped: number;
    total: 6;
  };
};

export function createOfflineScenarioReport({
  executions,
  generatedAtIso
}: {
  executions: readonly OfflineScenarioExecutionInput[];
  generatedAtIso: string;
}): OfflineScenarioReport {
  const normalizedGeneratedAtIso = normalizeIso(generatedAtIso);
  const byId = new Map<OfflineScenarioId, OfflineScenarioExecution>();

  for (const execution of executions) {
    if (byId.has(execution.id)) {
      throw new Error(`Raport offline zawiera duplikat scenariusza ${execution.id}.`);
    }

    byId.set(execution.id, normalizeExecution(execution));
  }

  const missing = OFFLINE_SCENARIO_IDS.filter((id) => !byId.has(id));

  if (missing.length > 0) {
    throw new Error(`Raport offline nie zawiera scenariuszy: ${missing.join(", ")}.`);
  }

  const ordered = OFFLINE_SCENARIO_IDS.map((id) => getRequiredExecution(byId, id));
  const passed = ordered.filter((execution) => execution.result === "PASS").length;
  const failed = ordered.filter((execution) => execution.result === "FAIL").length;
  const skipped = ordered.filter((execution) => execution.result === "SKIPPED").length;

  return {
    executions: ordered,
    format: {
      name: OFFLINE_SCENARIO_REPORT_FORMAT,
      version: OFFLINE_SCENARIO_REPORT_VERSION
    },
    generatedAtIso: normalizedGeneratedAtIso,
    status: failed > 0 ? "FAIL" : skipped > 0 ? "PARTIAL" : "PASS",
    summary: {
      failed,
      passed,
      skipped,
      total: 6
    }
  };
}

function normalizeExecution(
  execution: OfflineScenarioExecutionInput
): OfflineScenarioExecution {
  return {
    ...execution,
    appVersion: normalizeRequiredText(
      execution.appVersion,
      "Raport wymaga wersji aplikacji."
    ),
    browser: normalizeRequiredText(execution.browser, "Raport wymaga przegladarki."),
    conflictResult: normalizeRequiredText(
      execution.conflictResult,
      "Raport wymaga wyniku konfliktu."
    ),
    deviceModel: normalizeRequiredText(
      execution.deviceModel,
      "Raport wymaga modelu urzadzenia."
    ),
    entryCount: normalizeCount(execution.entryCount, "Liczba wpisow"),
    firestoreDocumentCount: normalizeCount(
      execution.firestoreDocumentCount,
      "Liczba dokumentow Firestore"
    ),
    offlineDurationMinutes: normalizeCount(
      execution.offlineDurationMinutes,
      "Czas offline"
    ),
    result: normalizeResult(execution.result),
    stateAfter: normalizeRequiredText(execution.stateAfter, "Raport wymaga stanu po."),
    stateBefore: normalizeRequiredText(
      execution.stateBefore,
      "Raport wymaga stanu przed."
    ),
    statusSnapshots: normalizeSnapshots(execution.statusSnapshots),
    system: normalizeRequiredText(execution.system, "Raport wymaga systemu.")
  };
}

function normalizeResult(result: OfflineScenarioResult): OfflineScenarioResult {
  if (!(OFFLINE_SCENARIO_RESULTS as readonly unknown[]).includes(result)) {
    throw new Error("Wynik scenariusza musi byc PASS, FAIL albo SKIPPED.");
  }

  return result;
}

function getRequiredExecution(
  byId: ReadonlyMap<OfflineScenarioId, OfflineScenarioExecution>,
  id: OfflineScenarioId
): OfflineScenarioExecution {
  const execution = byId.get(id);

  if (!execution) {
    throw new Error(`Raport offline nie zawiera scenariusza ${id}.`);
  }

  return execution;
}

function normalizeSnapshots(snapshots: readonly string[]): string[] {
  const normalized = snapshots.map((snapshot) =>
    normalizeRequiredText(snapshot, "Zrzut statusu nie moze byc pusty.")
  );

  if (normalized.length === 0) {
    throw new Error("Raport wymaga co najmniej jednego zrzutu statusu.");
  }

  return normalized;
}

function normalizeCount(value: number, label: string): number {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error(`${label} musi byc nieujemna liczba calkowita.`);
  }

  return value;
}

function normalizeIso(value: string): string {
  const normalized = normalizeRequiredText(value, "Raport wymaga czasu wygenerowania.");

  if (Number.isNaN(Date.parse(normalized))) {
    throw new Error("Czas wygenerowania raportu musi byc poprawnym ISO.");
  }

  return normalized;
}

function normalizeRequiredText(value: string, message: string): string {
  const normalized = value.trim();

  if (!normalized) {
    throw new Error(message);
  }

  return normalized;
}
