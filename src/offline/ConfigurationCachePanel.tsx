import { AlertTriangle, Database, Download, RefreshCw, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import type { AuthSessionState } from "../auth/authSession";
import type { ServiceWorkerStatus } from "../app/useServiceWorkerStatus";
import {
  evaluateBlockedAccountPendingData,
  type BlockedAccountPendingDataAdminHandoff
} from "./blockedAccountPendingData";
import {
  clearConfigurationCache,
  prepareConfigurationCache,
  readConfigurationCache,
  type ClearConfigurationCacheInput,
  type ConfigurationCacheReadiness,
  type ConfigurationCacheSnapshot,
  type PrepareConfigurationCacheInput,
  type PrepareConfigurationCacheResult,
  type ReadConfigurationCacheInput,
  type ReadConfigurationCacheResult
} from "./configurationCache";
import {
  evaluateOfflineLayerReadiness,
  type OfflineLayerReadiness
} from "./offlineReadiness";
import {
  authStateRequiresOfflineReconfirmation,
  evaluateOfflineReadinessIndicator,
  type OfflineReadinessIndicator,
  type OfflineReadinessIndicatorTone
} from "./offlineReadinessIndicator";
import type { SyncDocumentMetadataInput } from "./pendingWriteMetadata";
import {
  buildSyncCenterModel,
  createEmergencySyncExportPayload,
  type EmergencySyncExportPayload,
  type SyncCenterModel,
  type SyncCenterSessionSummary
} from "./syncCenter";

type FirebaseEnv = Record<string, string | boolean | undefined>;

export type RetrySynchronizationResult =
  | {
      message?: string;
    }
  | undefined;

export type ConfigurationCacheApi = {
  read: (input: ReadConfigurationCacheInput) => Promise<ReadConfigurationCacheResult>;
  prepare: (
    env: FirebaseEnv,
    input: PrepareConfigurationCacheInput
  ) => Promise<PrepareConfigurationCacheResult>;
  clear: (input: ClearConfigurationCacheInput) => Promise<void>;
};

export const defaultConfigurationCacheApi: ConfigurationCacheApi = {
  read: readConfigurationCache,
  prepare: prepareConfigurationCache,
  clear: clearConfigurationCache
};

type PanelState =
  | {
      status: "IDLE" | "LOADING";
      snapshot: ConfigurationCacheSnapshot | null;
      readiness: ConfigurationCacheReadiness | null;
      message: string;
    }
  | {
      status: "READY";
      snapshot: ConfigurationCacheSnapshot | null;
      readiness: ConfigurationCacheReadiness;
      message: string;
    }
  | {
      status: "ERROR";
      snapshot: ConfigurationCacheSnapshot | null;
      readiness: ConfigurationCacheReadiness | null;
      message: string;
    };

const initialState: PanelState = {
  status: "IDLE",
  snapshot: null,
  readiness: null,
  message: "Cache konfiguracji nie zostal jeszcze odczytany."
};

export function ConfigurationCachePanel({
  authState,
  configurationCacheApi = defaultConfigurationCacheApi,
  deviceId,
  env,
  isOnline,
  lastSyncError = null,
  onEmergencyExport,
  onRetrySync,
  serviceWorkerStatus,
  syncDocuments = []
}: {
  authState: AuthSessionState;
  configurationCacheApi?: ConfigurationCacheApi;
  deviceId: string;
  env: FirebaseEnv;
  isOnline: boolean;
  lastSyncError?: string | null;
  onEmergencyExport?: (payload: EmergencySyncExportPayload) => Promise<void> | void;
  onRetrySync?: (
    model: SyncCenterModel
  ) => Promise<RetrySynchronizationResult> | RetrySynchronizationResult;
  serviceWorkerStatus: ServiceWorkerStatus;
  syncDocuments?: readonly SyncDocumentMetadataInput[];
}) {
  const [state, setState] = useState<PanelState>(initialState);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPreparing, setIsPreparing] = useState(false);
  const [isClearing, setIsClearing] = useState(false);
  const [isRetrying, setIsRetrying] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const serviceWorkerReady = isServiceWorkerReady(serviceWorkerStatus);
  const syncCenterModel = useMemo(
    () => buildSyncCenterModel(syncDocuments),
    [syncDocuments]
  );
  const syncSummary = syncCenterModel.metadataSummary;
  const localChangeCount =
    syncSummary.localSavedCount +
    syncSummary.pendingSyncCount +
    syncSummary.rejectedCount +
    syncSummary.remoteChangedCount;
  const syncErrorMessage =
    lastSyncError ?? syncCenterModel.sessions[0]?.lastError ?? null;
  const accountReconfirmationRequired = authStateRequiresOfflineReconfirmation(authState);
  const blockedAccountPendingData =
    authState.status === "BLOCKED"
      ? evaluateBlockedAccountPendingData({
          currentDeviceId: deviceId,
          model: syncCenterModel,
          profile: authState.profile
        })
      : null;
  const viewerRole =
    authState.status === "READY" &&
    (authState.profile.role === "ADMIN" || authState.profile.role === "OPERATOR")
      ? authState.profile.role
      : null;
  const canPrepare =
    authState.status === "READY" &&
    viewerRole !== null &&
    authState.profile.offlineConsent &&
    isOnline &&
    !isPreparing;
  const readiness = state.readiness;
  const offlineLayerReadiness = readiness
    ? evaluateOfflineLayerReadiness({
        applicationFilesReady: serviceWorkerReady,
        serviceWorkerSupported: serviceWorkerStatus !== "unsupported",
        configurationDataReady: readiness.status === "READY",
        pendingWriteCount: syncSummary.localSavedCount + syncSummary.pendingSyncCount,
        rejectedWriteCount: syncSummary.rejectedCount,
        staleDocumentCount:
          (state.snapshot?.invalidDocumentCount ?? 0) + syncSummary.remoteChangedCount
      })
    : null;
  const readinessIndicator = evaluateOfflineReadinessIndicator({
    isOnline,
    accountReconfirmationRequired,
    syncError:
      state.status === "ERROR" ||
      syncSummary.actionableErrorCount > 0 ||
      lastSyncError !== null,
    pendingWriteCount: syncSummary.localSavedCount + syncSummary.pendingSyncCount,
    lastFirestoreContactIso: state.snapshot?.preparedAtIso ?? null,
    layerReadiness: offlineLayerReadiness
  });
  const preparedAtLabel = useMemo(
    () => (state.snapshot ? formatPreparedAt(state.snapshot.preparedAtIso) : "brak"),
    [state.snapshot]
  );

  useEffect(() => {
    let isMounted = true;

    if (authState.status !== "READY") {
      setState(initialState);
      return undefined;
    }

    setState((current) => ({
      status: "LOADING",
      snapshot: current.snapshot,
      readiness: current.readiness,
      message: "Odczyt cache konfiguracji."
    }));

    void configurationCacheApi
      .read({
        actorProfile: authState.profile,
        deviceId,
        serviceWorkerReady
      })
      .then((result) => {
        if (isMounted) {
          setState({
            status: "READY",
            snapshot: result.snapshot,
            readiness: result.readiness,
            message: "Cache konfiguracji odczytany."
          });
        }
      })
      .catch(() => {
        if (isMounted) {
          setState({
            status: "ERROR",
            snapshot: null,
            readiness: null,
            message: "Nie udalo sie odczytac cache konfiguracji."
          });
        }
      });

    return () => {
      isMounted = false;
    };
  }, [authState, configurationCacheApi, deviceId, serviceWorkerReady]);

  const handlePrepare = async () => {
    if (authState.status !== "READY" || viewerRole === null) {
      return;
    }

    setFeedback(null);
    setError(null);

    if (!authState.profile.offlineConsent) {
      setError("Najpierw wlacz zgode na trwale dane offline.");
      return;
    }

    if (!isOnline) {
      setError("Przygotowanie konfiguracji wymaga polaczenia online.");
      return;
    }

    setIsPreparing(true);

    try {
      const result = await configurationCacheApi.prepare(env, {
        actorProfile: authState.profile,
        viewerRole,
        deviceId,
        serviceWorkerReady
      });

      setState({
        status: "READY",
        snapshot: result.snapshot,
        readiness: result.readiness,
        message: "Cache konfiguracji przygotowany."
      });
      setFeedback("Cache konfiguracji zostal przygotowany.");
    } catch (prepareError: unknown) {
      setError(getConfigurationCacheErrorMessage(prepareError));
    } finally {
      setIsPreparing(false);
    }
  };

  const handleClear = async () => {
    if (authState.status !== "READY") {
      return;
    }

    setFeedback(null);
    setError(null);
    setIsClearing(true);

    try {
      await configurationCacheApi.clear({
        actorProfile: authState.profile,
        deviceId
      });
      const result = await configurationCacheApi.read({
        actorProfile: authState.profile,
        deviceId,
        serviceWorkerReady
      });

      setState({
        status: "READY",
        snapshot: result.snapshot,
        readiness: result.readiness,
        message: "Cache konfiguracji wyczyszczony."
      });
      setFeedback("Cache konfiguracji zostal wyczyszczony.");
    } catch (clearError: unknown) {
      setError(getConfigurationCacheErrorMessage(clearError));
    } finally {
      setIsClearing(false);
    }
  };

  const handleRetrySync = async () => {
    setFeedback(null);
    setError(null);

    if (!onRetrySync) {
      setError("Ponowienie synchronizacji zostanie podlaczone w runtime synchronizacji.");
      return;
    }

    setIsRetrying(true);

    try {
      const result = await onRetrySync(syncCenterModel);
      setFeedback(result?.message ?? "Ponowienie synchronizacji zostalo uruchomione.");
    } catch (retryError: unknown) {
      setError(getConfigurationCacheErrorMessage(retryError));
    } finally {
      setIsRetrying(false);
    }
  };

  const handleEmergencyExport = async () => {
    setFeedback(null);
    setError(null);
    setIsExporting(true);

    try {
      const payload = createEmergencySyncExportPayload({
        createdAtIso: new Date().toISOString(),
        deviceId,
        model: syncCenterModel
      });

      if (onEmergencyExport) {
        await onEmergencyExport(payload);
      } else {
        downloadEmergencySyncExport(payload);
      }

      setFeedback("Eksport awaryjny zostal przygotowany.");
    } catch (exportError: unknown) {
      setError(getConfigurationCacheErrorMessage(exportError));
    } finally {
      setIsExporting(false);
    }
  };

  if (authState.status !== "READY") {
    if (blockedAccountPendingData?.status === "BLOCKED_ACCOUNT_PENDING_DATA") {
      return (
        <section className="configuration-cache" aria-label="Centrum synchronizacji">
          <BlockedAccountPendingDataNotice
            handoff={blockedAccountPendingData.adminHandoff}
            isExporting={isExporting}
            message={blockedAccountPendingData.message}
            onEmergencyExport={() => {
              void handleEmergencyExport();
            }}
          />
          {feedback ? <p className="form-message form-message--ok">{feedback}</p> : null}
          {error ? <p className="form-message form-message--error">{error}</p> : null}
        </section>
      );
    }

    return (
      <section className="configuration-cache" aria-label="Centrum synchronizacji">
        <CacheNotice
          title={
            accountReconfirmationRequired
              ? readinessIndicator.label
              : "Logowanie wymagane"
          }
          message={
            accountReconfirmationRequired
              ? authState.message
              : "Przygotowanie offline wymaga aktywnego profilu aplikacji."
          }
        />
      </section>
    );
  }

  if (!viewerRole) {
    return (
      <section className="configuration-cache" aria-label="Centrum synchronizacji">
        <CacheNotice
          title="Zakres w przygotowaniu"
          message="Cache konfiguracji dla zbieracza zostanie podlaczony razem z widokiem wlasnych danych."
        />
      </section>
    );
  }

  return (
    <section className="configuration-cache" aria-label="Centrum synchronizacji">
      <div className="directory-header">
        <div>
          <p className="eyebrow">Offline</p>
          <h2>Centrum synchronizacji</h2>
          <p className="panel-detail">{state.message}</p>
        </div>
        <div className="configuration-cache__actions">
          <button
            className="secondary-action"
            disabled={isClearing || !state.snapshot}
            onClick={() => {
              void handleClear();
            }}
            type="button"
          >
            <Trash2 aria-hidden="true" size={18} strokeWidth={2.2} />
            <span>Wyczysc cache konfiguracji</span>
          </button>
          <button
            className="secondary-action"
            disabled={isRetrying || !onRetrySync}
            onClick={() => {
              void handleRetrySync();
            }}
            type="button"
          >
            <RefreshCw aria-hidden="true" size={18} strokeWidth={2.2} />
            <span>{isRetrying ? "Synchronizacja..." : "Synchronizuj teraz"}</span>
          </button>
          <button
            className="secondary-action"
            disabled={isExporting || syncSummary.totalDocumentCount === 0}
            onClick={() => {
              void handleEmergencyExport();
            }}
            type="button"
          >
            <Download aria-hidden="true" size={18} strokeWidth={2.2} />
            <span>{isExporting ? "Eksport..." : "Eksport awaryjny"}</span>
          </button>
          <button
            className="primary-action"
            disabled={!canPrepare}
            onClick={() => {
              void handlePrepare();
            }}
            type="button"
          >
            <RefreshCw aria-hidden="true" size={18} strokeWidth={2.2} />
            <span>
              {isPreparing
                ? "Przygotowanie..."
                : state.snapshot
                  ? "Odswiez konfiguracje"
                  : "Przygotuj offline"}
            </span>
          </button>
        </div>
      </div>

      <div className="configuration-cache__summary">
        <CacheStat
          label="Polaczenie"
          tone={isOnline ? "ok" : "warn"}
          value={isOnline ? "Online" : "Offline"}
        />
        <CacheStat
          label="Wskaznik gotowosci"
          tone={readinessIndicator.tone}
          value={readinessIndicator.label}
        />
        <CacheStat
          label="Warstwa PWA"
          tone={
            offlineLayerReadiness?.applicationLayer.status === "READY" ? "ok" : "warn"
          }
          value={offlineLayerReadiness?.applicationLayer.label ?? "Nieodczytana"}
        />
        <CacheStat
          label="Warstwa danych"
          tone={offlineLayerReadiness?.dataLayer.status === "READY" ? "ok" : "warn"}
          value={offlineLayerReadiness?.dataLayer.label ?? "Nieodczytana"}
        />
        <CacheStat label="Ostatnie przygotowanie" value={preparedAtLabel} />
        <CacheStat
          label="Ostatnia synchronizacja"
          value={
            syncSummary.lastSuccessfulSyncIso
              ? formatPreparedAt(syncSummary.lastSuccessfulSyncIso)
              : "brak"
          }
        />
        <CacheStat
          label="Lokalne zmiany"
          tone={localChangeCount > 0 ? "warn" : "ok"}
          value={String(localChangeCount)}
        />
        <CacheStat
          label="Bledy synchronizacji"
          tone={syncSummary.actionableErrorCount > 0 ? "error" : "ok"}
          value={String(syncSummary.actionableErrorCount)}
        />
        <CacheStat label="Urzadzenie" value={deviceId} />
        <CacheStat
          label="Zbieracze offline"
          value={String(readiness?.counts.workers ?? 0)}
        />
        <CacheStat label="Plany offline" value={String(readiness?.counts.plans ?? 0)} />
        <CacheStat
          label="Stawki offline"
          value={String(readiness?.counts.rateVersions ?? 0)}
        />
        <CacheStat
          label="Otwarte sesje offline"
          value={String(readiness?.counts.openSessions ?? 0)}
        />
        <CacheStat
          label="Wersja aplikacji"
          value={state.snapshot?.appVersion ?? "brak"}
        />
      </div>

      <OfflineIndicatorDetails indicator={readinessIndicator} />

      {offlineLayerReadiness ? (
        <OfflineLayerDetails readiness={offlineLayerReadiness} />
      ) : null}

      <SyncCenterDetails lastSyncError={syncErrorMessage} model={syncCenterModel} />

      <div className="configuration-cache__requirements">
        <div className="worker-rate-form__heading">
          <Database aria-hidden="true" size={18} strokeWidth={2.2} />
          <h3>Wymagane dane</h3>
        </div>

        {readiness && readiness.missingRequirements.length > 0 ? (
          <ul className="worker-profile__list">
            {readiness.missingRequirements.map((requirement) => (
              <li key={requirement}>{requirement}</li>
            ))}
          </ul>
        ) : (
          <p className="worker-profile__empty">
            Profil, sezon, zbieracze, plany i stawki sa zapisane w cache.
          </p>
        )}
      </div>

      {!authState.profile.offlineConsent ? (
        <p className="worker-form__warning">
          Wlacz zgode offline w panelu logowania, tylko jesli to zaufane urzadzenie.
        </p>
      ) : null}
      {!isOnline ? (
        <p className="worker-form__warning">
          Przygotowanie konfiguracji wymaga polaczenia online.
        </p>
      ) : null}
      {!serviceWorkerReady ? (
        <p className="worker-form__warning">
          Service worker nie potwierdzil jeszcze cache plikow PWA.
        </p>
      ) : null}
      {feedback ? <p className="form-message form-message--ok">{feedback}</p> : null}
      {error ? <p className="form-message form-message--error">{error}</p> : null}
    </section>
  );
}

function BlockedAccountPendingDataNotice({
  handoff,
  isExporting,
  message,
  onEmergencyExport
}: {
  handoff: BlockedAccountPendingDataAdminHandoff;
  isExporting: boolean;
  message: string;
  onEmergencyExport: () => void;
}) {
  return (
    <div className="configuration-cache__sync" aria-label="Zablokowane konto">
      <div className="worker-rate-form__heading">
        <AlertTriangle aria-hidden="true" size={18} strokeWidth={2.2} />
        <h3>Konto zablokowane, dane lokalne zachowane</h3>
      </div>
      <p className="panel-detail">{message}</p>
      <div className="configuration-cache__sync-summary">
        <CacheStat label="Urzadzenie" tone="warn" value={handoff.deviceId} />
        <CacheStat
          label="Dokumenty lokalne"
          tone="warn"
          value={String(handoff.pendingDocumentCount)}
        />
        <CacheStat
          label="Sesje dla administratora"
          tone="warn"
          value={handoff.sessionIds.join(", ")}
        />
        <CacheStat label="Konto" tone="warn" value={handoff.email} />
      </div>
      <button
        className="secondary-action"
        disabled={isExporting}
        onClick={onEmergencyExport}
        type="button"
      >
        <Download aria-hidden="true" size={18} strokeWidth={2.2} />
        <span>{isExporting ? "Eksport..." : "Eksport awaryjny"}</span>
      </button>
    </div>
  );
}

function CacheNotice({ title, message }: { title: string; message: string }) {
  return (
    <div className="access-notice">
      <div className="access-notice__icon">
        <Database aria-hidden="true" size={20} strokeWidth={2.2} />
      </div>
      <div>
        <p className="eyebrow">{title}</p>
        <p className="panel-detail">{message}</p>
      </div>
    </div>
  );
}

function CacheStat({
  label,
  tone = "neutral",
  value
}: {
  label: string;
  tone?: OfflineReadinessIndicatorTone | "neutral";
  value: string;
}) {
  return (
    <div className={`directory-stat configuration-cache__stat--${tone}`}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function OfflineIndicatorDetails({
  indicator
}: {
  indicator: OfflineReadinessIndicator;
}) {
  return (
    <div className="configuration-cache__indicator" aria-label="Wskaznik gotowosci">
      <div className="worker-rate-form__heading">
        <RefreshCw aria-hidden="true" size={18} strokeWidth={2.2} />
        <h3>{indicator.label}</h3>
      </div>
      <ul className="worker-profile__list">
        {indicator.details.map((detail) => (
          <li key={detail}>{detail}</li>
        ))}
      </ul>
    </div>
  );
}

function OfflineLayerDetails({ readiness }: { readiness: OfflineLayerReadiness }) {
  return (
    <div className="configuration-cache__layers" aria-label="Warstwy offline">
      <LayerDetail
        title="Dostepnosc aplikacji"
        details={readiness.applicationLayer.details}
      />
      <LayerDetail
        title="Trwalosc danych"
        details={[
          ...readiness.dataLayer.details,
          `Statusy danych: ${formatDataSources(readiness)}`
        ]}
      />
    </div>
  );
}

function SyncCenterDetails({
  lastSyncError,
  model
}: {
  lastSyncError: string | null;
  model: SyncCenterModel;
}) {
  return (
    <div className="configuration-cache__sync" aria-label="Szczegoly synchronizacji">
      <div className="worker-rate-form__heading">
        <RefreshCw aria-hidden="true" size={18} strokeWidth={2.2} />
        <h3>Oczekujace dokumenty</h3>
      </div>

      <div className="configuration-cache__sync-summary">
        <CacheStat
          label="Dokumenty lokalne"
          tone={
            model.metadataSummary.localSavedCount +
              model.metadataSummary.pendingSyncCount >
            0
              ? "warn"
              : "ok"
          }
          value={String(
            model.metadataSummary.localSavedCount + model.metadataSummary.pendingSyncCount
          )}
        />
        <CacheStat
          label="Sesje z oczekujacymi zmianami"
          tone={model.pendingSessionCount > 0 ? "warn" : "ok"}
          value={String(model.pendingSessionCount)}
        />
        <CacheStat
          label="Dokumenty odrzucone"
          tone={model.metadataSummary.rejectedCount > 0 ? "error" : "ok"}
          value={String(model.metadataSummary.rejectedCount)}
        />
        <CacheStat
          label="Zmiany z innych urzadzen"
          tone={model.metadataSummary.remoteChangedCount > 0 ? "warn" : "ok"}
          value={String(model.metadataSummary.remoteChangedCount)}
        />
      </div>

      {lastSyncError ? (
        <div className="configuration-cache__sync-error">
          <AlertTriangle aria-hidden="true" size={18} strokeWidth={2.2} />
          <span>Ostatni blad: {lastSyncError}</span>
        </div>
      ) : (
        <p className="worker-profile__empty">Brak ostatniego bledu synchronizacji.</p>
      )}

      <SyncSessionList sessions={model.sessions} />
      <SyncSafetyInstructions />
    </div>
  );
}

function SyncSessionList({
  sessions
}: {
  sessions: readonly SyncCenterSessionSummary[];
}) {
  if (sessions.length === 0) {
    return (
      <p className="worker-profile__empty">Brak sesji z oczekujacymi dokumentami.</p>
    );
  }

  return (
    <div className="configuration-cache__sessions" aria-label="Sesje oczekujace">
      {sessions.map((session) => (
        <article className="configuration-cache__session" key={session.sessionId}>
          <div>
            <h4>{session.workerName}</h4>
            <p>
              {session.businessDate} · {session.businessStatus}
            </p>
          </div>
          <dl>
            <div>
              <dt>Lokalne wpisy</dt>
              <dd>{session.localEntryCount}</dd>
            </div>
            <div>
              <dt>Potwierdzone wpisy</dt>
              <dd>{session.confirmedEntryCount}</dd>
            </div>
            <div>
              <dt>Dokumenty oczekujace</dt>
              <dd>{session.pendingDocumentCount}</dd>
            </div>
            <div>
              <dt>Bledy</dt>
              <dd>
                {session.rejectedDocumentCount + session.remoteChangedDocumentCount}
              </dd>
            </div>
          </dl>
          <p>{session.lastError ?? "Brak bledu dla tej sesji."}</p>
          <span className="configuration-cache__session-action">
            {session.actionLabel}
          </span>
        </article>
      ))}
    </div>
  );
}

function SyncSafetyInstructions() {
  return (
    <div
      className="configuration-cache__safety"
      aria-label="Instrukcje przy bledzie synchronizacji"
    >
      <div className="worker-rate-form__heading">
        <AlertTriangle aria-hidden="true" size={18} strokeWidth={2.2} />
        <h3>Przy bledzie synchronizacji</h3>
      </div>
      <ul className="worker-profile__list">
        <li>Nie czysc danych przegladarki przed eksportem awaryjnym.</li>
        <li>Nie wylogowuj sie przed potwierdzeniem zielonego statusu synchronizacji.</li>
        <li>Nie wyplacaj sesji oznaczonych jako lokalne albo oczekujace.</li>
        <li>
          Po odzyskaniu internetu ponownie otworz PWA, aby uruchomic synchronizacje.
        </li>
      </ul>
    </div>
  );
}

function LayerDetail({ details, title }: { details: readonly string[]; title: string }) {
  return (
    <div className="configuration-cache__layer">
      <h3>{title}</h3>
      <ul className="worker-profile__list">
        {details.map((detail) => (
          <li key={detail}>{detail}</li>
        ))}
      </ul>
    </div>
  );
}

function formatDataSources(readiness: OfflineLayerReadiness): string {
  const labels = [
    readiness.dataLayer.sources.CACHE ? "cache" : null,
    readiness.dataLayer.sources.PENDING_WRITE ? "oczekujace" : null,
    readiness.dataLayer.sources.SERVER_CONFIRMED ? "potwierdzone" : null,
    readiness.dataLayer.sources.REJECTED ? "odrzucone" : null,
    readiness.dataLayer.sources.STALE ? "nieaktualne" : null
  ].filter((label): label is string => label !== null);

  return labels.length > 0 ? labels.join(", ") : "brak";
}

function isServiceWorkerReady(status: ServiceWorkerStatus): boolean {
  return status === "controlled" || status === "registered";
}

function formatPreparedAt(value: string): string {
  const parsed = new Date(value);

  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("pl-PL", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Europe/Warsaw"
  }).format(parsed);
}

function downloadEmergencySyncExport(payload: EmergencySyncExportPayload): void {
  if (
    typeof window === "undefined" ||
    typeof document === "undefined" ||
    typeof window.URL.createObjectURL !== "function"
  ) {
    throw new Error("Eksport awaryjny wymaga przegladarki z obsluga plikow.");
  }

  const blob = new Blob([JSON.stringify(payload, null, 2)], {
    type: "application/json"
  });
  const url = window.URL.createObjectURL(blob);
  const anchor = document.createElement("a");

  anchor.href = url;
  anchor.download = `borowka-sync-export-${payload.createdAtIso.replace(/[:.]/g, "-")}.json`;
  anchor.click();
  window.URL.revokeObjectURL(url);
}

function getConfigurationCacheErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  return "Nie udalo sie obsluzyc cache konfiguracji.";
}
