import { act, render, screen, waitFor } from "@testing-library/react";
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
    offlineConsent: false
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
    offlineConsent: false
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

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe("App shell", () => {
  it("renders the product shell and diagnostics", async () => {
    const user = userEvent.setup();

    render(<App />);

    expect(screen.getByRole("heading", { name: "Borowka PWA" })).toBeInTheDocument();
    expect(screen.getByText("Firebase brak konfiguracji")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /diagnostyka/i }));

    expect(screen.getByRole("heading", { name: "Diagnostyka" })).toBeInTheDocument();
    expect(screen.getByText("Wersja aplikacji")).toBeInTheDocument();
    expect(screen.getByText("Identyfikator buildu")).toBeInTheDocument();
    expect(screen.getByText("Nazwa urzadzenia")).toBeInTheDocument();
    expect(screen.getByText("Platforma urzadzenia")).toBeInTheDocument();
  });

  it("submits email and password through the auth session API", async () => {
    const user = userEvent.setup();
    const signIn = vi.fn<AuthSessionApi["signIn"]>().mockResolvedValue(undefined);

    render(<App authSessionApi={createAuthSessionApi(signedOutState, { signIn })} />);

    await user.click(screen.getByRole("button", { name: /logowanie/i }));
    await user.type(screen.getByLabelText("E-mail"), "admin@example.test");
    await user.type(screen.getByLabelText("Haslo"), "secret-password");
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

    await user.click(screen.getByRole("button", { name: /logowanie/i }));
    await user.click(screen.getByRole("button", { name: "Nie pamietam hasla" }));
    await user.type(screen.getByLabelText("E-mail"), "admin@example.test");
    await user.click(screen.getByRole("button", { name: "Wyslij reset" }));

    await waitFor(() => {
      expect(requestPasswordReset).toHaveBeenCalledWith(
        expect.anything(),
        "admin@example.test"
      );
    });
    expect(screen.getByText(PASSWORD_RESET_CONFIRMATION)).toBeInTheDocument();
  });

  it("validates invited registration passwords", async () => {
    const user = userEvent.setup();
    const register = vi.fn<AuthSessionApi["register"]>().mockResolvedValue(undefined);

    render(<App authSessionApi={createAuthSessionApi(signedOutState, { register })} />);

    await user.click(screen.getByRole("button", { name: /logowanie/i }));
    await user.click(screen.getByRole("button", { name: "Zaloz konto" }));
    await user.type(screen.getByLabelText("E-mail"), "operator@example.test");
    await user.type(screen.getByLabelText("Imie i nazwisko"), "Operator Test");
    await user.type(screen.getByLabelText("Haslo"), "secret-password");
    await user.type(screen.getByLabelText("Powtorz haslo"), "different-password");
    await user.click(screen.getByLabelText("Akceptuje prerejestracje administratora"));
    await user.click(screen.getByRole("button", { name: "Zaloz konto" }));

    expect(register).not.toHaveBeenCalled();
    expect(screen.getByText("Hasla musza byc takie same.")).toBeInTheDocument();
  });

  it("submits invited registration through the auth session API", async () => {
    const user = userEvent.setup();
    const register = vi.fn<AuthSessionApi["register"]>().mockResolvedValue(undefined);

    render(<App authSessionApi={createAuthSessionApi(signedOutState, { register })} />);

    await user.click(screen.getByRole("button", { name: /logowanie/i }));
    await user.click(screen.getByRole("button", { name: "Zaloz konto" }));
    await user.type(screen.getByLabelText("E-mail"), "Operator@Example.TEST");
    await user.type(screen.getByLabelText("Imie i nazwisko"), "Operator Test");
    await user.type(screen.getByLabelText("Haslo"), "secret-password");
    await user.type(screen.getByLabelText("Powtorz haslo"), "secret-password");
    await user.click(screen.getByLabelText("Akceptuje prerejestracje administratora"));
    await user.click(screen.getByRole("button", { name: "Zaloz konto" }));

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
      screen.getByText("Konto zostalo utworzone. Pobieram profil.")
    ).toBeInTheDocument();
  });

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

    await user.click(screen.getByRole("button", { name: /logowanie/i }));
    await user.click(screen.getByRole("button", { name: "Zaloz konto" }));
    await user.type(screen.getByLabelText("E-mail"), "picker@example.test");
    await user.type(screen.getByLabelText("Imie i nazwisko"), "Picker Test");
    await user.type(screen.getByLabelText("Haslo"), "secret-password");
    await user.type(screen.getByLabelText("Powtorz haslo"), "secret-password");
    await user.click(screen.getByLabelText("Akceptuje prerejestracje administratora"));
    await user.click(screen.getByRole("button", { name: "Zaloz konto" }));

    await waitFor(() => {
      expect(refresh).toHaveBeenCalledWith(expect.anything());
    });
    expect(screen.getByRole("heading", { name: "Picker Test" })).toBeInTheDocument();
    expect(screen.getAllByText("Zbieracz").length).toBeGreaterThan(0);
    expect(screen.getByText("worker-1")).toBeInTheDocument();
    expect(
      screen.getByText("Konto zostalo utworzone i profil jest aktywny.")
    ).toBeInTheDocument();
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

    await user.click(screen.getByRole("button", { name: /logowanie/i }));

    expect(screen.getByRole("heading", { name: "Admin Test" })).toBeInTheDocument();
    expect(screen.getAllByText("Administrator").length).toBeGreaterThan(0);
    expect(screen.getByText("Status konta")).toBeInTheDocument();
    expect(screen.getByText("zatwierdzone")).toBeInTheDocument();
    expect(screen.getByText("Powiazany zbieracz")).toBeInTheDocument();
    expect(screen.getByText("Zgoda offline")).toBeInTheDocument();
    expect(screen.getByText("brak zgody")).toBeInTheDocument();
    expect(screen.getByText("Identyfikator urzadzenia")).toBeInTheDocument();
    expect(screen.getByText("Nazwa urzadzenia")).toBeInTheDocument();
    expect(screen.getByText("Wersja aplikacji")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Wyloguj" }));

    await waitFor(() => {
      expect(signOut).toHaveBeenCalled();
    });
  });

  it("blocks sign out and lists sessions while local documents are pending", async () => {
    for (const [key, value] of Object.entries(completeFirebaseEnv)) {
      vi.stubEnv(key, value);
    }

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
      expect(listLocalDocuments).toHaveBeenCalledTimes(2);
    });
    await user.click(screen.getByRole("button", { name: /logowanie/i }));
    await user.click(screen.getByRole("button", { name: "Wyloguj" }));

    expect(signOut).not.toHaveBeenCalled();
    expect(
      screen.getByRole("heading", { name: "Najpierw zsynchronizuj dane" })
    ).toBeInTheDocument();
    expect(screen.getByText("Anna Test")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Anuluj wylogowanie" })).toBeEnabled();
    expect(
      screen.queryByRole("button", { name: "Wyloguj i wyczysc urzadzenie" })
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

    await user.click(screen.getByRole("button", { name: /logowanie/i }));
    await user.click(
      screen.getByRole("button", { name: "Wyloguj i wyczysc urzadzenie" })
    );

    const finalAction = screen.getByRole("button", {
      name: "Wyczysc urzadzenie i wyloguj"
    });

    expect(finalAction).toBeDisabled();
    await user.type(
      screen.getByLabelText(`Wpisz ${DEVICE_CLEAR_CONFIRMATION}, aby potwierdzic`),
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
  });

  it("does not expose one account's pending documents after switching users", async () => {
    for (const [key, value] of Object.entries(completeFirebaseEnv)) {
      vi.stubEnv(key, value);
    }

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
      expect(listLocalDocuments).toHaveBeenCalledTimes(2);
    });
    await user.click(screen.getByRole("button", { name: /logowanie/i }));
    await user.click(screen.getByRole("button", { name: "Wyloguj" }));
    expect(screen.getByText("Dane administratora")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Anuluj wylogowanie" }));

    act(() => {
      sessionListener?.(activePickerState);
    });
    await screen.findByRole("heading", { name: "Picker Test" });
    expect(screen.queryByText("Dane administratora")).not.toBeInTheDocument();
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

    await user.click(screen.getByRole("button", { name: /logowanie/i }));
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

    await screen.findByText("Konto: Administrator");

    globalThis.dispatchEvent(new Event("focus"));

    await waitFor(() => {
      expect(refresh).toHaveBeenCalledWith(expect.anything());
    });
    expect(screen.getByText("Konto: Operator")).toBeInTheDocument();
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

    await screen.findByText("Konto: Zbieracz");

    globalThis.dispatchEvent(new Event("online"));

    await waitFor(() => {
      expect(refresh).toHaveBeenCalledWith(expect.anything());
    });
    expect(screen.getByText("Konto: zablokowane")).toBeInTheDocument();
  });

  it("opens the private picker dashboard from the application shell", async () => {
    const user = userEvent.setup();
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
        label: "Caly sezon: 01.07.2026 - 30.09.2026",
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

    await user.click(screen.getByRole("button", { name: "Zbieracz" }));

    expect(await screen.findByText("12,500 kg")).toBeInTheDocument();
    expect(screen.getByText("Picker Test / Anna Zbieracz")).toBeInTheDocument();
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
      trustedOfflineStorage: false
    });
    expect(input.deviceId).toEqual(expect.any(String));
    expect(input.deviceName).toEqual(expect.any(String));
  });

  it("updates offline consent from the user profile panel", async () => {
    const user = userEvent.setup();
    const updateOfflineConsent = vi
      .fn<AuthSessionApi["updateOfflineConsent"]>()
      .mockResolvedValue(undefined);

    render(
      <App
        authSessionApi={createAuthSessionApi(activeAdminState, {
          updateOfflineConsent
        })}
      />
    );

    await user.click(screen.getByRole("button", { name: /logowanie/i }));
    expect(screen.getByText(/Dane moga pozostac na tym urzadzeniu/)).toBeInTheDocument();
    expect(screen.getByText(/Tryb prywatny przegladarki/)).toBeInTheDocument();
    expect(screen.getAllByText(/Wyloguj i wyczysc urzadzenie/).length).toBeGreaterThan(0);

    await user.click(screen.getByLabelText("Zgoda na trwale dane offline"));

    await waitFor(() => {
      expect(updateOfflineConsent).toHaveBeenCalled();
    });
    const consentInput = updateOfflineConsent.mock.calls[0]?.[1];

    expect(consentInput).toMatchObject({
      uid: "admin-1",
      offlineConsent: true
    });
    expect(typeof consentInput.deviceId).toBe("string");
    expect(consentInput.deviceId.length).toBeGreaterThan(0);
    const deviceName = consentInput.deviceName;

    expect(typeof deviceName).toBe("string");
    if (typeof deviceName !== "string") {
      throw new Error("Expected trusted offline consent to include a device name.");
    }
    expect(deviceName.length).toBeGreaterThan(0);
    expect(
      screen.getByText(
        "Zgoda offline wlaczona. Uruchom ponownie PWA przed przygotowaniem offline."
      )
    ).toBeInTheDocument();
    expect(screen.getByText("zgoda aktywna")).toBeInTheDocument();
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

  it("routes manual sync retry from the synchronization center", async () => {
    for (const [key, value] of Object.entries(completeFirebaseEnv)) {
      vi.stubEnv(key, value);
    }

    const user = userEvent.setup();
    const read = vi.fn<ConfigurationCacheApi["read"]>().mockResolvedValue({
      snapshot: null,
      readiness: {
        status: "NOT_READY",
        missingRequirements: ["Brak lokalnego snapshotu konfiguracji."],
        counts: {
          workers: 0,
          plans: 0,
          rateVersions: 0,
          openSessions: 0
        }
      }
    });
    const synchronize = vi
      .fn<SynchronizationApi["synchronize"]>()
      .mockImplementation((_env, request) =>
        Promise.resolve({
          finishedAtIso: request.requestedAtIso,
          message: "Synchronizacja reczna przyjeta.",
          requestedAtIso: request.requestedAtIso,
          status: "SUCCESS",
          trigger: request.trigger
        })
      );

    render(
      <App
        authSessionApi={createAuthSessionApi(activeAdminState)}
        configurationCacheApi={{
          read,
          prepare: vi.fn<ConfigurationCacheApi["prepare"]>(),
          clear: vi.fn<ConfigurationCacheApi["clear"]>()
        }}
        synchronizationApi={createSynchronizationApi({
          hasLocalData: vi
            .fn<SynchronizationApi["hasLocalData"]>()
            .mockResolvedValue(false),
          synchronize
        })}
      />
    );

    await user.click(screen.getByRole("button", { name: /ustawienia/i }));
    await screen.findByRole("heading", { name: "Centrum synchronizacji" });
    await user.click(screen.getByRole("button", { name: "Synchronizuj teraz" }));

    await waitFor(() => {
      expect(synchronize).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          pendingDocumentCount: 0,
          trigger: "MANUAL_RETRY",
          userUid: "admin-1"
        })
      );
    });
    expect(screen.getByText("Synchronizacja reczna przyjeta.")).toBeInTheDocument();
    expect(
      screen.getByText(
        "Po odzyskaniu internetu ponownie otworz PWA, aby uruchomic synchronizacje."
      )
    ).toBeInTheDocument();
  });

  it("renders configuration cache center from settings", async () => {
    const user = userEvent.setup();
    const read = vi.fn<ConfigurationCacheApi["read"]>().mockResolvedValue({
      snapshot: null,
      readiness: {
        status: "NOT_READY",
        missingRequirements: [
          "Pliki PWA nie sa potwierdzone w cache service workera.",
          "Brak lokalnego snapshotu konfiguracji."
        ],
        counts: {
          workers: 0,
          plans: 0,
          rateVersions: 0,
          openSessions: 0
        }
      }
    });

    render(
      <App
        authSessionApi={createAuthSessionApi(activeAdminState)}
        configurationCacheApi={{
          read,
          prepare: vi.fn<ConfigurationCacheApi["prepare"]>(),
          clear: vi.fn<ConfigurationCacheApi["clear"]>()
        }}
      />
    );

    await user.click(screen.getByRole("button", { name: /ustawienia/i }));

    await waitFor(() => {
      expect(read).toHaveBeenCalled();
    });
    expect(
      screen.getByRole("heading", { name: "Centrum synchronizacji" })
    ).toBeInTheDocument();
    expect(
      screen.getByText("Brak lokalnego snapshotu konfiguracji.")
    ).toBeInTheDocument();
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

    await user.click(screen.getByRole("button", { name: /^administrator$/i }));

    await waitFor(() => {
      expect(list).toHaveBeenCalled();
      expect(listInvitations).toHaveBeenCalled();
      expect(listDevices).toHaveBeenCalled();
      expect(listSeasons).toHaveBeenCalled();
      expect(listSettlementPlans).toHaveBeenCalled();
      expect(listPayments).toHaveBeenCalled();
      expect(listIssues).toHaveBeenCalled();
      expect(readPickerExportSetting).toHaveBeenCalled();
      expect(listWorkers).toHaveBeenCalledWith(expect.anything(), {
        viewerRole: "ADMIN"
      });
    });
    expect(screen.getByRole("heading", { name: "Lista kont" })).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Eksport danych pickera" })
    ).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Historia wyplat" })).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Zgloszenia niezgodnosci" })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Konfiguracja sezonow" })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Lista planow rozliczen" })
    ).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Lista zbieraczy" })).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Prerejestracja kont" })
    ).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Lista urzadzen" })).toBeInTheDocument();
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
          localPendingCount: 0,
          openSessionCount: 0,
          ownClosedSessionCount: 1,
          ownOpenSessionCount: 0
        },
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

    await user.click(screen.getByRole("button", { name: /^operator$/i }));

    await waitFor(() => {
      expect(listHarvestSessions).toHaveBeenCalledWith(expect.anything(), {
        actorProfile: activeOperatorState.profile,
        selectedSessionId: null,
        isOnline: true
      });
      expect(loadOperatorDashboard).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          actorProfile: activeOperatorState.profile,
          isOnline: true
        })
      );
    });
    expect(listOpeningConfiguration).toHaveBeenCalledWith(expect.anything(), {
      actorProfile: activeOperatorState.profile,
      isOnline: true
    });
    expect(
      screen.getByRole("heading", { name: "Otwarte sesje zbioru" })
    ).toBeInTheDocument();
    expect(screen.getAllByRole("heading", { name: "Pulpit operatora" })).toHaveLength(2);
    expect(screen.queryByRole("heading", { name: "Lista zbieraczy" })).toBeNull();
  });
});
