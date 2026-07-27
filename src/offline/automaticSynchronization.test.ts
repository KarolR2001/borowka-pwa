import {
  AUTOMATIC_SYNC_REOPEN_INSTRUCTION,
  createSynchronizationRequest,
  evaluateSynchronizationTrigger
} from "./automaticSynchronization";

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
});
