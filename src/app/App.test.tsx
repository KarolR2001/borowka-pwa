import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { PASSWORD_RESET_CONFIRMATION, type AuthSessionState } from "../auth/authSession";
import type { DeviceDirectoryApi } from "../devices/AdminDeviceDirectoryPanel";
import type { OperatorDashboardApi } from "../dashboard/OperatorDashboardPanel";
import type { OperatorHarvestSessionsApi } from "../harvest/OperatorHarvestSessionsPanel";
import type { RegistrationInvitationsApi } from "../invitations/AdminRegistrationInvitationsPanel";
import type { ConfigurationCacheApi } from "../offline/ConfigurationCachePanel";
import type { SynchronizationApi } from "../offline/automaticSynchronization";
import type { OfflineStorageHealthApi } from "../offline/offlineStorageHealth";
import type { SyncDocumentMetadataInput } from "../offline/pendingWriteMetadata";
import { DEVICE_CLEAR_CONFIRMATION } from "../offline/safeSignOut";
import type { AdminPaymentDirectoryApi } from "../payments/AdminPaymentDirectoryPanel";
import type { AdminIssueReportsApi } from "../issues/AdminIssueReportsPanel";
import type { PickerDashboardApi } from "../picker/PickerDashboardPanel";
import type { PickerExportSettingsApi } from "../picker/AdminPickerExportSettingsPanel";
import type { SettlementPlansApi } from "../plans/AdminSettlementPlansPanel";
import type { SeasonsApi } from "../seasons/AdminSeasonsPanel";
import type { UserDirectoryApi } from "../users/AdminUserDirectoryPanel";
import type { WorkerDirectoryApi } from "../workers/WorkerDirectoryPanel";
import { App, type AuthSessionApi, type DeviceRegistryApi } from "./App";

const firebaseServicesMocks = vi.hoisted(() => {
  const getStatus = (env: Record<string, string | boolean | undefined>) => {
    const ready = Boolean(env.VITE_FIREBASE_API_KEY);

    return {
      cacheMode: "MEMORY" as const,
      initialized: false,
      message: ready
        ? "Usługi Firebase mogą zostać uruchomione."
        : "Brak konfiguracji Firebase.",
      mode: "development" as const,
      ready,
      warnings: []
    };
  };

  return {
    clearFirestoreLocalData: vi.fn(() => Promise.resolve()),
    getFirebaseServices: vi.fn(() => Promise.resolve({ auth: {}, firestore: {} })),
    getFirebaseServicesStatus: vi.fn(getStatus),
    initializeFirebaseServicesIfReady: vi.fn(
      (env: Record<string, string | boolean | undefined>) =>
        Promise.resolve({
          ...getStatus(env),
          initialized: getStatus(env).ready
        })
    )
  };
});

vi.mock("../config/firebaseServices", () => firebaseServicesMocks);

const signedOutState: AuthSessionState = {
  status: "SIGNED_OUT",
  message: "Uzytkownik nie jest zalogowany."
};

const activeAdminState: AuthSessionState = {
  status: "READY",
  message: "Profil aplikacji jest aktywny.",
  user: {
    uid: "admin-1",
    email: "admin@example.test",
    displayName: null
  },
  profile: {
    uid: "admin-1",
    email: "admin@example.test",
    displayName: "Admin Test",
    role: "ADMIN",
    workerId: null,
    active: true,
    registrationStatus: "APPROVED",
    offlineConsent: true
  },
  access: {
    status: "READY",
    role: "ADMIN"
  }
};

const activePickerState: AuthSessionState = {
  status: "READY",
  message: "Profil aplikacji jest aktywny.",
  user: {
    uid: "picker-1",
    email: "picker@example.test",
    displayName: "Picker Test"
  },
  profile: {
    uid: "picker-1",
    email: "picker@example.test",
    displayName: "Picker Test",
    role: "PICKER",
    workerId: "worker-1",
    active: true,
    registrationStatus: "APPROVED",
    offlineConsent: true
  },
  access: {
    status: "READY",
    role: "PICKER"
  }
};

const activeOperatorState: AuthSessionState = {
  ...activeAdminState,
  profile: {
    ...activeAdminState.profile,
    role: "OPERATOR"
  },
  access: {
    status: "READY",
    role: "OPERATOR"
  }
};

const blockedPickerState: AuthSessionState = {
  status: "BLOCKED",
  message: "Konto jest zablokowane.",
  user: activePickerState.user,
  profile: {
    ...activePickerState.profile,
    active: false,
    registrationStatus: "BLOCKED"
  },
  access: {
    status: "BLOCKED",
    reason: "Konto jest zablokowane."
  }
};

const missingPickerProfileState: AuthSessionState = {
  status: "MISSING_PROFILE",
  message: "Konto nie ma jeszcze profilu aplikacji.",
  user: activePickerState.user,
  access: {
    status: "MISSING_PROFILE",
    reason: "Konto nie ma jeszcze profilu aplikacji."
  }
};

const completeFirebaseEnv = {
  VITE_APP_ENV: "development",
  VITE_USE_FIREBASE_EMULATORS: "false",
  VITE_FIREBASE_API_KEY: "dev-api-key",
  VITE_FIREBASE_AUTH_DOMAIN: "borowka-pwa-dev.firebaseapp.com",
  VITE_FIREBASE_PROJECT_ID: "borowka-pwa-dev",
  VITE_FIREBASE_STORAGE_BUCKET: "borowka-pwa-dev.appspot.com",
  VITE_FIREBASE_MESSAGING_SENDER_ID: "123456789",
  VITE_FIREBASE_APP_ID: "1:123456789:web:dev"
};

const createAuthSessionApi = (
  initialState: AuthSessionState,
  overrides: Partial<AuthSessionApi> = {}
): AuthSessionApi => ({
  getInitialState: () => initialState,
  subscribe: (_env, listener) => {
    listener(initialState);
    return Promise.resolve(() => undefined);
  },
  signIn: () => Promise.resolve(),
  requestPasswordReset: () => Promise.resolve(),
  register: () => Promise.resolve(),
  refresh: () => Promise.resolve(initialState),
  updateOfflineConsent: () => Promise.resolve(),
  signOut: () => Promise.resolve(),
  ...overrides
});

const createSynchronizationApi = (
  overrides: Partial<SynchronizationApi> = {}
): SynchronizationApi => ({
  clearLocalData: () => Promise.resolve(),
  hasLocalData: () => Promise.resolve(false),
  listLocalDocuments: () => Promise.resolve([]),
  synchronize: (_env, request) =>
    Promise.resolve({
      finishedAtIso: request.requestedAtIso,
      message: "Synchronizacja przyjeta.",
      requestedAtIso: request.requestedAtIso,
      status: "SUCCESS",
      trigger: request.trigger
    }),
  ...overrides
});

async function selectMainView(
  user: ReturnType<typeof userEvent.setup>,
  viewName: string
) {
  await user.click(screen.getByRole("button", { name: "Otwórz menu" }));
  await user.click(screen.getByRole("button", { name: viewName }));
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe("App shell", () => {
  it("renders only the full-screen login for a signed-out user", () => {
    render(<App authSessionApi={createAuthSessionApi(signedOutState)} />);

    expect(screen.getByRole("heading", { name: "Borówka" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Zaloguj się" })).toBeInTheDocument();
    expect(screen.queryByRole("navigation")).not.toBeInTheDocument();
    expect(screen.queryByText(/Firebase/i)).not.toBeInTheDocument();
    expect(screen.queryByText("Administrator")).not.toBeInTheDocument();
    expect(screen.queryByText("Operator")).not.toBeInTheDocument();
    expect(screen.queryByText("Zbieracz")).not.toBeInTheDocument();
  });

  it("submits email and password through the auth session API", async () => {
    const user = userEvent.setup();
    const signIn = vi.fn<AuthSessionApi["signIn"]>().mockResolvedValue(undefined);

    render(<App authSessionApi={createAuthSessionApi(signedOutState, { signIn })} />);

    await user.type(screen.getByLabelText("E-mail"), "admin@example.test");
    await user.type(screen.getByLabelText("Hasło"), "secret-password");
    await user.click(screen.getByRole("button", { name: "Zaloguj" }));

    await waitFor(() => {
      expect(signIn).toHaveBeenCalledWith(expect.anything(), {
        email: "admin@example.test",
        password: "secret-password"
      });
    });
  });

  it("requests password reset with neutral confirmation", async () => {
    const user = userEvent.setup();
    const requestPasswordReset = vi
      .fn<AuthSessionApi["requestPasswordReset"]>()
      .mockResolvedValue(undefined);

    render(
      <App
        authSessionApi={createAuthSessionApi(signedOutState, {
          requestPasswordReset
        })}
      />
    );

    await user.click(screen.getByRole("button", { name: "Nie pamietam hasła" }));
    await user.type(screen.getByLabelText("E-mail"), "admin@example.test");
    await user.click(screen.getByRole("button", { name: "Wyślij reset" }));

    await waitFor(() => {
      expect(requestPasswordReset).toHaveBeenCalledWith(
        expect.anything(),
        "admin@example.test"
      );
    });
    expect(screen.getByText(PASSWORD_RESET_CONFIRMATION)).toBeInTheDocument();
  });

  it("allows an invited user without a profile to complete registration", async () => {
    const user = userEvent.setup();
    const completeRegistration = vi
      .fn<NonNullable<AuthSessionApi["completeRegistration"]>>()
      .mockResolvedValue(undefined);
    const refresh = vi
      .fn<AuthSessionApi["refresh"]>()
      .mockResolvedValue(activePickerState);

    render(
      <App
        authSessionApi={createAuthSessionApi(missingPickerProfileState, {
          completeRegistration,
          refresh
        })}
      />
    );

    await user.click(screen.getByRole("button", { name: "Dokończ rejestrację" }));

    await waitFor(() => {
      expect(completeRegistration).toHaveBeenCalledWith(
        expect.anything(),
        activePickerState.user
      );
    });
    expect(refresh).toHaveBeenCalledWith(expect.anything());
    expect(await screen.findByRole("heading", { name: "Moje dane" })).toBeInTheDocument();
  });

  it("validates invited registration passwords", async () => {
    const user = userEvent.setup();
    const register = vi.fn<AuthSessionApi["register"]>().mockResolvedValue(undefined);

    render(<App authSessionApi={createAuthSessionApi(signedOutState, { register })} />);

    await user.click(screen.getByRole("button", { name: "Załóż konto" }));
    await user.type(screen.getByLabelText("E-mail"), "operator@example.test");
    await user.type(screen.getByLabelText("Imię i nazwisko"), "Operator Test");
    await user.type(screen.getByLabelText("Hasło"), "secret-password");
    await user.type(screen.getByLabelText("Powtórz hasło"), "different-password");
    await user.click(screen.getByLabelText("Akceptuję prerejestracje administratora"));
    await user.click(screen.getByRole("button", { name: "Załóż konto" }));

    expect(register).not.toHaveBeenCalled();
    expect(screen.getByText("Hasla musza byc takie same.")).toBeInTheDocument();
  }, 15000);

  it("submits invited registration through the auth session API", async () => {
    const user = userEvent.setup();
    const register = vi.fn<AuthSessionApi["register"]>().mockResolvedValue(undefined);

    render(<App authSessionApi={createAuthSessionApi(signedOutState, { register })} />);

    await user.click(screen.getByRole("button", { name: "Załóż konto" }));
    await user.type(screen.getByLabelText("E-mail"), "Operator@Example.TEST");
    await user.type(screen.getByLabelText("Imię i nazwisko"), "Operator Test");
    await user.type(screen.getByLabelText("Hasło"), "secret-password");
    await user.type(screen.getByLabelText("Powtórz hasło"), "secret-password");
    await user.click(screen.getByLabelText("Akceptuję prerejestracje administratora"));
    await user.click(screen.getByRole("button", { name: "Załóż konto" }));

    await waitFor(() => {
      expect(register).toHaveBeenCalledWith(expect.anything(), {
        email: "Operator@Example.TEST",
        displayName: "Operator Test",
        password: "secret-password",
        passwordConfirmation: "secret-password",
        acceptsPrerelease: true
      });
    });
    expect(
      screen.getByText("Konto zostało utworzone. Pobieram profil.")
    ).toBeInTheDocument();
  }, 15000);

  it("refreshes the active profile immediately after invited picker registration", async () => {
    const user = userEvent.setup();
    const register = vi.fn<AuthSessionApi["register"]>().mockResolvedValue(undefined);
    const refresh = vi
      .fn<AuthSessionApi["refresh"]>()
      .mockResolvedValue(activePickerState);

    render(
      <App
        authSessionApi={createAuthSessionApi(signedOutState, {
          register,
          refresh
        })}
      />
    );

    await user.click(screen.getByRole("button", { name: "Załóż konto" }));
    await user.type(screen.getByLabelText("E-mail"), "picker@example.test");
    await user.type(screen.getByLabelText("Imię i nazwisko"), "Picker Test");
    await user.type(screen.getByLabelText("Hasło"), "secret-password");
    await user.type(screen.getByLabelText("Powtórz hasło"), "secret-password");
    await user.click(screen.getByLabelText("Akceptuję prerejestracje administratora"));
    await user.click(screen.getByRole("button", { name: "Załóż konto" }));

    await waitFor(() => {
      expect(refresh).toHaveBeenCalledWith(expect.anything());
    });
    expect(screen.getByRole("region", { name: "Pulpit zbieracza" })).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Otwórz menu" }));
    expect(screen.getByRole("button", { name: "Moje dane" })).toBeVisible();
    expect(screen.queryByText("Administrator", { exact: true })).toBeNull();
    expect(screen.queryByText("Operator", { exact: true })).toBeNull();
  });

  it("shows active profile state and sign out action", async () => {
    const user = userEvent.setup();
    const signOut = vi.fn<AuthSessionApi["signOut"]>().mockResolvedValue(undefined);

    render(
      <App
        authSessionApi={createAuthSessionApi(activeAdminState, { signOut })}
        synchronizationApi={createSynchronizationApi()}
      />
    );

    await selectMainView(user, "Konto");

    expect(screen.getByRole("heading", { name: "Admin Test" })).toBeInTheDocument();
    expect(screen.getByText("admin@example.test")).toBeInTheDocument();
    expect(screen.getByText("Informacje techniczne")).toBeInTheDocument();
    expect(screen.getByText("Wersja aplikacji")).not.toBeVisible();
    expect(screen.queryByRole("button", { name: "Zbiory" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Moje dane" })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Wyloguj" }));

    await waitFor(() => {
      expect(signOut).toHaveBeenCalled();
    });
  });

  it("blocks sign out and lists sessions while local documents are pending", async () => {
    const user = userEvent.setup();
    const signOut = vi.fn<AuthSessionApi["signOut"]>().mockResolvedValue(undefined);
    const listLocalDocuments = vi
      .fn<SynchronizationApi["listLocalDocuments"]>()
      .mockResolvedValue([
        {
          id: "session-local",
          kind: "HARVEST_SESSION",
          workerName: "Anna Test",
          businessDate: "2026-07-28",
          savedLocally: true
        }
      ]);

    render(
      <App
        authSessionApi={createAuthSessionApi(activeAdminState, { signOut })}
        synchronizationApi={createSynchronizationApi({
          hasLocalData: () => Promise.resolve(true),
          listLocalDocuments
        })}
      />
    );

    await waitFor(() => {
      expect(listLocalDocuments).toHaveBeenCalledTimes(1);
    });
    await selectMainView(user, "Konto");
    await user.click(screen.getByRole("button", { name: "Wyloguj" }));

    expect(signOut).not.toHaveBeenCalled();
    expect(
      screen.getByRole("heading", { name: "Najpierw zsynchronizuj dane" })
    ).toBeInTheDocument();
    expect(screen.getByText("Anna Test")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Anuluj wylogowanie" })).toBeEnabled();
    expect(
      screen.queryByRole("button", { name: "Wyloguj i wyczyść urządzenie" })
    ).not.toBeInTheDocument();
  });

  it("clears account-scoped local data only after explicit confirmation", async () => {
    const user = userEvent.setup();
    const signOut = vi.fn<AuthSessionApi["signOut"]>().mockResolvedValue(undefined);
    const clearLocalData = vi
      .fn<SynchronizationApi["clearLocalData"]>()
      .mockResolvedValue(undefined);
    const clearConfiguration = vi
      .fn<ConfigurationCacheApi["clear"]>()
      .mockResolvedValue(undefined);
    const markConfigurationCleared = vi
      .fn<OfflineStorageHealthApi["markConfigurationCleared"]>()
      .mockResolvedValue(undefined);
    const adminDashboardKey = "borowka.dashboard-snapshot.v1.admin.admin-1";
    const operatorDashboardKey = "borowka.dashboard-snapshot.v1.operator.admin-1";
    localStorage.setItem(adminDashboardKey, "admin-snapshot");
    localStorage.setItem(operatorDashboardKey, "operator-snapshot");

    render(
      <App
        authSessionApi={createAuthSessionApi(activeAdminState, { signOut })}
        configurationCacheApi={{
          clear: clearConfiguration,
          prepare: vi.fn<ConfigurationCacheApi["prepare"]>(),
          read: vi.fn<ConfigurationCacheApi["read"]>()
        }}
        offlineStorageHealthApi={{
          inspect: vi.fn<OfflineStorageHealthApi["inspect"]>(),
          markConfigurationCleared,
          markConfigurationPrepared:
            vi.fn<OfflineStorageHealthApi["markConfigurationPrepared"]>(),
          requestPersistentStorage:
            vi.fn<OfflineStorageHealthApi["requestPersistentStorage"]>()
        }}
        synchronizationApi={createSynchronizationApi({ clearLocalData })}
      />
    );

    await selectMainView(user, "Konto");
    await user.click(
      screen.getByRole("button", { name: "Wyloguj i wyczyść urządzenie" })
    );

    const finalAction = screen.getByRole("button", {
      name: "Wyczyść urządzenie i wyloguj"
    });

    expect(finalAction).toBeDisabled();
    await user.type(
      screen.getByLabelText(`Wpisz ${DEVICE_CLEAR_CONFIRMATION}, aby potwierdzić`),
      DEVICE_CLEAR_CONFIRMATION
    );
    await user.click(finalAction);

    await waitFor(() => {
      expect(signOut).toHaveBeenCalled();
    });
    expect(clearLocalData).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ userUid: "admin-1" })
    );
    expect(clearConfiguration).toHaveBeenCalledWith(
      expect.objectContaining({
        actorProfile: activeAdminState.profile
      })
    );
    expect(markConfigurationCleared).toHaveBeenCalledWith(
      expect.objectContaining({ userUid: "admin-1" })
    );
    expect(localStorage.getItem(adminDashboardKey)).toBeNull();
    expect(localStorage.getItem(operatorDashboardKey)).toBeNull();
  }, 15000);

  it("does not expose one account's pending documents after switching users", async () => {
    const user = userEvent.setup();
    const signOut = vi.fn<AuthSessionApi["signOut"]>().mockResolvedValue(undefined);
    let sessionListener: ((state: AuthSessionState) => void) | null = null;
    let resolvePickerDocuments!: (
      documents: readonly SyncDocumentMetadataInput[]
    ) => void;
    const pickerDocuments = new Promise<readonly SyncDocumentMetadataInput[]>(
      (resolve) => {
        resolvePickerDocuments = resolve;
      }
    );
    const listLocalDocuments = vi
      .fn<SynchronizationApi["listLocalDocuments"]>()
      .mockImplementation((_env, input) =>
        input.userUid === "admin-1"
          ? Promise.resolve([
              {
                id: "admin-entry",
                kind: "HARVEST_ENTRY" as const,
                sessionId: "admin-session",
                workerName: "Dane administratora",
                pendingSync: true
              }
            ])
          : pickerDocuments
      );
    const authSessionApi = createAuthSessionApi(activeAdminState, {
      signOut,
      subscribe: (_env, listener) => {
        sessionListener = listener;
        listener(activeAdminState);
        return Promise.resolve(() => undefined);
      }
    });

    render(
      <App
        authSessionApi={authSessionApi}
        synchronizationApi={createSynchronizationApi({
          hasLocalData: () => Promise.resolve(true),
          listLocalDocuments
        })}
      />
    );

    await waitFor(() => {
      expect(listLocalDocuments).toHaveBeenCalledTimes(1);
    });
    await selectMainView(user, "Konto");
    await user.click(screen.getByRole("button", { name: "Wyloguj" }));
    expect(screen.getByText("Dane administratora")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Anuluj wylogowanie" }));

    act(() => {
      sessionListener?.(activePickerState);
    });
    await screen.findByRole("heading", { name: "Moje dane" });
    expect(screen.queryByText("Dane administratora")).not.toBeInTheDocument();
    await selectMainView(user, "Konto");
    await user.click(screen.getByRole("button", { name: "Wyloguj" }));
    expect(signOut).not.toHaveBeenCalled();
    resolvePickerDocuments([]);

    await waitFor(() => {
      expect(signOut).toHaveBeenCalled();
    });
  });

  it("allows a blocked account to sign out when no local data is pending", async () => {
    const user = userEvent.setup();
    const signOut = vi.fn<AuthSessionApi["signOut"]>().mockResolvedValue(undefined);

    render(
      <App
        authSessionApi={createAuthSessionApi(blockedPickerState, {
          signOut
        })}
        synchronizationApi={createSynchronizationApi()}
      />
    );

    await user.click(screen.getByRole("button", { name: "Wyloguj" }));

    await waitFor(() => {
      expect(signOut).toHaveBeenCalled();
    });
  });

  it("loads blocked-account local data for integrity without starting sync", async () => {
    const listLocalDocuments = vi
      .fn<SynchronizationApi["listLocalDocuments"]>()
      .mockResolvedValue([
        {
          id: "blocked-entry",
          kind: "HARVEST_ENTRY",
          pendingSync: true
        }
      ]);
    const synchronize = vi.fn<SynchronizationApi["synchronize"]>();

    render(
      <App
        authSessionApi={createAuthSessionApi(blockedPickerState)}
        synchronizationApi={createSynchronizationApi({
          listLocalDocuments,
          synchronize
        })}
      />
    );

    await waitFor(() => {
      expect(listLocalDocuments).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          userUid: "picker-1"
        })
      );
    });
    expect(synchronize).not.toHaveBeenCalled();
  });

  it("refreshes the active profile on window focus to detect role changes", async () => {
    const user = userEvent.setup();
    const refresh = vi
      .fn<AuthSessionApi["refresh"]>()
      .mockResolvedValue(activeOperatorState);

    render(
      <App
        authSessionApi={createAuthSessionApi(activeAdminState, {
          refresh
        })}
      />
    );

    await screen.findByRole("button", { name: "Otwórz menu" });
    await user.click(screen.getByRole("button", { name: "Otwórz menu" }));
    expect(screen.queryByRole("button", { name: "Moje dane" })).toBeNull();

    globalThis.dispatchEvent(new Event("focus"));

    await waitFor(() => {
      expect(refresh).toHaveBeenCalledWith(expect.anything());
    });
    expect(screen.getByRole("button", { name: "Zbiory" })).toBeVisible();
    expect(screen.queryByRole("button", { name: "Moje dane" })).toBeNull();
  });

  it("refreshes the active profile on online event to detect account blocks", async () => {
    const refresh = vi
      .fn<AuthSessionApi["refresh"]>()
      .mockResolvedValue(blockedPickerState);

    render(
      <App
        authSessionApi={createAuthSessionApi(activePickerState, {
          refresh
        })}
      />
    );

    await screen.findByRole("heading", { name: "Moje dane" });

    globalThis.dispatchEvent(new Event("online"));

    await waitFor(() => {
      expect(refresh).toHaveBeenCalledWith(expect.anything());
    });
    expect(screen.getByText("Konto jest zablokowane.")).toBeInTheDocument();
    expect(screen.queryByRole("navigation")).toBeNull();
  });

  it("opens the private picker dashboard from the application shell", async () => {
    const load = vi.fn<PickerDashboardApi["load"]>().mockResolvedValue({
      accruedAmountGrosz: 5000,
      dataSource: "SERVER",
      invalidPaymentCount: 0,
      invalidSeasonCount: 0,
      invalidSessionCount: 0,
      invalidWorker: false,
      paidAmountGrosz: 2000,
      period: {
        dateBasis: "BUSINESS_DATE",
        fromDate: "2026-07-01",
        label: "Cały sezon: 01.07.2026 - 30.09.2026",
        preset: "SEASON",
        toDate: "2026-09-30"
      },
      quantities: [],
      refreshedAtIso: "2026-07-28T18:30:00.000Z",
      remainingAmountGrosz: 3000,
      seasons: [
        {
          endDate: "2026-09-30",
          id: "season-2026",
          isDefault: true,
          name: "Sezon 2026",
          startDate: "2026-07-01",
          status: "OPEN"
        }
      ],
      selectedSeasonId: "season-2026",
      selectedSeasonName: "Sezon 2026",
      sessionCounts: {
        closed: 1,
        open: 0,
        paid: 1
      },
      totalWeightG: 12_500,
      userName: "Picker Test",
      workerId: "worker-1",
      workerName: "Anna Zbieracz"
    });

    render(
      <App
        authSessionApi={createAuthSessionApi(activePickerState)}
        pickerDashboardApi={{ load }}
        pickerOfflineDataApi={{
          enablePersistence: vi.fn(),
          prepare: vi.fn(),
          read: vi.fn().mockResolvedValue({
            code: "NOT_PREPARED",
            dataSource: "SERVER",
            lastSuccessfulSyncIso: null
          })
        }}
      />
    );

    expect(await screen.findByText("12,500 kg")).toBeInTheDocument();
    expect(screen.getByText("Picker Test / Anna Zbieracz")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Pelny eksport chmury" })).toBeNull();
    expect(screen.queryByRole("tab", { name: "Offline" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Pulpit" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Zbiory" })).toBeNull();
    expect(load).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        actorProfile: activePickerState.profile,
        selectedSeasonId: null
      })
    );
  });

  it("registers the current device for an active profile", async () => {
    for (const [key, value] of Object.entries(completeFirebaseEnv)) {
      vi.stubEnv(key, value);
    }

    const register = vi.fn<DeviceRegistryApi["register"]>().mockResolvedValue(undefined);

    render(
      <App
        authSessionApi={createAuthSessionApi(activePickerState)}
        deviceRegistryApi={{ register }}
      />
    );

    await waitFor(() => {
      expect(register).toHaveBeenCalled();
    });
    const [, input] = register.mock.calls[0];

    expect(input).toMatchObject({
      userUid: "picker-1",
      trustedOfflineStorage: true
    });
    expect(input.deviceId).toEqual(expect.any(String));
    expect(input.deviceName).toEqual(expect.any(String));
  });

  it("requires explicit consent before enabling persistent offline data", async () => {
    const user = userEvent.setup();
    const updateOfflineConsent = vi
      .fn<AuthSessionApi["updateOfflineConsent"]>()
      .mockResolvedValue(undefined);
    const requestPersistentStorage = vi
      .fn<OfflineStorageHealthApi["requestPersistentStorage"]>()
      .mockResolvedValue(true);
    const consentRequiredState: AuthSessionState = {
      ...activeAdminState,
      profile: {
        ...activeAdminState.profile,
        offlineConsent: false
      }
    };

    render(
      <App
        authSessionApi={createAuthSessionApi(consentRequiredState, {
          updateOfflineConsent
        })}
        offlineStorageHealthApi={{
          inspect: vi.fn<OfflineStorageHealthApi["inspect"]>(),
          markConfigurationCleared:
            vi.fn<OfflineStorageHealthApi["markConfigurationCleared"]>(),
          markConfigurationPrepared:
            vi.fn<OfflineStorageHealthApi["markConfigurationPrepared"]>(),
          requestPersistentStorage
        }}
      />
    );

    expect(
      screen.getByRole("dialog", { name: "Zezwolić na zapis danych?" })
    ).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Tak, włącz pracę offline" }));

    await waitFor(() => {
      expect(updateOfflineConsent).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          uid: "admin-1",
          offlineConsent: true
        })
      );
    });
    expect(requestPersistentStorage).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("shows only the simple offline storage setting in the account view", async () => {
    const user = userEvent.setup();

    render(<App authSessionApi={createAuthSessionApi(activeAdminState)} />);

    await selectMainView(user, "Konto");

    expect(screen.getByLabelText("Dane na urządzeniu")).toBeVisible();
    expect(screen.getByRole("button", { name: "Wyłącz przechowywanie" })).toBeVisible();
  });

  it("starts synchronization on launch and after online activation when local data exists", async () => {
    for (const [key, value] of Object.entries(completeFirebaseEnv)) {
      vi.stubEnv(key, value);
    }

    const hasLocalData = vi
      .fn<SynchronizationApi["hasLocalData"]>()
      .mockResolvedValue(true);
    const synchronize = vi
      .fn<SynchronizationApi["synchronize"]>()
      .mockImplementation((_env, request) =>
        Promise.resolve({
          finishedAtIso: request.requestedAtIso,
          message: "Synchronizacja przyjeta.",
          requestedAtIso: request.requestedAtIso,
          status: "SUCCESS",
          trigger: request.trigger
        })
      );
    const listLocalDocuments = vi
      .fn<SynchronizationApi["listLocalDocuments"]>()
      .mockResolvedValue([
        {
          id: "entry-local",
          kind: "HARVEST_ENTRY",
          sessionId: "session-1",
          workerName: "Anna Test",
          businessDate: "2026-07-17",
          pendingSync: true
        }
      ]);

    render(
      <App
        authSessionApi={createAuthSessionApi(activeAdminState)}
        synchronizationApi={createSynchronizationApi({
          hasLocalData,
          listLocalDocuments,
          synchronize
        })}
      />
    );

    await waitFor(() => {
      expect(synchronize).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          pendingDocumentCount: 1,
          trigger: "APP_START",
          userUid: "admin-1"
        })
      );
    });
    await waitFor(() => {
      expect(listLocalDocuments).toHaveBeenCalledTimes(2);
    });

    synchronize.mockClear();
    globalThis.dispatchEvent(new Event("online"));

    await waitFor(() => {
      expect(synchronize).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          trigger: "ONLINE_RESTORED",
          userUid: "admin-1"
        })
      );
    });
    expect(hasLocalData).toHaveBeenCalled();
  });

  it("starts synchronization after connectivity returns from an offline render", async () => {
    for (const [key, value] of Object.entries(completeFirebaseEnv)) {
      vi.stubEnv(key, value);
    }

    const onLineSpy = vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
    const listLocalDocuments = vi
      .fn<SynchronizationApi["listLocalDocuments"]>()
      .mockResolvedValue([
        {
          id: "entry-local",
          kind: "HARVEST_ENTRY",
          sessionId: "session-1",
          workerName: "Anna Test",
          businessDate: "2026-07-17",
          pendingSync: true
        }
      ]);
    const synchronize = vi
      .fn<SynchronizationApi["synchronize"]>()
      .mockImplementation((_env, request) =>
        Promise.resolve({
          finishedAtIso: request.requestedAtIso,
          message: "Synchronizacja przyjeta.",
          requestedAtIso: request.requestedAtIso,
          status: "SUCCESS",
          trigger: request.trigger
        })
      );

    render(
      <App
        authSessionApi={createAuthSessionApi(activeAdminState)}
        synchronizationApi={createSynchronizationApi({
          hasLocalData: vi
            .fn<SynchronizationApi["hasLocalData"]>()
            .mockResolvedValue(true),
          listLocalDocuments,
          synchronize
        })}
      />
    );

    await waitFor(() => {
      expect(listLocalDocuments).toHaveBeenCalledTimes(1);
    });
    expect(synchronize).not.toHaveBeenCalled();

    onLineSpy.mockReturnValue(true);
    globalThis.dispatchEvent(new Event("online"));

    await waitFor(() => {
      expect(synchronize).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          trigger: "ONLINE_RESTORED",
          userUid: "admin-1"
        })
      );
    });

    onLineSpy.mockRestore();
  });

  it("shows only transient notifications when connectivity changes", async () => {
    const onLineSpy = vi.spyOn(navigator, "onLine", "get").mockReturnValue(true);

    render(<App authSessionApi={createAuthSessionApi(activeAdminState)} />);

    onLineSpy.mockReturnValue(false);
    act(() => {
      globalThis.dispatchEvent(new Event("offline"));
    });
    expect(
      await screen.findByText("Utracono połączenie. Aplikacja przeszła w tryb offline.")
    ).toBeInTheDocument();

    onLineSpy.mockReturnValue(true);
    act(() => {
      globalThis.dispatchEvent(new Event("online"));
    });
    expect(
      await screen.findByText("Połączenie zostało przywrócone. Pracujesz online.")
    ).toBeInTheDocument();
    expect(screen.queryByText(/^Online$|^Offline$/)).not.toBeInTheDocument();
  });

  it("does not expose the synchronization center in primary navigation", () => {
    render(<App authSessionApi={createAuthSessionApi(activeAdminState)} />);

    expect(screen.queryByRole("button", { name: "Offline" })).not.toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: "Centrum synchronizacji" })
    ).not.toBeInTheDocument();
  });

  it("renders administrator user directory from the admin tab", async () => {
    const user = userEvent.setup();
    const list = vi.fn<UserDirectoryApi["list"]>().mockResolvedValue({
      profiles: [
        {
          uid: "admin-1",
          email: "admin@example.test",
          displayName: "Admin Test",
          role: "ADMIN",
          workerId: null,
          active: true,
          registrationStatus: "APPROVED",
          offlineConsent: false
        }
      ],
      invalidProfiles: []
    });
    const listInvitations = vi
      .fn<RegistrationInvitationsApi["list"]>()
      .mockResolvedValue({
        invitations: [],
        invalidInvitations: []
      });
    const listDevices = vi.fn<DeviceDirectoryApi["list"]>().mockResolvedValue({
      devices: [],
      invalidDevices: []
    });
    const listSeasons = vi.fn<SeasonsApi["list"]>().mockResolvedValue({
      seasons: [],
      invalidSeasons: []
    });
    const listSettlementPlans = vi.fn<SettlementPlansApi["list"]>().mockResolvedValue({
      plans: [],
      invalidPlans: [],
      invalidRateVersions: []
    });
    const listWorkers = vi.fn<WorkerDirectoryApi["list"]>().mockResolvedValue({
      workers: [],
      plans: [],
      profiles: [],
      invalidWorkers: [],
      invalidPlans: [],
      invalidRateVersions: [],
      invalidProfiles: [],
      invalidAuditEvents: []
    });
    const listPayments = vi.fn<AdminPaymentDirectoryApi["list"]>().mockResolvedValue({
      invalidPaymentCount: 0,
      invalidSeasonCount: 0,
      invalidSessionCount: 0,
      missingSourceSessionCount: 0,
      payments: []
    });
    const listIssues = vi.fn<AdminIssueReportsApi["list"]>().mockResolvedValue({
      invalidReportCount: 0,
      reports: []
    });
    const readPickerExportSetting = vi
      .fn<PickerExportSettingsApi["read"]>()
      .mockResolvedValue({
        dataSource: "SERVER",
        enabled: false,
        updatedAtIso: "2026-07-28T18:00:00.000Z"
      });

    render(
      <App
        adminIssueReportsApi={{
          list: listIssues,
          loadSource: vi.fn(),
          resolve: vi.fn()
        }}
        adminPaymentDirectoryApi={{
          cancel: vi.fn(),
          downloadCsv: vi.fn(),
          list: listPayments
        }}
        authSessionApi={createAuthSessionApi(activeAdminState)}
        deviceDirectoryApi={{ list: listDevices }}
        pickerExportSettingsApi={{
          read: readPickerExportSetting,
          update: vi.fn()
        }}
        settlementPlansApi={{ list: listSettlementPlans }}
        seasonsApi={{ list: listSeasons }}
        userDirectoryApi={{ list }}
        workerDirectoryApi={{ list: listWorkers }}
        registrationInvitationsApi={{
          list: listInvitations,
          create: vi.fn<RegistrationInvitationsApi["create"]>(),
          cancel: vi.fn<RegistrationInvitationsApi["cancel"]>()
        }}
      />
    );

    expect(screen.getByRole("region", { name: "Pulpit administratora" })).toBeVisible();
    expect(
      screen.queryByRole("heading", { name: "Pulpit administratora" })
    ).not.toBeInTheDocument();
    expect(list).not.toHaveBeenCalled();
    expect(listWorkers).not.toHaveBeenCalled();

    await user.click(screen.getByRole("tab", { name: "Konta" }));
    await waitFor(() => {
      expect(list).toHaveBeenCalled();
    });
    expect(listInvitations).not.toHaveBeenCalled();
    expect(listDevices).not.toHaveBeenCalled();
    expect(screen.getByRole("region", { name: "Użytkownicy" })).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Lista zbieraczy" })).toBeNull();

    const accessTabs = within(
      screen.getByRole("tablist", { name: "Obszary zarządzania kontami" })
    );
    await user.click(accessTabs.getByRole("tab", { name: "Rejestracja" }));
    await waitFor(() => {
      expect(listInvitations).toHaveBeenCalled();
    });
    expect(screen.queryByRole("region", { name: "Użytkownicy" })).toBeNull();
    await user.click(accessTabs.getByRole("tab", { name: "Urządzenia" }));
    await waitFor(() => {
      expect(listDevices).toHaveBeenCalled();
    });

    await user.click(screen.getByRole("tab", { name: "Zbieracze" }));
    await waitFor(() => {
      expect(listWorkers).toHaveBeenCalledWith(expect.anything(), {
        viewerRole: "ADMIN"
      });
    });
    expect(screen.getByRole("region", { name: "Lista zbieraczy" })).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Użytkownicy" })).toBeNull();

    await user.click(screen.getByRole("tab", { name: "Konfiguracja" }));
    await waitFor(() => {
      expect(listSeasons).toHaveBeenCalled();
    });
    expect(listSettlementPlans).not.toHaveBeenCalled();
    expect(screen.getByRole("region", { name: "Sezony" })).toBeInTheDocument();
    await user.click(screen.getByRole("tab", { name: "Plany rozliczeń" }));
    await waitFor(() => {
      expect(listSettlementPlans).toHaveBeenCalled();
    });
    expect(screen.getByRole("region", { name: "Plany rozliczeń" })).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Sezony" })).toBeNull();

    expect(screen.getByRole("tab", { name: "Do wypłaty" })).toBeVisible();
    await user.click(screen.getByRole("tab", { name: "Historia wypłat" }));
    await waitFor(() => {
      expect(listPayments).toHaveBeenCalled();
    });
    expect(screen.getByRole("region", { name: "Historia wypłat" })).toBeVisible();

    await user.click(screen.getByRole("tab", { name: "Zgłoszenia" }));
    await waitFor(() => {
      expect(listIssues).toHaveBeenCalled();
    });
    expect(
      screen.getByRole("heading", { name: "Zgłoszenia niezgodności" })
    ).toBeInTheDocument();

    await user.click(screen.getByRole("tab", { name: "Dane" }));
    await waitFor(() => {
      expect(readPickerExportSetting).toHaveBeenCalled();
    });
    expect(
      screen.getByRole("heading", { name: "Eksport danych zbieracza" })
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: "Pełny eksport chmury" })
    ).not.toBeInTheDocument();
    await user.click(screen.getByRole("tab", { name: "Pełny eksport" }));
    expect(
      screen.getByRole("heading", { name: "Pełny eksport chmury" })
    ).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Użytkownicy" })).toBeNull();
    expect(screen.getByText("Admin Test")).toBeInTheDocument();
  });

  it("renders the operational dashboard without the worker directory", async () => {
    const user = userEvent.setup();
    const loadOperatorDashboard = vi
      .fn<OperatorDashboardApi["load"]>()
      .mockResolvedValue({
        activeSeason: { id: "season-1", name: "Sezon 2026" },
        conflicts: [],
        connection: "ONLINE",
        metrics: {
          availableWeightG: 12_000,
          conflictCount: 0,
          harvestedWeightG: 12_000,
          localPendingCount: 0,
          openSessionCount: 0,
          ownClosedSessionCount: 1,
          ownOpenSessionCount: 0
        },
        dailyWorkerHarvest: null,
        openSessions: [],
        ownRecentSessions: [],
        period: {
          dateBasis: "BUSINESS_DATE",
          fromDate: "2026-07-29",
          label: "Dzisiaj: 29.07.2026",
          preset: "TODAY",
          toDate: "2026-07-29"
        },
        lastServerSyncIso: "2026-07-29T08:00:00.000Z",
        refreshedAtIso: "2026-07-29T08:00:00.000Z",
        stock: {
          dataSource: "SERVER",
          invalidMovementCount: 0,
          movementCount: 2,
          pendingMovementCount: 0
        }
      });
    const listHarvestSessions = vi
      .fn<OperatorHarvestSessionsApi["list"]>()
      .mockResolvedValue({
        openSessions: [],
        closedSessions: [],
        selectedSessionId: null,
        selectedSessionView: null,
        invalidSessions: [],
        invalidEntries: [],
        invalidSeasons: []
      });
    const listOpeningConfiguration = vi
      .fn<OperatorHarvestSessionsApi["listOpeningConfiguration"]>()
      .mockResolvedValue({
        seasons: [],
        workers: [],
        plans: [],
        rateVersions: [],
        openSessions: [],
        invalidSeasons: [],
        invalidWorkers: [],
        invalidPlans: [],
        invalidRateVersions: [],
        invalidSessions: []
      });
    const openHarvestSession = vi
      .fn<OperatorHarvestSessionsApi["open"]>()
      .mockRejectedValue(new Error("unused"));
    const addHarvestEntry = vi
      .fn<OperatorHarvestSessionsApi["addEntry"]>()
      .mockRejectedValue(new Error("unused"));
    const cancelHarvestEntry = vi
      .fn<OperatorHarvestSessionsApi["cancelEntry"]>()
      .mockRejectedValue(new Error("unused"));
    const closeHarvestSession = vi
      .fn<OperatorHarvestSessionsApi["close"]>()
      .mockRejectedValue(new Error("unused"));
    const reopenHarvestSession = vi
      .fn<OperatorHarvestSessionsApi["reopen"]>()
      .mockRejectedValue(new Error("unused"));
    const cancelHarvestSession = vi
      .fn<OperatorHarvestSessionsApi["cancel"]>()
      .mockRejectedValue(new Error("unused"));

    render(
      <App
        authSessionApi={createAuthSessionApi(activeOperatorState)}
        harvestSessionsApi={{
          list: listHarvestSessions,
          listOpeningConfiguration,
          open: openHarvestSession,
          addEntry: addHarvestEntry,
          cancelEntry: cancelHarvestEntry,
          close: closeHarvestSession,
          reopen: reopenHarvestSession,
          cancel: cancelHarvestSession
        }}
        operatorDashboardApi={{ load: loadOperatorDashboard }}
      />
    );

    await waitFor(() => {
      expect(listHarvestSessions).toHaveBeenCalledWith(expect.anything(), {
        actorProfile: activeOperatorState.profile,
        selectedSessionId: null,
        isOnline: true
      });
    });
    expect(listOpeningConfiguration).toHaveBeenCalledWith(expect.anything(), {
      actorProfile: activeOperatorState.profile,
      isOnline: true
    });
    expect(screen.getByRole("heading", { name: "Zbiory" })).toBeInTheDocument();
    expect(loadOperatorDashboard).not.toHaveBeenCalled();
    expect(screen.queryByRole("region", { name: "Lista zbieraczy" })).toBeNull();
    expect(screen.queryByRole("heading", { name: "Pelny eksport chmury" })).toBeNull();

    await user.click(screen.getByRole("tab", { name: "Pulpit" }));
    await waitFor(() => {
      expect(loadOperatorDashboard).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          actorProfile: activeOperatorState.profile,
          isOnline: true
        })
      );
    });
    expect(screen.getByRole("region", { name: "Pulpit operatora" })).toBeVisible();
    expect(screen.queryByRole("region", { name: "Moje zbiory" })).toBeNull();

    await user.click(screen.getByRole("button", { name: "Nowy zbiór" }));
    expect(screen.getByRole("heading", { name: "Zbiory" })).toBeVisible();
    expect(
      await screen.findByRole("dialog", { name: "Otwieranie sesji zbioru" })
    ).toHaveClass("record-dialog--fullscreen");
  });
});
