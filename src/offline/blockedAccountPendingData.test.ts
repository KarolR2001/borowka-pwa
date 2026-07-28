import type { UserProfile } from "../domain/identity";
import { buildSyncCenterModel } from "./syncCenter";
import {
  BLOCKED_ACCOUNT_PENDING_DATA_RESOLUTION_OPTIONS,
  evaluateBlockedAccountPendingData
} from "./blockedAccountPendingData";

describe("blocked account with pending local data", () => {
  it("stops automatic retry and prepares an admin handoff when blocked account has pending documents", () => {
    const result = evaluateBlockedAccountPendingData({
      currentDeviceId: " device-1 ",
      profile: profile({
        active: false,
        registrationStatus: "BLOCKED"
      }),
      model: buildSyncCenterModel([
        {
          id: "session-pending",
          kind: "HARVEST_SESSION",
          workerName: "Anna Test",
          businessDate: "2026-07-17",
          businessStatus: "OPEN",
          pendingSync: true
        },
        {
          id: "entry-rejected",
          kind: "HARVEST_ENTRY",
          sessionId: "session-pending",
          workerName: "Anna Test",
          businessDate: "2026-07-17",
          businessStatus: "OPEN",
          rejectedReason: "permission-denied: Konto jest zablokowane."
        }
      ])
    });

    expect(result).toEqual({
      adminHandoff: {
        deviceId: "device-1",
        documentIds: ["entry-rejected", "session-pending"],
        email: "operator@example.test",
        pendingDocumentCount: 2,
        sessionIds: ["session-pending"],
        userUid: "operator-1"
      },
      automaticRetryAllowed: false,
      emergencyExportRequired: true,
      localDataPreserved: true,
      message:
        "Konto jest zablokowane, a urzadzenie ma lokalne dane oczekujace. Dane pozostaja lokalnie, automatyczne ponawianie jest wstrzymane i wymagany jest eksport awaryjny albo decyzja administratora.",
      paymentBlocked: true,
      resolutionOptions: BLOCKED_ACCOUNT_PENDING_DATA_RESOLUTION_OPTIONS,
      status: "BLOCKED_ACCOUNT_PENDING_DATA"
    });
  });

  it("allows normal synchronization when account is active or there are no pending documents", () => {
    const emptyModel = buildSyncCenterModel([]);

    expect(
      evaluateBlockedAccountPendingData({
        currentDeviceId: "device-1",
        profile: profile(),
        model: emptyModel
      })
    ).toEqual({
      adminHandoff: null,
      automaticRetryAllowed: true,
      emergencyExportRequired: false,
      localDataPreserved: true,
      message: "Konto moze kontynuowac standardowa synchronizacje.",
      paymentBlocked: false,
      resolutionOptions: [],
      status: "ACCOUNT_CAN_CONTINUE"
    });

    expect(
      evaluateBlockedAccountPendingData({
        currentDeviceId: "device-1",
        profile: profile({
          active: false,
          registrationStatus: "BLOCKED"
        }),
        model: emptyModel
      }).status
    ).toBe("ACCOUNT_CAN_CONTINUE");
  });

  it("requires a device id for admin handoff", () => {
    expect(() =>
      evaluateBlockedAccountPendingData({
        currentDeviceId: " ",
        profile: profile({
          active: false,
          registrationStatus: "BLOCKED"
        }),
        model: buildSyncCenterModel([
          {
            id: "session-pending",
            kind: "HARVEST_SESSION",
            pendingSync: true
          }
        ])
      })
    ).toThrow("Blokada konta z danymi lokalnymi wymaga urzadzenia.");
  });
});

function profile(overrides: Partial<UserProfile> = {}): UserProfile {
  return {
    uid: "operator-1",
    email: "operator@example.test",
    displayName: "Operator Test",
    role: "OPERATOR",
    workerId: null,
    active: true,
    registrationStatus: "APPROVED",
    offlineConsent: true,
    ...overrides
  };
}
