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
import { useEffect, useMemo, useState, type SyntheticEvent } from "react";

import {
  PASSWORD_RESET_CONFIRMATION,
  getInitialAuthSessionState,
  getLoginErrorMessage,
  getPasswordResetErrorMessage,
  requestPasswordResetEmail,
  signInWithEmailPassword,
  signOutCurrentUser,
  subscribeToAuthSession,
  type AuthenticatedUser,
  type AuthSessionListener,
  type AuthSessionState
} from "../auth/authSession";
import { APP_META } from "../config/appMeta";
import { getFirebaseClientConfigStatus } from "../config/firebaseClientConfig";
import { getFirebaseRuntimeStatus } from "../config/firebaseRuntime";
import {
  getFirebaseServicesStatus,
  initializeFirebaseServicesIfReady
} from "../config/firebaseServices";
import { getOrCreateDeviceId } from "../domain/device";
import { formatBusinessDate, formatKilograms, formatMoney } from "../domain/format";
import {
  AdminUserDirectoryPanel,
  defaultUserDirectoryApi,
  type UserDirectoryApi
} from "../users/AdminUserDirectoryPanel";
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
  signOut: (env: FirebaseEnv) => Promise<void>;
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
  signOut: signOutCurrentUser
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
    detail: "Administrator widzi profile aplikacyjne z kolekcji users."
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
  userDirectoryApi = defaultUserDirectoryApi
}: {
  authSessionApi?: AuthSessionApi;
  userDirectoryApi?: UserDirectoryApi;
} = {}) {
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

  const today = useMemo(() => formatBusinessDate(APP_META.buildDate), []);
  const diagnostics = useMemo(
    () => ({
      deviceId: getOrCreateDeviceId(),
      launchedAt: new Intl.DateTimeFormat("pl-PL", {
        dateStyle: "medium",
        timeStyle: "medium",
        timeZone: "Europe/Warsaw"
      }).format(new Date())
    }),
    []
  );

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
          <AuthPanel authSessionApi={authSessionApi} authState={authState} env={env} />
        ) : null}

        {activeView === "admin" ? (
          <AdminUserDirectoryPanel
            authState={authState}
            env={env}
            userDirectoryApi={userDirectoryApi}
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
  env
}: {
  authSessionApi: AuthSessionApi;
  authState: AuthSessionState;
  env: FirebaseEnv;
}) {
  const [mode, setMode] = useState<"login" | "reset">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
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

    setIsSubmitting(true);

    try {
      if (mode === "login") {
        await authSessionApi.signIn(env, {
          email: trimmedEmail,
          password
        });
        setFeedback("Logowanie przyjete. Pobieram profil.");
        setPassword("");
      } else {
        await authSessionApi.requestPasswordReset(env, trimmedEmail);
        setFeedback(PASSWORD_RESET_CONFIRMATION);
      }
    } catch (submitError: unknown) {
      setError(
        mode === "login"
          ? getLoginErrorMessage(submitError)
          : getPasswordResetErrorMessage(submitError)
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
            <AuthSummaryRow label="E-mail" value={authState.user.email ?? "brak"} />
            {"profile" in authState ? (
              <>
                <AuthSummaryRow label="Rola" value={roleLabel(authState.profile.role)} />
                <AuthSummaryRow
                  label="Status"
                  value={authState.profile.registrationStatus}
                />
                <AuthSummaryRow
                  label="workerId"
                  value={authState.profile.workerId ?? "brak"}
                />
              </>
            ) : null}
          </dl>

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
          <p className="eyebrow">
            {mode === "login" ? "Dostep do aplikacji" : "Reset hasla"}
          </p>
          <h2>{mode === "login" ? "Zaloguj sie" : "Nie pamietam hasla"}</h2>
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

        {mode === "login" ? (
          <label className="field">
            <span>Haslo</span>
            <span className="password-field">
              <input
                autoComplete="current-password"
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
            ) : (
              <RotateCcw aria-hidden="true" size={18} strokeWidth={2.2} />
            )}
            <span>{mode === "login" ? "Zaloguj" : "Wyslij reset"}</span>
          </button>

          <button
            className="secondary-action"
            disabled={isSubmitting}
            onClick={() => {
              setMode((current) => (current === "login" ? "reset" : "login"));
              setFeedback(null);
              setError(null);
            }}
            type="button"
          >
            {mode === "login" ? "Nie pamietam hasla" : "Wroc do logowania"}
          </button>

          <button
            className="secondary-action"
            disabled={isSubmitting}
            onClick={() => {
              setFeedback("Konto przygotowuje administrator przez prerejestracje.");
              setError(null);
            }}
            type="button"
          >
            Zaloz konto
          </button>
        </div>
      </form>
    </section>
  );
}

function AuthSummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="auth-summary__row">
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
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
