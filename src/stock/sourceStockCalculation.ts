import {
  evaluateHarvestSessionStockSource,
  evaluateSaleStockSource,
  type HarvestSessionStockSource,
  type SaleStockSource
} from "./stockSourceDefinition";

export type SourceStockHarvestSession = HarvestSessionStockSource & {
  id: string;
  seasonId: string;
};

export type SourceStockSale = SaleStockSource & {
  id: string;
  seasonId: string;
};

export type SourceStockCalculationResult = {
  activeSaleWeightG: number;
  availableWeightG: number;
  confirmedHarvestWeightG: number;
  correctionDecreaseWeightG: number;
  correctionIncreaseWeightG: number;
  seasonId: string;
  soldWeightG: number;
  sourceCounts: {
    activeCorrectionDocuments: number;
    activeSaleDocuments: number;
    cancelledSaleDocuments: number;
    harvestSessionDocuments: number;
    includedHarvestSessionDocuments: number;
    saleDocuments: number;
  };
};

export function calculateSourceStockForSeason({
  harvestSessions,
  sales,
  seasonId
}: {
  harvestSessions: readonly SourceStockHarvestSession[];
  sales: readonly SourceStockSale[];
  seasonId: string;
}): SourceStockCalculationResult {
  const selectedSeasonId = normalizeRequiredId(
    seasonId,
    "Kalkulacja stanu wymaga identyfikatora sezonu."
  );
  const selectedSessions = harvestSessions.filter(
    (session) => session.seasonId === selectedSeasonId
  );
  const selectedSales = sales.filter((sale) => sale.seasonId === selectedSeasonId);
  assertUniqueDocumentIds(selectedSessions, "sesji zbioru");
  assertUniqueDocumentIds(selectedSales, "sprzedazy");

  let confirmedHarvestWeightG = 0;
  let includedHarvestSessionDocuments = 0;

  for (const session of selectedSessions) {
    const contribution = evaluateHarvestSessionStockSource(session);

    if (contribution.reason !== "CONFIRMED_HARVEST") {
      continue;
    }

    confirmedHarvestWeightG = safeAdd(
      confirmedHarvestWeightG,
      contribution.contributionG
    );
    includedHarvestSessionDocuments += 1;
  }

  let activeSaleWeightG = 0;
  let correctionIncreaseWeightG = 0;
  let correctionDecreaseWeightG = 0;
  let activeSaleDocuments = 0;
  let activeCorrectionDocuments = 0;
  let cancelledSaleDocuments = 0;

  for (const sale of selectedSales) {
    const contribution = evaluateSaleStockSource(sale);

    if (contribution.reason === "SALE_CANCELLED") {
      cancelledSaleDocuments += 1;
      continue;
    }

    if (contribution.reason === "ACTIVE_SALE") {
      activeSaleWeightG = safeAdd(activeSaleWeightG, sale.weightG);
      activeSaleDocuments += 1;
      continue;
    }

    activeCorrectionDocuments += 1;
    if (contribution.impact === "INCREASE") {
      correctionIncreaseWeightG = safeAdd(correctionIncreaseWeightG, sale.weightG);
    } else {
      correctionDecreaseWeightG = safeAdd(correctionDecreaseWeightG, sale.weightG);
    }
  }

  const soldWeightG = safeAdd(
    safeAdd(activeSaleWeightG, correctionDecreaseWeightG),
    -correctionIncreaseWeightG
  );
  const availableWeightG = safeAdd(confirmedHarvestWeightG, -soldWeightG);

  return {
    activeSaleWeightG,
    availableWeightG,
    confirmedHarvestWeightG,
    correctionDecreaseWeightG,
    correctionIncreaseWeightG,
    seasonId: selectedSeasonId,
    soldWeightG,
    sourceCounts: {
      activeCorrectionDocuments,
      activeSaleDocuments,
      cancelledSaleDocuments,
      harvestSessionDocuments: selectedSessions.length,
      includedHarvestSessionDocuments,
      saleDocuments: selectedSales.length
    }
  };
}

function assertUniqueDocumentIds(
  documents: readonly { id: string }[],
  sourceLabel: string
): void {
  const ids = new Set<string>();

  for (const document of documents) {
    const id = normalizeRequiredId(
      document.id,
      `Dokument ${sourceLabel} wymaga identyfikatora.`
    );

    if (ids.has(id)) {
      throw new Error(`Kalkulacja stanu zawiera zduplikowany dokument ${sourceLabel}.`);
    }

    ids.add(id);
  }
}

function normalizeRequiredId(value: string, message: string): string {
  const normalized = value.trim();

  if (!normalized) {
    throw new Error(message);
  }

  return normalized;
}

function safeAdd(left: number, right: number): number {
  if (!Number.isSafeInteger(left) || !Number.isSafeInteger(right)) {
    throw new Error("Kalkulacja stanu zawiera nieprawidlowa wartosc liczbowa.");
  }

  const result = left + right;

  if (!Number.isSafeInteger(result)) {
    throw new Error("Kalkulacja stanu przekracza bezpieczny zakres liczbowy.");
  }

  return result;
}
