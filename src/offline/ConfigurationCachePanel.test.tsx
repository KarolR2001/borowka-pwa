import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import type { AuthSessionState } from "../auth/authSession";
import type {
  ConfigurationCacheReadiness,
  ConfigurationCacheSnapshot
} from "./configurationCache";
import {
  ConfigurationCachePanel,
  type ConfigurationCacheApi
} from "./ConfigurationCachePanel";
import type { EmergencySyncExportPayload, SyncCenterModel } from "./syncCenter";

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
      <ConfigurationCachePanel
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
      <ConfigurationCachePanel
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
      <ConfigurationCachePanel
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
      <ConfigurationCachePanel
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
      <ConfigurationCachePanel
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
      <ConfigurationCachePanel
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

  it("reports synchronization errors from failed cache reads", async () => {
    const read = vi
      .fn<ConfigurationCacheApi["read"]>()
      .mockRejectedValue(new Error("Firestore unavailable"));

    render(
      <ConfigurationCachePanel
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
      .fn<(model: SyncCenterModel) => Promise<void>>()
      .mockResolvedValue(undefined);
    const onEmergencyExport = vi
      .fn<(payload: EmergencySyncExportPayload) => Promise<void>>()
      .mockResolvedValue(undefined);

    render(
      <ConfigurationCachePanel
        authState={activeAdminState}
        configurationCacheApi={{
          read,
          prepare: vi.fn<ConfigurationCacheApi["prepare"]>(),
          clear: vi.fn<ConfigurationCacheApi["clear"]>()
        }}
        deviceId="device-1"
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
            workerName: "Anna Test",
            businessDate: "2026-07-17",
            businessStatus: "OPEN",
            pendingSync: true
          },
          {
            id: "entry-pending",
            kind: "HARVEST_ENTRY",
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
    expect(exportedPayload.deviceId).toBe("device-1");
    expect(exportedPayload.summary).toMatchObject({
      totalDocumentCount: 4,
      rejectedCount: 1
    });
  });
});
