import {
  verifyLongOfflineRun,
  type LongOfflineEntrySnapshot,
  type LongOfflineSessionSnapshot
} from "./longOfflineVerification";

describe("long offline verification", () => {
  it("passes six hours, four sessions, one hundred entries and two interruptions", () => {
    const localSessions = createSessions();
    const localEntries = createEntries();
    const result = verifyLongOfflineRun({
      configuration: {
        beforeRevision: 7,
        afterRevision: 8,
        changedDeviceId: "device-b",
        currentDeviceId: "device-a"
      },
      interruptionCount: 2,
      localEntries,
      localSessions,
      offlineStartedAtIso: "2026-07-17T02:00:00.000Z",
      recoveredAtIso: "2026-07-17T08:00:00.000Z",
      restartCount: 1,
      serverEntries: [...localEntries].reverse(),
      serverSessions: [...localSessions].reverse()
    });

    expect(result).toEqual({
      findings: [],
      metrics: {
        durationMinutes: 360,
        entryCount: 100,
        interruptionCount: 2,
        quantityMilli: 100_000,
        restartCount: 1,
        sessionCount: 4,
        weightG: 100_000
      },
      status: "PASS"
    });
  });

  it("fails when a UUID, sum, status or remote configuration evidence differs", () => {
    const localSessions = createSessions();
    const localEntries = createEntries();
    const result = verifyLongOfflineRun({
      configuration: {
        beforeRevision: 7,
        afterRevision: 7,
        changedDeviceId: "device-a",
        currentDeviceId: "device-a"
      },
      interruptionCount: 1,
      localEntries,
      localSessions,
      offlineStartedAtIso: "2026-07-17T07:00:00.000Z",
      recoveredAtIso: "2026-07-17T08:00:00.000Z",
      restartCount: 0,
      serverEntries: localEntries.slice(1),
      serverSessions: localSessions.map((session, index) =>
        index === 0 ? { ...session, status: "OPEN" } : session
      )
    });

    expect(result.status).toBe("FAIL");
    expect(result.findings).toEqual(
      expect.arrayContaining([
        "OFFLINE_DURATION_TOO_SHORT",
        "RESTART_NOT_CONFIRMED",
        "TOO_FEW_INTERRUPTION_ATTEMPTS",
        "CONFIGURATION_REVISION_NOT_CHANGED",
        "CONFIGURATION_NOT_CHANGED_ON_OTHER_DEVICE",
        "ENTRY_SNAPSHOTS_DIFFER",
        "SESSION_SNAPSHOTS_DIFFER",
        "QUANTITY_SUM_DIFFERS",
        "WEIGHT_SUM_DIFFERS"
      ])
    );
  });
});

function createSessions(): LongOfflineSessionSnapshot[] {
  return Array.from({ length: 4 }, (_, index) => ({
    id: `session-${String(index + 1)}`,
    status: index < 2 ? "CLOSED" : "OPEN"
  }));
}

function createEntries(): LongOfflineEntrySnapshot[] {
  return Array.from({ length: 100 }, (_, index) => ({
    id: `entry-${String(index + 1)}`,
    quantityMilli: 1000,
    status: "ACTIVE",
    weightG: 1000
  }));
}
