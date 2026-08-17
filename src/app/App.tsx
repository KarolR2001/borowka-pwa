import {
  AlertTriangle,
  Banknote,
  CalendarDays,
  ClipboardList,
  Database,
  Eye,
  EyeOff,
  Flag,
  LayoutDashboard,
  LogIn,
  LogOut,
  Menu,
  RefreshCw,
  RotateCcw,
  Settings2,
  ShoppingBasket,
  Smartphone,
  Trash2,
  UserCog,
  UserPlus,
  UserRound,
  Users,
  X,
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
  getPasswordResetErrorMessage,
  refreshCurrentAuthSession,
  requestPasswordReset,
  signInWithEmailPassword,
  signOutCurrentUser,
  subscribeToAuthSession,
  type AuthenticatedUser,
  type AuthSessionListener,
  type AuthSessionState
} from "../auth/authSession";
import {
  claimRegistrationInvitationForUser,
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
import { readCurrentDeviceIdentity } from "../devices/deviceIdentity";
import {
  AdminDeviceDirectoryPanel,
  defaultDeviceDirectoryApi,
  type DeviceDirectoryApi
} from "../devices/AdminDeviceDirectoryPanel";
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
  AdminPasswordResetRequestsPanel,
  defaultPasswordResetRequestsApi,
  type PasswordResetRequestsApi
} from "../passwordReset/AdminPasswordResetRequestsPanel";
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
  defaultConfigurationCacheApi,
  type ConfigurationCacheApi
} from "../offline/ConfigurationCachePanel";
import {
  updateTrustedOfflineConsent,
  type TrustedOfflineConsentUpdateInput
} from "../offline/trustedOfflineConsent";
import {
  OfflineStorageConsentPrompt,
  OfflineStorageSettings
} from "../offline/OfflineStorageConsent";
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
  defaultOfflineStorageHealthApi,
  type OfflineStorageHealthApi
} from "../offline/offlineStorageHealth";
import {
  DEVICE_CLEAR_CONFIRMATION,
  buildSafeSignOutModel,
  canConfirmDeviceClear
} from "../offline/safeSignOut";
import {
  defaultOperatorHarvestSessionsApi,
  OperatorHarvestSessionsPanel,
  type OperatorHarvestSessionsApi
} from "../harvest/OperatorHarvestSessionsPanel";
import {
  AdminPendingPaymentsPanel,
  defaultPendingPaymentsApi,
  type PendingPaymentsApi
} from "../payments/AdminPendingPaymentsPanel";
import {
  AdminPaymentDirectoryPanel,
  defaultAdminPaymentDirectoryApi,
  type AdminPaymentDirectoryApi
} from "../payments/AdminPaymentDirectoryPanel";
import {
  AdminIssueReportsPanel,
  defaultAdminIssueReportsApi,
  type AdminIssueReportsApi
} from "../issues/AdminIssueReportsPanel";
import {
  AdminDashboardPanel,
  defaultAdminDashboardApi,
  type AdminDashboardApi
} from "../dashboard/AdminDashboardPanel";
import {
  defaultOperatorDashboardApi,
  OperatorDashboardPanel,
  type OperatorDashboardApi
} from "../dashboard/OperatorDashboardPanel";
import { clearDashboardSnapshots } from "../dashboard/dashboardOfflineState";
import {
  AdminOrdinarySalesPanel,
  defaultOrdinarySalesApi,
  type OrdinarySalesApi
} from "../sales/AdminOrdinarySalesPanel";
import {
  defaultPickerIssueReportsApi,
  type PickerIssueReportsApi
} from "../issues/PickerIssueReportsPanel";
import {
  defaultPickerDashboardApi,
  type PickerDashboardApi
} from "../picker/PickerDashboardPanel";
import {
  defaultPickerHarvestListApi,
  type PickerHarvestListApi
} from "../picker/PickerHarvestListPanel";
import { PickerWorkspacePanel } from "../picker/PickerWorkspacePanel";
import {
  defaultPickerSessionDetailsApi,
  type PickerSessionDetailsApi
} from "../picker/PickerSessionDetailsPanel";
import {
  defaultPickerPaymentListApi,
  type PickerPaymentListApi
} from "../picker/PickerPaymentListPanel";
import {
  defaultPickerOfflineDataApi,
  type PickerOfflineDataApi
} from "../picker/PickerOfflineDataPanel";
import {
  AdminPickerExportSettingsPanel,
  defaultPickerExportSettingsApi,
  type PickerExportSettingsApi
} from "../picker/AdminPickerExportSettingsPanel";
import {
  defaultPickerDataExportApi,
  type PickerDataExportApi
} from "../picker/PickerDataExportPanel";
import {
  AdminFullCloudExportPanel,
  defaultFullCloudExportApi,
  type FullCloudExportApi
} from "../reports/AdminFullCloudExportPanel";
import {
  homeNavigationForRole,
  navigationItemsForRole,
  type NavigationKey
} from "./navigation";
import { useOnlineStatus } from "./useOnlineStatus";
import { useCloseDetailsOnOutsideClick } from "../ui/useCloseDetailsOnOutsideClick";
import {
  isServiceWorkerReady,
  serviceWorkerStatusLabel,
  useServiceWorkerStatus
} from "./useServiceWorkerStatus";
import { PwaUpdateController } from "../pwa/PwaUpdateNotice";
import { TransientToast } from "../ui/TransientToast";

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
  completeRegistration?: (env: FirebaseEnv, user: AuthenticatedUser) => Promise<void>;
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
  passwordResetRequestsApi?: PasswordResetRequestsApi;
  workerDirectoryApi?: WorkerDirectoryApi;
  seasonsApi?: SeasonsApi;
  settlementPlansApi?: SettlementPlansApi;
  registrationInvitationsApi?: RegistrationInvitationsApi;
  configurationCacheApi?: ConfigurationCacheApi;
  harvestSessionsApi?: OperatorHarvestSessionsApi;
  pendingPaymentsApi?: PendingPaymentsApi;
  adminPaymentDirectoryApi?: AdminPaymentDirectoryApi;
  adminIssueReportsApi?: AdminIssueReportsApi;
  adminDashboardApi?: AdminDashboardApi;
  fullCloudExportApi?: FullCloudExportApi;
  operatorDashboardApi?: OperatorDashboardApi;
  ordinarySalesApi?: OrdinarySalesApi;
  pickerDashboardApi?: PickerDashboardApi;
  pickerDataExportApi?: PickerDataExportApi;
  pickerExportSettingsApi?: PickerExportSettingsApi;
  pickerHarvestListApi?: PickerHarvestListApi;
  pickerPaymentListApi?: PickerPaymentListApi;
  pickerIssueReportsApi?: PickerIssueReportsApi;
  pickerOfflineDataApi?: PickerOfflineDataApi;
  pickerSessionDetailsApi?: PickerSessionDetailsApi;
  offlineStorageHealthApi?: OfflineStorageHealthApi;
  synchronizationApi?: SynchronizationApi;
};

const defaultAuthSessionApi: AuthSessionApi = {
  getInitialState: getInitialAuthSessionState,
  subscribe: subscribeToAuthSession,
  signIn: signInWithEmailPassword,
  requestPasswordReset,
  register: registerInvitedUser,
  completeRegistration: (env, user) => {
    if (!user.email) {
      return Promise.reject(new Error("Konto nie ma adresu e-mail."));
    }

    return claimRegistrationInvitationForUser(env, {
      email: user.email,
      uid: user.uid
    }).then(() => undefined);
  },
  refresh: refreshCurrentAuthSession,
  updateOfflineConsent: updateTrustedOfflineConsent,
  signOut: signOutCurrentUser
};

const defaultDeviceRegistryApi: DeviceRegistryApi = {
  register: registerCurrentDevice
};

type AdminWorkspaceView =
  | "DASHBOARD"
  | "HARVEST_CORRECTIONS"
  | "SALES"
  | "PAYMENTS"
  | "PAYMENT_HISTORY"
  | "WORKERS"
  | "ACCESS"
  | "ISSUES"
  | "CONFIGURATION"
  | "DATA";

type OperatorWorkspaceView = "HARVESTS" | "DASHBOARD";
type AdminAccessView = "USERS" | "INVITATIONS" | "DEVICES";
type AdminConfigurationView = "SEASONS" | "PLANS";
type AdminDataView = "PICKER_EXPORT" | "FULL_EXPORT";

const adminWorkspaceItems: readonly WorkspaceNavigationItem<AdminWorkspaceView>[] = [
  { key: "DASHBOARD", label: "Pulpit", icon: LayoutDashboard },
  { key: "HARVEST_CORRECTIONS", label: "Sesje zbiorów", icon: ClipboardList },
  { key: "SALES", label: "Sprzedaż", icon: ShoppingBasket },
  { key: "PAYMENTS", label: "Do wypłaty", icon: Banknote },
  { key: "PAYMENT_HISTORY", label: "Historia wypłat", icon: Banknote },
  { key: "WORKERS", label: "Zbieracze", icon: Users },
  { key: "ACCESS", label: "Konta", icon: UserCog },
  { key: "ISSUES", label: "Zgłoszenia", icon: Flag },
  { key: "CONFIGURATION", label: "Konfiguracja", icon: Settings2 },
  { key: "DATA", label: "Dane", icon: Database }
];

const operatorWorkspaceItems: readonly WorkspaceNavigationItem<OperatorWorkspaceView>[] =
  [
    { key: "HARVESTS", label: "Zbiory", icon: ShoppingBasket },
    { key: "DASHBOARD", label: "Pulpit", icon: LayoutDashboard }
  ];

const adminAccessItems: readonly WorkspaceNavigationItem<AdminAccessView>[] = [
  { key: "USERS", label: "Konta", icon: UserCog },
  { key: "INVITATIONS", label: "Rejestracja", icon: UserPlus },
  { key: "DEVICES", label: "Urządzenia", icon: Smartphone }
];

const adminConfigurationItems: readonly WorkspaceNavigationItem<AdminConfigurationView>[] =
  [
    { key: "SEASONS", label: "Sezony", icon: CalendarDays },
    { key: "PLANS", label: "Plany rozliczeń", icon: Settings2 }
  ];

const adminDataItems: readonly WorkspaceNavigationItem<AdminDataView>[] = [
  { key: "PICKER_EXPORT", label: "Eksport zbieracza", icon: UserRound },
  { key: "FULL_EXPORT", label: "Pełny eksport", icon: Database }
];

type WorkspaceNavigationItem<Key extends string> = {
  key: Key;
  label: string;
  icon: LucideIcon;
};

export function App({
  authSessionApi = defaultAuthSessionApi,
  deviceRegistryApi = defaultDeviceRegistryApi,
  deviceDirectoryApi = defaultDeviceDirectoryApi,
  userDirectoryApi = defaultUserDirectoryApi,
  passwordResetRequestsApi = defaultPasswordResetRequestsApi,
  workerDirectoryApi = defaultWorkerDirectoryApi,
  seasonsApi = defaultSeasonsApi,
  settlementPlansApi = defaultSettlementPlansApi,
  registrationInvitationsApi = defaultRegistrationInvitationsApi,
  configurationCacheApi = defaultConfigurationCacheApi,
  harvestSessionsApi = defaultOperatorHarvestSessionsApi,
  pendingPaymentsApi = defaultPendingPaymentsApi,
  adminPaymentDirectoryApi = defaultAdminPaymentDirectoryApi,
  adminIssueReportsApi = defaultAdminIssueReportsApi,
  adminDashboardApi = defaultAdminDashboardApi,
  fullCloudExportApi = defaultFullCloudExportApi,
  operatorDashboardApi = defaultOperatorDashboardApi,
  ordinarySalesApi = defaultOrdinarySalesApi,
  pickerDashboardApi = defaultPickerDashboardApi,
  pickerDataExportApi = defaultPickerDataExportApi,
  pickerExportSettingsApi = defaultPickerExportSettingsApi,
  pickerHarvestListApi = defaultPickerHarvestListApi,
  pickerPaymentListApi = defaultPickerPaymentListApi,
  pickerIssueReportsApi = defaultPickerIssueReportsApi,
  pickerOfflineDataApi = defaultPickerOfflineDataApi,
  pickerSessionDetailsApi = defaultPickerSessionDetailsApi,
  offlineStorageHealthApi = defaultOfflineStorageHealthApi,
  synchronizationApi = defaultSynchronizationApi
}: AppProps = {}) {
  useCloseDetailsOnOutsideClick();
  const env = import.meta.env as FirebaseEnv;
  const [activeView, setActiveView] = useState<NavigationKey>("account");
  const [adminWorkspaceView, setAdminWorkspaceView] =
    useState<AdminWorkspaceView>("DASHBOARD");
  const [operatorWorkspaceView, setOperatorWorkspaceView] =
    useState<OperatorWorkspaceView>("HARVESTS");
  const [adminAccessView, setAdminAccessView] = useState<AdminAccessView>("USERS");
  const [adminConfigurationView, setAdminConfigurationView] =
    useState<AdminConfigurationView>("SEASONS");
  const [adminDataView, setAdminDataView] = useState<AdminDataView>("PICKER_EXPORT");
  const [isMainMenuOpen, setIsMainMenuOpen] = useState(false);
  const [authState, setAuthState] = useState<AuthSessionState>(() =>
    authSessionApi.getInitialState(env)
  );
  const isOnline = useOnlineStatus();
  const [connectionMessage, setConnectionMessage] = useState<string | null>(null);
  const [dismissedOfflineConsentUid, setDismissedOfflineConsentUid] = useState<
    string | null
  >(null);
  const [offlineConsentError, setOfflineConsentError] = useState<string | null>(null);
  const [offlineConsentFeedback, setOfflineConsentFeedback] = useState<string | null>(
    null
  );
  const [isOfflineConsentSubmitting, setIsOfflineConsentSubmitting] = useState(false);
  const serviceWorkerStatus = useServiceWorkerStatus();
  const firebaseStatus = getFirebaseClientConfigStatus(env);
  const firebaseRuntimeStatus = getFirebaseRuntimeStatus(env);
  const initialFirebaseServicesStatus = useMemo(() => getFirebaseServicesStatus(env), []);
  const [firebaseServicesStatus, setFirebaseServicesStatus] = useState(
    initialFirebaseServicesStatus
  );
  const [accountSyncState, setAccountSyncState] = useState<{
    documents: SyncDocumentMetadataInput[];
    ownerUid: string | null;
  }>({
    documents: [],
    ownerUid: null
  });
  const [, setLastSyncError] = useState<string | null>(null);
  const [hasActiveForm, setHasActiveForm] = useState(false);
  const [hasActiveHarvestSession, setHasActiveHarvestSession] = useState(false);
  const latestAuthStateRef = useRef(authState);
  const latestIsOnlineRef = useRef(isOnline);
  const previousOnlineStatusRef = useRef(isOnline);
  const refreshInFlightRef = useRef(false);
  const syncInFlightRef = useRef(false);
  const initialAuthReadyRef = useRef(authState.status === "READY");
  const firstReadySyncHandledRef = useRef(false);
  const lastReadySyncUidRef = useRef<string | null>(null);
  const preparedOfflineConfigurationUidsRef = useRef(new Set<string>());
  const deviceIdentity = useMemo(() => readCurrentDeviceIdentity(), []);
  const deviceId = deviceIdentity.id;
  const currentProfileUid = "profile" in authState ? authState.profile.uid : null;
  const syncDocuments =
    currentProfileUid === accountSyncState.ownerUid ? accountSyncState.documents : [];
  const localDataInspected =
    currentProfileUid === null || currentProfileUid === accountSyncState.ownerUid;
  const hasLocalOpenHarvestSession = syncDocuments.some(
    (document) =>
      document.kind === "HARVEST_SESSION" && document.businessStatus === "OPEN"
  );
  const readyRole = authState.status === "READY" ? authState.profile.role : null;
  const roleNavigationItems = readyRole ? navigationItemsForRole(readyRole) : [];
  const roleHomeView = readyRole ? homeNavigationForRole(readyRole) : "account";
  const resolvedActiveView = roleNavigationItems.some((item) => item.key === activeView)
    ? activeView
    : roleHomeView;
  const currentScreenLabel =
    resolvedActiveView === "account"
      ? "Konto"
      : resolvedActiveView === "admin"
        ? (adminWorkspaceItems.find((item) => item.key === adminWorkspaceView)?.label ??
          "Pulpit")
        : resolvedActiveView === "operator"
          ? (operatorWorkspaceItems.find((item) => item.key === operatorWorkspaceView)
              ?.label ?? "Zbiory")
          : "Moje dane";

  useEffect(() => {
    setDismissedOfflineConsentUid(null);
    setOfflineConsentError(null);
    setOfflineConsentFeedback(null);
  }, [currentProfileUid]);

  useEffect(() => {
    if (!isMainMenuOpen) {
      return undefined;
    }

    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsMainMenuOpen(false);
      }
    };

    globalThis.addEventListener("keydown", closeOnEscape);
    return () => {
      globalThis.removeEventListener("keydown", closeOnEscape);
    };
  }, [isMainMenuOpen]);

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
            cacheMode: "MEMORY",
            ready: false,
            initialized: false,
            message: "Nie udało się uruchomić uslug Firebase."
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
            message: "Nie udało się uruchomić sesji logowania."
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

    if (previousOnlineStatusRef.current !== isOnline) {
      setConnectionMessage(
        isOnline
          ? "Połączenie zostało przywrócone. Pracujesz online."
          : "Utracono połączenie. Aplikacja przeszła w tryb offline."
      );
      previousOnlineStatusRef.current = isOnline;
    }
  }, [isOnline]);

  const dismissConnectionMessage = useCallback(() => {
    setConnectionMessage(null);
  }, []);

  useEffect(() => {
    setHasActiveForm(false);
    setHasActiveHarvestSession(false);
  }, [currentProfileUid]);

  useEffect(() => {
    if (readyRole) {
      setActiveView(homeNavigationForRole(readyRole));
    }
  }, [readyRole]);

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

        if (
          "profile" in latestAuthStateRef.current &&
          latestAuthStateRef.current.profile.uid === currentAuthState.profile.uid
        ) {
          setAccountSyncState({
            documents: [...currentDocuments],
            ownerUid: currentAuthState.profile.uid
          });
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

        if (
          "profile" in latestAuthStateRef.current &&
          latestAuthStateRef.current.profile.uid === currentAuthState.profile.uid
        ) {
          setAccountSyncState({
            documents: [...refreshedDocuments],
            ownerUid: currentAuthState.profile.uid
          });
        }
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
      if (authState.status === "BLOCKED") {
        const blockedUserUid = authState.profile.uid;

        void synchronizationApi
          .listLocalDocuments(env, {
            deviceId,
            userUid: blockedUserUid
          })
          .then((documents) => {
            if (
              "profile" in latestAuthStateRef.current &&
              latestAuthStateRef.current.profile.uid === blockedUserUid
            ) {
              setAccountSyncState({
                documents: [...documents],
                ownerUid: blockedUserUid
              });
            }
          })
          .catch(() => undefined);
      } else {
        setAccountSyncState({
          documents: [],
          ownerUid: null
        });
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
  }, [authState, deviceId, env, requestSynchronization, synchronizationApi]);

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

  useEffect(() => {
    if (
      authState.status !== "READY" ||
      !authState.profile.offlineConsent ||
      authState.profile.role === "PICKER" ||
      !isOnline ||
      !firebaseServicesStatus.initialized ||
      firebaseServicesStatus.cacheMode !== "PERSISTENT" ||
      !isServiceWorkerReady(serviceWorkerStatus) ||
      preparedOfflineConfigurationUidsRef.current.has(authState.profile.uid)
    ) {
      return;
    }

    const profile = authState.profile;
    const viewerRole = profile.role === "ADMIN" ? "ADMIN" : "OPERATOR";
    preparedOfflineConfigurationUidsRef.current.add(profile.uid);

    void offlineStorageHealthApi
      .requestPersistentStorage()
      .then(async (persistentStorageGranted) => {
        if (!persistentStorageGranted) {
          throw new Error("Przeglądarka nie przyznała trwałej pamięci.");
        }

        const result = await configurationCacheApi.prepare(env, {
          actorProfile: profile,
          viewerRole,
          deviceId,
          persistentDataCacheReady: true,
          serviceWorkerReady: true
        });

        await offlineStorageHealthApi.markConfigurationPrepared({
          deviceId,
          preparedAtIso: result.snapshot.preparedAtIso,
          userUid: profile.uid
        });
      })
      .catch(() => {
        preparedOfflineConfigurationUidsRef.current.delete(profile.uid);
      });
  }, [
    authState,
    configurationCacheApi,
    deviceId,
    env,
    firebaseServicesStatus.cacheMode,
    firebaseServicesStatus.initialized,
    isOnline,
    offlineStorageHealthApi,
    serviceWorkerStatus
  ]);

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

  const handleManualSynchronization = useCallback(async () => {
    const result = await requestSynchronization("MANUAL_RETRY");

    return {
      message: result.message
    };
  }, [requestSynchronization]);
  const readAndStoreLocalDocuments = useCallback(async () => {
    const currentAuthState = latestAuthStateRef.current;

    if (!("profile" in currentAuthState)) {
      throw new Error("Sprawdzenie danych lokalnych wymaga profilu konta.");
    }

    const documents = await synchronizationApi.listLocalDocuments(env, {
      deviceId,
      userUid: currentAuthState.profile.uid
    });

    if (
      "profile" in latestAuthStateRef.current &&
      latestAuthStateRef.current.profile.uid === currentAuthState.profile.uid
    ) {
      setAccountSyncState({
        documents: [...documents],
        ownerUid: currentAuthState.profile.uid
      });
    }

    return documents;
  }, [deviceId, env, synchronizationApi]);
  const handleLocalDocumentsChanged = useCallback(async () => {
    try {
      await readAndStoreLocalDocuments();
    } catch (error: unknown) {
      setLastSyncError(getSynchronizationErrorMessage(error));
    }
  }, [readAndStoreLocalDocuments]);
  const handleClearLocalAccountData = useCallback(async () => {
    const currentAuthState = latestAuthStateRef.current;

    if (currentAuthState.status !== "READY") {
      throw new Error("Czyszczenie urządzenia wymaga aktywnego profilu.");
    }

    const accountQuery = {
      deviceId,
      userUid: currentAuthState.profile.uid
    };

    await synchronizationApi.clearLocalData(env, accountQuery);
    await configurationCacheApi.clear({
      actorProfile: currentAuthState.profile,
      deviceId
    });
    await offlineStorageHealthApi.markConfigurationCleared(accountQuery);
    clearDashboardSnapshots({ ownerUid: currentAuthState.profile.uid });
    setAccountSyncState({
      documents: [],
      ownerUid: null
    });
    setLastSyncError(null);
  }, [configurationCacheApi, deviceId, env, offlineStorageHealthApi, synchronizationApi]);
  const dashboardOwnerKey =
    authState.status === "READY" ? authState.profile.uid : authState.status;
  const handleOfflineConsentUpdate = async (offlineConsent: boolean) => {
    if (authState.status !== "READY") {
      return;
    }

    setOfflineConsentError(null);
    setOfflineConsentFeedback(null);

    if (!isOnline) {
      setOfflineConsentError(
        "Zmiana przechowywania danych wymaga połączenia z internetem."
      );
      return;
    }

    setIsOfflineConsentSubmitting(true);

    try {
      await authSessionApi.updateOfflineConsent(env, {
        uid: authState.profile.uid,
        offlineConsent,
        deviceId,
        deviceName: deviceIdentity.name,
        platform: deviceIdentity.platform
      });
      if (offlineConsent) {
        await offlineStorageHealthApi.requestPersistentStorage();
      }
      setAuthState((current) =>
        current.status === "READY"
          ? {
              ...current,
              profile: {
                ...current.profile,
                offlineConsent
              }
            }
          : current
      );

      if (offlineConsent) {
        setOfflineConsentFeedback(
          "Zapis danych na tym urządzeniu został włączony. Pełna praca offline będzie dostępna po następnym uruchomieniu aplikacji."
        );
      } else {
        setDismissedOfflineConsentUid(authState.profile.uid);
        setOfflineConsentFeedback(
          "Przechowywanie wyłączono. Wyczyść urządzenie przy wylogowaniu, aby usunąć istniejące dane lokalne."
        );
      }
    } catch (e) {
      console.error("OFFLINE CONSENT ERROR:", e);
      setOfflineConsentError("Nie udało się zapisać zgody dla tego urządzenia.");
    } finally {
      setIsOfflineConsentSubmitting(false);
    }
  };
  const accountPanel = (
    <AuthPanel
      authSessionApi={authSessionApi}
      authState={authState}
      env={env}
      isOnline={isOnline}
      onActiveFormChange={setHasActiveForm}
      onClearLocalAccountData={handleClearLocalAccountData}
      onAuthStateUpdated={setAuthState}
      onInspectLocalData={readAndStoreLocalDocuments}
      onSynchronizeBeforeSignOut={handleManualSynchronization}
      syncDocuments={syncDocuments}
    />
  );

  if (authState.status !== "READY") {
    return (
      <main className="auth-screen">
        {connectionMessage ? (
          <TransientToast
            message={connectionMessage}
            onDismiss={dismissConnectionMessage}
            tone={isOnline ? "SUCCESS" : "WARNING"}
          />
        ) : null}
        <div className="auth-screen__content">
          <header className="auth-screen__brand">
            <h1 className="auth-screen__brand-title">
              <img
                alt="Borówka"
                className="auth-screen__brand-logo"
                src="/brand/borowka-logo.svg"
              />
            </h1>
          </header>
          {accountPanel}
        </div>
      </main>
    );
  }

  return (
    <div className="app-shell">
      {connectionMessage ? (
        <TransientToast
          message={connectionMessage}
          onDismiss={dismissConnectionMessage}
          tone={isOnline ? "SUCCESS" : "WARNING"}
        />
      ) : null}
      {offlineConsentFeedback ? (
        <TransientToast
          message={offlineConsentFeedback}
          onDismiss={() => {
            setOfflineConsentFeedback(null);
          }}
          tone="SUCCESS"
        />
      ) : null}
      {!authState.profile.offlineConsent &&
      dismissedOfflineConsentUid !== authState.profile.uid ? (
        <OfflineStorageConsentPrompt
          error={offlineConsentError}
          isOnline={isOnline}
          isSubmitting={isOfflineConsentSubmitting}
          onAccept={() => {
            void handleOfflineConsentUpdate(true);
          }}
          onDecline={() => {
            setOfflineConsentError(null);
            setDismissedOfflineConsentUid(authState.profile.uid);
          }}
        />
      ) : null}
      <header className="topbar">
        <div className="topbar__identity">
          <img
            alt=""
            aria-hidden="true"
            className="topbar__logo"
            src="/brand/borowka-logo.svg"
          />
          <div>
            <p className="topbar__user">{displaySessionName(authState)}</p>
            <h1>{currentScreenLabel}</h1>
          </div>
        </div>
        <button
          aria-expanded={isMainMenuOpen}
          aria-label="Otwórz menu"
          className="topbar__menu-button"
          onClick={() => {
            setIsMainMenuOpen(true);
          }}
          type="button"
        >
          <Menu aria-hidden="true" size={24} strokeWidth={2.2} />
        </button>
      </header>

      {isMainMenuOpen ? (
        <div
          className="app-menu-backdrop"
          onClick={() => {
            setIsMainMenuOpen(false);
          }}
          role="presentation"
        >
          <nav
            aria-label="Menu główne"
            className="app-menu"
            onClick={(event) => {
              event.stopPropagation();
            }}
          >
            <div className="app-menu__header">
              <div>
                <p className="eyebrow">Borówka</p>
                <strong>{displaySessionName(authState)}</strong>
              </div>
              <button
                aria-label="Zamknij menu"
                className="topbar__menu-button"
                onClick={() => {
                  setIsMainMenuOpen(false);
                }}
                type="button"
              >
                <X aria-hidden="true" size={22} strokeWidth={2.2} />
              </button>
            </div>
            <div className="app-menu__items">
              {roleNavigationItems.map((item) => {
                const Icon = item.icon;
                const isActive = item.key === resolvedActiveView;

                return (
                  <button
                    aria-current={isActive ? "page" : undefined}
                    className="app-menu__item"
                    key={item.key}
                    onClick={() => {
                      setActiveView(item.key);
                      setIsMainMenuOpen(false);
                    }}
                    type="button"
                  >
                    <Icon aria-hidden="true" size={20} strokeWidth={2.2} />
                    <span>{item.label}</span>
                  </button>
                );
              })}
            </div>
          </nav>
        </div>
      ) : null}

      <PwaUpdateController
        currentUserUid={currentProfileUid}
        deviceId={deviceId}
        hasActiveForm={hasActiveForm}
        hasActiveHarvestSession={hasActiveHarvestSession || hasLocalOpenHarvestSession}
        localDataInspected={localDataInspected}
        syncDocuments={syncDocuments}
      />

      <main className="workspace">
        {resolvedActiveView === "account" ? (
          <>
            {accountPanel}
            {authState.profile.offlineConsent ? (
              <OfflineStorageSettings
                isOnline={isOnline}
                isSubmitting={isOfflineConsentSubmitting}
                onDisable={() => {
                  void handleOfflineConsentUpdate(false);
                }}
              />
            ) : null}
            {authState.profile.role === "ADMIN" ? (
              <details className="technical-details">
                <summary>Informacje techniczne</summary>
                <section className="diagnostics" aria-label="Diagnostyka">
                  <DiagnosticRow label="Środowisko" value={APP_META.environment} />
                  <DiagnosticRow label="Wersja aplikacji" value={APP_META.version} />
                  <DiagnosticRow label="Identyfikator buildu" value={APP_META.buildId} />
                  <DiagnosticRow label="Wersja schematu" value={APP_META.schemaVersion} />
                  <DiagnosticRow
                    label="Reguła obliczeń"
                    value={APP_META.calculationVersion}
                  />
                  <DiagnosticRow
                    label="Ostatnie uruchomienie"
                    value={diagnostics.launchedAt}
                  />
                  <DiagnosticRow
                    label="Identyfikator urządzenia"
                    value={diagnostics.deviceId}
                  />
                  <DiagnosticRow
                    label="Nazwa urządzenia"
                    value={diagnostics.deviceName}
                  />
                  <DiagnosticRow
                    label="Platforma urządzenia"
                    value={diagnostics.devicePlatform}
                  />
                  <DiagnosticRow
                    label="Service worker"
                    value={serviceWorkerStatusLabel[serviceWorkerStatus]}
                  />
                  <DiagnosticRow
                    label="Tryb Firebase"
                    value={firebaseRuntimeStatus.label}
                  />
                  <DiagnosticRow
                    label="Uslugi Firebase"
                    value={firebaseServicesStatus.message}
                  />
                  <DiagnosticRow label="Sesja logowania" value={authState.message} />
                  <DiagnosticRow
                    label="Firebase"
                    value={
                      firebaseStatus.ready ? "skonfigurowany" : firebaseStatus.message
                    }
                  />
                </section>
              </details>
            ) : null}
          </>
        ) : null}

        {resolvedActiveView === "admin" && authState.profile.role === "ADMIN" ? (
          <>
            <WorkspaceNavigation
              activeKey={adminWorkspaceView}
              ariaLabel="Obszary administratora"
              items={adminWorkspaceItems}
              onChange={setAdminWorkspaceView}
            />
            {adminWorkspaceView === "DASHBOARD" ? (
              <AdminDashboardPanel
                api={adminDashboardApi}
                authState={authState}
                env={env}
                isOnline={isOnline}
                key={`admin-dashboard-${dashboardOwnerKey}`}
                syncDocuments={syncDocuments}
              />
            ) : adminWorkspaceView === "HARVEST_CORRECTIONS" ? (
              <OperatorHarvestSessionsPanel
                authState={authState}
                env={env}
                firestoreCacheMode={firebaseServicesStatus.cacheMode}
                harvestSessionsApi={harvestSessionsApi}
                isOnline={isOnline}
                onActiveFormChange={setHasActiveForm}
                onActiveHarvestSessionChange={setHasActiveHarvestSession}
                onLocalDocumentsChanged={handleLocalDocumentsChanged}
                serviceWorkerReady={isServiceWorkerReady(serviceWorkerStatus)}
              />
            ) : adminWorkspaceView === "SALES" ? (
              <AdminOrdinarySalesPanel
                authState={authState}
                deviceId={deviceId}
                env={env}
                isOnline={isOnline}
                ordinarySalesApi={ordinarySalesApi}
              />
            ) : adminWorkspaceView === "PAYMENTS" ? (
              <AdminPendingPaymentsPanel
                authState={authState}
                deviceId={deviceId}
                env={env}
                isOnline={isOnline}
                pendingPaymentsApi={pendingPaymentsApi}
                syncDocuments={syncDocuments}
              />
            ) : adminWorkspaceView === "PAYMENT_HISTORY" ? (
              <AdminPaymentDirectoryPanel
                adminPaymentDirectoryApi={adminPaymentDirectoryApi}
                authState={authState}
                deviceId={deviceId}
                env={env}
                isOnline={isOnline}
              />
            ) : adminWorkspaceView === "WORKERS" ? (
              <WorkerDirectoryPanel
                authState={authState}
                env={env}
                workerDirectoryApi={workerDirectoryApi}
              />
            ) : adminWorkspaceView === "ACCESS" ? (
              <>
                <WorkspaceNavigation
                  activeKey={adminAccessView}
                  ariaLabel="Obszary zarządzania kontami"
                  items={adminAccessItems}
                  onChange={setAdminAccessView}
                />
                {adminAccessView === "USERS" ? (
                  <>
                    <AdminPasswordResetRequestsPanel
                      api={passwordResetRequestsApi}
                      authState={authState}
                      env={env}
                      isOnline={isOnline}
                    />
                    <AdminUserDirectoryPanel
                      authState={authState}
                      env={env}
                      userDirectoryApi={userDirectoryApi}
                      workerDirectoryApi={workerDirectoryApi}
                    />
                  </>
                ) : adminAccessView === "INVITATIONS" ? (
                  <AdminRegistrationInvitationsPanel
                    authState={authState}
                    env={env}
                    registrationInvitationsApi={registrationInvitationsApi}
                    workerDirectoryApi={workerDirectoryApi}
                  />
                ) : (
                  <AdminDeviceDirectoryPanel
                    authState={authState}
                    env={env}
                    deviceDirectoryApi={deviceDirectoryApi}
                  />
                )}
              </>
            ) : adminWorkspaceView === "ISSUES" ? (
              <AdminIssueReportsPanel
                authState={authState}
                env={env}
                isOnline={isOnline}
                issueReportsApi={adminIssueReportsApi}
              />
            ) : adminWorkspaceView === "CONFIGURATION" ? (
              <>
                <WorkspaceNavigation
                  activeKey={adminConfigurationView}
                  ariaLabel="Obszary konfiguracji"
                  items={adminConfigurationItems}
                  onChange={setAdminConfigurationView}
                />
                {adminConfigurationView === "SEASONS" ? (
                  <AdminSeasonsPanel
                    authState={authState}
                    env={env}
                    seasonsApi={seasonsApi}
                  />
                ) : (
                  <AdminSettlementPlansPanel
                    authState={authState}
                    env={env}
                    settlementPlansApi={settlementPlansApi}
                  />
                )}
              </>
            ) : (
              <>
                <WorkspaceNavigation
                  activeKey={adminDataView}
                  ariaLabel="Obszary danych"
                  items={adminDataItems}
                  onChange={setAdminDataView}
                />
                {adminDataView === "PICKER_EXPORT" ? (
                  <AdminPickerExportSettingsPanel
                    authState={authState}
                    env={env}
                    isOnline={isOnline}
                    settingsApi={pickerExportSettingsApi}
                  />
                ) : (
                  <AdminFullCloudExportPanel
                    api={fullCloudExportApi}
                    authState={authState}
                    env={env}
                    isOnline={isOnline}
                  />
                )}
              </>
            )}
          </>
        ) : null}

        {resolvedActiveView === "operator" && authState.profile.role === "OPERATOR" ? (
          <>
            <WorkspaceNavigation
              activeKey={operatorWorkspaceView}
              ariaLabel="Obszary operatora"
              items={operatorWorkspaceItems}
              onChange={setOperatorWorkspaceView}
            />
            {operatorWorkspaceView === "HARVESTS" ? (
              <OperatorHarvestSessionsPanel
                authState={authState}
                env={env}
                firestoreCacheMode={firebaseServicesStatus.cacheMode}
                harvestSessionsApi={harvestSessionsApi}
                isOnline={isOnline}
                onActiveFormChange={setHasActiveForm}
                onActiveHarvestSessionChange={setHasActiveHarvestSession}
                onLocalDocumentsChanged={handleLocalDocumentsChanged}
                serviceWorkerReady={isServiceWorkerReady(serviceWorkerStatus)}
              />
            ) : (
              <OperatorDashboardPanel
                api={operatorDashboardApi}
                authState={authState}
                env={env}
                isOnline={isOnline}
                key={`operator-dashboard-${dashboardOwnerKey}`}
                onNewHarvest={() => {
                  setOperatorWorkspaceView("HARVESTS");
                }}
                syncDocuments={syncDocuments}
              />
            )}
          </>
        ) : null}

        {resolvedActiveView === "picker" && authState.profile.role === "PICKER" ? (
          <PickerWorkspacePanel
            authState={authState}
            cacheMode={firebaseServicesStatus.cacheMode}
            deviceId={deviceId}
            env={env}
            isOnline={isOnline}
            onLocalDocumentsChanged={handleLocalDocumentsChanged}
            pickerDataExportApi={pickerDataExportApi}
            pickerDashboardApi={pickerDashboardApi}
            pickerHarvestListApi={pickerHarvestListApi}
            pickerPaymentListApi={pickerPaymentListApi}
            pickerIssueReportsApi={pickerIssueReportsApi}
            pickerOfflineDataApi={pickerOfflineDataApi}
            pickerSessionDetailsApi={pickerSessionDetailsApi}
            syncDocuments={syncDocuments}
          />
        ) : null}
      </main>
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

function WorkspaceNavigation<Key extends string>({
  activeKey,
  ariaLabel,
  items,
  onChange
}: {
  activeKey: Key;
  ariaLabel: string;
  items: readonly WorkspaceNavigationItem<Key>[];
  onChange: (key: Key) => void;
}) {
  return (
    <div className="workspace-tabs" role="tablist" aria-label={ariaLabel}>
      {items.map((item) => {
        const Icon = item.icon;
        const isActive = item.key === activeKey;

        return (
          <button
            aria-selected={isActive}
            className={isActive ? "workspace-tab is-active" : "workspace-tab"}
            key={item.key}
            onClick={() => {
              onChange(item.key);
            }}
            role="tab"
            type="button"
          >
            <Icon aria-hidden="true" size={18} strokeWidth={2.2} />
            <span>{item.label}</span>
          </button>
        );
      })}
    </div>
  );
}

function AuthPanel({
  authSessionApi,
  authState,
  env,
  isOnline,
  onActiveFormChange,
  onClearLocalAccountData,
  onAuthStateUpdated,
  onInspectLocalData,
  onSynchronizeBeforeSignOut,
  syncDocuments
}: {
  authSessionApi: AuthSessionApi;
  authState: AuthSessionState;
  env: FirebaseEnv;
  isOnline: boolean;
  onActiveFormChange: (isActive: boolean) => void;
  onClearLocalAccountData: () => Promise<void>;
  onAuthStateUpdated: (state: AuthSessionState) => void;
  onInspectLocalData: () => Promise<readonly SyncDocumentMetadataInput[]>;
  onSynchronizeBeforeSignOut: () => Promise<{ message?: string } | undefined>;
  syncDocuments: readonly SyncDocumentMetadataInput[];
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
  const [isSignOutReviewOpen, setIsSignOutReviewOpen] = useState(false);
  const [isClearConfirmationOpen, setIsClearConfirmationOpen] = useState(false);
  const [clearConfirmation, setClearConfirmation] = useState("");
  const safeSignOutModel = buildSafeSignOutModel(
    syncDocuments,
    "profile" in authState ? authState.profile.role : "PICKER"
  );
  const isUnavailable =
    authState.status === "CONFIGURATION_REQUIRED" ||
    authState.status === "ERROR" ||
    authState.status === "LOADING";
  const hasActiveAuthForm =
    !hasAuthenticatedUser(authState) &&
    (mode !== "login" ||
      email.length > 0 ||
      displayName.length > 0 ||
      password.length > 0 ||
      passwordConfirmation.length > 0 ||
      acceptsPrerelease);

  useEffect(() => {
    onActiveFormChange(hasActiveAuthForm);

    return () => {
      onActiveFormChange(false);
    };
  }, [hasActiveAuthForm, onActiveFormChange]);

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
      setError("Podaj hasło.");
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
            ? "Konto zostało utworzone i profil jest aktywny."
            : "Konto zostało utworzone. Pobieram profil."
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

  const handleCompleteRegistration = async () => {
    if (!hasAuthenticatedUser(authState) || !authSessionApi.completeRegistration) {
      setError("Nie można dokończyć rejestracji. Zaloguj się ponownie.");
      return;
    }

    setFeedback(null);
    setError(null);
    setIsSubmitting(true);

    try {
      await authSessionApi.completeRegistration(env, authState.user);
      const nextAuthState = await authSessionApi.refresh(env);
      onAuthStateUpdated(nextAuthState);
      setFeedback(
        nextAuthState.status === "READY"
          ? "Rejestracja została dokończona."
          : "Zaproszenie zostało zapisane. Pobieram profil."
      );
    } catch (submitError: unknown) {
      setError(getInvitedRegistrationErrorMessage(submitError));
    } finally {
      setIsSubmitting(false);
    }
  };

  useEffect(() => {
    setIsSignOutReviewOpen(false);
    setIsClearConfirmationOpen(false);
    setClearConfirmation("");
  }, ["user" in authState ? authState.user.uid : null]);

  useEffect(() => {
    if (isSignOutReviewOpen && safeSignOutModel.canSignOut) {
      setIsSignOutReviewOpen(false);
      setFeedback("Wszystkie lokalne zmiany zostały rozliczone. Możesz się wylogować.");
    }
  }, [isSignOutReviewOpen, safeSignOutModel.canSignOut]);

  const handleSignOutRequest = async () => {
    setFeedback(null);
    setError(null);
    setIsSubmitting(true);

    try {
      const currentDocuments = await onInspectLocalData();
      const currentModel = buildSafeSignOutModel(
        currentDocuments,
        "profile" in authState ? authState.profile.role : "PICKER"
      );

      if (!currentModel.canSignOut) {
        setIsClearConfirmationOpen(false);
        setIsSignOutReviewOpen(true);
        return;
      }

      await authSessionApi.signOut(env);
      setFeedback("Wylogowano z aplikacji.");
    } catch {
      setError(
        "Nie udało się sprawdzić danych lokalnych albo wylogować. Wylogowanie pozostaje zablokowane."
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleOpenClearConfirmation = async () => {
    setFeedback(null);
    setError(null);
    setIsSubmitting(true);

    try {
      const currentDocuments = await onInspectLocalData();
      const currentModel = buildSafeSignOutModel(
        currentDocuments,
        "profile" in authState ? authState.profile.role : "PICKER"
      );

      if (!currentModel.canClearDevice) {
        setIsClearConfirmationOpen(false);
        setIsSignOutReviewOpen(true);
        setError(
          "Urządzenia nie można wyczyścić, dopóki lokalne dane nie zostaną zsynchronizowane."
        );
        return;
      }

      setIsSignOutReviewOpen(false);
      setIsClearConfirmationOpen(true);
    } catch {
      setError(
        "Nie udało się sprawdzić danych lokalnych. Czyszczenie urządzenia pozostaje zablokowane."
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSynchronizationBeforeSignOut = async () => {
    setFeedback(null);
    setError(null);
    setIsSubmitting(true);

    try {
      const result = await onSynchronizeBeforeSignOut();
      setFeedback(result?.message ?? "Synchronizacja zakończona.");
    } catch {
      setError(
        "Nie udało się zsynchronizować danych. Wylogowanie pozostaje zablokowane."
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClearDeviceAndSignOut = async () => {
    setFeedback(null);
    setError(null);
    setIsSubmitting(true);

    try {
      const currentDocuments = await onInspectLocalData();
      const currentModel = buildSafeSignOutModel(
        currentDocuments,
        "profile" in authState ? authState.profile.role : "PICKER"
      );

      if (!canConfirmDeviceClear(currentModel, clearConfirmation)) {
        if (!currentModel.canClearDevice) {
          setIsClearConfirmationOpen(false);
          setIsSignOutReviewOpen(true);
          setError(
            "Pojawiły się lokalne dane oczekujące. Czyszczenie i wylogowanie zostało zablokowane."
          );
        } else {
          setError(`Wpisz dokladnie: ${DEVICE_CLEAR_CONFIRMATION}.`);
        }
        return;
      }

      await onClearLocalAccountData();
      await authSessionApi.signOut(env);
      setFeedback("Dane lokalne urządzenia zostały wyczyszczone. Wylogowano.");
    } catch {
      setError(
        "Nie udało się bezpiecznie wyczyścić urządzenia i wylogować. Spróbuj ponownie."
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  if (hasAuthenticatedUser(authState)) {
    return (
      <section className="auth-panel" aria-label="Sesja logowania">
        <div className="auth-card">
          <div>
            <p className="eyebrow">Konto</p>
            <h2>{displaySessionName(authState)}</h2>
            {authState.status === "READY" ? (
              <p className="panel-detail">{authState.user.email ?? ""}</p>
            ) : (
              <p className="panel-detail">{authState.message}</p>
            )}
          </div>

          {feedback ? <p className="form-message form-message--ok">{feedback}</p> : null}
          {error ? <p className="form-message form-message--error">{error}</p> : null}

          {authState.status === "MISSING_PROFILE" ? (
            <div className="safe-sign-out" aria-label="Dokończenie rejestracji">
              <p className="panel-detail">
                Jeśli administrator wcześniej przygotował konto dla tego adresu e-mail,
                możesz teraz dokończyć rejestrację.
              </p>
              <button
                className="primary-action"
                disabled={isSubmitting || !isOnline}
                onClick={() => {
                  void handleCompleteRegistration();
                }}
                type="button"
              >
                <UserPlus aria-hidden="true" size={18} strokeWidth={2.2} />
                <span>Dokończ rejestrację</span>
              </button>
            </div>
          ) : null}

          {isSignOutReviewOpen ? (
            <div
              className="safe-sign-out"
              aria-label="Oczekujace dane przed wylogowaniem"
            >
              <div className="worker-rate-form__heading">
                <AlertTriangle aria-hidden="true" size={18} strokeWidth={2.2} />
                <h3>Najpierw zsynchronizuj dane</h3>
              </div>
              <p className="panel-detail">
                Na tym urządzeniu są {safeSignOutModel.pendingDocumentCount} lokalne
                dokumenty należące do tego konta. Wylogowanie jest zablokowane, aby nie
                pozostawić ich następnemu użytkownikowi.
              </p>
              {safeSignOutModel.sessions.length > 0 ? (
                <ul className="safe-sign-out__sessions">
                  {safeSignOutModel.sessions.map((session) => (
                    <li key={session.sessionId}>
                      <strong>{session.workerName}</strong>
                      <span>
                        {session.businessDate} - {session.pendingDocumentCount} dokumentów
                      </span>
                      {session.lastError ? <span>{session.lastError}</span> : null}
                    </li>
                  ))}
                </ul>
              ) : null}
              {safeSignOutModel.unassignedPendingDocumentCount > 0 ? (
                <p className="panel-detail">
                  Poza sesjami: {safeSignOutModel.unassignedPendingDocumentCount}
                  dokumentów.
                </p>
              ) : null}
              <div className="auth-actions">
                <button
                  className="primary-action"
                  disabled={isSubmitting || !isOnline}
                  onClick={() => {
                    void handleSynchronizationBeforeSignOut();
                  }}
                  type="button"
                >
                  <RefreshCw aria-hidden="true" size={18} strokeWidth={2.2} />
                  <span>{isSubmitting ? "Synchronizacja..." : "Synchronizuj teraz"}</span>
                </button>
                <button
                  className="secondary-action"
                  disabled={isSubmitting}
                  onClick={() => {
                    setIsSignOutReviewOpen(false);
                  }}
                  type="button"
                >
                  Anuluj wylogowanie
                </button>
              </div>
            </div>
          ) : null}

          {isClearConfirmationOpen ? (
            <div
              className="safe-sign-out"
              aria-label="Potwierdzenie czyszczenia urządzenia"
            >
              <div className="worker-rate-form__heading">
                <Trash2 aria-hidden="true" size={18} strokeWidth={2.2} />
                <h3>Wyczyść lokalne dane urządzenia</h3>
              </div>
              <p className="worker-form__warning">
                Operacja usunie lokalną konfigurację i kopię danych tego konta z tego
                urządzenia. Dane zsynchronizowane na serwerze pozostaną bez zmian.
              </p>
              <label className="field">
                <span>Wpisz {DEVICE_CLEAR_CONFIRMATION}, aby potwierdzić</span>
                <input
                  autoComplete="off"
                  disabled={isSubmitting}
                  onChange={(event) => {
                    setClearConfirmation(event.target.value);
                  }}
                  value={clearConfirmation}
                />
              </label>
              <div className="auth-actions">
                <button
                  className="danger-action"
                  disabled={
                    isSubmitting ||
                    !canConfirmDeviceClear(safeSignOutModel, clearConfirmation)
                  }
                  onClick={() => {
                    void handleClearDeviceAndSignOut();
                  }}
                  type="button"
                >
                  <Trash2 aria-hidden="true" size={18} strokeWidth={2.2} />
                  <span>Wyczyść urządzenie i wyloguj</span>
                </button>
                <button
                  className="secondary-action"
                  disabled={isSubmitting}
                  onClick={() => {
                    setIsClearConfirmationOpen(false);
                    setClearConfirmation("");
                  }}
                  type="button"
                >
                  Anuluj
                </button>
              </div>
            </div>
          ) : null}

          <div className="auth-actions">
            <button
              className="primary-action"
              disabled={isSubmitting}
              onClick={() => {
                void handleSignOutRequest();
              }}
              type="button"
            >
              <LogOut aria-hidden="true" size={18} strokeWidth={2.2} />
              <span>Wyloguj</span>
            </button>
            {safeSignOutModel.canClearDevice ? (
              <button
                className="secondary-action"
                disabled={isSubmitting}
                onClick={() => {
                  void handleOpenClearConfirmation();
                }}
                type="button"
              >
                <Trash2 aria-hidden="true" size={18} strokeWidth={2.2} />
                <span>Wyloguj i wyczyść urządzenie</span>
              </button>
            ) : null}
          </div>
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
          {mode === "reset" ? (
            <p className="panel-detail">
              Administrator zweryfikuje prośbę i nada nowe hasło do konta.
            </p>
          ) : null}
          {authState.status !== "SIGNED_OUT" ? (
            <p className="panel-detail">{authState.message}</p>
          ) : null}
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
            <span>Imię i nazwisko</span>
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
            <span>Hasło</span>
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
                aria-label={showPassword ? "Ukryj hasło" : "Pokaz hasło"}
                className="icon-button"
                disabled={isUnavailable || isSubmitting}
                onClick={() => {
                  setShowPassword((current) => !current);
                }}
                title={showPassword ? "Ukryj hasło" : "Pokaz hasło"}
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
              <span>Powtórz hasło</span>
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
              <span>Akceptuję prerejestracje administratora</span>
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
            {mode === "reset" ? "Wróć do logowania" : "Nie pamiętam hasła"}
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
            {mode === "register" ? "Wroc do logowania" : "Załóż konto"}
          </button>
        </div>
      </form>
    </section>
  );
}

function authModeEyebrow(mode: "login" | "reset" | "register"): string {
  switch (mode) {
    case "login":
      return "Dostęp do aplikacji";
    case "reset":
      return "Odzyskiwanie dostępu";
    case "register":
      return "Zaproszenie";
  }
}

function authModeTitle(mode: "login" | "reset" | "register"): string {
  switch (mode) {
    case "login":
      return "Zaloguj się";
    case "reset":
      return "Nie pamiętam hasła";
    case "register":
      return "Załóż konto";
  }
}

function authPrimaryActionLabel(mode: "login" | "reset" | "register"): string {
  switch (mode) {
    case "login":
      return "Zaloguj";
    case "reset":
      return "Wyślij prośbę";
    case "register":
      return "Załóż konto";
  }
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

  return "Nie udało się uruchomić synchronizacji.";
}

function isDocumentVisible(): boolean {
  return typeof document === "undefined" || document.visibilityState !== "hidden";
}

function hasAuthenticatedUser(
  state: AuthSessionState
): state is AuthSessionState & { user: AuthenticatedUser } {
  return "user" in state;
}

function displaySessionName(state: AuthSessionState & { user: AuthenticatedUser }) {
  if ("profile" in state) {
    return state.profile.displayName;
  }

  return state.user.displayName ?? state.user.email ?? state.user.uid;
}
