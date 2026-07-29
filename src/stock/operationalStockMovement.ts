import type { HarvestSessionDocument } from "../harvest/openHarvestSession";
import type { SaleDocument } from "../sales/saleStockPreflight";
import type { Firestore } from "firebase/firestore";
import {
  evaluateHarvestSessionStockSource,
  evaluateSaleStockSource
} from "./stockSourceDefinition";

export const OPERATIONAL_STOCK_MOVEMENTS_COLLECTION = "operationalStockMovements";
export const OPERATIONAL_STOCK_SOURCE_TYPES = ["HARVEST_SESSION", "SALE"] as const;

export type OperationalStockSourceType = (typeof OPERATIONAL_STOCK_SOURCE_TYPES)[number];

export type OperationalStockMovementDocument = {
  id: string;
  seasonId: string;
  sourceId: string;
  sourceType: OperationalStockSourceType;
  updatedAt: unknown;
  updatedBy: string;
  weightImpactG: number;
};

export type OperationalStockCalculation = {
  availableWeightG: number;
  movementCount: number;
  seasonId: string;
};

export function createHarvestSessionStockMovement({
  actorUid,
  session,
  updatedAt
}: {
  actorUid: string;
  session: HarvestSessionDocument;
  updatedAt: unknown;
}): OperationalStockMovementDocument {
  const contribution = evaluateHarvestSessionStockSource(session);

  return createMovement({
    actorUid,
    seasonId: session.seasonId,
    sourceId: session.id,
    sourceType: "HARVEST_SESSION",
    updatedAt,
    weightImpactG: contribution.contributionG
  });
}

export function createSaleStockMovement({
  actorUid,
  sale,
  updatedAt
}: {
  actorUid: string;
  sale: SaleDocument;
  updatedAt: unknown;
}): OperationalStockMovementDocument {
  const contribution = evaluateSaleStockSource(sale);

  return createMovement({
    actorUid,
    seasonId: sale.seasonId,
    sourceId: sale.id,
    sourceType: "SALE",
    updatedAt,
    weightImpactG: contribution.contributionG
  });
}

export async function publishSaleStockMovement(
  firestore: Firestore,
  sale: SaleDocument,
  actorUid: string
): Promise<OperationalStockMovementDocument> {
  const { doc, getDocFromServer, serverTimestamp, setDoc } =
    await import("firebase/firestore");
  const movement = createSaleStockMovement({
    actorUid,
    sale,
    updatedAt: serverTimestamp()
  });
  const movementRef = doc(firestore, OPERATIONAL_STOCK_MOVEMENTS_COLLECTION, movement.id);

  await setDoc(movementRef, movement);
  const snapshot = await getDocFromServer(movementRef);
  const confirmed = snapshot.exists()
    ? decodeOperationalStockMovement(snapshot.id, snapshot.data())
    : null;

  if (
    confirmed?.seasonId !== sale.seasonId ||
    confirmed.sourceId !== sale.id ||
    confirmed.sourceType !== "SALE" ||
    confirmed.updatedBy !== actorUid ||
    confirmed.weightImpactG !== movement.weightImpactG
  ) {
    throw new Error("Serwer nie potwierdzil operacyjnego ruchu stanu sprzedazy.");
  }

  return confirmed;
}

export async function publishHarvestSessionStockMovement(
  firestore: Firestore,
  session: HarvestSessionDocument,
  actorUid: string
): Promise<OperationalStockMovementDocument> {
  const { doc, getDocFromServer, serverTimestamp, setDoc } =
    await import("firebase/firestore");
  const movement = createHarvestSessionStockMovement({
    actorUid,
    session,
    updatedAt: serverTimestamp()
  });
  const movementRef = doc(firestore, OPERATIONAL_STOCK_MOVEMENTS_COLLECTION, movement.id);

  await setDoc(movementRef, movement);
  const snapshot = await getDocFromServer(movementRef);
  const confirmed = snapshot.exists()
    ? decodeOperationalStockMovement(snapshot.id, snapshot.data())
    : null;

  if (
    confirmed?.seasonId !== session.seasonId ||
    confirmed.sourceId !== session.id ||
    confirmed.sourceType !== "HARVEST_SESSION" ||
    confirmed.updatedBy !== actorUid ||
    confirmed.weightImpactG !== movement.weightImpactG
  ) {
    throw new Error("Serwer nie potwierdzil operacyjnego ruchu stanu zbioru.");
  }

  return confirmed;
}

export function operationalStockMovementId(
  sourceType: OperationalStockSourceType,
  sourceId: string
): string {
  const normalizedSourceId = normalizeRequiredText(
    sourceId,
    "Ruch stanu wymaga identyfikatora zrodla."
  );
  const prefix = sourceType === "HARVEST_SESSION" ? "harvest-session" : "sale";
  return `${prefix}-${normalizedSourceId}`;
}

export function decodeOperationalStockMovement(
  expectedId: string,
  data: unknown
): OperationalStockMovementDocument | null {
  if (!isRecord(data)) {
    return null;
  }

  const id = readRequiredString(data.id);
  const seasonId = readRequiredString(data.seasonId);
  const sourceId = readRequiredString(data.sourceId);
  const sourceType = data.sourceType;
  const updatedBy = readRequiredString(data.updatedBy);
  const weightImpactG = data.weightImpactG;

  if (
    !id ||
    id !== expectedId ||
    !seasonId ||
    !sourceId ||
    !isOperationalStockSourceType(sourceType) ||
    id !== operationalStockMovementId(sourceType, sourceId) ||
    data.updatedAt == null ||
    !updatedBy ||
    typeof weightImpactG !== "number" ||
    !Number.isSafeInteger(weightImpactG)
  ) {
    return null;
  }

  return {
    id,
    seasonId,
    sourceId,
    sourceType,
    updatedAt: data.updatedAt,
    updatedBy,
    weightImpactG
  };
}

export function calculateOperationalStock(
  movements: readonly OperationalStockMovementDocument[],
  seasonId: string
): OperationalStockCalculation {
  const normalizedSeasonId = normalizeRequiredText(
    seasonId,
    "Stan operacyjny wymaga identyfikatora sezonu."
  );
  const selectedMovements = movements.filter(
    (movement) => movement.seasonId === normalizedSeasonId
  );
  const ids = new Set<string>();
  let availableWeightG = 0;

  for (const movement of selectedMovements) {
    if (ids.has(movement.id)) {
      throw new Error("Stan operacyjny zawiera zduplikowany ruch.");
    }

    ids.add(movement.id);
    availableWeightG = safeAdd(availableWeightG, movement.weightImpactG);
  }

  return {
    availableWeightG,
    movementCount: selectedMovements.length,
    seasonId: normalizedSeasonId
  };
}

function createMovement({
  actorUid,
  seasonId,
  sourceId,
  sourceType,
  updatedAt,
  weightImpactG
}: {
  actorUid: string;
  seasonId: string;
  sourceId: string;
  sourceType: OperationalStockSourceType;
  updatedAt: unknown;
  weightImpactG: number;
}): OperationalStockMovementDocument {
  const normalizedActorUid = normalizeRequiredText(actorUid, "Ruch stanu wymaga autora.");
  const normalizedSeasonId = normalizeRequiredText(seasonId, "Ruch stanu wymaga sezonu.");

  if (updatedAt == null || !Number.isSafeInteger(weightImpactG)) {
    throw new Error("Ruch stanu ma nieprawidlowe dane.");
  }

  return {
    id: operationalStockMovementId(sourceType, sourceId),
    seasonId: normalizedSeasonId,
    sourceId: sourceId.trim(),
    sourceType,
    updatedAt,
    updatedBy: normalizedActorUid,
    weightImpactG
  };
}

function isOperationalStockSourceType(
  value: unknown
): value is OperationalStockSourceType {
  return OPERATIONAL_STOCK_SOURCE_TYPES.some((sourceType) => sourceType === value);
}

function normalizeRequiredText(value: string, message: string): string {
  const normalized = value.trim();

  if (!normalized) {
    throw new Error(message);
  }

  return normalized;
}

function readRequiredString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function safeAdd(left: number, right: number): number {
  const result = left + right;

  if (!Number.isSafeInteger(result)) {
    throw new Error("Stan operacyjny przekracza bezpieczny zakres.");
  }

  return result;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
