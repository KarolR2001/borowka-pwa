import {
  DEVICE_CONFLICT_RESOLUTION_OPTIONS,
  evaluateDeviceConflict,
  type DeviceConflictEntrySnapshot,
  type DeviceConflictSessionSnapshot
} from "./deviceConflict";

describe("two device offline conflict", () => {
  it("detects independent sessions for the same worker and date without merging them", () => {
    const result = evaluateDeviceConflict({
      currentDeviceId: "device-1",
      localSession: session({ id: "session-local", createdDeviceId: "device-1" }),
      otherSessionsSameBusinessKey: [
        session({ id: "session-remote", createdDeviceId: "device-2" })
      ],
      entries: []
    });

    expect(result).toMatchObject({
      adminReview: {
        primaryActionLabel: "Przejrzyj konflikt urzadzen",
        required: true,
        resolutionOptions: DEVICE_CONFLICT_RESOLUTION_OPTIONS,
        title: "Konflikt pracy na dwoch urzadzeniach"
      },
      automaticMergeAllowed: false,
      businessKey: "worker-1:2026-07-17",
      entriesPreserved: true,
      paymentBlocked: true,
      recommendedSessionStatus: "REVIEW_REQUIRED",
      sessionsPreserved: true,
      status: "DEVICE_REVIEW_REQUIRED"
    });
    expect(result.findings).toEqual([
      expect.objectContaining({
        code: "POSSIBLE_BUSINESS_DUPLICATE",
        deviceIds: ["device-1", "device-2"],
        sessionIds: ["session-local", "session-remote"],
        severity: "REVIEW_REQUIRED"
      })
    ]);
  });

  it("detects the same session changed on another device with a newer revision", () => {
    const result = evaluateDeviceConflict({
      currentDeviceId: "device-1",
      localSession: session({
        id: "session-1",
        createdDeviceId: "device-1",
        revision: 1
      }),
      remoteSession: session({
        id: "session-1",
        createdDeviceId: "device-2",
        revision: 2
      }),
      entries: []
    });

    expect(result.status).toBe("DEVICE_REVIEW_REQUIRED");
    expect(result.paymentBlocked).toBe(true);
    expect(result.findings.map((finding) => finding.code)).toEqual([
      "SAME_SESSION_CHANGED_ON_OTHER_DEVICE",
      "SESSION_REVISION_DIVERGED"
    ]);
  });

  it("blocks payment when one device closed the session and another has pending entries", () => {
    const result = evaluateDeviceConflict({
      currentDeviceId: "device-2",
      localSession: session({
        id: "session-1",
        createdDeviceId: "device-2",
        status: "OPEN",
        revision: 1
      }),
      remoteSession: session({
        id: "session-1",
        closedDeviceId: "device-1",
        createdDeviceId: "device-1",
        status: "CLOSED",
        revision: 2
      }),
      entries: [
        entry({
          createdDeviceId: "device-2",
          id: "entry-after-close",
          pendingSync: true,
          sessionId: "session-1"
        })
      ]
    });

    expect(result.status).toBe("DEVICE_REVIEW_REQUIRED");
    expect(result.recommendedSessionStatus).toBe("REVIEW_REQUIRED");
    expect(result.paymentBlocked).toBe(true);
    expect(result.entriesPreserved).toBe(true);
    expect(result.findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "ENTRY_AFTER_REMOTE_CLOSE",
          deviceIds: ["device-2"],
          entryIds: ["entry-after-close"],
          severity: "REVIEW_REQUIRED"
        })
      ])
    );
  });

  it("tracks entries from multiple devices without requiring review by itself", () => {
    const result = evaluateDeviceConflict({
      currentDeviceId: "device-1",
      localSession: session({ id: "session-1", createdDeviceId: "device-1" }),
      entries: [
        entry({ id: "entry-1", createdDeviceId: "device-1", sessionId: "session-1" }),
        entry({ id: "entry-2", createdDeviceId: "device-2", sessionId: "session-1" })
      ]
    });

    expect(result).toMatchObject({
      adminReview: {
        primaryActionLabel: "Brak przegladu",
        required: false,
        resolutionOptions: [],
        title: "Brak konfliktu urzadzen"
      },
      paymentBlocked: false,
      recommendedSessionStatus: "OPEN",
      status: "MULTI_DEVICE_ENTRIES_TRACKED"
    });
    expect(result.findings).toEqual([
      expect.objectContaining({
        code: "MULTI_DEVICE_ENTRIES",
        deviceIds: ["device-1", "device-2"],
        entryIds: ["entry-1", "entry-2"],
        severity: "INFO"
      })
    ]);
  });

  it("validates session and entry identifiers before creating a review result", () => {
    expect(() =>
      evaluateDeviceConflict({
        currentDeviceId: "device-1",
        localSession: session({ id: " " }),
        entries: []
      })
    ).toThrow("Sesja konfliktu urzadzen wymaga ID.");

    expect(() =>
      evaluateDeviceConflict({
        currentDeviceId: "device-1",
        localSession: session(),
        entries: [entry({ sequenceNumber: 0 })]
      })
    ).toThrow("Numer wpisu konfliktu urzadzen musi byc dodatni.");
  });
});

function session(
  overrides: Partial<DeviceConflictSessionSnapshot> = {}
): DeviceConflictSessionSnapshot {
  return {
    businessDate: "2026-07-17",
    closedDeviceId: null,
    createdDeviceId: "device-1",
    id: "session-1",
    pendingSync: false,
    revision: 1,
    status: "OPEN",
    totalEntryCount: 0,
    workerId: "worker-1",
    workerNameSnapshot: "Anna Test",
    ...overrides
  };
}

function entry(
  overrides: Partial<DeviceConflictEntrySnapshot> = {}
): DeviceConflictEntrySnapshot {
  return {
    createdDeviceId: "device-1",
    id: "entry-1",
    pendingSync: false,
    sequenceNumber: 1,
    sessionId: "session-1",
    status: "ACTIVE",
    ...overrides
  };
}
