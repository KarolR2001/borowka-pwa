import { APP_META } from "../config/appMeta";
import {
  createEmergencyLocalExportFilename,
  createEmergencyLocalExportPayload,
  EMERGENCY_LOCAL_EXPORT_WARNING
} from "./emergencyLocalExport";
import { buildSyncCenterModel } from "./syncCenter";

describe("emergency local export", () => {
  it("exports recovery metadata, local snapshots, UUIDs, statuses and sync errors", () => {
    const model = buildSyncCenterModel([
      {
        id: "session-uuid-1",
        kind: "HARVEST_SESSION",
        localSnapshot: {
          id: "session-uuid-1",
          planIdSnapshot: "plan-weight",
          rateGroszSnapshot: 650,
          status: "CLOSED"
        },
        workerName: "Anna Test",
        businessDate: "2026-07-17",
        businessStatus: "CLOSED",
        pendingSync: true,
        savedLocally: true,
        currentDeviceId: "device-1",
        lastLocalWriteIso: "2026-07-17T11:55:00.000Z"
      },
      {
        id: "entry-uuid-1",
        kind: "HARVEST_ENTRY",
        sessionId: "session-uuid-1",
        localSnapshot: {
          id: "entry-uuid-1",
          sessionId: "session-uuid-1",
          quantityMilli: 1000,
          weightG: 1250
        },
        rejectedReason: "Rules odrzucily wpis po blokadzie konta.",
        savedLocally: true,
        currentDeviceId: "device-1",
        lastLocalWriteIso: "2026-07-17T11:58:00.000Z"
      },
      {
        id: "audit-uuid-1",
        kind: "AUDIT_EVENT",
        sessionId: "session-uuid-1",
        localSnapshot: {
          id: "audit-uuid-1",
          action: "HARVEST_SESSION_CLOSED"
        },
        pendingSync: true
      }
    ]);

    const payload = createEmergencyLocalExportPayload({
      device: {
        id: "device-1",
        name: "Telefon operatora",
        platform: "Android"
      },
      exportedAtIso: "2026-07-17T12:00:00.000Z",
      model,
      user: {
        uid: "operator-1",
        email: "operator@example.test",
        displayName: "Operator Test",
        role: "OPERATOR",
        workerId: null,
        active: false,
        registrationStatus: "BLOCKED",
        offlineConsent: true
      }
    });

    expect(payload.application).toEqual({
      buildDate: APP_META.buildDate,
      calculationVersion: APP_META.calculationVersion,
      environment: APP_META.environment,
      name: APP_META.name,
      schemaVersion: APP_META.schemaVersion,
      version: APP_META.version
    });
    expect(payload.exportedAtIso).toBe("2026-07-17T12:00:00.000Z");
    expect(payload.device).toEqual({
      id: "device-1",
      name: "Telefon operatora",
      platform: "Android"
    });
    expect(payload.user).toMatchObject({
      active: false,
      email: "operator@example.test",
      registrationStatus: "BLOCKED",
      role: "OPERATOR",
      uid: "operator-1"
    });
    expect(payload.format).toEqual({
      automaticProductionImportAllowed: false,
      dataScope: "CURRENT_DEVICE_LOCAL_PENDING_DATA",
      name: "BOROWKA_EMERGENCY_LOCAL_EXPORT",
      purpose: "EMERGENCY_RECOVERY",
      productionImportPolicy: "CONTROLLED_REVIEW_REQUIRED",
      source: "LOCAL_DEVICE_STORAGE",
      version: 2,
      warning: EMERGENCY_LOCAL_EXPORT_WARNING
    });
    expect(payload.summary).toEqual({
      actionableErrorCount: 1,
      entryCount: 1,
      localSavedCount: 0,
      pendingSyncCount: 2,
      rejectedCount: 1,
      relatedDocumentCount: 1,
      remoteChangedCount: 0,
      sessionCount: 1,
      totalDocumentCount: 3
    });
    expect(payload.data.sessions[0]).toMatchObject({
      documentUuid: "session-uuid-1",
      kind: "HARVEST_SESSION",
      localStatus: "PENDING_SYNC",
      sessionUuid: "session-uuid-1",
      snapshot: {
        planIdSnapshot: "plan-weight",
        rateGroszSnapshot: 650
      },
      synchronization: {
        currentDeviceId: "device-1",
        lastLocalWriteIso: "2026-07-17T11:55:00.000Z",
        pendingSync: true,
        savedLocally: true
      }
    });
    expect(payload.data.entries[0]).toMatchObject({
      documentUuid: "entry-uuid-1",
      localStatus: "REJECTED",
      sessionUuid: "session-uuid-1",
      snapshot: {
        quantityMilli: 1000,
        weightG: 1250
      },
      synchronization: {
        rejectedReason: "Rules odrzucily wpis po blokadzie konta."
      }
    });
    expect(payload.data.relatedDocuments[0]).toMatchObject({
      documentUuid: "audit-uuid-1",
      kind: "AUDIT_EVENT",
      localStatus: "PENDING_SYNC",
      sessionUuid: "session-uuid-1",
      snapshot: {
        action: "HARVEST_SESSION_CLOSED"
      }
    });
    expect(() => JSON.stringify(payload)).not.toThrow();
  });

  it("creates a stable JSON filename and validates recovery identifiers", () => {
    expect(createEmergencyLocalExportFilename("2026-07-17T12:00:00.123Z")).toBe(
      "borowka-emergency-local-export-2026-07-17T12-00-00-123Z.json"
    );

    expect(() =>
      createEmergencyLocalExportPayload({
        device: {
          id: " ",
          name: "Telefon",
          platform: null
        },
        exportedAtIso: "2026-07-17T12:00:00.000Z",
        model: buildSyncCenterModel([]),
        user: {
          uid: "operator-1",
          email: "operator@example.test",
          displayName: "Operator Test",
          role: "OPERATOR",
          workerId: null,
          active: true,
          registrationStatus: "APPROVED",
          offlineConsent: true
        }
      })
    ).toThrow("Eksport awaryjny wymaga urzadzenia.");
    expect(() => createEmergencyLocalExportFilename("not-a-date")).toThrow(
      "Czas eksportu awaryjnego musi byc poprawnym ISO."
    );
  });
});
