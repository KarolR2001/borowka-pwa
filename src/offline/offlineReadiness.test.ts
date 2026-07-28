import {
  evaluateOfflineLayerReadiness,
  offlineOverallStatusLabel
} from "./offlineReadiness";

describe("offlineReadiness", () => {
  it("reports full offline readiness only when application files and domain data are ready", () => {
    const readiness = evaluateOfflineLayerReadiness({
      applicationFilesReady: true,
      serviceWorkerSupported: true,
      configurationDataReady: true,
      storageReady: true,
      pendingWriteCount: 0,
      rejectedWriteCount: 0,
      staleDocumentCount: 0
    });

    expect(readiness).toMatchObject({
      overallStatus: "READY",
      applicationLayer: {
        status: "READY",
        label: "Pliki aplikacji gotowe"
      },
      dataLayer: {
        status: "READY",
        label: "Dane gotowe offline",
        sources: {
          CACHE: true,
          SERVER_CONFIRMED: true,
          PENDING_WRITE: false,
          REJECTED: false,
          STALE: false
        }
      }
    });
    expect(offlineOverallStatusLabel(readiness.overallStatus)).toBe("Gotowe offline");
  });

  it("keeps PWA availability separate from missing domain data", () => {
    const readiness = evaluateOfflineLayerReadiness({
      applicationFilesReady: true,
      serviceWorkerSupported: true,
      configurationDataReady: false,
      storageReady: true,
      pendingWriteCount: 0,
      rejectedWriteCount: 0,
      staleDocumentCount: 0
    });

    expect(readiness).toMatchObject({
      overallStatus: "PARTIAL",
      applicationLayer: {
        status: "READY"
      },
      dataLayer: {
        status: "NOT_READY",
        sources: {
          CACHE: false,
          SERVER_CONFIRMED: false
        }
      }
    });
    expect(readiness.dataLayer.details).toContain(
      "Brak gotowego lokalnego snapshotu danych domenowych."
    );
  });

  it("distinguishes pending, rejected and stale data sources", () => {
    const readiness = evaluateOfflineLayerReadiness({
      applicationFilesReady: false,
      serviceWorkerSupported: true,
      configurationDataReady: true,
      storageReady: true,
      pendingWriteCount: 2,
      rejectedWriteCount: 1,
      staleDocumentCount: 3
    });

    expect(readiness).toMatchObject({
      overallStatus: "NOT_READY",
      applicationLayer: {
        status: "NOT_READY"
      },
      dataLayer: {
        status: "NOT_READY",
        sources: {
          CACHE: true,
          PENDING_WRITE: true,
          SERVER_CONFIRMED: false,
          REJECTED: true,
          STALE: true
        }
      }
    });
    expect(readiness.dataLayer.details).toEqual(
      expect.arrayContaining([
        "Oczekujace zapisy lokalne: 2.",
        "Odrzucone zapisy: 1.",
        "Nieaktualne dokumenty: 3."
      ])
    );
  });

  it("reports unsupported service workers as application layer blocker", () => {
    const readiness = evaluateOfflineLayerReadiness({
      applicationFilesReady: false,
      serviceWorkerSupported: false,
      configurationDataReady: true,
      storageReady: true,
      pendingWriteCount: 0,
      rejectedWriteCount: 0,
      staleDocumentCount: 0
    });

    expect(readiness).toMatchObject({
      overallStatus: "PARTIAL",
      applicationLayer: {
        status: "UNSUPPORTED",
        label: "Pliki aplikacji niedostepne offline"
      },
      dataLayer: {
        status: "READY"
      }
    });
  });

  it("blocks ready status when persistent local storage is unavailable", () => {
    const readiness = evaluateOfflineLayerReadiness({
      applicationFilesReady: true,
      serviceWorkerSupported: true,
      configurationDataReady: true,
      storageReady: false,
      pendingWriteCount: 0,
      rejectedWriteCount: 0,
      staleDocumentCount: 0
    });

    expect(readiness).toMatchObject({
      overallStatus: "PARTIAL",
      applicationLayer: {
        status: "READY"
      },
      dataLayer: {
        status: "NOT_READY",
        label: "Dane nieprzygotowane",
        sources: {
          CACHE: false,
          SERVER_CONFIRMED: false
        }
      }
    });
    expect(readiness.dataLayer.details).toContain(
      "Trwala pamiec lokalna nie jest gotowa."
    );
    expect(offlineOverallStatusLabel(readiness.overallStatus)).not.toBe("Gotowe offline");
  });
});
