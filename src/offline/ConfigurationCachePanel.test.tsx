import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ComponentProps } from "react";

import type { AuthSessionState } from "../auth/authSession";
import type {
  ConfigurationCacheReadiness,
  ConfigurationCacheSnapshot
} from "./configurationCache";
import {
  ConfigurationCachePanel,
  type ConfigurationCacheApi
} from "./ConfigurationCachePanel";
import type { EmergencyLocalExportPayload } from "./emergencyLocalExport";
import type {
  OfflineStorageHealth,
  OfflineStorageHealthApi
} from "./offlineStorageHealth";
import type { SyncCenterModel } from "./syncCenter";

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

const signedOutState: AuthSessionState = {
  status: "SIGNED_OUT",
  message: "Uzytkownik nie jest zalogowany."
};

const profileUnavailableState: AuthSessionState = {
  status: "PROFILE_UNAVAILABLE",
  message: "Nie udalo sie potwierdzic profilu.",
  user: {
    uid: "admin-1",
    email: "admin@example.test",
    displayName: null
  }
};

const blockedOperatorState: AuthSessionState = {
  status: "BLOCKED",
  message: "Konto jest zablokowane.",
  user: {
    uid: "operator-1",
    email: "operator@example.test",
    displayName: null
  },
  profile: {
    uid: "operator-1",
    email: "operator@example.test",
    displayName: "Operator Test",
    role: "OPERATOR",
    workerId: null,
    active: false,
    registrationStatus: "BLOCKED",
    offlineConsent: true
  },
  access: {
    status: "BLOCKED",
    reason: "Konto jest zablokowane."
  }
};

const readyReadiness: ConfigurationCacheReadiness = {
  status: "READY",
  missingRequirements: [],
  counts: {
    workers: 2,
    plans: 2,
    rateVersions: 3,
    openSessions: 1
  }
};

const healthyStorageHealth: OfflineStorageHealth = {
  status: "READY",
  label: "Pamiec offline gotowa",
  issues: [],
  persistenceStatus: "GRANTED",
  quota: {
    availableBytes: 900 * 1024 * 1024,
    quotaBytes: 1024 * 1024 * 1024,
    usageBytes: 124 * 1024 * 1024,
    usageRatio: 124 / 1024
  }
};

const healthyStorageHealthApi: OfflineStorageHealthApi = {
  inspect: () => Promise.resolve(healthyStorageHealth),
  markConfigurationCleared: () => Promise.resolve(),
  markConfigurationPrepared: () => Promise.resolve(),
  requestPersistentStorage: () => Promise.resolve(true)
};

function TestConfigurationCachePanel(
  props: ComponentProps<typeof ConfigurationCachePanel>
) {
  return (
    <ConfigurationCachePanel
      offlineStorageHealthApi={healthyStorageHealthApi}
      {...props}
    />
  );
}

const snapshot: ConfigurationCacheSnapshot = {
  id: "admin-1:device-1",
  version: 1,
  preparedAtIso: "2026-07-17T10:00:00.000Z",
  appVersion: "0.1.0",
  schemaVersion: "schema-0001",
  calculationVersion: "calc-0001",
  userUid: "admin-1",
  deviceId: "device-1",
  viewerRole: "ADMIN",
  account: {
    uid: "admin-1",
    email: "admin@example.test",
    displayName: "Admin Test",
    role: "ADMIN",
    workerId: null,
    offlineConsent: true
  },
  activeSeason: {
    id: "season-2026",
    name: "Sezon 2026",
    startDate: "2026-07-01",
    endDate: "2026-09-30",
    status: "OPEN",
    isDefault: true
  },
  workers: [
    {
      id: "worker-anna-test",
      displayName: "Anna Test",
      normalizedName: "anna test",
      active: true,
      currentPlanId: "plan-weight-kg",
      currentRateVersionId: "rate-worker-anna-test-2026-07-01"
    },
    {
      id: "worker-bartek-test",
      displayName: "Bartek Test",
      normalizedName: "bartek test",
      active: true,
      currentPlanId: "plan-quantity",
      currentRateVersionId: "rate-worker-bartek-test-2026-07-01"
    }
  ],
  plans: [
    {
      id: "plan-weight-kg",
      name: "Za kilogram",
      code: "WEIGHT_KG",
      calculationBasis: "WEIGHT",
      unitLabelSingular: "kilogram",
      unitLabelPlural: "kilogramy",
      unitSymbol: "kg",
      quantityPrecision: 3,
      weightRequired: true,
      allowBatchQuantity: true,
      active: true
    },
    {
      id: "plan-quantity",
      name: "Za ubianke",
      code: "UBIANKA",
      calculationBasis: "QUANTITY",
      unitLabelSingular: "ubianka",
      unitLabelPlural: "ubianki",
      unitSymbol: "ubianka",
      quantityPrecision: 1,
      weightRequired: false,
      allowBatchQuantity: true,
      active: true
    }
  ],
  rateVersions: [
    {
      id: "rate-worker-anna-test-2026-07-01",
      workerId: "worker-anna-test",
      planId: "plan-weight-kg",
      rateGroszPerUnit: 1000,
      validFrom: "2026-07-01",
      validTo: null,
      active: true,
      supersedesRateId: null
    },
    {
      id: "rate-worker-bartek-test-2026-07-01",
      workerId: "worker-bartek-test",
      planId: "plan-quantity",
      rateGroszPerUnit: 1500,
      validFrom: "2026-07-01",
      validTo: null,
      active: true,
      supersedesRateId: null
    },
    {
      id: "rate-worker-bartek-test-2026-08-01",
      workerId: "worker-bartek-test",
      planId: "plan-quantity",
      rateGroszPerUnit: 1700,
      validFrom: "2026-08-01",
      validTo: null,
      active: true,
      supersedesRateId: "rate-worker-bartek-test-2026-07-01"
    }
  ],
  openSessions: [
    {
      id: "session-open-1",
      seasonId: "season-2026",
      workerId: "worker-anna-test",
      workerNameSnapshot: "Anna Test",
      businessDate: "2026-07-17",
      status: "OPEN",
      planIdSnapshot: "plan-weight-kg",
      planNameSnapshot: "Za kilogram",
      calculationBasisSnapshot: "WEIGHT",
      unitLabelSnapshot: "kilogram",
      unitLabelPluralSnapshot: "kilogramy",
      rateVersionIdSnapshot: "rate-worker-anna-test-2026-07-01",
      rateGroszSnapshot: 1000,
      weightRequiredSnapshot: true,
      quantityPrecisionSnapshot: 3,
      allowBatchQuantitySnapshot: true,
      totalEntryCount: 2,
      totalQuantityMilli: 0,
      totalWeightG: 3000,
      amountDueGrosz: null,
      calculationVersion: "calc-0001",
      createdBy: "operator-1",
      createdDeviceId: "device-operator-1",
      revision: 1
    }
  ],
  invalidDocumentCount: 0
};

const env = {};

describe("ConfigurationCachePanel", () => {
  it("requires an active profile", () => {
    render(
      <TestConfigurationCachePanel
        authState={signedOutState}
        deviceId="device-1"
        env={env}
        isOnline={true}
        serviceWorkerStatus="registered"
      />
    );

    expect(screen.getByText("Logowanie wymagane")).toBeInTheDocument();
  });

  it("reports account reconfirmation when profile cannot be confirmed", () => {
    render(
      <TestConfigurationCachePanel
        authState={profileUnavailableState}
        deviceId="device-1"
        env={env}
        isOnline={true}
        serviceWorkerStatus="registered"
      />
    );

    expect(screen.getByText("Wymagane ponowne potwierdzenie konta")).toBeInTheDocument();
    expect(screen.getByText("Nie udalo sie potwierdzic profilu.")).toBeInTheDocument();
  });

  it("keeps emergency export available when a blocked account has pending local data", async () => {
    const user = userEvent.setup();
    const onEmergencyExport = vi
      .fn<(payload: EmergencyLocalExportPayload) => Promise<void>>()
      .mockResolvedValue(undefined);

    render(
      <TestConfigurationCachePanel
        authState={blockedOperatorState}
        deviceId="device-1"
        deviceName="Telefon operatora"
        devicePlatform="Android"
        env={env}
        isOnline={true}
        onEmergencyExport={onEmergencyExport}
        onRetrySync={vi.fn()}
        serviceWorkerStatus="registered"
        syncDocuments={[
          {
            id: "session-pending",
            kind: "HARVEST_SESSION",
            workerName: "Anna Test",
            businessDate: "2026-07-17",
            businessStatus: "OPEN",
            pendingSync: true
          },
          {
            id: "entry-rejected",
            kind: "HARVEST_ENTRY",
            sessionId: "session-pending",
            workerName: "Anna Test",
            businessDate: "2026-07-17",
            businessStatus: "OPEN",
            rejectedReason: "permission-denied: Konto jest zablokowane."
          }
        ]}
      />
    );

    expect(
      screen.getByText("Konto zablokowane, dane lokalne zachowane")
    ).toBeInTheDocument();
    expect(screen.getByText("session-pending")).toBeInTheDocument();
    expect(screen.getByText("operator@example.test")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Synchronizuj teraz" })).toBeNull();

    await user.click(screen.getByRole("button", { name: "Eksport awaryjny" }));

    expect(onEmergencyExport).toHaveBeenCalledTimes(1);
    expect(onEmergencyExport.mock.calls[0]?.[0]).toMatchObject({
      device: {
        id: "device-1",
        name: "Telefon operatora",
        platform: "Android"
      },
      format: {
        automaticProductionImportAllowed: false
      },
      summary: {
        pendingSyncCount: 1,
        rejectedCount: 1,
        sessionCount: 1,
        entryCount: 1
      },
      user: {
        registrationStatus: "BLOCKED",
        uid: "operator-1"
      }
    });
  });

  it("shows missing consent before offline preparation", async () => {
    const read = vi.fn<ConfigurationCacheApi["read"]>().mockResolvedValue({
      snapshot: null,
      readiness: {
        status: "NOT_READY",
        missingRequirements: [
          "Brak zgody na trwale dane offline.",
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
    const prepare = vi.fn<ConfigurationCacheApi["prepare"]>();

    render(
      <TestConfigurationCachePanel
        authState={{
          ...activeAdminState,
          profile: {
            ...activeAdminState.profile,
            offlineConsent: false
          }
        }}
        configurationCacheApi={{
          read,
          prepare,
          clear: vi.fn<ConfigurationCacheApi["clear"]>()
        }}
        deviceId="device-1"
        env={env}
        isOnline={true}
        serviceWorkerStatus="registered"
      />
    );

    await screen.findByText("Brak zgody na trwale dane offline.");

    expect(screen.getByRole("button", { name: "Przygotuj offline" })).toBeDisabled();
    expect(
      screen.getByText(
        "Wlacz zgode offline w panelu logowania, tylko jesli to zaufane urzadzenie."
      )
    ).toBeInTheDocument();
    expect(prepare).not.toHaveBeenCalled();
  });

  it("prepares configuration cache and shows offline readiness", async () => {
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
    const prepare = vi.fn<ConfigurationCacheApi["prepare"]>().mockResolvedValue({
      snapshot,
      readiness: readyReadiness
    });

    render(
      <TestConfigurationCachePanel
        authState={activeAdminState}
        configurationCacheApi={{
          read,
          prepare,
          clear: vi.fn<ConfigurationCacheApi["clear"]>()
        }}
        deviceId="device-1"
        env={env}
        isOnline={true}
        serviceWorkerStatus="registered"
      />
    );

    await screen.findByText("Brak lokalnego snapshotu konfiguracji.");
    await user.click(screen.getByRole("button", { name: "Przygotuj offline" }));

    await waitFor(() => {
      expect(prepare).toHaveBeenCalledWith(env, {
        actorProfile: activeAdminState.profile,
        viewerRole: "ADMIN",
        deviceId: "device-1",
        serviceWorkerReady: true
      });
    });
    expect(screen.getAllByText("Online, zsynchronizowano")).toHaveLength(2);
    expect(
      screen.getByText("Dane wymagane do pracy offline sa gotowe.")
    ).toBeInTheDocument();
    expect(
      screen.getByText("Cache konfiguracji zostal przygotowany.")
    ).toBeInTheDocument();
    expect(
      screen.getByText("Profil, sezon, zbieracze, plany i stawki sa zapisane w cache.")
    ).toBeInTheDocument();
    expect(screen.getByText("Otwarte sesje offline")).toBeInTheDocument();
    expect(screen.getAllByText("2")).toHaveLength(2);
    expect(screen.getByText("1")).toBeInTheDocument();
    expect(screen.getByText("3")).toBeInTheDocument();
  });

  it("separates PWA file readiness from cached domain data readiness", async () => {
    const read = vi.fn<ConfigurationCacheApi["read"]>().mockResolvedValue({
      snapshot,
      readiness: readyReadiness
    });

    render(
      <TestConfigurationCachePanel
        authState={activeAdminState}
        configurationCacheApi={{
          read,
          prepare: vi.fn<ConfigurationCacheApi["prepare"]>(),
          clear: vi.fn<ConfigurationCacheApi["clear"]>()
        }}
        deviceId="device-1"
        env={env}
        isOnline={true}
        serviceWorkerStatus="not-registered"
      />
    );

    expect(await screen.findAllByText("Offline, brak wymaganych danych")).toHaveLength(2);

    expect(screen.getByText("Pliki aplikacji niepotwierdzone")).toBeInTheDocument();
    expect(screen.getByText("Dane gotowe offline")).toBeInTheDocument();
    expect(
      screen.getAllByText("Service worker nie potwierdzil jeszcze cache plikow PWA.")
    ).toHaveLength(2);
    expect(screen.getByText("Statusy danych: cache, potwierdzone")).toBeInTheDocument();
  });

  it("reports offline ready when cached layers are ready without connectivity", async () => {
    const read = vi.fn<ConfigurationCacheApi["read"]>().mockResolvedValue({
      snapshot,
      readiness: readyReadiness
    });

    render(
      <TestConfigurationCachePanel
        authState={activeAdminState}
        configurationCacheApi={{
          read,
          prepare: vi.fn<ConfigurationCacheApi["prepare"]>(),
          clear: vi.fn<ConfigurationCacheApi["clear"]>()
        }}
        deviceId="device-1"
        env={env}
        isOnline={false}
        serviceWorkerStatus="registered"
      />
    );

    expect(await screen.findAllByText("Offline, gotowe")).toHaveLength(2);

    expect(
      screen.getByText("Aplikacja i dane moga obslugiwac prace bez internetu.")
    ).toBeInTheDocument();
  });

  it("never reports offline ready when local storage health has blockers", async () => {
    const unavailableStorageHealth: OfflineStorageHealth = {
      status: "NOT_READY",
      label: "Pamiec offline niedostepna",
      issues: [
        {
          code: "PERSISTENT_STORAGE_UNAVAILABLE",
          message: "Trwala pamiec offline nie jest dostepna albo nie zostala wlaczona."
        },
        {
          code: "PRIVATE_MODE_SUSPECTED",
          message: "Tryb prywatny albo ustawienia przegladarki blokuja lokalna pamiec."
        },
        {
          code: "LOCAL_WRITE_FAILED",
          message: "Zapis lub odczyt lokalnego cache nie powiodl sie."
        },
        {
          code: "LOW_SPACE",
          message: "Na urzadzeniu jest za malo miejsca na bezpieczna prace offline."
        },
        {
          code: "STORAGE_CLEARED",
          message:
            "Wczesniej przygotowany cache zniknal. Pamiec mogla zostac wyczyszczona przez system lub uzytkownika."
        },
        {
          code: "CONFIGURATION_INCOMPLETE",
          message: "Konfiguracja offline jest niekompletna."
        }
      ],
      persistenceStatus: "NOT_GRANTED",
      quota: null
    };

    render(
      <TestConfigurationCachePanel
        authState={activeAdminState}
        configurationCacheApi={{
          read: () =>
            Promise.resolve({
              snapshot,
              readiness: readyReadiness
            }),
          prepare: vi.fn<ConfigurationCacheApi["prepare"]>(),
          clear: vi.fn<ConfigurationCacheApi["clear"]>()
        }}
        deviceId="device-1"
        env={env}
        isOnline={false}
        offlineStorageHealthApi={{
          ...healthyStorageHealthApi,
          inspect: () => Promise.resolve(unavailableStorageHealth)
        }}
        serviceWorkerStatus="registered"
      />
    );

    expect(
      (await screen.findAllByText("Pamiec offline niedostepna")).length
    ).toBeGreaterThanOrEqual(2);
    expect(screen.queryByText("Offline, gotowe")).not.toBeInTheDocument();

    for (const issue of unavailableStorageHealth.issues) {
      expect(screen.getAllByText(issue.message).length).toBeGreaterThan(0);
    }
  });

  it("does not prepare offline data when persistent storage is denied", async () => {
    const user = userEvent.setup();
    const prepare = vi.fn<ConfigurationCacheApi["prepare"]>();
    const inspect = vi.fn<OfflineStorageHealthApi["inspect"]>().mockResolvedValue({
      status: "NOT_READY",
      label: "Pamiec offline niedostepna",
      issues: [
        {
          code: "PERSISTENT_STORAGE_UNAVAILABLE",
          message: "Trwala pamiec offline nie jest dostepna albo nie zostala wlaczona."
        },
        {
          code: "CONFIGURATION_INCOMPLETE",
          message: "Konfiguracja offline jest niekompletna."
        }
      ],
      persistenceStatus: "NOT_GRANTED",
      quota: null
    });

    render(
      <TestConfigurationCachePanel
        authState={activeAdminState}
        configurationCacheApi={{
          read: () =>
            Promise.resolve({
              snapshot: null,
              readiness: {
                ...readyReadiness,
                status: "NOT_READY",
                missingRequirements: ["Brak lokalnego snapshotu konfiguracji."]
              }
            }),
          prepare,
          clear: vi.fn<ConfigurationCacheApi["clear"]>()
        }}
        deviceId="device-1"
        env={env}
        isOnline={true}
        offlineStorageHealthApi={{
          ...healthyStorageHealthApi,
          inspect,
          requestPersistentStorage: () => Promise.resolve(false)
        }}
        serviceWorkerStatus="registered"
      />
    );

    await screen.findByText("Brak lokalnego snapshotu konfiguracji.");
    await user.click(screen.getByRole("button", { name: "Przygotuj offline" }));

    expect(prepare).not.toHaveBeenCalled();
    expect(
      await screen.findByText("Przegladarka nie zezwolila na trwala pamiec offline.")
    ).toBeInTheDocument();
  });

  it("reports synchronization errors from failed cache reads", async () => {
    const read = vi
      .fn<ConfigurationCacheApi["read"]>()
      .mockRejectedValue(new Error("Firestore unavailable"));

    render(
      <TestConfigurationCachePanel
        authState={activeAdminState}
        configurationCacheApi={{
          read,
          prepare: vi.fn<ConfigurationCacheApi["prepare"]>(),
          clear: vi.fn<ConfigurationCacheApi["clear"]>()
        }}
        deviceId="device-1"
        env={env}
        isOnline={true}
        serviceWorkerStatus="registered"
      />
    );

    expect(await screen.findAllByText("Blad synchronizacji")).toHaveLength(2);

    expect(
      screen.getByText("Co najmniej jeden zapis lub odczyt wymaga interwencji.")
    ).toBeInTheDocument();
  });

  it("shows synchronization metadata, pending sessions and safe sync actions", async () => {
    const user = userEvent.setup();
    const read = vi.fn<ConfigurationCacheApi["read"]>().mockResolvedValue({
      snapshot,
      readiness: readyReadiness
    });
    const onRetrySync = vi
      .fn<(model: SyncCenterModel) => Promise<undefined>>()
      .mockResolvedValue(undefined);
    const onEmergencyExport = vi
      .fn<(payload: EmergencyLocalExportPayload) => Promise<void>>()
      .mockResolvedValue(undefined);

    render(
      <TestConfigurationCachePanel
        authState={activeAdminState}
        configurationCacheApi={{
          read,
          prepare: vi.fn<ConfigurationCacheApi["prepare"]>(),
          clear: vi.fn<ConfigurationCacheApi["clear"]>()
        }}
        deviceId="device-1"
        deviceName="Telefon administratora"
        devicePlatform="Android"
        env={env}
        isOnline={true}
        lastSyncError="Ostatnia proba synchronizacji zostala przerwana."
        onEmergencyExport={onEmergencyExport}
        onRetrySync={onRetrySync}
        serviceWorkerStatus="registered"
        syncDocuments={[
          {
            id: "session-pending",
            kind: "HARVEST_SESSION",
            localSnapshot: {
              id: "session-pending",
              planIdSnapshot: "plan-weight",
              rateGroszSnapshot: 650
            },
            workerName: "Anna Test",
            businessDate: "2026-07-17",
            businessStatus: "OPEN",
            pendingSync: true
          },
          {
            id: "entry-pending",
            kind: "HARVEST_ENTRY",
            localSnapshot: {
              id: "entry-pending",
              quantityMilli: 1000,
              weightG: 1250
            },
            sessionId: "session-pending",
            workerName: "Anna Test",
            businessDate: "2026-07-17",
            businessStatus: "OPEN",
            pendingSync: true
          },
          {
            id: "entry-synced",
            kind: "HARVEST_ENTRY",
            sessionId: "session-pending",
            workerName: "Anna Test",
            businessDate: "2026-07-17",
            businessStatus: "OPEN",
            lastSuccessfulSyncIso: "2026-07-17T10:10:00.000Z"
          },
          {
            id: "entry-rejected",
            kind: "HARVEST_ENTRY",
            sessionId: "session-rejected",
            workerName: "Bartek Test",
            businessDate: "2026-07-18",
            businessStatus: "CLOSED",
            rejectedReason: "Rules odrzucily wpis."
          }
        ]}
      />
    );

    expect(await screen.findByText("Lokalne zmiany")).toBeInTheDocument();
    expect(screen.getByText("Sesje z oczekujacymi zmianami")).toBeInTheDocument();
    expect(
      screen.getByText(/Ostatnia proba synchronizacji zostala przerwana\./)
    ).toBeInTheDocument();
    expect(screen.getByText("Anna Test")).toBeInTheDocument();
    expect(screen.getByText("Bartek Test")).toBeInTheDocument();
    expect(screen.getByText("Rules odrzucily wpis.")).toBeInTheDocument();
    expect(screen.getByText("Przejrzyj konflikt")).toBeInTheDocument();
    expect(screen.queryByText("Usun wszystkie oczekujace dane")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Synchronizuj teraz" }));

    expect(onRetrySync).toHaveBeenCalledWith(
      expect.objectContaining({
        pendingSessionCount: 2
      })
    );

    await user.click(screen.getByRole("button", { name: "Eksport awaryjny" }));

    expect(onEmergencyExport).toHaveBeenCalledTimes(1);

    const [[exportedPayload]] = onEmergencyExport.mock.calls;
    expect(exportedPayload.device).toEqual({
      id: "device-1",
      name: "Telefon administratora",
      platform: "Android"
    });
    expect(exportedPayload.user).toMatchObject({
      email: "admin@example.test",
      role: "ADMIN",
      uid: "admin-1"
    });
    expect(exportedPayload.format).toMatchObject({
      automaticProductionImportAllowed: false,
      name: "BOROWKA_EMERGENCY_LOCAL_EXPORT",
      productionImportPolicy: "CONTROLLED_REVIEW_REQUIRED"
    });
    expect(exportedPayload.summary).toMatchObject({
      entryCount: 3,
      totalDocumentCount: 4,
      rejectedCount: 1,
      sessionCount: 1
    });
    expect(exportedPayload.data.sessions[0]).toMatchObject({
      documentUuid: "session-pending",
      localStatus: "PENDING_SYNC",
      snapshot: {
        planIdSnapshot: "plan-weight",
        rateGroszSnapshot: 650
      }
    });
    expect(exportedPayload.data.entries[0]).toMatchObject({
      documentUuid: "entry-rejected",
      synchronization: {
        rejectedReason: "Rules odrzucily wpis."
      }
    });
  });
});
