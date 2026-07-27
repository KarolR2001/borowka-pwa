import { Database, RefreshCw, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import type { AuthSessionState } from "../auth/authSession";
import type { ServiceWorkerStatus } from "../app/useServiceWorkerStatus";
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
  offlineOverallStatusLabel,
  type OfflineLayerReadiness
} from "./offlineReadiness";

type FirebaseEnv = Record<string, string | boolean | undefined>;

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
  serviceWorkerStatus
}: {
  authState: AuthSessionState;
  configurationCacheApi?: ConfigurationCacheApi;
  deviceId: string;
  env: FirebaseEnv;
  isOnline: boolean;
  serviceWorkerStatus: ServiceWorkerStatus;
}) {
  const [state, setState] = useState<PanelState>(initialState);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPreparing, setIsPreparing] = useState(false);
  const [isClearing, setIsClearing] = useState(false);
  const serviceWorkerReady = isServiceWorkerReady(serviceWorkerStatus);
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
        pendingWriteCount: 0,
        rejectedWriteCount: 0,
        staleDocumentCount: state.snapshot?.invalidDocumentCount ?? 0
      })
    : null;
  const statusLabel = offlineLayerReadiness
    ? offlineOverallStatusLabel(offlineLayerReadiness.overallStatus)
    : "Nieprzygotowane";
  const statusTone = offlineLayerReadiness?.overallStatus === "READY" ? "ok" : "warn";
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

  if (authState.status !== "READY") {
    return (
      <section className="configuration-cache" aria-label="Centrum synchronizacji">
        <CacheNotice
          title="Logowanie wymagane"
          message="Przygotowanie offline wymaga aktywnego profilu aplikacji."
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
            <span>Wyczysc cache</span>
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
            <span>{isPreparing ? "Przygotowanie..." : "Przygotuj offline"}</span>
          </button>
        </div>
      </div>

      <div className="configuration-cache__summary">
        <CacheStat label="Status" tone={statusTone} value={statusLabel} />
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

      {offlineLayerReadiness ? (
        <OfflineLayerDetails readiness={offlineLayerReadiness} />
      ) : null}

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
  tone?: "ok" | "warn" | "neutral";
  value: string;
}) {
  return (
    <div className={`directory-stat configuration-cache__stat--${tone}`}>
      <span>{label}</span>
      <strong>{value}</strong>
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

function getConfigurationCacheErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  return "Nie udalo sie obsluzyc cache konfiguracji.";
}
