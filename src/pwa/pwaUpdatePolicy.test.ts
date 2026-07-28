import {
  PWA_UPDATE_INTENT_FORMAT,
  PWA_UPDATE_INTENT_VERSION,
  createBrowserPwaUpdateIntentStorage,
  createPwaUpdateIntent,
  evaluatePwaUpdateDecision,
  runPwaUpdateIntegrityCheck
} from "./pwaUpdatePolicy";

describe("PWA update policy", () => {
  it("allows an update only at a safe moment", () => {
    expect(
      evaluatePwaUpdateDecision({
        hasActiveForm: false,
        hasActiveHarvestSession: false,
        syncDocuments: [
          {
            id: "entry-synced",
            kind: "HARVEST_ENTRY"
          }
        ]
      })
    ).toMatchObject({
      blockers: [],
      canApplyUpdate: true,
      pendingDocumentCount: 0,
      status: "READY"
    });
  });

  it("defers for an active form, active session and every unresolved local status", () => {
    const decision = evaluatePwaUpdateDecision({
      hasActiveForm: true,
      hasActiveHarvestSession: true,
      syncDocuments: [
        {
          id: "entry-local",
          kind: "HARVEST_ENTRY",
          savedLocally: true
        },
        {
          id: "entry-pending",
          kind: "HARVEST_ENTRY",
          pendingSync: true
        },
        {
          id: "entry-rejected",
          kind: "HARVEST_ENTRY",
          rejectedReason: "Blad serwera."
        },
        {
          id: "entry-remote",
          kind: "HARVEST_ENTRY",
          remoteChanged: true
        }
      ]
    });

    expect(decision.canApplyUpdate).toBe(false);
    expect(decision.pendingDocumentCount).toBe(4);
    expect(decision.blockers.map((blocker) => blocker.code)).toEqual([
      "ACTIVE_FORM",
      "ACTIVE_HARVEST_SESSION",
      "PENDING_LOCAL_DATA"
    ]);
  });

  it("stores a versioned intent without changing local document UUIDs", () => {
    const storage = createBrowserPwaUpdateIntentStorage(localStorage);
    localStorage.setItem("firebase:firestore-cache", "preserve");
    const intent = createPwaUpdateIntent({
      appVersion: "0.1.0",
      deviceId: "device-1",
      requestedAt: new Date("2026-07-28T08:00:00.000Z"),
      schemaVersion: "schema-0001",
      syncDocuments: [
        { id: "entry-b", kind: "HARVEST_ENTRY", pendingSync: true },
        { id: "entry-a", kind: "HARVEST_ENTRY", savedLocally: true }
      ],
      userUid: "operator-1"
    });

    storage.write(intent);

    expect(storage.read()).toEqual({
      appVersion: "0.1.0",
      deviceId: "device-1",
      expectedLocalDocumentIds: ["entry-a", "entry-b"],
      format: PWA_UPDATE_INTENT_FORMAT,
      formatVersion: PWA_UPDATE_INTENT_VERSION,
      requestedAtIso: "2026-07-28T08:00:00.000Z",
      schemaVersion: "schema-0001",
      userUid: "operator-1"
    });

    storage.clear();
    expect(storage.read()).toBeNull();
    expect(localStorage.getItem("firebase:firestore-cache")).toBe("preserve");
  });

  it("runs a controlled schema migration and verifies device and local IDs", async () => {
    const migrate = vi.fn().mockResolvedValue(undefined);
    const report = await runPwaUpdateIntegrityCheck({
      checkedAt: new Date("2026-07-28T08:05:00.000Z"),
      currentDeviceId: "device-1",
      currentLocalDocumentIds: ["entry-a"],
      currentSchemaVersion: "schema-0002",
      intent: createPwaUpdateIntent({
        appVersion: "0.1.0",
        deviceId: "device-1",
        schemaVersion: "schema-0001",
        syncDocuments: [{ id: "entry-a", kind: "HARVEST_ENTRY", pendingSync: true }],
        userUid: "operator-1"
      }),
      migrations: [
        {
          fromSchemaVersion: "schema-0001",
          migrate,
          toSchemaVersion: "schema-0002"
        }
      ]
    });

    expect(migrate).toHaveBeenCalled();
    expect(report).toMatchObject({
      issues: [],
      migratedSchemaVersions: ["schema-0002"],
      status: "READY"
    });
  });

  it("requires review when local IDs disappear or schema migration is missing", async () => {
    const report = await runPwaUpdateIntegrityCheck({
      currentDeviceId: "device-other",
      currentLocalDocumentIds: [],
      currentSchemaVersion: "schema-0002",
      intent: createPwaUpdateIntent({
        appVersion: "0.1.0",
        deviceId: "device-1",
        schemaVersion: "schema-0001",
        syncDocuments: [{ id: "entry-a", kind: "HARVEST_ENTRY", pendingSync: true }],
        userUid: "operator-1"
      })
    });

    expect(report.status).toBe("REVIEW_REQUIRED");
    expect(report.issues.map((issue) => issue.code)).toEqual([
      "DEVICE_CHANGED",
      "LOCAL_DOCUMENT_MISSING",
      "SCHEMA_MIGRATION_MISSING"
    ]);
  });
});
