import {
  DEVICE_CLEAR_CONFIRMATION,
  buildSafeSignOutModel,
  canConfirmDeviceClear
} from "./safeSignOut";

describe("safe sign out", () => {
  it("allows immediate sign out when all local documents are synchronized", () => {
    const model = buildSafeSignOutModel(
      [
        {
          id: "entry-1",
          kind: "HARVEST_ENTRY",
          sessionId: "session-1",
          savedLocally: false,
          pendingSync: false
        }
      ],
      "ADMIN"
    );

    expect(model).toMatchObject({
      canClearDevice: true,
      canSignOut: true,
      pendingDocumentCount: 0,
      status: "CLEAR_TO_SIGN_OUT"
    });
  });

  it("counts pending documents and groups affected harvest sessions", () => {
    const model = buildSafeSignOutModel(
      [
        {
          id: "session-1",
          kind: "HARVEST_SESSION",
          workerName: "Anna Test",
          businessDate: "2026-07-28",
          savedLocally: true
        },
        {
          id: "entry-1",
          kind: "HARVEST_ENTRY",
          sessionId: "session-1",
          workerName: "Anna Test",
          businessDate: "2026-07-28",
          pendingSync: true
        },
        {
          id: "audit-1",
          kind: "AUDIT_EVENT",
          rejectedReason: "Brak uprawnien."
        }
      ],
      "OPERATOR"
    );

    expect(model).toMatchObject({
      canClearDevice: false,
      canSignOut: false,
      pendingDocumentCount: 3,
      status: "PENDING_DATA",
      unassignedPendingDocumentCount: 1
    });
    expect(model.sessions).toEqual([
      expect.objectContaining({
        businessDate: "2026-07-28",
        pendingDocumentCount: 2,
        sessionId: "session-1",
        workerName: "Anna Test"
      })
    ]);
  });

  it("requires an exact confirmation from an authorized role before clearing", () => {
    const adminModel = buildSafeSignOutModel([], "ADMIN");
    const pickerModel = buildSafeSignOutModel([], "PICKER");

    expect(canConfirmDeviceClear(adminModel, "inne")).toBe(false);
    expect(canConfirmDeviceClear(adminModel, DEVICE_CLEAR_CONFIRMATION)).toBe(true);
    expect(canConfirmDeviceClear(pickerModel, DEVICE_CLEAR_CONFIRMATION)).toBe(false);
  });

  it("blocks clearing while a rejected or remotely changed document is unresolved", () => {
    const model = buildSafeSignOutModel(
      [
        {
          id: "entry-rejected",
          kind: "HARVEST_ENTRY",
          rejectedReason: "Konflikt wersji."
        },
        {
          id: "entry-remote",
          kind: "HARVEST_ENTRY",
          remoteChanged: true
        }
      ],
      "ADMIN"
    );

    expect(model.pendingDocumentCount).toBe(2);
    expect(model.canSignOut).toBe(false);
    expect(model.canClearDevice).toBe(false);
  });
});
