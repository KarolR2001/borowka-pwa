import type { UserProfile } from "../domain/identity";
import type { HarvestSessionDocument } from "./openHarvestSession";

export type HarvestEntryDraft = {
  sessionId: string;
  seasonId: string;
  workerId: string;
  businessDate: string;
  createdBy: string;
  quantityMilli: number;
  weightG: number | null;
};

export type HarvestEntryConnectivityMode = "ONLINE" | "OFFLINE_ALLOWED";

export type HarvestEntryNextSessionTotals = {
  totalEntryCount: number;
  totalQuantityMilli: number;
  totalWeightG: number;
  estimatedAmountGrosz: number;
};

export type ValidatedHarvestEntryDraft = HarvestEntryDraft & {
  amountPreviewGrosz: number;
  stockWeightG: number | null;
  connectivityMode: HarvestEntryConnectivityMode;
  nextSessionTotals: HarvestEntryNextSessionTotals;
};

export type ValidateHarvestEntryDraftInput = {
  actorProfile: UserProfile;
  session: HarvestSessionDocument | null;
  draft: HarvestEntryDraft;
  isOnline: boolean;
};

export function validateHarvestEntryDraft(
  input: ValidateHarvestEntryDraftInput
): ValidatedHarvestEntryDraft {
  const session = input.session;

  if (!session) {
    throw new Error("Wpis wymaga otwartej sesji.");
  }

  assertEntryAuthorRole(input.actorProfile);

  if (session.status !== "OPEN") {
    throw new Error("Wpis mozna dodac tylko do otwartej sesji.");
  }

  const draft = normalizeDraft(input.draft);

  assertDraftMatchesSession(draft, session);

  if (draft.createdBy !== input.actorProfile.uid) {
    throw new Error("Wpis musi miec tego samego autora co zalogowany uzytkownik.");
  }

  assertSafePositiveInteger(draft.quantityMilli, "Ilosc wpisu musi byc wieksza od zera.");
  assertQuantityPrecision(draft.quantityMilli, session.quantityPrecisionSnapshot);

  const weightG = validateWeight(draft.weightG, session);

  if (session.calculationBasisSnapshot === "WEIGHT" && draft.quantityMilli !== weightG) {
    throw new Error("Plan wagowy wymaga zgodnosci ilosci i wagi wpisu.");
  }

  const amountPreviewGrosz = calculateHarvestEntryPreviewGrosz(session, {
    quantityMilli: draft.quantityMilli,
    weightG
  });
  const totalEntryCount = addSafeIntegers(
    session.totalEntryCount,
    1,
    "Liczba wpisow sesji przekracza bezpieczny zakres."
  );
  const totalQuantityMilli = addSafeIntegers(
    session.totalQuantityMilli,
    draft.quantityMilli,
    "Suma ilosci sesji przekracza bezpieczny zakres."
  );
  const totalWeightG =
    weightG === null
      ? assertSafeNonNegativeInteger(
          session.totalWeightG,
          "Suma wagi sesji ma nieprawidlowy zakres."
        )
      : addSafeIntegers(
          session.totalWeightG,
          weightG,
          "Suma wagi sesji przekracza bezpieczny zakres."
        );

  return {
    ...draft,
    weightG,
    amountPreviewGrosz,
    stockWeightG: weightG,
    connectivityMode: input.isOnline ? "ONLINE" : "OFFLINE_ALLOWED",
    nextSessionTotals: {
      totalEntryCount,
      totalQuantityMilli,
      totalWeightG,
      estimatedAmountGrosz: calculateHarvestSessionEstimatedAmountGrosz(session, {
        totalQuantityMilli,
        totalWeightG
      })
    }
  };
}

export function calculateHarvestEntryPreviewGrosz(
  session: Pick<HarvestSessionDocument, "calculationBasisSnapshot" | "rateGroszSnapshot">,
  draft: Pick<HarvestEntryDraft, "quantityMilli" | "weightG">
): number {
  const rateGrosz = assertSafePositiveInteger(
    session.rateGroszSnapshot,
    "Stawka sesji musi byc wieksza od zera."
  );
  const basisMilli =
    session.calculationBasisSnapshot === "WEIGHT"
      ? assertSafePositiveInteger(draft.weightG, "Waga wpisu musi byc wieksza od zera.")
      : assertSafePositiveInteger(
          draft.quantityMilli,
          "Ilosc wpisu musi byc wieksza od zera."
        );

  return calculateRoundedGroszFromMilli(basisMilli, rateGrosz);
}

export function calculateHarvestSessionEstimatedAmountGrosz(
  session: Pick<HarvestSessionDocument, "calculationBasisSnapshot" | "rateGroszSnapshot">,
  totals: Pick<HarvestEntryNextSessionTotals, "totalQuantityMilli" | "totalWeightG">
): number {
  const rateGrosz = assertSafePositiveInteger(
    session.rateGroszSnapshot,
    "Stawka sesji musi byc wieksza od zera."
  );
  const basisMilli =
    session.calculationBasisSnapshot === "WEIGHT"
      ? assertSafeNonNegativeInteger(
          totals.totalWeightG,
          "Suma wagi sesji ma nieprawidlowy zakres."
        )
      : assertSafeNonNegativeInteger(
          totals.totalQuantityMilli,
          "Suma ilosci sesji ma nieprawidlowy zakres."
        );

  return calculateRoundedGroszFromMilli(basisMilli, rateGrosz);
}

export function isQuantityAllowedByPrecision(
  quantityMilli: number,
  quantityPrecision: number
): boolean {
  if (!Number.isSafeInteger(quantityMilli) || quantityMilli <= 0) {
    return false;
  }

  const precision = normalizeQuantityPrecision(quantityPrecision);
  const step = 10 ** (3 - precision);

  return quantityMilli % step === 0;
}

function assertEntryAuthorRole(actorProfile: UserProfile): void {
  if (actorProfile.role !== "ADMIN" && actorProfile.role !== "OPERATOR") {
    throw new Error("Ta rola nie moze dodawac wpisow zbioru.");
  }
}

function normalizeDraft(draft: HarvestEntryDraft): HarvestEntryDraft {
  return {
    sessionId: normalizeRequiredText(
      draft.sessionId,
      "Wpis wymaga identyfikatora sesji."
    ),
    seasonId: normalizeRequiredText(draft.seasonId, "Wpis wymaga sezonu."),
    workerId: normalizeRequiredText(draft.workerId, "Wpis wymaga zbieracza."),
    businessDate: normalizeBusinessDate(draft.businessDate),
    createdBy: normalizeRequiredText(draft.createdBy, "Wpis wymaga autora."),
    quantityMilli: draft.quantityMilli,
    weightG: draft.weightG
  };
}

function assertDraftMatchesSession(
  draft: HarvestEntryDraft,
  session: HarvestSessionDocument
): void {
  if (draft.sessionId !== session.id) {
    throw new Error("Wpis nalezy do innej sesji.");
  }

  if (draft.seasonId !== session.seasonId) {
    throw new Error("Wpis nalezy do innego sezonu niz sesja.");
  }

  if (draft.workerId !== session.workerId) {
    throw new Error("Wpis nalezy do innego zbieracza niz sesja.");
  }

  if (draft.businessDate !== session.businessDate) {
    throw new Error("Data wpisu musi byc zgodna z data sesji.");
  }
}

function validateWeight(
  weightG: number | null,
  session: Pick<
    HarvestSessionDocument,
    "calculationBasisSnapshot" | "weightRequiredSnapshot"
  >
): number | null {
  const weightRequired =
    session.weightRequiredSnapshot || session.calculationBasisSnapshot === "WEIGHT";

  if (weightG === null) {
    if (weightRequired) {
      throw new Error("Waga wpisu musi byc wieksza od zera.");
    }

    return null;
  }

  return assertSafePositiveInteger(weightG, "Waga wpisu musi byc wieksza od zera.");
}

function assertQuantityPrecision(quantityMilli: number, quantityPrecision: number): void {
  if (!isQuantityAllowedByPrecision(quantityMilli, quantityPrecision)) {
    throw new Error("Ilosc wpisu nie miesci sie w precyzji planu.");
  }
}

function addSafeIntegers(left: number, right: number, message: string): number {
  assertSafeNonNegativeInteger(left, message);
  assertSafePositiveInteger(right, message);

  const value = left + right;

  if (!Number.isSafeInteger(value)) {
    throw new Error(message);
  }

  return value;
}

function calculateRoundedGroszFromMilli(basisMilli: number, rateGrosz: number): number {
  assertSafeNonNegativeInteger(
    basisMilli,
    "Podstawa obliczenia ma nieprawidlowy zakres."
  );
  assertSafePositiveInteger(rateGrosz, "Stawka sesji musi byc wieksza od zera.");

  const numerator = BigInt(basisMilli) * BigInt(rateGrosz);
  const quotient = numerator / 1000n;
  const remainder = numerator % 1000n;
  const rounded = quotient + (remainder >= 500n ? 1n : 0n);
  const value = Number(rounded);

  if (!Number.isSafeInteger(value)) {
    throw new Error("Kwota wpisu przekracza bezpieczny zakres.");
  }

  return value;
}

function assertSafePositiveInteger(value: number | null, message: string): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value)) {
    throw new Error(message);
  }

  if (value <= 0) {
    throw new Error(message);
  }

  return value;
}

function assertSafeNonNegativeInteger(value: number, message: string): number {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error(message);
  }

  return value;
}

function normalizeQuantityPrecision(quantityPrecision: number): number {
  if (
    !Number.isInteger(quantityPrecision) ||
    quantityPrecision < 0 ||
    quantityPrecision > 3
  ) {
    throw new Error("Precyzja planu musi byc liczba od 0 do 3.");
  }

  return quantityPrecision;
}

function normalizeRequiredText(value: string, message: string): string {
  const trimmed = value.trim();

  if (!trimmed) {
    throw new Error(message);
  }

  return trimmed;
}

function normalizeBusinessDate(value: string): string {
  const trimmed = normalizeRequiredText(value, "Podaj prawidlowa date wpisu.");
  const match = /^\d{4}-\d{2}-\d{2}$/.exec(trimmed);
  const parsed = Date.parse(`${trimmed}T00:00:00.000Z`);

  if (!match || Number.isNaN(parsed)) {
    throw new Error("Podaj prawidlowa date wpisu.");
  }

  if (new Date(parsed).toISOString().slice(0, 10) !== trimmed) {
    throw new Error("Podaj prawidlowa date wpisu.");
  }

  return trimmed;
}
