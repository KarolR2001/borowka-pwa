import { parseDecimalToScaledInteger } from "../domain/format";

export const ORDINARY_SALE_NOTE_MAX_LENGTH = 200;

export type SaleFormStockContext = {
  availableWeightG: number;
  dataSource: "SERVER" | "CACHE";
  isFresh: boolean;
  pendingDocumentCount: number;
  refreshedAtIso: string;
  seasonId: string;
  seasonName: string;
};

export type OrdinarySaleFormDraft = {
  businessDate: string;
  note: string;
  pricePlnPerKg: string;
  seasonId: string;
  weightKg: string;
};

export type OrdinarySalePreview = {
  availableWeightG: number;
  businessDate: string;
  note: string | null;
  pendingDocumentCount: number;
  priceGroszPerKg: number;
  projectedAvailableWeightG: number;
  refreshedAtIso: string;
  revenuePreviewGrosz: number;
  seasonId: string;
  seasonName: string;
  stockDataSource: SaleFormStockContext["dataSource"];
  stockWasFresh: boolean;
  weightG: number;
};

export type PreparedOrdinarySale = OrdinarySalePreview & {
  correctionDirection: null;
  entryType: "SALE";
  status: "ACTIVE";
};

export function createInitialOrdinarySaleDraft({
  businessDate = currentBusinessDate(),
  stockContexts
}: {
  businessDate?: string;
  stockContexts: readonly SaleFormStockContext[];
}): OrdinarySaleFormDraft {
  return {
    businessDate,
    note: "",
    pricePlnPerKg: "",
    seasonId: stockContexts[0]?.seasonId ?? "",
    weightKg: ""
  };
}

export function createOrdinarySalePreview({
  draft,
  stockContexts
}: {
  draft: OrdinarySaleFormDraft;
  stockContexts: readonly SaleFormStockContext[];
}): OrdinarySalePreview {
  assertBusinessDate(draft.businessDate);
  const context = findStockContext(stockContexts, draft.seasonId);
  assertStockContext(context);

  const weightG = parseSaleWeight(draft.weightKg);
  const priceGroszPerKg = parseSalePrice(draft.pricePlnPerKg);
  const note = normalizeNote(draft.note);
  const projectedAvailableWeightG = safeSubtract(
    context.availableWeightG,
    weightG,
    "Przewidywany stan przekracza bezpieczny zakres liczbowy."
  );

  return {
    availableWeightG: context.availableWeightG,
    businessDate: draft.businessDate,
    note,
    pendingDocumentCount: context.pendingDocumentCount,
    priceGroszPerKg,
    projectedAvailableWeightG,
    refreshedAtIso: new Date(context.refreshedAtIso).toISOString(),
    revenuePreviewGrosz: calculateSaleRevenuePreviewGrosz(weightG, priceGroszPerKg),
    seasonId: context.seasonId,
    seasonName: context.seasonName,
    stockDataSource: context.dataSource,
    stockWasFresh: context.isFresh,
    weightG
  };
}

export function prepareOrdinarySale({
  draft,
  isOnline,
  stockContexts
}: {
  draft: OrdinarySaleFormDraft;
  isOnline: boolean;
  stockContexts: readonly SaleFormStockContext[];
}): PreparedOrdinarySale {
  if (!isOnline) {
    throw new Error("Sprzedaz wymaga polaczenia z internetem.");
  }

  return {
    ...createOrdinarySalePreview({ draft, stockContexts }),
    correctionDirection: null,
    entryType: "SALE",
    status: "ACTIVE"
  };
}

export function calculateSaleRevenuePreviewGrosz(
  weightG: number,
  priceGroszPerKg: number
): number {
  assertSafePositiveInteger(
    weightG,
    "Masa sprzedazy musi byc dodatnia liczba calkowita gramow."
  );
  assertSafeNonNegativeInteger(
    priceGroszPerKg,
    "Cena sprzedazy musi byc nieujemna liczba calkowita groszy za kilogram."
  );

  const rounded = (BigInt(weightG) * BigInt(priceGroszPerKg) + 500n) / 1000n;

  if (rounded > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new Error("Podglad przychodu przekracza bezpieczny zakres liczbowy.");
  }

  return Number(rounded);
}

function parseSaleWeight(value: string): number {
  let weightG: number;

  try {
    weightG = parseDecimalToScaledInteger(value, 3);
  } catch {
    throw new Error("Podaj mase w kilogramach z dokladnoscia do 3 miejsc.");
  }

  assertSafePositiveInteger(weightG, "Masa sprzedazy musi byc wieksza od zera.");
  return weightG;
}

function parseSalePrice(value: string): number {
  let priceGroszPerKg: number;

  try {
    priceGroszPerKg = parseDecimalToScaledInteger(value, 2);
  } catch {
    throw new Error("Podaj cene za kilogram z dokladnoscia do 2 miejsc.");
  }

  assertSafeNonNegativeInteger(
    priceGroszPerKg,
    "Cena zwyklej sprzedazy nie moze byc ujemna."
  );
  return priceGroszPerKg;
}

function normalizeNote(value: string): string | null {
  const normalized = value.trim();

  if (normalized.length > ORDINARY_SALE_NOTE_MAX_LENGTH) {
    throw new Error(
      `Notatka moze miec maksymalnie ${String(ORDINARY_SALE_NOTE_MAX_LENGTH)} znakow.`
    );
  }

  return normalized || null;
}

function findStockContext(
  contexts: readonly SaleFormStockContext[],
  seasonId: string
): SaleFormStockContext {
  const normalizedSeasonId = seasonId.trim();

  if (!normalizedSeasonId) {
    throw new Error("Wybierz sezon sprzedazy.");
  }

  const matches = contexts.filter((context) => context.seasonId === normalizedSeasonId);

  if (matches.length !== 1) {
    throw new Error(
      matches.length === 0
        ? "Brak stanu zrodlowego dla wybranego sezonu."
        : "Formularz zawiera zduplikowany kontekst sezonu."
    );
  }

  return matches[0];
}

function assertStockContext(context: SaleFormStockContext): void {
  if (!context.seasonId.trim() || !context.seasonName.trim()) {
    throw new Error("Kontekst stanu wymaga sezonu.");
  }

  if (!Number.isSafeInteger(context.availableWeightG)) {
    throw new Error("Dostepny stan ma nieprawidlowa wartosc.");
  }

  if (typeof context.isFresh !== "boolean") {
    throw new Error("Kontekst stanu wymaga informacji o swiezosci.");
  }

  assertSafeNonNegativeInteger(
    context.pendingDocumentCount,
    "Liczba oczekujacych dokumentow ma nieprawidlowa wartosc."
  );

  if (Number.isNaN(new Date(context.refreshedAtIso).getTime())) {
    throw new Error("Kontekst stanu ma nieprawidlowy czas odswiezenia.");
  }
}

function assertBusinessDate(value: string): void {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);

  if (!match) {
    throw new Error("Podaj prawidlowa date biznesowa sprzedazy.");
  }

  const [, year, month, day] = match;
  const date = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));

  if (
    date.getUTCFullYear() !== Number(year) ||
    date.getUTCMonth() !== Number(month) - 1 ||
    date.getUTCDate() !== Number(day)
  ) {
    throw new Error("Podaj prawidlowa date biznesowa sprzedazy.");
  }
}

function safeSubtract(left: number, right: number, message: string): number {
  const result = left - right;

  if (!Number.isSafeInteger(result)) {
    throw new Error(message);
  }

  return result;
}

function assertSafePositiveInteger(value: number, message: string): void {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error(message);
  }
}

function assertSafeNonNegativeInteger(value: number, message: string): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error(message);
  }
}

function currentBusinessDate(): string {
  return new Date().toISOString().slice(0, 10);
}
