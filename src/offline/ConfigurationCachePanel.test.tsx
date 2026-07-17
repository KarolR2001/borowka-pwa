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

const readyReadiness: ConfigurationCacheReadiness = {
  status: "READY",
  missingRequirements: [],
  counts: {
    workers: 2,
    plans: 2,
    rateVersions: 3
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
          rateVersions: 0
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
          rateVersions: 0
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
    expect(screen.getByText("Gotowe offline")).toBeInTheDocument();
    expect(
      screen.getByText("Cache konfiguracji zostal przygotowany.")
    ).toBeInTheDocument();
    expect(
      screen.getByText("Profil, sezon, zbieracze, plany i stawki sa zapisane w cache.")
    ).toBeInTheDocument();
    expect(screen.getAllByText("2")).toHaveLength(2);
    expect(screen.getByText("3")).toBeInTheDocument();
  });
});
