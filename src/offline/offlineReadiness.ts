export type OfflineApplicationLayerStatus = "READY" | "NOT_READY" | "UNSUPPORTED";
export type OfflineDataLayerStatus = "READY" | "NOT_READY" | "PENDING_WRITES";
export type OfflineOverallStatus = "READY" | "PARTIAL" | "NOT_READY";

export type OfflineDataSourceStatus =
  "CACHE" | "PENDING_WRITE" | "SERVER_CONFIRMED" | "REJECTED" | "STALE";

export type OfflineLayerReadinessInput = {
  applicationFilesReady: boolean;
  serviceWorkerSupported: boolean;
  configurationDataReady: boolean;
  storageReady: boolean;
  pendingWriteCount: number;
  rejectedWriteCount: number;
  staleDocumentCount: number;
};

export type OfflineLayerReadiness = {
  overallStatus: OfflineOverallStatus;
  applicationLayer: {
    status: OfflineApplicationLayerStatus;
    label: string;
    details: string[];
  };
  dataLayer: {
    status: OfflineDataLayerStatus;
    label: string;
    details: string[];
    sources: Record<OfflineDataSourceStatus, boolean>;
  };
};

export function evaluateOfflineLayerReadiness(
  input: OfflineLayerReadinessInput
): OfflineLayerReadiness {
  const applicationLayer = evaluateApplicationLayer(input);
  const dataLayer = evaluateDataLayer(input);
  const overallStatus = resolveOverallStatus(applicationLayer.status, dataLayer.status);

  return {
    overallStatus,
    applicationLayer,
    dataLayer
  };
}

export function offlineOverallStatusLabel(status: OfflineOverallStatus): string {
  switch (status) {
    case "READY":
      return "Gotowe offline";
    case "PARTIAL":
      return "Czesciowo gotowe";
    case "NOT_READY":
      return "Nieprzygotowane";
  }
}

function evaluateApplicationLayer(input: OfflineLayerReadinessInput) {
  if (!input.serviceWorkerSupported) {
    return {
      status: "UNSUPPORTED" as const,
      label: "Pliki aplikacji niedostepne offline",
      details: ["Service worker nie jest wspierany w tej przegladarce."]
    };
  }

  if (!input.applicationFilesReady) {
    return {
      status: "NOT_READY" as const,
      label: "Pliki aplikacji niepotwierdzone",
      details: ["Service worker nie potwierdzil jeszcze cache plikow PWA."]
    };
  }

  return {
    status: "READY" as const,
    label: "Pliki aplikacji gotowe",
    details: ["Ekran startowy, nawigacja i formularze moga uruchomic sie z cache PWA."]
  };
}

function evaluateDataLayer(input: OfflineLayerReadinessInput) {
  const details: string[] = [];
  const cacheReady = input.configurationDataReady && input.storageReady;
  const sources: Record<OfflineDataSourceStatus, boolean> = {
    CACHE: cacheReady,
    PENDING_WRITE: input.pendingWriteCount > 0,
    SERVER_CONFIRMED: cacheReady && input.pendingWriteCount === 0,
    REJECTED: input.rejectedWriteCount > 0,
    STALE: input.staleDocumentCount > 0
  };

  if (!input.configurationDataReady) {
    details.push("Brak gotowego lokalnego snapshotu danych domenowych.");
  }

  if (!input.storageReady) {
    details.push("Trwala pamiec lokalna nie jest gotowa.");
  }

  if (input.pendingWriteCount > 0) {
    details.push(`Oczekujace zapisy lokalne: ${String(input.pendingWriteCount)}.`);
  }

  if (input.rejectedWriteCount > 0) {
    details.push(`Odrzucone zapisy: ${String(input.rejectedWriteCount)}.`);
  }

  if (input.staleDocumentCount > 0) {
    details.push(`Nieaktualne dokumenty: ${String(input.staleDocumentCount)}.`);
  }

  if (details.length === 0) {
    details.push("Dane konfiguracji sa dostepne z lokalnego cache.");
  }

  if (input.rejectedWriteCount > 0 || input.staleDocumentCount > 0) {
    return {
      status: "NOT_READY" as const,
      label: "Dane wymagaja synchronizacji",
      details,
      sources
    };
  }

  if (input.pendingWriteCount > 0) {
    return {
      status: "PENDING_WRITES" as const,
      label: "Dane z lokalnymi zapisami",
      details,
      sources
    };
  }

  return {
    status: cacheReady ? ("READY" as const) : ("NOT_READY" as const),
    label: cacheReady ? "Dane gotowe offline" : "Dane nieprzygotowane",
    details,
    sources
  };
}

function resolveOverallStatus(
  applicationStatus: OfflineApplicationLayerStatus,
  dataStatus: OfflineDataLayerStatus
): OfflineOverallStatus {
  if (applicationStatus === "READY" && dataStatus === "READY") {
    return "READY";
  }

  if (
    applicationStatus === "READY" ||
    dataStatus === "READY" ||
    dataStatus === "PENDING_WRITES"
  ) {
    return "PARTIAL";
  }

  return "NOT_READY";
}
