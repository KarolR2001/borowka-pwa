export type LongOfflineEntrySnapshot = {
  id: string;
  quantityMilli: number;
  status: string;
  weightG: number | null;
};

export type LongOfflineSessionSnapshot = {
  id: string;
  status: string;
};

export type LongOfflineVerification = {
  findings: string[];
  metrics: {
    durationMinutes: number;
    entryCount: number;
    interruptionCount: number;
    quantityMilli: number;
    restartCount: number;
    sessionCount: number;
    weightG: number;
  };
  status: "PASS" | "FAIL";
};

export function verifyLongOfflineRun({
  configuration,
  interruptionCount,
  localEntries,
  localSessions,
  offlineStartedAtIso,
  recoveredAtIso,
  restartCount,
  serverEntries,
  serverSessions
}: {
  configuration: {
    afterRevision: number;
    beforeRevision: number;
    changedDeviceId: string;
    currentDeviceId: string;
  };
  interruptionCount: number;
  localEntries: readonly LongOfflineEntrySnapshot[];
  localSessions: readonly LongOfflineSessionSnapshot[];
  offlineStartedAtIso: string;
  recoveredAtIso: string;
  restartCount: number;
  serverEntries: readonly LongOfflineEntrySnapshot[];
  serverSessions: readonly LongOfflineSessionSnapshot[];
}): LongOfflineVerification {
  const durationMinutes = calculateDurationMinutes(offlineStartedAtIso, recoveredAtIso);
  const findings: string[] = [];

  addFinding(durationMinutes < 180, "OFFLINE_DURATION_TOO_SHORT", findings);
  addFinding(localSessions.length < 3, "TOO_FEW_SESSIONS", findings);
  addFinding(localEntries.length < 100, "TOO_FEW_ENTRIES", findings);
  addFinding(restartCount < 1, "RESTART_NOT_CONFIRMED", findings);
  addFinding(interruptionCount < 2, "TOO_FEW_INTERRUPTION_ATTEMPTS", findings);
  addFinding(
    configuration.afterRevision <= configuration.beforeRevision,
    "CONFIGURATION_REVISION_NOT_CHANGED",
    findings
  );
  addFinding(
    normalizeId(configuration.changedDeviceId) ===
      normalizeId(configuration.currentDeviceId),
    "CONFIGURATION_NOT_CHANGED_ON_OTHER_DEVICE",
    findings
  );
  addFinding(
    !sameSnapshots(localEntries, serverEntries, compareEntries),
    "ENTRY_SNAPSHOTS_DIFFER",
    findings
  );
  addFinding(
    !sameSnapshots(localSessions, serverSessions, compareSessions),
    "SESSION_SNAPSHOTS_DIFFER",
    findings
  );

  const quantityMilli = sumEntries(localEntries, "quantityMilli");
  const weightG = sumEntries(localEntries, "weightG");

  addFinding(
    quantityMilli !== sumEntries(serverEntries, "quantityMilli"),
    "QUANTITY_SUM_DIFFERS",
    findings
  );
  addFinding(
    weightG !== sumEntries(serverEntries, "weightG"),
    "WEIGHT_SUM_DIFFERS",
    findings
  );

  return {
    findings,
    metrics: {
      durationMinutes,
      entryCount: localEntries.length,
      interruptionCount: normalizeCount(interruptionCount, "Liczba przerwan"),
      quantityMilli,
      restartCount: normalizeCount(restartCount, "Liczba restartow"),
      sessionCount: localSessions.length,
      weightG
    },
    status: findings.length === 0 ? "PASS" : "FAIL"
  };
}

function sameSnapshots<T>(
  local: readonly T[],
  server: readonly T[],
  compare: (left: T, right: T) => number
): boolean {
  if (local.length !== server.length) {
    return false;
  }

  const localSorted = [...local].sort(compare);
  const serverSorted = [...server].sort(compare);

  return localSorted.every(
    (snapshot, index) => JSON.stringify(snapshot) === JSON.stringify(serverSorted[index])
  );
}

function compareEntries(
  left: LongOfflineEntrySnapshot,
  right: LongOfflineEntrySnapshot
): number {
  return normalizeId(left.id).localeCompare(normalizeId(right.id));
}

function compareSessions(
  left: LongOfflineSessionSnapshot,
  right: LongOfflineSessionSnapshot
): number {
  return normalizeId(left.id).localeCompare(normalizeId(right.id));
}

function sumEntries(
  entries: readonly LongOfflineEntrySnapshot[],
  field: "quantityMilli" | "weightG"
): number {
  return entries.reduce((sum, entry) => {
    const value = entry[field] ?? 0;

    if (!Number.isSafeInteger(value) || value < 0 || !Number.isSafeInteger(sum + value)) {
      throw new Error("Suma dlugiego offline ma nieprawidlowy zakres.");
    }

    return sum + value;
  }, 0);
}

function calculateDurationMinutes(startIso: string, endIso: string): number {
  const start = Date.parse(normalizeIso(startIso));
  const end = Date.parse(normalizeIso(endIso));

  if (end < start) {
    throw new Error("Koniec offline nie moze byc przed poczatkiem.");
  }

  return Math.floor((end - start) / 60_000);
}

function addFinding(condition: boolean, finding: string, findings: string[]): void {
  if (condition) {
    findings.push(finding);
  }
}

function normalizeCount(value: number, label: string): number {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error(`${label} musi byc nieujemna liczba calkowita.`);
  }

  return value;
}

function normalizeId(value: string): string {
  const normalized = value.trim();

  if (!normalized) {
    throw new Error("Snapshot dlugiego offline wymaga identyfikatora.");
  }

  return normalized;
}

function normalizeIso(value: string): string {
  if (Number.isNaN(Date.parse(value))) {
    throw new Error("Czas dlugiego offline musi byc poprawnym ISO.");
  }

  return value;
}
