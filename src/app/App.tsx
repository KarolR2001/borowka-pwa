import {
  AlertTriangle,
  CheckCircle2,
  CloudOff,
  Eye,
  EyeOff,
  LogIn,
  LogOut,
  RotateCcw,
  UserRound,
  Wifi,
  type LucideIcon
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type SyntheticEvent
} from "react";

import {
  PASSWORD_RESET_CONFIRMATION,
  getInitialAuthSessionState,
  getLoginErrorMessage,
  getOfflineConsentUpdateErrorMessage,
  getPasswordResetErrorMessage,
  refreshCurrentAuthSession,
  requestPasswordResetEmail,
  signInWithEmailPassword,
  signOutCurrentUser,
  subscribeToAuthSession,
  type AuthenticatedUser,
  type AuthSessionListener,
  type AuthSessionState
} from "../auth/authSession";
import {
  getInvitedRegistrationErrorMessage,
  registerInvitedUser,
  validateInvitedRegistrationInput,
  type InvitedRegistrationInput
} from "../auth/invitedRegistration";
import { APP_META } from "../config/appMeta";
import { getFirebaseClientConfigStatus } from "../config/firebaseClientConfig";
import { getFirebaseRuntimeStatus } from "../config/firebaseRuntime";
import {
  getFirebaseServicesStatus,
  initializeFirebaseServicesIfReady
} from "../config/firebaseServices";
import {
  registerCurrentDevice,
  type RegisterCurrentDeviceInput
} from "../devices/deviceRegistry";
import {
  readCurrentDeviceIdentity,
  type DeviceIdentity
} from "../devices/deviceIdentity";
import {
  AdminDeviceDirectoryPanel,
  defaultDeviceDirectoryApi,
  type DeviceDirectoryApi
} from "../devices/AdminDeviceDirectoryPanel";
import { formatBusinessDate, formatKilograms, formatMoney } from "../domain/format";
import type { UserProfile } from "../domain/identity";
import {
  AdminSeasonsPanel,
  defaultSeasonsApi,
  type SeasonsApi
} from "../seasons/AdminSeasonsPanel";
import {
  AdminUserDirectoryPanel,
  defaultUserDirectoryApi,
  type UserDirectoryApi
} from "../users/AdminUserDirectoryPanel";
import {
  defaultWorkerDirectoryApi,
  WorkerDirectoryPanel,
  type WorkerDirectoryApi
} from "../workers/WorkerDirectoryPanel";
import {
  AdminRegistrationInvitationsPanel,
  defaultRegistrationInvitationsApi,
  type RegistrationInvitationsApi
} from "../invitations/AdminRegistrationInvitationsPanel";
import {
  AdminSettlementPlansPanel,
  defaultSettlementPlansApi,
  type SettlementPlansApi
} from "../plans/AdminSettlementPlansPanel";
import {
  ConfigurationCachePanel,
  defaultConfigurationCacheApi,
  type ConfigurationCacheApi
} from "../offline/ConfigurationCachePanel";
import {
  TRUSTED_OFFLINE_STORAGE_DISCLOSURE,
  updateTrustedOfflineConsent,
  type TrustedOfflineConsentUpdateInput
} from "../offline/trustedOfflineConsent";
import {
  createSynchronizationRequest,
  defaultSynchronizationApi,
  evaluateSynchronizationTrigger,
  type SynchronizationApi,
  type SynchronizationRunResult,
  type SynchronizationTrigger
} from "../offline/automaticSynchronization";
import type { SyncDocumentMetadataInput } from "../offline/pendingWriteMetadata";
import {
  defaultOperatorHarvestSessionsApi,
  OperatorHarvestSessionsPanel,
  type OperatorHarvestSessionsApi
} from "../harvest/OperatorHarvestSessionsPanel";
import { navigationItems, type NavigationKey } from "./navigation";
import { useOnlineStatus } from "./useOnlineStatus";
import {
  serviceWorkerStatusLabel,
  useServiceWorkerStatus
} from "./useServiceWorkerStatus";

type FirebaseEnv = Record<string, string | boolean | undefined>;

export type AuthSessionApi = {
  getInitialState: (env: FirebaseEnv) => AuthSessionState;
  subscribe: (env: FirebaseEnv, listener: AuthSessionListener) => Promise<() => void>;
  signIn: (
    env: FirebaseEnv,
    credentials: { email: string; password: string }
  ) => Promise<void>;
  requestPasswordReset: (env: FirebaseEnv, email: string) => Promise<void>;
  register: (env: FirebaseEnv, input: InvitedRegistrationInput) => Promise<void>;
  refresh: (env: FirebaseEnv) => Promise<AuthSessionState>;
  updateOfflineConsent: (
    env: FirebaseEnv,
    input: TrustedOfflineConsentUpdateInput
  ) => Promise<void>;
  signOut: (env: FirebaseEnv) => Promise<void>;
};

export type DeviceRegistryApi = {
  register: (env: FirebaseEnv, input: RegisterCurrentDeviceInput) => Promise<void>;
};

export type AppProps = {
  authSessionApi?: AuthSessionApi;
  deviceRegistryApi?: DeviceRegistryApi;
  deviceDirectoryApi?: DeviceDirectoryApi;
  userDirectoryApi?: UserDirectoryApi;
  workerDirectoryApi?: WorkerDirectoryApi;
  seasonsApi?: SeasonsApi;
  settlementPlansApi?: SettlementPlansApi;
  registrationInvitationsApi?: RegistrationInvitationsApi;
  configurationCacheApi?: ConfigurationCacheApi;
  harvestSessionsApi?: OperatorHarvestSessionsApi;
  synchronizationApi?: SynchronizationApi;
};

type PanelState = {
  title: string;
  status: string;
  detail: string;
};

const defaultAuthSessionApi: AuthSessionApi = {
  getInitialState: getInitialAuthSessionState,
  subscribe: subscribeToAuthSession,
  signIn: signInWithEmailPassword,
  requestPasswordReset: requestPasswordResetEmail,
  register: registerInvitedUser,
  refresh: refreshCurrentAuthSession,
  updateOfflineConsent: updateTrustedOfflineConsent,
  signOut: signOutCurrentUser
};

const defaultDeviceRegistryApi: DeviceRegistryApi = {
  register: registerCurrentDevice
};

const panelByNavigation: Record<NavigationKey, PanelState> = {
  start: {
    title: "Start",
    status: "Szkielet aplikacji",
    detail: "Gotowy ekran bazowy bez danych biznesowych."
  },
  login: {
    title: "Logowanie",
    status: "Sesja Firebase",
    detail: "Pierwsze logowanie wymaga internetu i aktywnego profilu aplikacji."
  },
  admin: {
    title: "Pulpit administratora",
    status: "Konta i role",
    detail: "Administrator widzi profile aplikacyjne i zaproszenia prerejestracji."
  },
  operator: {
    title: "Pulpit operatora",
    status: "Brak aktywnej sesji",
    detail: "Proces zbioru powstanie po konfiguracji domeny."
  },
  picker: {
    title: "Pulpit zbieracza",
    status: "Brak przypisanego profilu",
    detail: "Prywatny widok zostanie połączony z workerId."
  },
  settings: {
    title: "Ustawienia",
    status: "Tryb lokalny",
    detail: "Konfiguracja środowiska jest rozdzielona przez zmienne Vite."
  },
  diagnostics: {
    title: "Diagnostyka",
    status: "Wersje systemowe",
    detail: "Informacje diagnostyczne są dostępne od pierwszego etapu."
  }
};

export function App({
  authSessionApi = defaultAuthSessionApi,
  deviceRegistryApi = defaultDeviceRegistryApi,
  deviceDirectoryApi = defaultDeviceDirectoryApi,
  userDirectoryApi = defaultUserDirectoryApi,
  workerDirectoryApi = defaultWorkerDirectoryApi,
  seasonsApi = defaultSeasonsApi,
  settlementPlansApi = defaultSettlementPlansApi,
  registrationInvitationsApi = defaultRegistrationInvitationsApi,
  configurationCacheApi = defaultConfigurationCacheApi,
  harvestSessionsApi = defaultOperatorHarvestSessionsApi,
  synchronizationApi = defaultSynchronizationApi
}: AppProps = {}) {
  const env = import.meta.env as FirebaseEnv;
  const [activeView, setActiveView] = useState<NavigationKey>("start");
  const [authState, setAuthState] = useState<AuthSessionState>(() =>
    authSessionApi.getInitialState(env)
  );
  const isOnline = useOnlineStatus();
  const serviceWorkerStatus = useServiceWorkerStatus();
  const firebaseStatus = getFirebaseClientConfigStatus(env);
  const firebaseRuntimeStatus = getFirebaseRuntimeStatus(env);
  const initialFirebaseServicesStatus = useMemo(() => getFirebaseServicesStatus(env), []);
  const [firebaseServicesStatus, setFirebaseServicesStatus] = useState(
    initialFirebaseServicesStatus
  );
  const [syncDocuments, setSyncDocuments] = useState<SyncDocumentMetadataInput[]>([]);
  const [lastSyncError, setLastSyncError] = useState<string | null>(null);
  const latestAuthStateRef = useRef(authState);
  const latestIsOnlineRef = useRef(isOnline);
  const refreshInFlightRef = useRef(false);
  const syncInFlightRef = useRef(false);
  const initialAuthReadyRef = useRef(authState.status === "READY");
  const firstReadySyncHandledRef = useRef(false);
  const lastReadySyncUidRef = useRef<string | null>(null);
  const deviceIdentity = useMemo(() => readCurrentDeviceIdentity(), []);
  const deviceId = deviceIdentity.id;
  const panel = panelByNavigation[activeView];

  useEffect(() => {
    let isMounted = true;

    if (!initialFirebaseServicesStatus.ready) {
      return undefined;
    }

    void initializeFirebaseServicesIfReady(env)
      .then((status) => {
        if (isMounted) {
          setFirebaseServicesStatus(status);
        }
      })
      .catch(() => {
        if (isMounted) {
          setFirebaseServicesStatus({
            ...initialFirebaseServicesStatus,
            ready: false,
            initialized: false,
            message: "Nie udalo sie uruchomic uslug Firebase."
          });
        }
      });

    return () => {
      isMounted = false;
    };
  }, [initialFirebaseServicesStatus]);

  useEffect(() => {
    let isMounted = true;
    let unsubscribe: (() => void) | undefined;

    void authSessionApi
      .subscribe(env, (nextState) => {
        if (isMounted) {
          setAuthState(nextState);
        }
      })
      .then((unsubscribeFromSession) => {
        if (isMounted) {
          unsubscribe = unsubscribeFromSession;
          return;
        }

        unsubscribeFromSession();
      })
      .catch(() => {
        if (isMounted) {
          setAuthState({
            status: "ERROR",
            message: "Nie udalo sie uruchomic sesji logowania."
          });
        }
      });

    return () => {
      isMounted = false;
      unsubscribe?.();
    };
  }, [authSessionApi]);

  useEffect(() => {
    latestAuthStateRef.current = authState;
  }, [authState]);

  useEffect(() => {
    latestIsOnlineRef.current = isOnline;
  }, [isOnline]);

  const requestSynchronization = useCallback(
    async (trigger: SynchronizationTrigger): Promise<SynchronizationRunResult> => {
      const requestedAtIso = new Date().toISOString();
      const currentAuthState = latestAuthStateRef.current;

      if (currentAuthState.status !== "READY") {
        return createSkippedSynchronizationResult(
          trigger,
          "Synchronizacja wymaga aktywnego profilu.",
          requestedAtIso
        );
      }

      if (!initialFirebaseServicesStatus.ready) {
        const result = createSkippedSynchronizationResult(
          trigger,
          "Synchronizacja wymaga poprawnej konfiguracji Firebase.",
          requestedAtIso
        );

        if (trigger === "MANUAL_RETRY") {
          setLastSyncError(result.message);
        }

        return result;
      }

      if (syncInFlightRef.current) {
        const decision = evaluateSynchronizationTrigger({
          authReady: true,
          hasLocalDataForAccount: true,
          inFlight: true,
          isOnline: latestIsOnlineRef.current,
          isVisible: isDocumentVisible(),
          trigger
        });
        const result = createSkippedSynchronizationResult(
          trigger,
          decision.message,
          requestedAtIso
        );

        if (trigger === "MANUAL_RETRY") {
          setLastSyncError(result.message);
        }

        return result;
      }

      syncInFlightRef.current = true;

      try {
        const accountQuery = {
          deviceId,
          userUid: currentAuthState.profile.uid
        };
        const [hasLocalDataResult, currentDocuments] = await Promise.all([
          synchronizationApi.hasLocalData(env, accountQuery),
          synchronizationApi.listLocalDocuments(env, accountQuery)
        ]);
        const hasLocalDataForAccount = hasLocalDataResult || currentDocuments.length > 0;
        const decision = evaluateSynchronizationTrigger({
          authReady: true,
          hasLocalDataForAccount,
          inFlight: false,
          isOnline: latestIsOnlineRef.current,
          isVisible: isDocumentVisible(),
          trigger
        });

        setSyncDocuments([...currentDocuments]);

        if (!decision.shouldRun) {
          if (decision.reason === "NO_LOCAL_DATA") {
            setLastSyncError(null);
          } else if (trigger === "MANUAL_RETRY") {
            setLastSyncError(decision.message);
          }

          return createSkippedSynchronizationResult(
            trigger,
            decision.message,
            requestedAtIso
          );
        }

        const result = await synchronizationApi.synchronize(
          env,
          createSynchronizationRequest({
            deviceId,
            pendingDocumentCount: currentDocuments.length,
            requestedAtIso,
            trigger,
            userRole: currentAuthState.profile.role,
            userUid: currentAuthState.profile.uid
          })
        );
        const refreshedDocuments = await synchronizationApi.listLocalDocuments(
          env,
          accountQuery
        );

        setSyncDocuments([...refreshedDocuments]);
        setLastSyncError(result.status === "FAILED" ? result.message : null);

        return result;
      } catch (syncError: unknown) {
        const message = getSynchronizationErrorMessage(syncError);

        setLastSyncError(message);

        return createFailedSynchronizationResult(trigger, message, requestedAtIso);
      } finally {
        syncInFlightRef.current = false;
      }
    },
    [deviceId, env, initialFirebaseServicesStatus.ready, synchronizationApi]
  );

  useEffect(() => {
    if (authState.status !== "READY") {
      lastReadySyncUidRef.current = null;
      if (authState.status !== "BLOCKED") {
        setSyncDocuments([]);
      }
      return;
    }

    const currentUid = authState.profile.uid;
    const trigger = !firstReadySyncHandledRef.current
      ? initialAuthReadyRef.current
        ? "APP_START"
        : "AUTH_LOCAL_DATA_READY"
      : lastReadySyncUidRef.current !== currentUid
        ? "AUTH_LOCAL_DATA_READY"
        : null;

    firstReadySyncHandledRef.current = true;
    lastReadySyncUidRef.current = currentUid;

    if (trigger) {
      void requestSynchronization(trigger);
    }
  }, [authState, requestSynchronization]);

  useEffect(() => {
    const synchronizeAfterOnline = () => {
      latestIsOnlineRef.current = true;
      void requestSynchronization("ONLINE_RESTORED");
    };
    const synchronizeAfterActivation = () => {
      void requestSynchronization("APP_ACTIVATED");
    };
    const synchronizeWhenVisible = () => {
      if (document.visibilityState === "visible") {
        void requestSynchronization("APP_ACTIVATED");
      }
    };

    globalThis.addEventListener("online", synchronizeAfterOnline);
    globalThis.addEventListener("focus", synchronizeAfterActivation);
    document.addEventListener("visibilitychange", synchronizeWhenVisible);

    return () => {
      globalThis.removeEventListener("online", synchronizeAfterOnline);
      globalThis.removeEventListener("focus", synchronizeAfterActivation);
      document.removeEventListener("visibilitychange", synchronizeWhenVisible);
    };
  }, [requestSynchronization]);

  useEffect(() => {
    let isMounted = true;

    const refreshActiveSession = () => {
      const currentState = latestAuthStateRef.current;

      if (
        !isOnline ||
        !hasAuthenticatedUser(currentState) ||
        currentState.status === "PROFILE_LOADING" ||
        refreshInFlightRef.current ||
        document.visibilityState === "hidden"
      ) {
        return;
      }

      refreshInFlightRef.current = true;

      void authSessionApi
        .refresh(env)
        .then((nextState) => {
          if (isMounted) {
            setAuthState(nextState);
          }
        })
        .catch(() => undefined)
        .finally(() => {
          refreshInFlightRef.current = false;
        });
    };

    const refreshWhenVisible = () => {
      if (document.visibilityState === "visible") {
        refreshActiveSession();
      }
    };

    globalThis.addEventListener("focus", refreshActiveSession);
    globalThis.addEventListener("online", refreshActiveSession);
    document.addEventListener("visibilitychange", refreshWhenVisible);

    return () => {
      isMounted = false;
      globalThis.removeEventListener("focus", refreshActiveSession);
      globalThis.removeEventListener("online", refreshActiveSession);
      document.removeEventListener("visibilitychange", refreshWhenVisible);
    };
  }, [authSessionApi, env, isOnline]);

  useEffect(() => {
    if (
      !initialFirebaseServicesStatus.ready ||
      !isOnline ||
      authState.status !== "READY"
    ) {
      return;
    }

    void deviceRegistryApi
      .register(env, {
        deviceId,
        userUid: authState.profile.uid,
        deviceName: deviceIdentity.name,
        platform: deviceIdentity.platform,
        trustedOfflineStorage: authState.profile.offlineConsent
      })
      .catch(() => undefined);
  }, [
    authState,
    deviceId,
    deviceIdentity,
    deviceRegistryApi,
    env,
    initialFirebaseServicesStatus.ready,
    isOnline
  ]);

  const today = useMemo(() => formatBusinessDate(APP_META.buildDate), []);
  const diagnostics = useMemo(
    () => ({
      deviceId,
      deviceName: deviceIdentity.name,
      devicePlatform: deviceIdentity.platform ?? "brak",
      launchedAt: new Intl.DateTimeFormat("pl-PL", {
        dateStyle: "medium",
        timeStyle: "medium",
        timeZone: "Europe/Warsaw"
      }).format(new Date())
    }),
    [deviceId, deviceIdentity]
  );

  const handleProfileUpdated = (profile: UserProfile) => {
    setAuthState((currentState) => {
      if ("profile" in currentState && currentState.profile.uid === profile.uid) {
        return {
          ...currentState,
          profile
        };
      }

      return currentState;
    });
  };
  const handleManualSynchronization = useCallback(async () => {
    const result = await requestSynchronization("MANUAL_RETRY");

    return {
      message: result.message
    };
  }, [requestSynchronization]);

  return (
    <div className="app-shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">System ewidencji</p>
          <h1>Borowka PWA</h1>
        </div>
        <div className="topbar__meta" aria-label="Metadane aplikacji">
          <span>{APP_META.environment}</span>
          <span>v{APP_META.version}</span>
        </div>
      </header>

      <nav className="nav-tabs" aria-label="Nawigacja glowna">
        {navigationItems.map((item) => {
          const Icon = item.icon;
          const isActive = item.key === activeView;

          return (
            <button
              className="nav-tabs__button"
              aria-current={isActive ? "page" : undefined}
              key={item.key}
              onClick={() => {
                setActiveView(item.key);
              }}
              type="button"
              title={item.label}
            >
              <Icon aria-hidden="true" size={18} strokeWidth={2.2} />
              <span>{item.label}</span>
            </button>
          );
        })}
      </nav>

      <main className="workspace">
        <section className="status-band" aria-label="Status aplikacji">
          <StatusItem
            icon={isOnline ? Wifi : CloudOff}
            label={isOnline ? "Online" : "Offline"}
            tone={isOnline ? "ok" : "warn"}
          />
          <StatusItem
            icon={firebaseStatus.ready ? CheckCircle2 : AlertTriangle}
            label={
              firebaseStatus.ready ? "Firebase gotowy" : "Firebase brak konfiguracji"
            }
            tone={firebaseStatus.ready ? "ok" : "warn"}
          />
          <StatusItem label={`Schemat ${APP_META.schemaVersion}`} tone="neutral" />
          <StatusItem
            label={`Kalkulacje ${APP_META.calculationVersion}`}
            tone="neutral"
          />
          <StatusItem
            icon={firebaseServicesStatus.initialized ? CheckCircle2 : AlertTriangle}
            label={
              firebaseServicesStatus.initialized
                ? "Uslugi Firebase gotowe"
                : "Uslugi Firebase nieaktywne"
            }
            tone={firebaseServicesStatus.initialized ? "ok" : "warn"}
          />
          <StatusItem
            icon={authState.status === "READY" ? UserRound : AlertTriangle}
            label={authStatusLabel(authState)}
            tone={authStatusTone(authState)}
          />
        </section>

        <section className="primary-panel" aria-labelledby="active-panel-title">
          <div>
            <p className="eyebrow">{panel.status}</p>
            <h2 id="active-panel-title">{panel.title}</h2>
            <p className="panel-detail">{panel.detail}</p>
          </div>

          <dl className="metrics-grid" aria-label="Przyklady formatowania domenowego">
            <Metric label="Data biznesowa" value={today} />
            <Metric label="Masa" value={formatKilograms(631510)} />
            <Metric label="Kwota" value={formatMoney(501615)} />
          </dl>
        </section>

        {activeView === "diagnostics" ? (
          <section className="diagnostics" aria-label="Diagnostyka">
            <DiagnosticRow label="Srodowisko" value={APP_META.environment} />
            <DiagnosticRow label="Wersja aplikacji" value={APP_META.version} />
            <DiagnosticRow label="Wersja schematu" value={APP_META.schemaVersion} />
            <DiagnosticRow label="Regula obliczen" value={APP_META.calculationVersion} />
            <DiagnosticRow label="Ostatnie uruchomienie" value={diagnostics.launchedAt} />
            <DiagnosticRow
              label="Identyfikator urzadzenia"
              value={diagnostics.deviceId}
            />
            <DiagnosticRow label="Nazwa urzadzenia" value={diagnostics.deviceName} />
            <DiagnosticRow
              label="Platforma urzadzenia"
              value={diagnostics.devicePlatform}
            />
            <DiagnosticRow
              label="Service worker"
              value={serviceWorkerStatusLabel[serviceWorkerStatus]}
            />
            <DiagnosticRow label="Tryb Firebase" value={firebaseRuntimeStatus.label} />
            <DiagnosticRow
              label="Uslugi Firebase"
              value={firebaseServicesStatus.message}
            />
            <DiagnosticRow
              label="Auth i Firestore"
              value={
                firebaseServicesStatus.initialized
                  ? "zainicjalizowane"
                  : "niezainicjalizowane"
              }
            />
            <DiagnosticRow label="Sesja logowania" value={authState.message} />
            <DiagnosticRow
              label="Ostrzezenia konfiguracji"
              value={
                firebaseRuntimeStatus.warnings.length > 0
                  ? firebaseRuntimeStatus.warnings.join("; ")
                  : "brak"
              }
            />
            <DiagnosticRow
              label="Firebase"
              value={firebaseStatus.ready ? "skonfigurowany" : firebaseStatus.message}
            />
          </section>
        ) : null}

        {activeView === "login" ? (
          <AuthPanel
            authSessionApi={authSessionApi}
            authState={authState}
            deviceIdentity={deviceIdentity}
            deviceId={diagnostics.deviceId}
            env={env}
            isOnline={isOnline}
            onAuthStateUpdated={setAuthState}
            onProfileUpdated={handleProfileUpdated}
          />
        ) : null}

        {activeView === "admin" ? (
          <>
            <AdminUserDirectoryPanel
              authState={authState}
              env={env}
              userDirectoryApi={userDirectoryApi}
            />
            <AdminSeasonsPanel authState={authState} env={env} seasonsApi={seasonsApi} />
            <AdminSettlementPlansPanel
              authState={authState}
              env={env}
              settlementPlansApi={settlementPlansApi}
            />
            <WorkerDirectoryPanel
              authState={authState}
              env={env}
              workerDirectoryApi={workerDirectoryApi}
            />
            <AdminRegistrationInvitationsPanel
              authState={authState}
              env={env}
              registrationInvitationsApi={registrationInvitationsApi}
            />
            <AdminDeviceDirectoryPanel
              authState={authState}
              env={env}
              deviceDirectoryApi={deviceDirectoryApi}
            />
          </>
        ) : null}

        {activeView === "operator" ? (
          <>
            <OperatorHarvestSessionsPanel
              authState={authState}
              env={env}
              harvestSessionsApi={harvestSessionsApi}
              isOnline={isOnline}
            />
            <WorkerDirectoryPanel
              authState={authState}
              env={env}
              workerDirectoryApi={workerDirectoryApi}
            />
          </>
        ) : null}

        {activeView === "settings" ? (
          <ConfigurationCachePanel
            authState={authState}
            configurationCacheApi={configurationCacheApi}
            deviceId={deviceId}
            env={env}
            isOnline={isOnline}
            lastSyncError={lastSyncError}
            onRetrySync={handleManualSynchronization}
            serviceWorkerStatus={serviceWorkerStatus}
            syncDocuments={syncDocuments}
          />
        ) : null}
      </main>
    </div>
  );
}

function StatusItem({
  icon: Icon,
  label,
  tone
}: {
  icon?: LucideIcon;
  label: string;
  tone: "ok" | "warn" | "neutral";
}) {
  return (
    <div className={`status-item status-item--${tone}`}>
      {Icon ? <Icon aria-hidden="true" size={18} strokeWidth={2.2} /> : null}
      <span>{label}</span>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="metric">
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

function DiagnosticRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="diagnostics__row">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function AuthPanel({
  authSessionApi,
  authState,
  deviceIdentity,
  deviceId,
  env,
  isOnline,
  onAuthStateUpdated,
  onProfileUpdated
}: {
  authSessionApi: AuthSessionApi;
  authState: AuthSessionState;
  deviceIdentity: DeviceIdentity;
  deviceId: string;
  env: FirebaseEnv;
  isOnline: boolean;
  onAuthStateUpdated: (state: AuthSessionState) => void;
  onProfileUpdated: (profile: UserProfile) => void;
}) {
  const [mode, setMode] = useState<"login" | "reset" | "register">("login");
  const [email, setEmail] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [password, setPassword] = useState("");
  const [passwordConfirmation, setPasswordConfirmation] = useState("");
  const [acceptsPrerelease, setAcceptsPrerelease] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const isUnavailable =
    authState.status === "CONFIGURATION_REQUIRED" ||
    authState.status === "ERROR" ||
    authState.status === "LOADING";

  const handleSubmit = async (event: SyntheticEvent<HTMLFormElement>) => {
    event.preventDefault();
    setFeedback(null);
    setError(null);

    const trimmedEmail = email.trim();

    if (!trimmedEmail.includes("@")) {
      setError("Podaj poprawny e-mail.");
      return;
    }

    if (mode === "login" && password.length === 0) {
      setError("Podaj haslo.");
      return;
    }

    if (mode === "register") {
      const validationError = validateInvitedRegistrationInput({
        email: trimmedEmail,
        displayName,
        password,
        passwordConfirmation,
        acceptsPrerelease
      });

      if (validationError) {
        setError(validationError);
        return;
      }
    }

    setIsSubmitting(true);

    try {
      if (mode === "login") {
        await authSessionApi.signIn(env, {
          email: trimmedEmail,
          password
        });
        setFeedback("Logowanie przyjete. Pobieram profil.");
        setPassword("");
      } else if (mode === "reset") {
        await authSessionApi.requestPasswordReset(env, trimmedEmail);
        setFeedback(PASSWORD_RESET_CONFIRMATION);
      } else {
        await authSessionApi.register(env, {
          email: trimmedEmail,
          displayName,
          password,
          passwordConfirmation,
          acceptsPrerelease
        });
        const nextAuthState = await authSessionApi.refresh(env);
        onAuthStateUpdated(nextAuthState);
        setFeedback(
          nextAuthState.status === "READY"
            ? "Konto zostalo utworzone i profil jest aktywny."
            : "Konto zostalo utworzone. Pobieram profil."
        );
        setDisplayName("");
        setPassword("");
        setPasswordConfirmation("");
        setAcceptsPrerelease(false);
      }
    } catch (submitError: unknown) {
      setError(
        mode === "login"
          ? getLoginErrorMessage(submitError)
          : mode === "reset"
            ? getPasswordResetErrorMessage(submitError)
            : getInvitedRegistrationErrorMessage(submitError)
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSignOut = async () => {
    setFeedback(null);
    setError(null);
    setIsSubmitting(true);

    try {
      await authSessionApi.signOut(env);
      setFeedback("Wylogowano z aplikacji.");
    } catch {
      setError("Nie udalo sie wylogowac. Sprobuj ponownie.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleOfflineConsentChange = async (offlineConsent: boolean) => {
    if (!("profile" in authState)) {
      return;
    }

    setFeedback(null);
    setError(null);

    if (!isOnline) {
      setError("Zmiana zgody offline wymaga polaczenia online.");
      return;
    }

    setIsSubmitting(true);

    const nextProfile = {
      ...authState.profile,
      offlineConsent
    };

    try {
      await authSessionApi.updateOfflineConsent(env, {
        uid: authState.profile.uid,
        offlineConsent,
        deviceId,
        deviceName: deviceIdentity.name,
        platform: deviceIdentity.platform
      });
      onProfileUpdated(nextProfile);
      setFeedback(
        offlineConsent ? "Zgoda offline wlaczona." : "Zgoda offline wylaczona."
      );
    } catch (updateError: unknown) {
      setError(getOfflineConsentUpdateErrorMessage(updateError));
    } finally {
      setIsSubmitting(false);
    }
  };

  if (hasAuthenticatedUser(authState)) {
    return (
      <section className="auth-panel" aria-label="Sesja logowania">
        <div className="auth-card">
          <div>
            <p className="eyebrow">{profileStateTitle(authState)}</p>
            <h2>{displaySessionName(authState)}</h2>
            <p className="panel-detail">{authState.message}</p>
          </div>

          <dl className="auth-summary" aria-label="Profil aplikacji">
            <AuthSummaryRow label="Nazwa" value={displaySessionName(authState)} />
            <AuthSummaryRow label="E-mail" value={authState.user.email ?? "brak"} />
            {"profile" in authState ? (
              <>
                <AuthSummaryRow label="Rola" value={roleLabel(authState.profile.role)} />
                <AuthSummaryRow
                  label="Status konta"
                  value={accountStatusLabel(authState.profile)}
                />
                <AuthSummaryRow
                  label="Powiazany zbieracz"
                  value={authState.profile.workerId ?? "brak"}
                />
                <AuthSummaryRow
                  label="Zgoda offline"
                  value={offlineConsentLabel(authState.profile.offlineConsent)}
                />
              </>
            ) : null}
            <AuthSummaryRow label="Identyfikator urzadzenia" value={deviceId} />
            <AuthSummaryRow label="Nazwa urzadzenia" value={deviceIdentity.name} />
            <AuthSummaryRow label="Wersja aplikacji" value={`v${APP_META.version}`} />
          </dl>

          {"profile" in authState ? (
            <div className="offline-consent" aria-label="Zaufane urzadzenie offline">
              <div className="worker-rate-form__heading">
                <AlertTriangle aria-hidden="true" size={18} strokeWidth={2.2} />
                <h3>Zaufane urzadzenie offline</h3>
              </div>
              <ul className="worker-profile__list">
                {TRUSTED_OFFLINE_STORAGE_DISCLOSURE.map((disclosure) => (
                  <li key={disclosure}>{disclosure}</li>
                ))}
              </ul>
              <label className="checkbox-field">
                <input
                  checked={authState.profile.offlineConsent}
                  disabled={isSubmitting || !isOnline}
                  onChange={(event) => {
                    void handleOfflineConsentChange(event.target.checked);
                  }}
                  type="checkbox"
                />
                <span>Zgoda na trwale dane offline</span>
              </label>
              {!isOnline ? (
                <p className="worker-form__warning">
                  Zmiana zgody offline wymaga polaczenia online.
                </p>
              ) : null}
            </div>
          ) : null}

          {feedback ? <p className="form-message form-message--ok">{feedback}</p> : null}
          {error ? <p className="form-message form-message--error">{error}</p> : null}

          <button
            className="primary-action"
            disabled={isSubmitting}
            onClick={() => {
              void handleSignOut();
            }}
            type="button"
          >
            <LogOut aria-hidden="true" size={18} strokeWidth={2.2} />
            <span>Wyloguj</span>
          </button>
        </div>
      </section>
    );
  }

  return (
    <section className="auth-panel" aria-label="Logowanie">
      <form
        className="auth-card"
        onSubmit={(event) => {
          void handleSubmit(event);
        }}
      >
        <div>
          <p className="eyebrow">{authModeEyebrow(mode)}</p>
          <h2>{authModeTitle(mode)}</h2>
          <p className="panel-detail">{authState.message}</p>
        </div>

        <label className="field">
          <span>E-mail</span>
          <input
            autoComplete="email"
            disabled={isUnavailable || isSubmitting}
            inputMode="email"
            onChange={(event) => {
              setEmail(event.target.value);
            }}
            type="email"
            value={email}
          />
        </label>

        {mode === "register" ? (
          <label className="field">
            <span>Imie i nazwisko</span>
            <input
              autoComplete="name"
              disabled={isUnavailable || isSubmitting}
              onChange={(event) => {
                setDisplayName(event.target.value);
              }}
              type="text"
              value={displayName}
            />
          </label>
        ) : null}

        {mode === "login" || mode === "register" ? (
          <label className="field">
            <span>Haslo</span>
            <span className="password-field">
              <input
                autoComplete={mode === "register" ? "new-password" : "current-password"}
                disabled={isUnavailable || isSubmitting}
                onChange={(event) => {
                  setPassword(event.target.value);
                }}
                type={showPassword ? "text" : "password"}
                value={password}
              />
              <button
                aria-label={showPassword ? "Ukryj haslo" : "Pokaz haslo"}
                className="icon-button"
                disabled={isUnavailable || isSubmitting}
                onClick={() => {
                  setShowPassword((current) => !current);
                }}
                title={showPassword ? "Ukryj haslo" : "Pokaz haslo"}
                type="button"
              >
                {showPassword ? (
                  <EyeOff aria-hidden="true" size={18} strokeWidth={2.2} />
                ) : (
                  <Eye aria-hidden="true" size={18} strokeWidth={2.2} />
                )}
              </button>
            </span>
          </label>
        ) : null}

        {mode === "register" ? (
          <>
            <label className="field">
              <span>Powtorz haslo</span>
              <input
                autoComplete="new-password"
                disabled={isUnavailable || isSubmitting}
                onChange={(event) => {
                  setPasswordConfirmation(event.target.value);
                }}
                type={showPassword ? "text" : "password"}
                value={passwordConfirmation}
              />
            </label>

            <label className="checkbox-field">
              <input
                checked={acceptsPrerelease}
                disabled={isUnavailable || isSubmitting}
                onChange={(event) => {
                  setAcceptsPrerelease(event.target.checked);
                }}
                type="checkbox"
              />
              <span>Akceptuje prerejestracje administratora</span>
            </label>
          </>
        ) : null}

        {feedback ? <p className="form-message form-message--ok">{feedback}</p> : null}
        {error ? <p className="form-message form-message--error">{error}</p> : null}

        <div className="auth-actions">
          <button
            className="primary-action"
            disabled={isUnavailable || isSubmitting}
            type="submit"
          >
            {mode === "login" ? (
              <LogIn aria-hidden="true" size={18} strokeWidth={2.2} />
            ) : mode === "reset" ? (
              <RotateCcw aria-hidden="true" size={18} strokeWidth={2.2} />
            ) : (
              <UserRound aria-hidden="true" size={18} strokeWidth={2.2} />
            )}
            <span>{authPrimaryActionLabel(mode)}</span>
          </button>

          <button
            className="secondary-action"
            disabled={isSubmitting}
            onClick={() => {
              setMode((current) => (current === "reset" ? "login" : "reset"));
              setFeedback(null);
              setError(null);
            }}
            type="button"
          >
            {mode === "reset" ? "Wroc do logowania" : "Nie pamietam hasla"}
          </button>

          <button
            className="secondary-action"
            disabled={isSubmitting}
            onClick={() => {
              setMode((current) => (current === "register" ? "login" : "register"));
              setFeedback(null);
              setError(null);
            }}
            type="button"
          >
            {mode === "register" ? "Wroc do logowania" : "Zaloz konto"}
          </button>
        </div>
      </form>
    </section>
  );
}

function authModeEyebrow(mode: "login" | "reset" | "register"): string {
  switch (mode) {
    case "login":
      return "Dostep do aplikacji";
    case "reset":
      return "Reset hasla";
    case "register":
      return "Zaproszenie";
  }
}

function authModeTitle(mode: "login" | "reset" | "register"): string {
  switch (mode) {
    case "login":
      return "Zaloguj sie";
    case "reset":
      return "Nie pamietam hasla";
    case "register":
      return "Zaloz konto";
  }
}

function authPrimaryActionLabel(mode: "login" | "reset" | "register"): string {
  switch (mode) {
    case "login":
      return "Zaloguj";
    case "reset":
      return "Wyslij reset";
    case "register":
      return "Zaloz konto";
  }
}

function AuthSummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="auth-summary__row">
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

function createSkippedSynchronizationResult(
  trigger: SynchronizationTrigger,
  message: string,
  requestedAtIso: string
): SynchronizationRunResult {
  return {
    finishedAtIso: requestedAtIso,
    message,
    requestedAtIso,
    status: "SKIPPED",
    trigger
  };
}

function createFailedSynchronizationResult(
  trigger: SynchronizationTrigger,
  message: string,
  requestedAtIso: string
): SynchronizationRunResult {
  return {
    finishedAtIso: new Date().toISOString(),
    message,
    requestedAtIso,
    status: "FAILED",
    trigger
  };
}

function getSynchronizationErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  return "Nie udalo sie uruchomic synchronizacji.";
}

function isDocumentVisible(): boolean {
  return typeof document === "undefined" || document.visibilityState !== "hidden";
}

function hasAuthenticatedUser(
  state: AuthSessionState
): state is AuthSessionState & { user: AuthenticatedUser } {
  return "user" in state;
}

function authStatusLabel(state: AuthSessionState): string {
  switch (state.status) {
    case "READY":
      return `Konto: ${roleLabel(state.profile.role)}`;
    case "SIGNED_OUT":
      return "Konto: niezalogowany";
    case "LOADING":
      return "Konto: sprawdzanie";
    case "PROFILE_LOADING":
      return "Konto: profil";
    case "CONFIGURATION_REQUIRED":
      return "Konto: brak konfiguracji";
    case "ERROR":
      return "Konto: blad sesji";
    case "MISSING_PROFILE":
      return "Konto: brak profilu";
    case "BLOCKED":
      return "Konto: zablokowane";
    case "PENDING_APPROVAL":
      return "Konto: niezatwierdzone";
    case "INVALID_PICKER_PROFILE":
      return "Konto: blad pickera";
    case "INVALID_PROFILE":
      return "Konto: profil bledny";
    case "PROFILE_UNAVAILABLE":
      return "Konto: profil niedostepny";
  }
}

function authStatusTone(state: AuthSessionState): "ok" | "warn" | "neutral" {
  if (state.status === "READY") {
    return "ok";
  }

  if (state.status === "SIGNED_OUT" || state.status === "LOADING") {
    return "neutral";
  }

  return "warn";
}

function profileStateTitle(state: AuthSessionState & { user: AuthenticatedUser }) {
  switch (state.status) {
    case "READY":
      return "Profil aktywny";
    case "PROFILE_LOADING":
      return "Pobieranie profilu";
    case "MISSING_PROFILE":
      return "Brak profilu";
    case "BLOCKED":
      return "Konto zablokowane";
    case "PENDING_APPROVAL":
      return "Konto niezatwierdzone";
    case "INVALID_PICKER_PROFILE":
      return "Profil pickera";
    case "INVALID_PROFILE":
      return "Profil bledny";
    case "PROFILE_UNAVAILABLE":
      return "Profil niedostepny";
  }
}

function displaySessionName(state: AuthSessionState & { user: AuthenticatedUser }) {
  if ("profile" in state) {
    return state.profile.displayName;
  }

  return state.user.displayName ?? state.user.email ?? state.user.uid;
}

function accountStatusLabel(profile: UserProfile): string {
  if (!profile.active || profile.registrationStatus === "BLOCKED") {
    return "zablokowane";
  }

  return registrationStatusLabel(profile.registrationStatus);
}

function registrationStatusLabel(status: UserProfile["registrationStatus"]): string {
  switch (status) {
    case "APPROVED":
      return "zatwierdzone";
    case "REJECTED":
      return "odrzucone";
    case "BLOCKED":
      return "zablokowane";
  }
}

function offlineConsentLabel(offlineConsent: boolean): string {
  return offlineConsent ? "zgoda aktywna" : "brak zgody";
}

function roleLabel(role: string): string {
  switch (role) {
    case "ADMIN":
      return "Administrator";
    case "OPERATOR":
      return "Operator";
    case "PICKER":
      return "Zbieracz";
    default:
      return role;
  }
}
