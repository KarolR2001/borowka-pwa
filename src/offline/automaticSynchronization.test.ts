import {
  AUTOMATIC_SYNC_REOPEN_INSTRUCTION,
  createFirestoreSynchronizationApi,
  createSynchronizationRequest,
  evaluateSynchronizationTrigger
} from "./automaticSynchronization";
import { createMemoryFirestoreSyncJournal } from "./firestoreSyncJournal";

describe("automatic synchronization trigger policy", () => {
  it("starts automatic synchronization when the app is open, online and local data exists", () => {
    expect(
      evaluateSynchronizationTrigger({
        authReady: true,
        hasLocalDataForAccount: true,
        inFlight: false,
        isOnline: true,
        isVisible: true,
        trigger: "ONLINE_RESTORED"
      })
    ).toEqual({
      shouldRun: true,
      trigger: "ONLINE_RESTORED",
      message: "Synchronizacja uruchomiona po odzyskaniu polaczenia."
    });
  });

  it("skips automatic triggers when the active account has no local data", () => {
    expect(
      evaluateSynchronizationTrigger({
        authReady: true,
        hasLocalDataForAccount: false,
        inFlight: false,
        isOnline: true,
        isVisible: true,
        trigger: "APP_START"
      })
    ).toEqual({
      shouldRun: false,
      trigger: "APP_START",
      reason: "NO_LOCAL_DATA",
      message: "Brak lokalnych dokumentow wymagajacych synchronizacji.",
      requiresOpenPwa: false
    });
  });

  it("allows manual retry to ask the runtime even before local metadata is refreshed", () => {
    expect(
      evaluateSynchronizationTrigger({
        authReady: true,
        hasLocalDataForAccount: false,
        inFlight: false,
        isOnline: true,
        isVisible: true,
        trigger: "MANUAL_RETRY"
      })
    ).toEqual({
      shouldRun: true,
      trigger: "MANUAL_RETRY",
      message: "Synchronizacja uruchomiona recznie."
    });
  });

  it("blocks synchronization when the PWA is not open and exposes the reopen instruction", () => {
    expect(
      evaluateSynchronizationTrigger({
        authReady: true,
        hasLocalDataForAccount: true,
        inFlight: false,
        isOnline: true,
        isVisible: false,
        trigger: "APP_ACTIVATED"
      })
    ).toEqual({
      shouldRun: false,
      trigger: "APP_ACTIVATED",
      reason: "APP_NOT_ACTIVE",
      message: AUTOMATIC_SYNC_REOPEN_INSTRUCTION,
      requiresOpenPwa: true
    });
  });

  it("blocks duplicate triggers while synchronization is already running", () => {
    expect(
      evaluateSynchronizationTrigger({
        authReady: true,
        hasLocalDataForAccount: true,
        inFlight: true,
        isOnline: true,
        isVisible: true,
        trigger: "AUTH_LOCAL_DATA_READY"
      })
    ).toEqual({
      shouldRun: false,
      trigger: "AUTH_LOCAL_DATA_READY",
      reason: "IN_FLIGHT",
      message: "Synchronizacja juz trwa.",
      requiresOpenPwa: false
    });
  });

  it("creates a validated synchronization request for the runtime", () => {
    expect(
      createSynchronizationRequest({
        deviceId: " device-1 ",
        pendingDocumentCount: 3,
        requestedAtIso: "2026-07-17T12:00:00.000Z",
        trigger: "AUTH_LOCAL_DATA_READY",
        userRole: "OPERATOR",
        userUid: " operator-1 "
      })
    ).toEqual({
      deviceId: "device-1",
      pendingDocumentCount: 3,
      requestedAtIso: "2026-07-17T12:00:00.000Z",
      trigger: "AUTH_LOCAL_DATA_READY",
      userRole: "OPERATOR",
      userUid: "operator-1"
    });
  });

  it("preserves 100 entries through two interrupted long-offline retries", async () => {
    const journal = createMemoryFirestoreSyncJournal();
    const account = {
      deviceId: "device-long-offline",
      userUid: "operator-long-offline"
    };

    for (let sessionIndex = 0; sessionIndex < 4; sessionIndex += 1) {
      const sessionId = `session-${String(sessionIndex + 1)}`;

      await journal.put({
        ...account,
        id: sessionId,
        kind: "HARVEST_SESSION",
        localSnapshot: {
          id: sessionId,
          status: sessionIndex < 2 ? "CLOSED" : "OPEN"
        },
        sessionId,
        businessStatus: sessionIndex < 2 ? "CLOSED" : "OPEN"
      });

      for (let entryIndex = 0; entryIndex < 25; entryIndex += 1) {
        const id = `${sessionId}-entry-${String(entryIndex + 1)}`;

        await journal.put({
          ...account,
          id,
          kind: "HARVEST_ENTRY",
          localSnapshot: {
            id,
            quantityMilli: 1000,
            weightG: 1000
          },
          sessionId
        });
      }
    }

    const flushPendingWrites = vi
      .fn<() => Promise<void>>()
      .mockRejectedValueOnce(new Error("Slaba siec: przerwanie 1."))
      .mockRejectedValueOnce(new Error("Slaba siec: przerwanie 2."))
      .mockResolvedValue(undefined);
    const confirmRecordOnServer = vi.fn().mockResolvedValue(true);
    const api = createFirestoreSynchronizationApi(journal, {
      flushPendingWrites,
      confirmRecordOnServer,
      now: () => new Date("2026-07-17T08:00:00.000Z")
    });
    const request = createSynchronizationRequest({
      ...account,
      pendingDocumentCount: 104,
      requestedAtIso: "2026-07-17T02:00:00.000Z",
      trigger: "MANUAL_RETRY",
      userRole: "OPERATOR"
    });

    expect((await api.synchronize({}, request)).status).toBe("FAILED");
    expect(await journal.list(account)).toHaveLength(104);
    expect((await api.synchronize({}, request)).status).toBe("FAILED");
    expect(await journal.list(account)).toHaveLength(104);

    const recovered = await api.synchronize({}, request);

    expect(recovered).toMatchObject({
      status: "SUCCESS",
      finishedAtIso: "2026-07-17T08:00:00.000Z"
    });
    expect(await journal.list(account)).toEqual([]);
    expect(flushPendingWrites).toHaveBeenCalledTimes(3);
    expect(confirmRecordOnServer).toHaveBeenCalledTimes(104);
  });

  it("confirms and removes an offline picker issue report", async () => {
    const journal = createMemoryFirestoreSyncJournal();
    const account = {
      deviceId: "device-picker",
      userUid: "picker-1"
    };
    await journal.put({
      ...account,
      businessStatus: "OPEN",
      id: "report-1",
      kind: "ISSUE_REPORT",
      localSnapshot: { id: "report-1", status: "OPEN" },
      sessionId: "session-1"
    });
    const confirmRecordOnServer = vi.fn().mockResolvedValue(true);
    const api = createFirestoreSynchronizationApi(journal, {
      confirmRecordOnServer,
      flushPendingWrites: vi.fn().mockResolvedValue(undefined)
    });

    const result = await api.synchronize(
      {},
      createSynchronizationRequest({
        ...account,
        pendingDocumentCount: 1,
        requestedAtIso: "2026-07-29T08:00:00.000Z",
        trigger: "ONLINE_RESTORED",
        userRole: "PICKER"
      })
    );

    expect(result.status).toBe("SUCCESS");
    expect(confirmRecordOnServer).toHaveBeenCalledWith(
      {},
      expect.objectContaining({
        id: "report-1",
        kind: "ISSUE_REPORT"
      })
    );
    expect(await journal.list(account)).toEqual([]);
  });
});
