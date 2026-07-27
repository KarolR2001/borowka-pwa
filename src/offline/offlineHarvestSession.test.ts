import { APP_META } from "../config/appMeta";
import type { UserProfile } from "../domain/identity";
import {
  HARVEST_SESSION_CALCULATION_VERSION,
  INITIAL_HARVEST_SESSION_REVISION
} from "../harvest/openHarvestSession";
import {
  CONFIGURATION_CACHE_VERSION,
  evaluateConfigurationCacheReadiness,
  type ConfigurationCacheSnapshot
} from "./configurationCache";
import {
  prepareOfflineHarvestSession,
  type PrepareOfflineHarvestSessionInput
} from "./offlineHarvestSession";

const createdAtDevice = "2026-07-17T10:00:00.000Z";

const operatorProfile: UserProfile = {
  uid: "operator-1",
  email: "operator@example.test",
  displayName: "Operator Test",
  role: "OPERATOR",
  workerId: null,
  active: true,
  registrationStatus: "APPROVED",
  offlineConsent: true
};

const adminProfile: UserProfile = {
  ...operatorProfile,
  uid: "admin-1",
  email: "admin@example.test",
  displayName: "Admin Test",
  role: "ADMIN"
};

const pickerProfile: UserProfile = {
  ...operatorProfile,
  uid: "picker-1",
  email: "picker@example.test",
  displayName: "Picker Test",
  role: "PICKER",
  workerId: "worker-anna-test"
};

function createSnapshot(
  profile: UserProfile = operatorProfile,
  overrides: Partial<ConfigurationCacheSnapshot> = {}
): ConfigurationCacheSnapshot {
  const viewerRole = profile.role === "ADMIN" ? "ADMIN" : "OPERATOR";

  return {
    id: `${profile.uid}:device-1`,
    version: CONFIGURATION_CACHE_VERSION,
    preparedAtIso: "2026-07-17T08:00:00.000Z",
    appVersion: APP_META.version,
    schemaVersion: APP_META.schemaVersion,
    calculationVersion: APP_META.calculationVersion,
    userUid: profile.uid,
    deviceId: "device-1",
    viewerRole,
    account: {
      uid: profile.uid,
      email: profile.email,
      displayName: profile.displayName,
      role: profile.role,
      workerId: profile.workerId ?? null,
      offlineConsent: profile.offlineConsent
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
      }
    ],
    openSessions: [],
    invalidDocumentCount: 0,
    ...overrides
  };
}

function openSession(
  overrides: Partial<ConfigurationCacheSnapshot["openSessions"][number]> = {}
): ConfigurationCacheSnapshot["openSessions"][number] {
  return {
    id: "existing-open",
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
    totalEntryCount: 0,
    totalQuantityMilli: 0,
    totalWeightG: 0,
    amountDueGrosz: null,
    calculationVersion: HARVEST_SESSION_CALCULATION_VERSION,
    createdBy: "operator-1",
    createdDeviceId: "device-1",
    revision: 1,
    ...overrides
  };
}

function createInput(
  overrides: Partial<PrepareOfflineHarvestSessionInput> & {
    serviceWorkerReady?: boolean;
  } = {}
): PrepareOfflineHarvestSessionInput {
  const actorProfile = overrides.actorProfile ?? operatorProfile;
  const configurationSnapshot = Object.prototype.hasOwnProperty.call(
    overrides,
    "configurationSnapshot"
  )
    ? (overrides.configurationSnapshot ?? null)
    : createSnapshot(actorProfile);
  const configurationReadiness =
    overrides.configurationReadiness ??
    evaluateConfigurationCacheReadiness({
      profile: actorProfile,
      serviceWorkerReady: overrides.serviceWorkerReady ?? true,
      snapshot: configurationSnapshot
    });

  return {
    actorProfile,
    configurationSnapshot,
    configurationReadiness,
    workerId: "worker-anna-test",
    businessDate: "2026-07-17",
    id: "session-offline-1",
    createdDeviceId: "device-1",
    createdAtDevice,
    note: "  pierwszy zbior offline  ",
    secondSessionReason: null,
    ...overrides
  };
}

describe("offline harvest session preparation", () => {
  it("creates a local OPEN session from a ready offline configuration snapshot", () => {
    const result = prepareOfflineHarvestSession(createInput());

    expect(result.status).toBe("CREATED_OFFLINE");
    if (result.status !== "CREATED_OFFLINE") {
      throw new Error("Expected offline session.");
    }

    expect(result).toMatchObject({
      selectedSessionId: "session-offline-1",
      syncState: "LOCAL_PENDING_SYNC",
      cacheSnapshotId: "operator-1:device-1",
      auditAction: "HARVEST_SESSION_CREATED",
      beforeSummary: null,
      reason: null,
      deviceId: "device-1",
      duplicateMode: "FIRST_SESSION"
    });
    expect(result.session).toMatchObject({
      id: "session-offline-1",
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
      totalEntryCount: 0,
      totalQuantityMilli: 0,
      totalWeightG: 0,
      amountDueGrosz: null,
      calculationVersion: HARVEST_SESSION_CALCULATION_VERSION,
      note: "pierwszy zbior offline",
      createdBy: "operator-1",
      createdDeviceId: "device-1",
      createdAtDevice,
      createdAtServer: null,
      updatedAtServer: null,
      revision: INITIAL_HARVEST_SESSION_REVISION,
      legacyImport: false,
      legacySourceRows: []
    });
    expect(result.afterSummary).toMatchObject({
      status: "OPEN",
      workerId: "worker-anna-test",
      businessDate: "2026-07-17",
      rateGroszPerUnit: 1000
    });
    expect(result.calculationDescription).toContain("10,00");
    expect(result.message).toBe("Utworzono lokalnie sesje offline dla Anna Test.");
  });

  it("blocks offline creation when the app is not prepared", () => {
    expect(() =>
      prepareOfflineHarvestSession(createInput({ serviceWorkerReady: false }))
    ).toThrow("Aplikacja nie jest przygotowana do pracy offline");
  });

  it("blocks unapproved roles and profiles before creating a local session", () => {
    expect(() =>
      prepareOfflineHarvestSession(
        createInput({
          actorProfile: {
            ...operatorProfile,
            registrationStatus: "BLOCKED"
          }
        })
      )
    ).toThrow("Profil nie jest zatwierdzony do pracy offline");
    expect(() =>
      prepareOfflineHarvestSession(
        createInput({
          actorProfile: pickerProfile,
          configurationSnapshot: createSnapshot(operatorProfile)
        })
      )
    ).toThrow("Tylko administrator albo operator moze utworzyc sesje offline.");
    expect(() =>
      prepareOfflineHarvestSession(
        createInput({
          actorProfile: {
            ...operatorProfile,
            offlineConsent: false
          }
        })
      )
    ).toThrow("Sesja offline wymaga zgody na trwale dane offline.");
  });

  it("blocks stale or foreign offline snapshots", () => {
    expect(() =>
      prepareOfflineHarvestSession(
        createInput({
          configurationSnapshot: createSnapshot(operatorProfile, {
            schemaVersion: "schema-0000"
          })
        })
      )
    ).toThrow("Snapshot konfiguracji ma nieaktualna wersje schematu.");
    expect(() =>
      prepareOfflineHarvestSession(
        createInput({
          createdDeviceId: "device-2"
        })
      )
    ).toThrow("Snapshot offline zostal przygotowany dla innego urzadzenia.");
    expect(() =>
      prepareOfflineHarvestSession(
        createInput({
          configurationSnapshot: createSnapshot(operatorProfile, {
            account: {
              uid: "operator-1",
              email: "operator@example.test",
              displayName: "Operator Test",
              role: "OPERATOR",
              workerId: null,
              offlineConsent: false
            }
          })
        })
      )
    ).toThrow("Cache offline nie potwierdza zgody na trwale dane offline.");
  });

  it("blocks missing season, worker, plan and rate data from cache", () => {
    expect(() =>
      prepareOfflineHarvestSession(
        createInput({
          configurationSnapshot: createSnapshot(operatorProfile, {
            activeSeason: null
          })
        })
      )
    ).toThrow("Aplikacja nie jest przygotowana do pracy offline");
    expect(() =>
      prepareOfflineHarvestSession(
        createInput({
          workerId: "worker-missing"
        })
      )
    ).toThrow("Wybrany zbieracz nie jest dostepny w cache offline.");
    expect(() =>
      prepareOfflineHarvestSession(
        createInput({
          configurationSnapshot: createSnapshot(operatorProfile, {
            rateVersions: [
              {
                id: "rate-worker-anna-test-2026-07-20",
                workerId: "worker-anna-test",
                planId: "plan-weight-kg",
                rateGroszPerUnit: 1000,
                validFrom: "2026-07-20",
                validTo: null,
                active: true,
                supersedesRateId: null
              }
            ],
            workers: [
              {
                id: "worker-anna-test",
                displayName: "Anna Test",
                normalizedName: "anna test",
                active: true,
                currentPlanId: "plan-weight-kg",
                currentRateVersionId: "rate-worker-anna-test-2026-07-20"
              }
            ]
          })
        })
      )
    ).toThrow("Brak stawki zbieracza w cache offline dla daty sesji.");
    expect(() =>
      prepareOfflineHarvestSession(
        createInput({
          configurationSnapshot: createSnapshot(operatorProfile, {
            plans: []
          })
        })
      )
    ).toThrow("Aplikacja nie jest przygotowana do pracy offline");
  });

  it("continues an existing cached open session instead of creating a hidden duplicate", () => {
    const existingSession = openSession();
    const result = prepareOfflineHarvestSession(
      createInput({
        configurationSnapshot: createSnapshot(operatorProfile, {
          openSessions: [existingSession]
        })
      })
    );

    expect(result).toEqual({
      status: "CONTINUE_EXISTING",
      selectedSessionId: "existing-open",
      cacheSnapshotId: "operator-1:device-1",
      existingOpenSessions: [existingSession],
      canCreateSecondSession: false,
      message: "W cache offline istnieje juz otwarta sesja tej osoby z ta data biznesowa."
    });
  });

  it("allows an admin to prepare a second offline same-day session only with a reason", () => {
    const existingSession = openSession();
    const result = prepareOfflineHarvestSession(
      createInput({
        actorProfile: adminProfile,
        configurationSnapshot: createSnapshot(adminProfile, {
          openSessions: [existingSession]
        }),
        id: "second-offline-session",
        secondSessionReason: "Drugi etap dnia."
      })
    );

    expect(result.status).toBe("CREATED_OFFLINE");
    if (result.status !== "CREATED_OFFLINE") {
      throw new Error("Expected admin second offline session.");
    }

    expect(result.duplicateMode).toBe("SECOND_SESSION_CONFIRMED");
    expect(result.reason).toBe("Drugi etap dnia.");
    expect(result.existingOpenSessions).toEqual([existingSession]);
  });

  it("blocks an operator from forcing a second offline same-day session", () => {
    expect(() =>
      prepareOfflineHarvestSession(
        createInput({
          configurationSnapshot: createSnapshot(operatorProfile, {
            openSessions: [openSession()]
          }),
          secondSessionReason: "Drugi etap dnia."
        })
      )
    ).toThrow("Tylko administrator moze utworzyc druga sesje offline tej osoby i daty.");
  });
});
