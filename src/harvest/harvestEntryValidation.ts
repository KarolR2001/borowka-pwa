import type { UserProfile } from "../domain/identity";
import {
  normalizeHarvestEntryId,
  normalizeSequenceNumber
} from "./harvestEntryIdempotency";
import {
  appendActiveHarvestEntryToSessionTotals,
  calculateEntryAmountPreviewGrosz,
  calculateHarvestSessionAmountDueGrosz
} from "./harvestSessionCalculation";
import type { HarvestSessionDocument } from "./openHarvestSession";

export type HarvestEntryDraft = {
  id: string;
  sequenceNumber: number;
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
  const nextTotals = appendActiveHarvestEntryToSessionTotals({
    session,
    currentTotals: {
      activeEntryCount: session.totalEntryCount,
      totalQuantityMilli: session.totalQuantityMilli,
      totalWeightG: session.totalWeightG
    },
    entry: {
      id: draft.id,
      status: "ACTIVE",
      quantityMilli: draft.quantityMilli,
      weightG
    }
  });

  return {
    ...draft,
    weightG,
    amountPreviewGrosz,
    stockWeightG: weightG,
    connectivityMode: input.isOnline ? "ONLINE" : "OFFLINE_ALLOWED",
    nextSessionTotals: {
      totalEntryCount: nextTotals.activeEntryCount,
      totalQuantityMilli: nextTotals.totalQuantityMilli,
      totalWeightG: nextTotals.totalWeightG,
      estimatedAmountGrosz: nextTotals.amountDueGrosz
    }
  };
}

export function calculateHarvestEntryPreviewGrosz(
  session: Pick<HarvestSessionDocument, "calculationBasisSnapshot" | "rateGroszSnapshot">,
  draft: Pick<HarvestEntryDraft, "quantityMilli" | "weightG">
): number {
  return calculateEntryAmountPreviewGrosz(session, draft);
}

export function calculateHarvestSessionEstimatedAmountGrosz(
  session: Pick<HarvestSessionDocument, "calculationBasisSnapshot" | "rateGroszSnapshot">,
  totals: Pick<HarvestEntryNextSessionTotals, "totalQuantityMilli" | "totalWeightG">
): number {
  return calculateHarvestSessionAmountDueGrosz(session, totals);
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
    id: normalizeHarvestEntryId(draft.id),
    sequenceNumber: normalizeSequenceNumber(draft.sequenceNumber),
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

function assertSafePositiveInteger(value: number | null, message: string): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value)) {
    throw new Error(message);
  }

  if (value <= 0) {
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
