import { buildSyncCenterModel, createEmergencySyncExportPayload } from "./syncCenter";

describe("sync center model", () => {
  it("groups pending and problematic documents by harvest session", () => {
    const model = buildSyncCenterModel([
      {
        id: "session-1",
        kind: "HARVEST_SESSION",
        workerName: "Anna Test",
        businessDate: "2026-07-17",
        businessStatus: "OPEN",
        pendingSync: true
      },
      {
        id: "entry-1",
        kind: "HARVEST_ENTRY",
        sessionId: "session-1",
        workerName: "Anna Test",
        businessDate: "2026-07-17",
        businessStatus: "OPEN",
        pendingSync: true
      },
      {
        id: "entry-2",
        kind: "HARVEST_ENTRY",
        sessionId: "session-1",
        workerName: "Anna Test",
        businessDate: "2026-07-17",
        businessStatus: "OPEN",
        lastSuccessfulSyncIso: "2026-07-17T10:00:00.000Z"
      },
      {
        id: "entry-rejected",
        kind: "HARVEST_ENTRY",
        sessionId: "session-2",
        workerName: "Bartek Test",
        businessDate: "2026-07-18",
        businessStatus: "CLOSED",
        rejectedReason: "Rules odrzucily wpis."
      },
      {
        id: "session-synced",
        kind: "HARVEST_SESSION",
        workerName: "Celina Test",
        businessDate: "2026-07-19",
        businessStatus: "OPEN",
        lastSuccessfulSyncIso: "2026-07-17T10:05:00.000Z"
      }
    ]);

    expect(model.metadataSummary).toMatchObject({
      totalDocumentCount: 5,
      pendingSyncCount: 2,
      syncedCount: 2,
      rejectedCount: 1,
      actionableErrorCount: 1,
      lastSuccessfulSyncIso: "2026-07-17T10:05:00.000Z"
    });
    expect(model.pendingSessionCount).toBe(2);
    expect(model.sessions).toEqual([
      expect.objectContaining({
        sessionId: "session-2",
        workerName: "Bartek Test",
        businessDate: "2026-07-18",
        businessStatus: "CLOSED",
        localEntryCount: 0,
        confirmedEntryCount: 0,
        pendingDocumentCount: 1,
        rejectedDocumentCount: 1,
        remoteChangedDocumentCount: 0,
        lastError: "Rules odrzucily wpis.",
        actionLabel: "Przejrzyj konflikt"
      }),
      expect.objectContaining({
        sessionId: "session-1",
        workerName: "Anna Test",
        businessDate: "2026-07-17",
        businessStatus: "OPEN",
        localEntryCount: 1,
        confirmedEntryCount: 1,
        pendingDocumentCount: 2,
        rejectedDocumentCount: 0,
        remoteChangedDocumentCount: 0,
        lastError: null,
        actionLabel: "Synchronizuj teraz"
      })
    ]);
  });

  it("summarizes remote changes as session conflicts", () => {
    const model = buildSyncCenterModel([
      {
        id: "session-remote",
        kind: "HARVEST_SESSION",
        workerName: "Anna Test",
        businessDate: "2026-07-17",
        businessStatus: "OPEN",
        remoteChanged: true,
        remoteDeviceId: "device-2",
        currentDeviceId: "device-1"
      }
    ]);

    expect(model.sessions).toEqual([
      expect.objectContaining({
        sessionId: "session-remote",
        remoteChangedDocumentCount: 1,
        lastError: "Nowsza zmiana pochodzi z urzadzenia device-2.",
        actionLabel: "Przejrzyj konflikt"
      })
    ]);
  });

  it("builds an emergency export payload without dropping pending details", () => {
    const model = buildSyncCenterModel([
      {
        id: "entry-pending",
        kind: "HARVEST_ENTRY",
        sessionId: "session-1",
        workerName: "Anna Test",
        businessDate: "2026-07-17",
        pendingSync: true
      }
    ]);
    const payload = createEmergencySyncExportPayload({
      createdAtIso: "2026-07-17T12:00:00.000Z",
      deviceId: "device-1",
      model
    });

    expect(payload).toMatchObject({
      createdAtIso: "2026-07-17T12:00:00.000Z",
      deviceId: "device-1",
      summary: {
        pendingSyncCount: 1,
        totalDocumentCount: 1
      },
      sessions: [
        {
          sessionId: "session-1",
          workerName: "Anna Test",
          pendingDocumentCount: 1
        }
      ]
    });
  });
});
