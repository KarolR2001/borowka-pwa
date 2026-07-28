import { AlertTriangle, CheckCircle2, Clock3, RefreshCw, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRegisterSW } from "virtual:pwa-register/react";

import { APP_META } from "../config/appMeta";
import type { SyncDocumentMetadataInput } from "../offline/pendingWriteMetadata";
import {
  createBrowserPwaUpdateIntentStorage,
  createPwaUpdateIntent,
  evaluatePwaUpdateDecision,
  runPwaUpdateIntegrityCheck,
  type PwaSchemaMigration,
  type PwaUpdateIntegrityReport,
  type PwaUpdateIntentStorage
} from "./pwaUpdatePolicy";

const NO_SCHEMA_MIGRATIONS: readonly PwaSchemaMigration[] = [];

export type PwaUpdateRegistration = {
  dismissOfflineReady: () => void;
  needRefresh: boolean;
  offlineReady: boolean;
  updateServiceWorker: () => Promise<void>;
};

export function PwaUpdateController({
  currentUserUid,
  deviceId,
  hasActiveForm,
  hasActiveHarvestSession,
  localDataInspected,
  migrations = NO_SCHEMA_MIGRATIONS,
  syncDocuments
}: {
  currentUserUid: string | null;
  deviceId: string;
  hasActiveForm: boolean;
  hasActiveHarvestSession: boolean;
  localDataInspected: boolean;
  migrations?: readonly PwaSchemaMigration[];
  syncDocuments: readonly SyncDocumentMetadataInput[];
}) {
  const [registrationError, setRegistrationError] = useState<string | null>(null);
  const [serviceWorkerRegistration, setServiceWorkerRegistration] =
    useState<ServiceWorkerRegistration | null>(null);
  const {
    needRefresh: [needRefresh],
    offlineReady: [offlineReady, setOfflineReady],
    updateServiceWorker
  } = useRegisterSW({
    onRegisteredSW: (_serviceWorkerUrl, registration) => {
      setServiceWorkerRegistration(registration ?? null);
    },
    onRegisterError: () => {
      setRegistrationError("Nie udalo sie zarejestrowac aktualizacji PWA.");
    }
  });

  useEffect(() => {
    if (!serviceWorkerRegistration) {
      return undefined;
    }

    const checkForUpdate = () => {
      if (navigator.onLine) {
        void serviceWorkerRegistration.update().catch(() => undefined);
      }
    };
    const intervalId = globalThis.setInterval(checkForUpdate, 60 * 60 * 1000);

    globalThis.addEventListener("online", checkForUpdate);
    globalThis.addEventListener("focus", checkForUpdate);

    return () => {
      globalThis.clearInterval(intervalId);
      globalThis.removeEventListener("online", checkForUpdate);
      globalThis.removeEventListener("focus", checkForUpdate);
    };
  }, [serviceWorkerRegistration]);

  return (
    <PwaUpdateNotice
      currentUserUid={currentUserUid}
      deviceId={deviceId}
      hasActiveForm={hasActiveForm}
      hasActiveHarvestSession={hasActiveHarvestSession}
      localDataInspected={localDataInspected}
      migrations={migrations}
      registration={{
        dismissOfflineReady: () => {
          setOfflineReady(false);
        },
        needRefresh,
        offlineReady,
        updateServiceWorker: () => updateServiceWorker(true)
      }}
      registrationError={registrationError}
      syncDocuments={syncDocuments}
    />
  );
}

export function PwaUpdateNotice({
  currentUserUid,
  deviceId,
  hasActiveForm,
  hasActiveHarvestSession,
  intentStorage,
  localDataInspected,
  migrations = NO_SCHEMA_MIGRATIONS,
  registration,
  registrationError = null,
  syncDocuments
}: {
  currentUserUid: string | null;
  deviceId: string;
  hasActiveForm: boolean;
  hasActiveHarvestSession: boolean;
  intentStorage?: PwaUpdateIntentStorage;
  localDataInspected: boolean;
  migrations?: readonly PwaSchemaMigration[];
  registration: PwaUpdateRegistration;
  registrationError?: string | null;
  syncDocuments: readonly SyncDocumentMetadataInput[];
}) {
  const storage = useMemo(
    () => intentStorage ?? createBrowserPwaUpdateIntentStorage(),
    [intentStorage]
  );
  const [isApplying, setIsApplying] = useState(false);
  const [isDeferred, setIsDeferred] = useState(false);
  const [error, setError] = useState<string | null>(registrationError);
  const [integrityReport, setIntegrityReport] = useState<PwaUpdateIntegrityReport | null>(
    null
  );
  const checkedIntentRef = useRef<string | null>(null);
  const decision = useMemo(
    () =>
      evaluatePwaUpdateDecision({
        hasActiveForm,
        hasActiveHarvestSession,
        syncDocuments
      }),
    [hasActiveForm, hasActiveHarvestSession, syncDocuments]
  );

  useEffect(() => {
    setError(registrationError);
  }, [registrationError]);

  useEffect(() => {
    if (!registration.needRefresh) {
      setIsDeferred(false);
    }
  }, [registration.needRefresh]);

  useEffect(() => {
    let isMounted = true;

    try {
      const intent = storage.read();

      if (
        !intent ||
        checkedIntentRef.current === intent.requestedAtIso ||
        (intent.userUid !== null &&
          (intent.userUid !== currentUserUid || !localDataInspected))
      ) {
        return undefined;
      }

      checkedIntentRef.current = intent.requestedAtIso;

      void runPwaUpdateIntegrityCheck({
        currentDeviceId: deviceId,
        currentLocalDocumentIds: syncDocuments.map((document) => document.id),
        currentSchemaVersion: APP_META.schemaVersion,
        intent,
        migrations
      })
        .then((report) => {
          if (!isMounted) {
            return;
          }

          setIntegrityReport(report);

          if (report.status === "READY") {
            storage.clear();
          }
        })
        .catch(() => {
          if (isMounted) {
            setError(
              "Kontrola spojnosci po aktualizacji nie powiodla sie. Dane lokalne pozostaja zachowane."
            );
          }
        });
    } catch {
      setError(
        "Znacznik poprzedniej aktualizacji jest uszkodzony. Dane lokalne pozostaja zachowane."
      );
    }

    return () => {
      isMounted = false;
    };
  }, [currentUserUid, deviceId, localDataInspected, migrations, storage, syncDocuments]);

  const handleApplyUpdate = async () => {
    setError(null);

    if (!decision.canApplyUpdate) {
      setError("Aktualizacja nadal wymaga bezpiecznego momentu.");
      return;
    }

    setIsApplying(true);

    try {
      storage.write(
        createPwaUpdateIntent({
          appVersion: APP_META.version,
          deviceId,
          schemaVersion: APP_META.schemaVersion,
          syncDocuments,
          userUid: currentUserUid
        })
      );
      await registration.updateServiceWorker();
    } catch {
      storage.clear();
      setError("Nie udalo sie zastosowac aktualizacji. Sprobuj ponownie.");
      setIsApplying(false);
    }
  };

  if (
    !registration.needRefresh &&
    !registration.offlineReady &&
    !registrationError &&
    !error &&
    !integrityReport
  ) {
    return null;
  }

  return (
    <section className="pwa-update-notice" aria-label="Aktualizacja aplikacji">
      {registration.offlineReady ? (
        <div className="pwa-update-notice__row">
          <CheckCircle2 aria-hidden="true" size={20} strokeWidth={2.2} />
          <p>Aplikacja i jej pliki sa gotowe do pracy offline.</p>
          <button
            aria-label="Zamknij komunikat gotowosci offline"
            className="icon-action"
            onClick={registration.dismissOfflineReady}
            title="Zamknij"
            type="button"
          >
            <X aria-hidden="true" size={18} strokeWidth={2.2} />
          </button>
        </div>
      ) : null}

      {registration.needRefresh ? (
        <div className="pwa-update-notice__content">
          <div className="worker-rate-form__heading">
            {decision.canApplyUpdate ? (
              <RefreshCw aria-hidden="true" size={20} strokeWidth={2.2} />
            ) : (
              <Clock3 aria-hidden="true" size={20} strokeWidth={2.2} />
            )}
            <h2>{isDeferred ? "Aktualizacja odroczona" : "Nowa wersja gotowa"}</h2>
          </div>

          {isDeferred ? (
            <p>
              Nowa wersja pozostaje pobrana w tle. Wroc do decyzji, gdy praca bedzie
              zakonczona.
            </p>
          ) : decision.canApplyUpdate ? (
            <p>
              Mozesz bezpiecznie uruchomic nowa wersje. Aktualizacja nie czysci cache
              Firestore ani lokalnych UUID.
            </p>
          ) : (
            <ul className="pwa-update-notice__blockers">
              {decision.blockers.map((blocker) => (
                <li key={blocker.code}>{blocker.message}</li>
              ))}
            </ul>
          )}

          <div className="auth-actions">
            {isDeferred ? (
              <button
                className="secondary-action"
                onClick={() => {
                  setIsDeferred(false);
                }}
                type="button"
              >
                Wroc do aktualizacji
              </button>
            ) : (
              <>
                <button
                  className="primary-action"
                  disabled={!decision.canApplyUpdate || isApplying}
                  onClick={() => {
                    void handleApplyUpdate();
                  }}
                  type="button"
                >
                  <RefreshCw aria-hidden="true" size={18} strokeWidth={2.2} />
                  <span>{isApplying ? "Aktualizacja..." : "Zaktualizuj teraz"}</span>
                </button>
                <button
                  className="secondary-action"
                  disabled={isApplying}
                  onClick={() => {
                    setIsDeferred(true);
                  }}
                  type="button"
                >
                  Odloz aktualizacje
                </button>
              </>
            )}
          </div>
        </div>
      ) : null}

      {integrityReport ? (
        <div
          className={`pwa-update-notice__integrity pwa-update-notice__integrity--${integrityReport.status.toLowerCase()}`}
        >
          {integrityReport.status === "READY" ? (
            <CheckCircle2 aria-hidden="true" size={20} strokeWidth={2.2} />
          ) : (
            <AlertTriangle aria-hidden="true" size={20} strokeWidth={2.2} />
          )}
          <div>
            <strong>
              {integrityReport.status === "READY"
                ? "Kontrola po aktualizacji zakonczona"
                : "Aktualizacja wymaga przegladu"}
            </strong>
            {integrityReport.issues.map((issue) => (
              <p key={issue.code}>{issue.message}</p>
            ))}
          </div>
        </div>
      ) : null}

      {error ? <p className="form-message form-message--error">{error}</p> : null}
    </section>
  );
}
