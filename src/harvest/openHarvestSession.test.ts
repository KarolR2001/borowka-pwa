import {
  QUANTITY_UBIANKA_PLAN_ID,
  TEST_SEASON_ID,
  WEIGHT_KG_PLAN_ID,
  createInitialDomainSeed,
  type SeasonDocument,
  type SettlementPlanDocument,
  type WorkerDocument,
  type WorkerRateVersionDocument
} from "../domain/domainConfiguration";
import type { UserProfile } from "../domain/identity";
import {
  HARVEST_SESSION_CALCULATION_VERSION,
  INITIAL_HARVEST_SESSION_REVISION,
  createHarvestSessionId,
  describeHarvestSessionCalculation,
  findEffectiveWorkerRateVersion,
  findOpenHarvestSessionsForWorkerDate,
  isWorkerRateVersionEffectiveOn,
  prepareOpenHarvestSession,
  type HarvestSessionLookup
} from "./openHarvestSession";

const createdAt = "2026-07-17T10:00:00.000Z";
const seed = createInitialDomainSeed({ createdAt });

const adminProfile: UserProfile = {
  uid: "admin-1",
  email: "admin@example.test",
  displayName: "Admin",
  role: "ADMIN",
  active: true,
  registrationStatus: "APPROVED",
  offlineConsent: true
};

const operatorProfile: UserProfile = {
  ...adminProfile,
  uid: "operator-1",
  role: "OPERATOR"
};

const pickerProfile: UserProfile = {
  ...adminProfile,
  uid: "picker-1",
  role: "PICKER",
  workerId: "worker-anna-test"
};

function defaultInput(overrides = {}) {
  return {
    actorProfile: operatorProfile,
    id: "session-1",
    season: seed.seasons[0],
    worker: seed.workers[0],
    plans: seed.settlementPlans,
    rateVersions: seed.workerRateVersions,
    businessDate: "2026-07-17",
    existingSessions: [],
    isOnline: true,
    note: "  pierwszy zbior  ",
    createdDeviceId: "device-1",
    createdAtDevice: createdAt,
    ...overrides
  };
}

describe("open harvest session preparation", () => {
  it("creates an OPEN session draft with immutable worker, plan and rate snapshots", () => {
    const result = prepareOpenHarvestSession(defaultInput());

    expect(result.status).toBe("CREATED");
    if (result.status !== "CREATED") {
      throw new Error("Expected session draft.");
    }

    expect(result.session).toMatchObject({
      id: "session-1",
      seasonId: TEST_SEASON_ID,
      workerId: "worker-anna-test",
      workerNameSnapshot: "Anna Test",
      businessDate: "2026-07-17",
      status: "OPEN",
      planIdSnapshot: WEIGHT_KG_PLAN_ID,
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
      note: "pierwszy zbior",
      createdBy: "operator-1",
      createdDeviceId: "device-1",
      revision: INITIAL_HARVEST_SESSION_REVISION,
      legacyImport: false,
      legacySourceRows: []
    });
    expect(result.auditAction).toBe("HARVEST_SESSION_CREATED");
    expect(result.beforeSummary).toBeNull();
    expect(result.afterSummary).toMatchObject({
      status: "OPEN",
      workerId: "worker-anna-test",
      businessDate: "2026-07-17",
      rateGroszPerUnit: 1000
    });
    expect(result.duplicateMode).toBe("FIRST_SESSION");
    expect(result.reason).toBeNull();
    expect(result.calculationDescription).toContain("10,00");
    expect(result.calculationDescription).toContain("aktywnej wagi");
  });

  it("keeps the snapshot stable when source configuration objects change later", () => {
    const result = prepareOpenHarvestSession(defaultInput());

    if (result.status !== "CREATED") {
      throw new Error("Expected session draft.");
    }

    const renamedWorker: WorkerDocument = {
      ...seed.workers[0],
      displayName: "Anna Po Zmianie"
    };
    const renamedPlan: SettlementPlanDocument = {
      ...seed.settlementPlans[0],
      name: "Nowa nazwa planu"
    };
    const changedRate: WorkerRateVersionDocument = {
      ...seed.workerRateVersions[0],
      rateGroszPerUnit: 1200
    };

    expect(renamedWorker.displayName).not.toBe(result.session.workerNameSnapshot);
    expect(renamedPlan.name).not.toBe(result.session.planNameSnapshot);
    expect(changedRate.rateGroszPerUnit).not.toBe(result.session.rateGroszSnapshot);
  });

  it("selects the rate version effective on the business date", () => {
    const worker = seed.workers[0];
    const rates: WorkerRateVersionDocument[] = [
      {
        ...seed.workerRateVersions[0],
        id: "rate-worker-anna-test-2026-07-01",
        validFrom: "2026-07-01",
        validTo: "2026-07-31",
        active: false
      },
      {
        ...seed.workerRateVersions[0],
        id: "rate-worker-anna-test-2026-08-01",
        rateGroszPerUnit: 1200,
        validFrom: "2026-08-01",
        validTo: null,
        active: true
      }
    ];

    expect(findEffectiveWorkerRateVersion(worker, rates, "2026-07-17")).toMatchObject({
      id: "rate-worker-anna-test-2026-07-01",
      rateGroszPerUnit: 1000
    });
    expect(findEffectiveWorkerRateVersion(worker, rates, "2026-08-02")).toMatchObject({
      id: "rate-worker-anna-test-2026-08-01",
      rateGroszPerUnit: 1200
    });
  });

  it("uses quantity plan snapshots and calculation description for ubianka workers", () => {
    const result = prepareOpenHarvestSession(
      defaultInput({
        worker: seed.workers[1],
        id: "session-quantity"
      })
    );

    expect(result.status).toBe("CREATED");
    if (result.status !== "CREATED") {
      throw new Error("Expected session draft.");
    }

    expect(result.session).toMatchObject({
      workerId: "worker-bartek-test",
      planIdSnapshot: QUANTITY_UBIANKA_PLAN_ID,
      calculationBasisSnapshot: "QUANTITY",
      unitLabelSnapshot: "ubianka",
      unitLabelPluralSnapshot: "ubianki",
      rateGroszSnapshot: 1500,
      weightRequiredSnapshot: false,
      quantityPrecisionSnapshot: 1,
      allowBatchQuantitySnapshot: true
    });
    expect(describeHarvestSessionCalculation(result.session)).toContain(
      "aktywnej ilosci"
    );
  });

  it("returns existing OPEN sessions instead of creating another one by default", () => {
    const existingSessions: HarvestSessionLookup[] = [
      {
        id: "existing-open",
        workerId: "worker-anna-test",
        businessDate: "2026-07-17",
        status: "OPEN"
      }
    ];
    const result = prepareOpenHarvestSession(defaultInput({ existingSessions }));

    expect(result).toEqual({
      status: "CONTINUE_EXISTING",
      existingOpenSessions: existingSessions,
      canCreateSecondSession: false,
      message: "Istnieje juz otwarta sesja tej osoby z ta data biznesowa."
    });
  });

  it("allows admin to create a second same-day session with a reason", () => {
    const existingSessions: HarvestSessionLookup[] = [
      {
        id: "existing-open",
        workerId: "worker-anna-test",
        businessDate: "2026-07-17",
        status: "OPEN"
      }
    ];
    const result = prepareOpenHarvestSession(
      defaultInput({
        actorProfile: adminProfile,
        id: "second-session",
        existingSessions,
        secondSessionReason: "Drugi etap dnia."
      })
    );

    expect(result.status).toBe("CREATED");
    if (result.status !== "CREATED") {
      throw new Error("Expected session draft.");
    }

    expect(result.duplicateMode).toBe("SECOND_SESSION_CONFIRMED");
    expect(result.reason).toBe("Drugi etap dnia.");
    expect(result.existingOpenSessions).toEqual(existingSessions);
  });

  it("blocks operator from forcing a second same-day session", () => {
    expect(() =>
      prepareOpenHarvestSession(
        defaultInput({
          existingSessions: [
            {
              id: "existing-open",
              workerId: "worker-anna-test",
              businessDate: "2026-07-17",
              status: "OPEN"
            }
          ],
          secondSessionReason: "Drugi etap dnia."
        })
      )
    ).toThrow("Tylko administrator moze utworzyc druga sesje tej osoby i daty.");
  });

  it("finds only open sessions for the same worker and business date", () => {
    const sessions: HarvestSessionLookup[] = [
      {
        id: "match",
        workerId: "worker-anna-test",
        businessDate: "2026-07-17",
        status: "OPEN"
      },
      {
        id: "closed",
        workerId: "worker-anna-test",
        businessDate: "2026-07-17",
        status: "CLOSED"
      },
      {
        id: "other-date",
        workerId: "worker-anna-test",
        businessDate: "2026-07-18",
        status: "OPEN"
      }
    ];

    expect(
      findOpenHarvestSessionsForWorkerDate(sessions, "worker-anna-test", "2026-07-17")
    ).toEqual([sessions[0]]);
  });

  it("validates basic role, connectivity and required draft fields", () => {
    expect(() =>
      prepareOpenHarvestSession(defaultInput({ actorProfile: pickerProfile }))
    ).toThrow("Ta rola nie moze wykonac przejscia statusu sesji.");
    expect(() => prepareOpenHarvestSession(defaultInput({ isOnline: false }))).toThrow(
      "Przejscie statusu sesji wymaga aktywnego polaczenia."
    );
    expect(() => prepareOpenHarvestSession(defaultInput({ id: "   " }))).toThrow(
      "Sesja wymaga identyfikatora UUID."
    );
    expect(() =>
      prepareOpenHarvestSession(defaultInput({ createdDeviceId: "" }))
    ).toThrow("Sesja wymaga urzadzenia tworzacego.");
    expect(() =>
      prepareOpenHarvestSession(defaultInput({ createdAtDevice: null }))
    ).toThrow("Sesja wymaga czasu utworzenia na urzadzeniu.");
  });

  it("validates season and business date constraints", () => {
    expect(() =>
      prepareOpenHarvestSession(
        defaultInput({
          season: {
            ...seed.seasons[0],
            status: "CLOSED"
          } satisfies SeasonDocument
        })
      )
    ).toThrow("Sesje mozna otworzyc tylko w otwartym sezonie.");
    expect(() =>
      prepareOpenHarvestSession(defaultInput({ businessDate: "2026-10-01" }))
    ).toThrow("Data sesji musi miescic sie w zakresie sezonu.");
    expect(() =>
      prepareOpenHarvestSession(defaultInput({ businessDate: "2026-02-31" }))
    ).toThrow("Podaj prawidlowa date biznesowa.");
  });

  it("validates worker, plan and rate consistency", () => {
    expect(() =>
      prepareOpenHarvestSession(
        defaultInput({
          worker: {
            ...seed.workers[0],
            active: false
          }
        })
      )
    ).toThrow("Nie mozna otworzyc sesji dla archiwalnego zbieracza.");
    expect(() =>
      prepareOpenHarvestSession(
        defaultInput({
          plans: [{ ...seed.settlementPlans[0], active: false }]
        })
      )
    ).toThrow("Nie mozna otworzyc sesji na archiwalnym planie.");
    expect(() => prepareOpenHarvestSession(defaultInput({ rateVersions: [] }))).toThrow(
      "Brak stawki zbieracza obowiazujacej w dacie sesji."
    );
    expect(() =>
      prepareOpenHarvestSession(
        defaultInput({
          rateVersions: [
            {
              ...seed.workerRateVersions[0],
              rateGroszPerUnit: 0
            }
          ]
        })
      )
    ).toThrow("Stawka zbieracza musi byc wieksza od zera.");
    expect(() =>
      prepareOpenHarvestSession(
        defaultInput({
          rateVersions: [
            seed.workerRateVersions[0],
            {
              ...seed.workerRateVersions[0],
              id: "overlapping-rate",
              validFrom: "2026-07-10"
            }
          ]
        })
      )
    ).toThrow("Wykryto nakladajace sie stawki zbieracza dla daty sesji.");
  });

  it("checks rate version effective dates inclusively", () => {
    const rate = {
      ...seed.workerRateVersions[0],
      validFrom: "2026-07-01",
      validTo: "2026-07-31"
    };

    expect(isWorkerRateVersionEffectiveOn(rate, "2026-07-01")).toBe(true);
    expect(isWorkerRateVersionEffectiveOn(rate, "2026-07-31")).toBe(true);
    expect(isWorkerRateVersionEffectiveOn(rate, "2026-08-01")).toBe(false);
  });

  it("creates a UUID through an injectable generator", () => {
    expect(createHarvestSessionId(() => "session-uuid")).toBe("session-uuid");
    expect(() => createHarvestSessionId(() => " ")).toThrow(
      "Sesja wymaga identyfikatora UUID."
    );
  });
});
