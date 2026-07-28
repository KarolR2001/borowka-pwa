import {
  evaluateSyncDocumentMetadata,
  summarizeSyncDocumentMetadata,
  type SyncDocumentMetadataInput
} from "./pendingWriteMetadata";

describe("pending write metadata", () => {
  it("reports a locally saved document before Firestore queue metadata is available", () => {
    const result = evaluateSyncDocumentMetadata({
      id: "session-local",
      kind: "HARVEST_SESSION",
      sessionId: "session-local",
      workerName: "Anna Test",
      businessDate: "2026-07-17",
      localSnapshot: {
        id: "session-local",
        rateGroszSnapshot: 650
      },
      savedLocally: true,
      lastLocalWriteIso: "2026-07-17T10:00:00.000Z"
    });

    expect(result).toMatchObject({
      id: "session-local",
      kind: "HARVEST_SESSION",
      localSnapshot: {
        id: "session-local",
        rateGroszSnapshot: 650
      },
      sessionId: "session-local",
      workerName: "Anna Test",
      businessDate: "2026-07-17",
      status: "LOCAL_SAVED",
      label: "Zapisany lokalnie",
      tone: "warn",
      pendingSync: false,
      savedLocally: true,
      lastLocalWriteIso: "2026-07-17T10:00:00.000Z"
    });
    expect(result.details).toContain(
      "Dokument zostal przyjety lokalnie, ale aplikacja nie ma jeszcze metadanych kolejki Firestore."
    );
  });

  it("reports pending sync from Firestore metadata or a domain pending flag", () => {
    const firestorePending = evaluateSyncDocumentMetadata({
      id: "entry-firestore-pending",
      kind: "HARVEST_ENTRY",
      firestoreMetadata: {
        hasPendingWrites: true,
        fromCache: true
      },
      lastLocalWriteIso: "2026-07-17T10:05:00.000Z"
    });

    expect(firestorePending).toMatchObject({
      status: "PENDING_SYNC",
      label: "Oczekuje synchronizacji",
      tone: "warn",
      pendingSync: true
    });
    expect(firestorePending.details).toContain(
      "Firestore raportuje lokalny zapis oczekujacy."
    );
    expect(firestorePending.details).toContain("Odczyt pochodzi z lokalnego cache.");
    expect(
      evaluateSyncDocumentMetadata({
        id: "entry-domain-pending",
        kind: "HARVEST_ENTRY",
        pendingSync: true
      })
    ).toMatchObject({
      status: "PENDING_SYNC",
      pendingSync: true
    });
  });

  it("reports synced documents with the last successful synchronization time", () => {
    const result = evaluateSyncDocumentMetadata({
      id: "entry-synced",
      kind: "HARVEST_ENTRY",
      firestoreMetadata: {
        hasPendingWrites: false,
        fromCache: false
      },
      lastSuccessfulSyncIso: "2026-07-17T10:10:00.000Z"
    });

    expect(result).toMatchObject({
      status: "SYNCED",
      label: "Zsynchronizowany",
      tone: "ok",
      pendingSync: false,
      lastSuccessfulSyncIso: "2026-07-17T10:10:00.000Z"
    });
    expect(result.details).toContain(
      "Ostatnia udana synchronizacja: 2026-07-17T10:10:00.000Z."
    );
  });

  it("prioritizes rejected writes and remote changes over pending metadata", () => {
    expect(
      evaluateSyncDocumentMetadata({
        id: "entry-rejected",
        kind: "HARVEST_ENTRY",
        pendingSync: true,
        rejectedReason: "Rules odrzucily zapis po zmianie roli."
      })
    ).toMatchObject({
      status: "REJECTED",
      label: "Odrzucony",
      tone: "error",
      rejectedReason: "Rules odrzucily zapis po zmianie roli."
    });
    const remoteChanged = evaluateSyncDocumentMetadata({
      id: "session-remote",
      kind: "HARVEST_SESSION",
      pendingSync: true,
      remoteChanged: true,
      remoteDeviceId: "device-2",
      currentDeviceId: "device-1"
    });

    expect(remoteChanged).toMatchObject({
      status: "REMOTE_CHANGED",
      label: "Zmieniony na innym urzadzeniu",
      tone: "warn",
      remoteDeviceId: "device-2",
      currentDeviceId: "device-1"
    });
    expect(remoteChanged.details).toContain(
      "Nowsza zmiana pochodzi z urzadzenia device-2."
    );
  });

  it("summarizes counts, actionable errors and latest sync time for the sync center", () => {
    const inputs: SyncDocumentMetadataInput[] = [
      {
        id: "entry-pending",
        kind: "HARVEST_ENTRY",
        sessionId: "session-1",
        pendingSync: true
      },
      {
        id: "session-local",
        kind: "HARVEST_SESSION",
        sessionId: "session-1",
        savedLocally: true
      },
      {
        id: "entry-rejected",
        kind: "HARVEST_ENTRY",
        sessionId: "session-2",
        rejectedReason: "Brak uprawnien."
      },
      {
        id: "session-remote",
        kind: "HARVEST_SESSION",
        sessionId: "session-3",
        remoteChanged: true
      },
      {
        id: "entry-synced",
        kind: "HARVEST_ENTRY",
        sessionId: "session-4",
        lastSuccessfulSyncIso: "2026-07-17T10:10:00.000Z"
      },
      {
        id: "audit-synced",
        kind: "AUDIT_EVENT",
        sessionId: "session-4",
        lastSuccessfulSyncIso: "2026-07-17T10:15:00.000Z"
      }
    ];

    const summary = summarizeSyncDocumentMetadata(inputs);

    expect(summary).toMatchObject({
      totalDocumentCount: 6,
      localSavedCount: 1,
      pendingSyncCount: 1,
      syncedCount: 2,
      rejectedCount: 1,
      remoteChangedCount: 1,
      actionableErrorCount: 2,
      lastSuccessfulSyncIso: "2026-07-17T10:15:00.000Z"
    });
    expect(summary.documents.map((document) => document.status)).toEqual([
      "REJECTED",
      "REMOTE_CHANGED",
      "PENDING_SYNC",
      "LOCAL_SAVED",
      "SYNCED",
      "SYNCED"
    ]);
  });

  it("validates required identifiers and sync timestamps", () => {
    expect(() =>
      evaluateSyncDocumentMetadata({
        id: " ",
        kind: "HARVEST_ENTRY"
      })
    ).toThrow("Dokument synchronizacji wymaga ID.");
    expect(() =>
      evaluateSyncDocumentMetadata({
        id: "entry-invalid-time",
        kind: "HARVEST_ENTRY",
        lastSuccessfulSyncIso: "not-a-date"
      })
    ).toThrow("Czas synchronizacji musi byc poprawnym ISO.");
  });
});
