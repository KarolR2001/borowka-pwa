import {
  createInitialDomainSeed,
  type WorkerDocument
} from "../domain/domainConfiguration";
import type { UserProfile } from "../domain/identity";
import {
  prepareOpenHarvestSession,
  type HarvestSessionDocument
} from "./openHarvestSession";
import {
  calculateHarvestEntryPreviewGrosz,
  calculateHarvestSessionEstimatedAmountGrosz,
  isQuantityAllowedByPrecision,
  validateHarvestEntryDraft,
  type HarvestEntryDraft
} from "./harvestEntryValidation";

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

function createSession(
  worker: WorkerDocument = seed.workers[0],
  overrides: Partial<HarvestSessionDocument> = {}
): HarvestSessionDocument {
  const result = prepareOpenHarvestSession({
    actorProfile: operatorProfile,
    id: `session-${worker.id}`,
    season: seed.seasons[0],
    worker,
    plans: seed.settlementPlans,
    rateVersions: seed.workerRateVersions,
    businessDate: "2026-07-17",
    existingSessions: [],
    isOnline: true,
    createdDeviceId: "device-1",
    createdAtDevice: createdAt
  });

  if (result.status !== "CREATED") {
    throw new Error("Expected created session.");
  }

  return {
    ...result.session,
    ...overrides
  };
}

function draftFor(
  session: HarvestSessionDocument,
  overrides: Partial<HarvestEntryDraft> = {}
): HarvestEntryDraft {
  return {
    sessionId: session.id,
    seasonId: session.seasonId,
    workerId: session.workerId,
    businessDate: session.businessDate,
    createdBy: operatorProfile.uid,
    quantityMilli: 1000,
    weightG: 1000,
    ...overrides
  };
}

describe("harvest entry validation", () => {
  it("validates a weight entry offline without blocking future local save", () => {
    const session = createSession();
    const result = validateHarvestEntryDraft({
      actorProfile: operatorProfile,
      session,
      draft: draftFor(session, {
        quantityMilli: 3495,
        weightG: 3495
      }),
      isOnline: false
    });

    expect(result).toMatchObject({
      quantityMilli: 3495,
      weightG: 3495,
      amountPreviewGrosz: 3495,
      stockWeightG: 3495,
      connectivityMode: "OFFLINE_ALLOWED",
      nextSessionTotals: {
        totalEntryCount: 1,
        totalQuantityMilli: 3495,
        totalWeightG: 3495,
        estimatedAmountGrosz: 3495
      }
    });
  });

  it("validates a quantity entry without optional weight", () => {
    const session = createSession(seed.workers[1]);
    const result = validateHarvestEntryDraft({
      actorProfile: operatorProfile,
      session,
      draft: draftFor(session, {
        quantityMilli: 2000,
        weightG: null
      }),
      isOnline: true
    });

    expect(result).toMatchObject({
      quantityMilli: 2000,
      weightG: null,
      amountPreviewGrosz: 3000,
      stockWeightG: null,
      connectivityMode: "ONLINE",
      nextSessionTotals: {
        totalEntryCount: 1,
        totalQuantityMilli: 2000,
        totalWeightG: 0,
        estimatedAmountGrosz: 3000
      }
    });
  });

  it("uses session-level totals for estimated amount instead of summing previews", () => {
    const session = createSession(seed.workers[0], {
      totalEntryCount: 1,
      totalQuantityMilli: 333,
      totalWeightG: 333,
      rateGroszSnapshot: 1001
    });
    const result = validateHarvestEntryDraft({
      actorProfile: operatorProfile,
      session,
      draft: draftFor(session, {
        quantityMilli: 333,
        weightG: 333
      }),
      isOnline: true
    });

    expect(result.amountPreviewGrosz).toBe(333);
    expect(result.nextSessionTotals.estimatedAmountGrosz).toBe(667);
  });

  it("blocks empty, negative, missing weight and precision-invalid values", () => {
    const weightSession = createSession();
    const quantitySession = createSession(seed.workers[1]);

    expect(() =>
      validateHarvestEntryDraft({
        actorProfile: operatorProfile,
        session: weightSession,
        draft: draftFor(weightSession, { quantityMilli: 0, weightG: 0 }),
        isOnline: true
      })
    ).toThrow("Ilosc wpisu musi byc wieksza od zera.");
    expect(() =>
      validateHarvestEntryDraft({
        actorProfile: operatorProfile,
        session: weightSession,
        draft: draftFor(weightSession, { quantityMilli: 1000, weightG: null }),
        isOnline: true
      })
    ).toThrow("Waga wpisu musi byc wieksza od zera.");
    expect(() =>
      validateHarvestEntryDraft({
        actorProfile: operatorProfile,
        session: quantitySession,
        draft: draftFor(quantitySession, { quantityMilli: 1250, weightG: null }),
        isOnline: true
      })
    ).toThrow("Ilosc wpisu nie miesci sie w precyzji planu.");
    expect(() =>
      validateHarvestEntryDraft({
        actorProfile: operatorProfile,
        session: quantitySession,
        draft: draftFor(quantitySession, { quantityMilli: 1000, weightG: -1 }),
        isOnline: true
      })
    ).toThrow("Waga wpisu musi byc wieksza od zera.");
  });

  it("blocks missing, closed and mismatched sessions", () => {
    const session = createSession();

    expect(() =>
      validateHarvestEntryDraft({
        actorProfile: operatorProfile,
        session: null,
        draft: draftFor(session),
        isOnline: false
      })
    ).toThrow("Wpis wymaga otwartej sesji.");
    expect(() =>
      validateHarvestEntryDraft({
        actorProfile: operatorProfile,
        session: { ...session, status: "CLOSED" },
        draft: draftFor(session),
        isOnline: true
      })
    ).toThrow("Wpis mozna dodac tylko do otwartej sesji.");
    expect(() =>
      validateHarvestEntryDraft({
        actorProfile: operatorProfile,
        session,
        draft: draftFor(session, { workerId: "worker-other" }),
        isOnline: true
      })
    ).toThrow("Wpis nalezy do innego zbieracza niz sesja.");
    expect(() =>
      validateHarvestEntryDraft({
        actorProfile: operatorProfile,
        session,
        draft: draftFor(session, { businessDate: "2026-07-18" }),
        isOnline: true
      })
    ).toThrow("Data wpisu musi byc zgodna z data sesji.");
  });

  it("blocks picker role and author mismatch", () => {
    const session = createSession();

    expect(() =>
      validateHarvestEntryDraft({
        actorProfile: pickerProfile,
        session,
        draft: draftFor(session, { createdBy: pickerProfile.uid }),
        isOnline: true
      })
    ).toThrow("Ta rola nie moze dodawac wpisow zbioru.");
    expect(() =>
      validateHarvestEntryDraft({
        actorProfile: operatorProfile,
        session,
        draft: draftFor(session, { createdBy: adminProfile.uid }),
        isOnline: true
      })
    ).toThrow("Wpis musi miec tego samego autora co zalogowany uzytkownik.");
    expect(() =>
      validateHarvestEntryDraft({
        actorProfile: adminProfile,
        session,
        draft: draftFor(session, { createdBy: adminProfile.uid }),
        isOnline: true
      })
    ).not.toThrow();
  });

  it("blocks unsafe numeric ranges before totals or amount can overflow", () => {
    const session = createSession();

    expect(() =>
      validateHarvestEntryDraft({
        actorProfile: operatorProfile,
        session,
        draft: draftFor(session, {
          quantityMilli: Number.MAX_SAFE_INTEGER + 1,
          weightG: Number.MAX_SAFE_INTEGER + 1
        }),
        isOnline: true
      })
    ).toThrow("Ilosc wpisu musi byc wieksza od zera.");
    expect(() =>
      validateHarvestEntryDraft({
        actorProfile: operatorProfile,
        session: {
          ...session,
          totalQuantityMilli: Number.MAX_SAFE_INTEGER
        },
        draft: draftFor(session, { quantityMilli: 1, weightG: 1 }),
        isOnline: true
      })
    ).toThrow("Suma ilosci sesji przekracza bezpieczny zakres.");
    expect(() =>
      calculateHarvestEntryPreviewGrosz(
        {
          calculationBasisSnapshot: "QUANTITY",
          rateGroszSnapshot: Number.MAX_SAFE_INTEGER
        },
        { quantityMilli: Number.MAX_SAFE_INTEGER, weightG: null }
      )
    ).toThrow("Kwota wpisu przekracza bezpieczny zakres.");
  });

  it("exposes precision and amount helpers for form-level validation", () => {
    expect(isQuantityAllowedByPrecision(1500, 1)).toBe(true);
    expect(isQuantityAllowedByPrecision(1250, 1)).toBe(false);
    expect(
      calculateHarvestEntryPreviewGrosz(
        { calculationBasisSnapshot: "QUANTITY", rateGroszSnapshot: 333 },
        { quantityMilli: 1500, weightG: null }
      )
    ).toBe(500);
    expect(
      calculateHarvestSessionEstimatedAmountGrosz(
        { calculationBasisSnapshot: "WEIGHT", rateGroszSnapshot: 1200 },
        { totalQuantityMilli: 0, totalWeightG: 2500 }
      )
    ).toBe(3000);
  });
});
