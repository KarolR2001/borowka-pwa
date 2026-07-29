import {
  AUDIT_EVENTS_COLLECTION,
  createAuditEventDraft,
  type AuditEventDocument
} from "../audit/auditEvents";
import { getFirebaseServices } from "../config/firebaseServices";
import { SEASONS_COLLECTION, type SeasonDocument } from "../domain/domainConfiguration";
import type { UserProfile } from "../domain/identity";
import { decodeHarvestSession } from "../harvest/harvestSessionDashboard";
import { HARVEST_SESSIONS_COLLECTION } from "../harvest/harvestSessionState";
import { decodeSeason } from "../seasons/seasons";
import { publishSaleStockMovement } from "../stock/operationalStockMovement";
import {
  calculateSourceStockForSeason,
  type SourceStockCalculationResult,
  type SourceStockHarvestSession,
  type SourceStockSale
} from "../stock/sourceStockCalculation";
import {
  SALE_ENTRY_TYPES,
  SALE_STATUSES,
  STOCK_CORRECTION_DIRECTIONS,
  type SaleEntryType,
  type SaleStatus,
  type StockCorrectionDirection
} from "../stock/stockSourceDefinition";
import {
  type PreparedOrdinarySale,
  type SaleFormStockContext
} from "./ordinarySalePreparation";
import {
  SALE_REVENUE_CALCULATION_VERSION,
  calculateSaleRevenue
} from "./saleRevenueCalculation";
import type { Firestore } from "firebase/firestore";

type FirebaseEnv = Record<string, string | boolean | undefined>;

export const SALES_COLLECTION = "sales";

export type SaleDocument = {
  businessDate: string;
  calculationVersion: string;
  cancellationReason: string | null;
  cancelledAt: unknown;
  cancelledBy: string | null;
  correctionDirection: StockCorrectionDirection | null;
  createdAtServer: unknown;
  createdBy: string;
  creationAttemptId: string;
  entryType: SaleEntryType;
  id: string;
  legacyImport: boolean;
  legacySourceRow: string | null;
  note: string | null;
  priceGroszPerKg: number;
  seasonId: string;
  status: SaleStatus;
  totalGrosz: number;
  weightG: number;
};

export type FreshSaleStock = {
  calculation: SourceStockCalculationResult;
  context: SaleFormStockContext;
  invalidDocumentCount: number;
};

export type FreshSaleStockOptions = {
  requireOpenSeason?: boolean;
};

export type OrdinarySaleStockCheck = {
  checkedAtIso: string;
  expectedAvailableWeightG: number;
  sale: PreparedOrdinarySale;
  saleId: string;
  stockChanged: boolean;
};

export type OrdinarySaleStockCheckResult =
  | {
      check: OrdinarySaleStockCheck;
      status: "CONFIRMATION_REQUIRED";
    }
  | {
      check: OrdinarySaleStockCheck;
      message: string;
      status: "BLOCKED";
    };

export type CreateOrdinarySaleInput = {
  actorProfile: UserProfile;
  check: OrdinarySaleStockCheck;
  deviceId: string;
  isOnline: boolean;
};

export type OrdinarySaleConfirmedResult = {
  auditEvent: AuditEventDocument;
  concurrentStockChangeDetected: boolean;
  message: string;
  postWriteAvailableWeightG: number;
  sale: SaleDocument;
  status: "CONFIRMED";
  stockIsConsistent: boolean;
};

export type CreateOrdinarySaleResult =
  | OrdinarySaleConfirmedResult
  | {
      check: OrdinarySaleStockCheck;
      message: string;
      status: "RECONFIRMATION_REQUIRED";
    }
  | {
      check: OrdinarySaleStockCheck;
      message: string;
      status: "BLOCKED";
    };

export type ListOrdinarySaleStockInput = {
  actorProfile: UserProfile;
  isOnline: boolean;
};

export type CheckOrdinarySaleStockInput = ListOrdinarySaleStockInput & {
  preparedSale: PreparedOrdinarySale;
  saleId?: string;
};

export async function listOrdinarySaleStockContexts(
  env: FirebaseEnv,
  input: ListOrdinarySaleStockInput
): Promise<SaleFormStockContext[]> {
  assertAdminOnline(input.actorProfile, input.isOnline);
  const { firestore } = await getFirebaseServices(env);
  const { collection, getDocsFromServer, query, where } =
    await import("firebase/firestore");
  const seasonsSnapshot = await getDocsFromServer(
    query(collection(firestore, SEASONS_COLLECTION), where("status", "==", "OPEN"))
  );
  const seasons = seasonsSnapshot.docs.map((snapshot) => {
    const decoded = decodeSeason(snapshot.id, snapshot.data());

    if (decoded.status !== "FOUND") {
      throw new Error(`Nieprawidlowy sezon ${snapshot.id}: ${decoded.reason}`);
    }

    return decoded.season;
  });
  const contexts = await Promise.all(
    seasons.map(async (season) => {
      const stock = await readFreshSaleStockWithFirestore({
        firestore,
        season,
        seasonId: season.id
      });
      return stock.context;
    })
  );

  return contexts.sort((left, right) => left.seasonName.localeCompare(right.seasonName));
}

export async function checkOrdinarySaleStock(
  env: FirebaseEnv,
  input: CheckOrdinarySaleStockInput
): Promise<OrdinarySaleStockCheckResult> {
  assertAdminOnline(input.actorProfile, input.isOnline);
  assertPreparedOrdinarySale(input.preparedSale);
  const freshStock = await readFreshSaleStockForSeason(
    env,
    input.actorProfile,
    input.preparedSale.seasonId,
    input.isOnline,
    input.preparedSale.businessDate
  );

  return evaluateOrdinarySaleStockCheck({
    freshStock,
    preparedSale: input.preparedSale,
    saleId: input.saleId ?? createOrdinarySaleId()
  });
}

export async function createOrdinarySale(
  env: FirebaseEnv,
  input: CreateOrdinarySaleInput
): Promise<CreateOrdinarySaleResult> {
  assertAdminOnline(input.actorProfile, input.isOnline);
  assertOrdinarySaleStockCheck(input.check);
  const deviceId = normalizeRequiredText(
    input.deviceId,
    "Sprzedaz wymaga identyfikatora urzadzenia."
  );
  const freshStock = await readFreshSaleStockForSeason(
    env,
    input.actorProfile,
    input.check.sale.seasonId,
    input.isOnline,
    input.check.sale.businessDate
  );
  const refreshedResult = evaluateOrdinarySaleStockCheck({
    freshStock,
    preparedSale: input.check.sale,
    saleId: input.check.saleId
  });

  if (refreshedResult.status === "BLOCKED") {
    return refreshedResult;
  }

  if (freshStock.context.availableWeightG !== input.check.expectedAvailableWeightG) {
    return {
      check: refreshedResult.check,
      message:
        "Stan zmienil sie po potwierdzeniu. Sprawdz nowe podsumowanie i potwierdz ponownie.",
      status: "RECONFIRMATION_REQUIRED"
    };
  }

  const { firestore } = await getFirebaseServices(env);
  const { Timestamp, doc, getDocFromServer, serverTimestamp, writeBatch } =
    await import("firebase/firestore");
  const createdAtServer = serverTimestamp();
  const creationAttemptId = `sale-attempt-${input.check.saleId}`;
  const sale = prepareOrdinarySaleDocument({
    actorProfile: input.actorProfile,
    checkedSale: refreshedResult.check.sale,
    createdAtServer,
    creationAttemptId,
    saleId: input.check.saleId
  });
  const auditEvent = prepareOrdinarySaleAudit({
    actorProfile: input.actorProfile,
    checkedSale: refreshedResult.check.sale,
    createdAtDevice: Timestamp.now(),
    createdAtServer,
    deviceId,
    saleId: sale.id
  });
  const saleRef = doc(firestore, SALES_COLLECTION, sale.id);
  const auditRef = doc(firestore, AUDIT_EVENTS_COLLECTION, auditEvent.id);
  const batch = writeBatch(firestore);
  batch.set(saleRef, sale);
  batch.set(auditRef, auditEvent);

  let writeError: unknown = null;

  try {
    await batch.commit();
  } catch (error) {
    writeError = error;
  }

  const [saleSnapshot, auditSnapshot] = await Promise.all([
    getDocFromServer(saleRef),
    getDocFromServer(auditRef)
  ]);
  const confirmedSale = saleSnapshot.exists()
    ? decodeSaleDocument(saleSnapshot.id, saleSnapshot.data())
    : null;

  if (
    confirmedSale === null ||
    !saleMatchesAttempt(confirmedSale, sale, creationAttemptId) ||
    !auditSnapshot.exists() ||
    !auditMatchesSale(auditSnapshot.id, auditSnapshot.data(), sale)
  ) {
    throw new Error(
      writeError instanceof Error
        ? `Nie udalo sie potwierdzic zapisu sprzedazy: ${writeError.message}`
        : "Nie udalo sie potwierdzic zapisu sprzedazy."
    );
  }

  await publishSaleStockMovement(firestore, confirmedSale, input.actorProfile.uid);

  const postWriteStock = await readFreshSaleStockForSeason(
    env,
    input.actorProfile,
    sale.seasonId,
    input.isOnline,
    sale.businessDate
  );
  const expectedPostWriteWeightG = input.check.expectedAvailableWeightG - sale.weightG;
  const concurrentStockChangeDetected =
    postWriteStock.context.availableWeightG !== expectedPostWriteWeightG;
  const stockIsConsistent = postWriteStock.context.availableWeightG >= 0;

  return {
    auditEvent,
    concurrentStockChangeDetected,
    message: stockIsConsistent
      ? concurrentStockChangeDetected
        ? "Sprzedaz zapisana. Stan zmienil sie rownolegle i zostal ponownie przeliczony."
        : "Sprzedaz zostala zapisana i potwierdzona przez serwer."
      : "Sprzedaz zapisana, ale stan jest ujemny. Wymagana jest reczna korekta.",
    postWriteAvailableWeightG: postWriteStock.context.availableWeightG,
    sale: confirmedSale,
    status: "CONFIRMED",
    stockIsConsistent
  };
}

export function evaluateOrdinarySaleStockCheck({
  freshStock,
  preparedSale,
  saleId
}: {
  freshStock: FreshSaleStock;
  preparedSale: PreparedOrdinarySale;
  saleId: string;
}): OrdinarySaleStockCheckResult {
  assertPreparedOrdinarySale(preparedSale);
  const normalizedSaleId = normalizeRequiredText(
    saleId,
    "Kontrola sprzedazy wymaga identyfikatora."
  );
  const availableWeightG = freshStock.context.availableWeightG;
  const projectedAvailableWeightG = safeSubtract(availableWeightG, preparedSale.weightG);
  const checkedSale: PreparedOrdinarySale = {
    ...preparedSale,
    availableWeightG,
    pendingDocumentCount: freshStock.context.pendingDocumentCount,
    projectedAvailableWeightG,
    refreshedAtIso: freshStock.context.refreshedAtIso,
    seasonName: freshStock.context.seasonName,
    stockDataSource: "SERVER",
    stockWasFresh: true
  };
  const check: OrdinarySaleStockCheck = {
    checkedAtIso: freshStock.context.refreshedAtIso,
    expectedAvailableWeightG: availableWeightG,
    sale: checkedSale,
    saleId: normalizedSaleId,
    stockChanged: availableWeightG !== preparedSale.availableWeightG
  };

  if (freshStock.invalidDocumentCount > 0) {
    return {
      check,
      message:
        "Stan zawiera nieprawidlowe dokumenty zrodlowe. Sprzedaz zostala zablokowana.",
      status: "BLOCKED"
    };
  }

  if (availableWeightG < 0) {
    return {
      check,
      message: "Stan sezonu jest ujemny. Najpierw wykonaj korekte danych zrodlowych.",
      status: "BLOCKED"
    };
  }

  if (preparedSale.weightG > availableWeightG) {
    return {
      check,
      message: "Sprzedaz przekracza aktualny stan i nie moze zostac zapisana.",
      status: "BLOCKED"
    };
  }

  return {
    check,
    status: "CONFIRMATION_REQUIRED"
  };
}

export function prepareOrdinarySaleDocument({
  actorProfile,
  checkedSale,
  createdAtServer,
  creationAttemptId,
  saleId
}: {
  actorProfile: UserProfile;
  checkedSale: PreparedOrdinarySale;
  createdAtServer: unknown;
  creationAttemptId: string;
  saleId: string;
}): SaleDocument {
  assertAdmin(actorProfile);
  assertPreparedOrdinarySale(checkedSale);

  return {
    businessDate: checkedSale.businessDate,
    calculationVersion: checkedSale.revenueCalculationVersion,
    cancellationReason: null,
    cancelledAt: null,
    cancelledBy: null,
    correctionDirection: null,
    createdAtServer,
    createdBy: normalizeRequiredText(
      actorProfile.uid,
      "Sprzedaz wymaga identyfikatora administratora."
    ),
    creationAttemptId: normalizeRequiredText(
      creationAttemptId,
      "Sprzedaz wymaga identyfikatora proby zapisu."
    ),
    entryType: "SALE",
    id: normalizeRequiredText(saleId, "Sprzedaz wymaga identyfikatora."),
    legacyImport: false,
    legacySourceRow: null,
    note: checkedSale.note,
    priceGroszPerKg: checkedSale.priceGroszPerKg,
    seasonId: checkedSale.seasonId,
    status: "ACTIVE",
    totalGrosz: checkedSale.revenuePreviewGrosz,
    weightG: checkedSale.weightG
  };
}

export function decodeSaleDocument(
  expectedId: string,
  data: unknown
): SaleDocument | null {
  if (!isRecord(data)) {
    return null;
  }

  const id = readRequiredText(data.id);
  const seasonId = readRequiredText(data.seasonId);
  const businessDate = readRequiredText(data.businessDate);
  const calculationVersion = readRequiredText(data.calculationVersion);
  const createdBy = readRequiredText(data.createdBy);
  const creationAttemptId = readRequiredText(data.creationAttemptId);
  const note = readNullableText(data.note);
  const cancelledBy = readNullableText(data.cancelledBy);
  const cancellationReason = readNullableText(data.cancellationReason);
  const legacySourceRow = readNullableText(data.legacySourceRow);
  const correctionDirection =
    data.correctionDirection === null
      ? null
      : STOCK_CORRECTION_DIRECTIONS.includes(
            data.correctionDirection as StockCorrectionDirection
          )
        ? (data.correctionDirection as StockCorrectionDirection)
        : undefined;

  if (
    !id ||
    id !== expectedId ||
    !seasonId ||
    !businessDate ||
    calculationVersion !== SALE_REVENUE_CALCULATION_VERSION ||
    !createdBy ||
    !creationAttemptId ||
    note === undefined ||
    cancelledBy === undefined ||
    cancellationReason === undefined ||
    legacySourceRow === undefined ||
    correctionDirection === undefined ||
    !SALE_ENTRY_TYPES.includes(data.entryType as SaleEntryType) ||
    !SALE_STATUSES.includes(data.status as SaleStatus) ||
    !isSafePositiveInteger(data.weightG) ||
    !isSafeNonNegativeInteger(data.priceGroszPerKg) ||
    !isSafeNonNegativeInteger(data.totalGrosz) ||
    typeof data.legacyImport !== "boolean" ||
    !isBusinessDate(businessDate)
  ) {
    return null;
  }

  if (
    (data.entryType === "SALE" && correctionDirection !== null) ||
    (data.entryType === "CORRECTION" && (correctionDirection === null || note === null))
  ) {
    return null;
  }

  const cancelledAt = data.cancelledAt ?? null;
  const hasCompleteCancellation =
    cancelledAt !== null &&
    cancelledBy !== null &&
    cancellationReason !== null &&
    cancellationReason.trim().length >= 3 &&
    cancellationReason.length <= 200;

  if (
    (data.status === "ACTIVE" &&
      (cancelledAt !== null || cancelledBy !== null || cancellationReason !== null)) ||
    (data.status === "CANCELLED" && !hasCompleteCancellation)
  ) {
    return null;
  }

  try {
    if (
      calculateSaleRevenue({
        priceGroszPerKg: data.priceGroszPerKg,
        weightG: data.weightG
      }).totalGrosz !== data.totalGrosz
    ) {
      return null;
    }
  } catch {
    return null;
  }

  const sale: SaleDocument = {
    businessDate,
    calculationVersion,
    cancellationReason,
    cancelledAt,
    cancelledBy,
    correctionDirection,
    createdAtServer: data.createdAtServer ?? null,
    createdBy,
    creationAttemptId,
    entryType: data.entryType as SaleEntryType,
    id,
    legacyImport: data.legacyImport,
    legacySourceRow,
    note,
    priceGroszPerKg: data.priceGroszPerKg,
    seasonId,
    status: data.status as SaleStatus,
    totalGrosz: data.totalGrosz,
    weightG: data.weightG
  };

  try {
    calculateSourceStockForSeason({
      harvestSessions: [],
      sales: [sale],
      seasonId
    });
  } catch {
    return null;
  }

  return sale;
}

export function createOrdinarySaleId(
  randomUuid: () => string = () => crypto.randomUUID()
): string {
  const id = normalizeRequiredText(
    randomUuid(),
    "Nie udalo sie utworzyc identyfikatora sprzedazy."
  );

  if (id.length > 80) {
    throw new Error("Identyfikator sprzedazy jest zbyt dlugi.");
  }

  return id;
}

export async function readFreshSaleStockForSeason(
  env: FirebaseEnv,
  actorProfile: UserProfile,
  seasonId: string,
  isOnline: boolean,
  businessDate: string,
  options: FreshSaleStockOptions = {}
): Promise<FreshSaleStock> {
  assertAdminOnline(actorProfile, isOnline);
  const { firestore } = await getFirebaseServices(env);
  const { doc, getDocFromServer } = await import("firebase/firestore");
  const seasonSnapshot = await getDocFromServer(
    doc(firestore, SEASONS_COLLECTION, seasonId)
  );

  if (!seasonSnapshot.exists()) {
    throw new Error("Nie znaleziono sezonu sprzedazy.");
  }

  const decodedSeason = decodeSeason(seasonSnapshot.id, seasonSnapshot.data());

  if (decodedSeason.status !== "FOUND") {
    throw new Error(decodedSeason.reason);
  }

  assertBusinessDateInSeason(businessDate, decodedSeason.season);

  return readFreshSaleStockWithFirestore({
    firestore,
    requireOpenSeason: options.requireOpenSeason ?? true,
    season: decodedSeason.season,
    seasonId
  });
}

async function readFreshSaleStockWithFirestore({
  firestore,
  requireOpenSeason = true,
  season,
  seasonId
}: {
  firestore: Firestore;
  requireOpenSeason?: boolean;
  season: SeasonDocument;
  seasonId: string;
}): Promise<FreshSaleStock> {
  if (requireOpenSeason && season.status !== "OPEN") {
    throw new Error("Sprzedaz mozna zapisac tylko w otwartym sezonie.");
  }

  const { collection, getDocsFromServer, query, where } =
    await import("firebase/firestore");
  const [sessionsSnapshot, salesSnapshot] = await Promise.all([
    getDocsFromServer(
      query(
        collection(firestore, HARVEST_SESSIONS_COLLECTION),
        where("seasonId", "==", seasonId)
      )
    ),
    getDocsFromServer(
      query(collection(firestore, SALES_COLLECTION), where("seasonId", "==", seasonId))
    )
  ]);
  const harvestSessions: SourceStockHarvestSession[] = [];
  const sales: SourceStockSale[] = [];
  let invalidDocumentCount = 0;

  for (const snapshot of sessionsSnapshot.docs) {
    const decoded = decodeHarvestSession(snapshot.id, snapshot.data());

    if (decoded.status === "FOUND") {
      harvestSessions.push(decoded.session);
    } else {
      invalidDocumentCount += 1;
    }
  }

  for (const snapshot of salesSnapshot.docs) {
    const decoded = decodeSaleDocument(snapshot.id, snapshot.data());

    if (decoded) {
      sales.push(decoded);
    } else {
      invalidDocumentCount += 1;
    }
  }

  const calculation = calculateSourceStockForSeason({
    harvestSessions,
    sales,
    seasonId
  });

  return {
    calculation,
    context: {
      availableWeightG: calculation.availableWeightG,
      dataSource: "SERVER",
      isFresh: true,
      pendingDocumentCount: 0,
      refreshedAtIso: new Date().toISOString(),
      seasonId,
      seasonName: season.name
    },
    invalidDocumentCount
  };
}

function prepareOrdinarySaleAudit({
  actorProfile,
  checkedSale,
  createdAtDevice,
  createdAtServer,
  deviceId,
  saleId
}: {
  actorProfile: UserProfile;
  checkedSale: PreparedOrdinarySale;
  createdAtDevice: unknown;
  createdAtServer: unknown;
  deviceId: string;
  saleId: string;
}): AuditEventDocument {
  const auditId = `sale-created-${saleId}`;

  return createAuditEventDraft({
    action: "SALE_CREATED",
    actorRoleSnapshot: actorProfile.role,
    actorUid: actorProfile.uid,
    afterSummary: {
      entryType: "SALE",
      calculationVersion: checkedSale.revenueCalculationVersion,
      projectedStockWeightG: checkedSale.projectedAvailableWeightG,
      saleId,
      seasonId: checkedSale.seasonId,
      status: "ACTIVE",
      totalGrosz: checkedSale.revenuePreviewGrosz,
      weightG: checkedSale.weightG
    },
    beforeSummary: {
      availableStockWeightG: checkedSale.availableWeightG,
      seasonId: checkedSale.seasonId
    },
    businessDate: checkedSale.businessDate,
    createdAtDevice,
    createdAtServer,
    deviceId,
    entityId: saleId,
    entityType: "SALE",
    id: auditId,
    reason: null
  });
}

function assertPreparedOrdinarySale(sale: PreparedOrdinarySale): void {
  normalizeRequiredText(sale.seasonId, "Sprzedaz wymaga sezonu.");
  normalizeRequiredText(sale.seasonName, "Sprzedaz wymaga nazwy sezonu.");

  if (
    !isBusinessDate(sale.businessDate) ||
    !isSafePositiveInteger(sale.weightG) ||
    !isSafeNonNegativeInteger(sale.priceGroszPerKg) ||
    !Number.isSafeInteger(sale.availableWeightG) ||
    !Number.isSafeInteger(sale.projectedAvailableWeightG) ||
    sale.revenueCalculationVersion !== SALE_REVENUE_CALCULATION_VERSION
  ) {
    throw new Error("Przygotowana sprzedaz ma nieprawidlowe dane.");
  }

  const revenue = calculateSaleRevenue({
    priceGroszPerKg: sale.priceGroszPerKg,
    weightG: sale.weightG
  });

  if (
    sale.revenuePreviewGrosz !== revenue.totalGrosz ||
    sale.revenueRemainderMilliGrosz !== revenue.remainderMilliGrosz
  ) {
    throw new Error("Przygotowana sprzedaz ma niespojny przychod.");
  }

  if (sale.note !== null && (sale.note.trim() !== sale.note || sale.note.length > 200)) {
    throw new Error("Przygotowana sprzedaz ma nieprawidlowa notatke.");
  }
}

function assertOrdinarySaleStockCheck(check: OrdinarySaleStockCheck): void {
  assertPreparedOrdinarySale(check.sale);
  normalizeRequiredText(check.saleId, "Kontrola sprzedazy wymaga identyfikatora.");

  if (
    !Number.isSafeInteger(check.expectedAvailableWeightG) ||
    check.expectedAvailableWeightG !== check.sale.availableWeightG ||
    check.sale.projectedAvailableWeightG !==
      check.expectedAvailableWeightG - check.sale.weightG ||
    Number.isNaN(new Date(check.checkedAtIso).getTime())
  ) {
    throw new Error("Kontrola sprzedazy ma nieprawidlowy stan.");
  }
}

function assertAdminOnline(actorProfile: UserProfile, isOnline: boolean): void {
  assertAdmin(actorProfile);

  if (!isOnline) {
    throw new Error("Sprzedaz wymaga aktywnego polaczenia.");
  }
}

function assertAdmin(actorProfile: UserProfile): void {
  if (
    actorProfile.role !== "ADMIN" ||
    !actorProfile.active ||
    actorProfile.registrationStatus !== "APPROVED"
  ) {
    throw new Error("Sprzedaz moze zapisac tylko aktywny administrator.");
  }
}

function saleMatchesAttempt(
  confirmed: SaleDocument,
  expected: SaleDocument,
  creationAttemptId: string
): boolean {
  return (
    confirmed.id === expected.id &&
    confirmed.creationAttemptId === creationAttemptId &&
    confirmed.createdBy === expected.createdBy &&
    confirmed.seasonId === expected.seasonId &&
    confirmed.businessDate === expected.businessDate &&
    confirmed.calculationVersion === expected.calculationVersion &&
    confirmed.weightG === expected.weightG &&
    confirmed.priceGroszPerKg === expected.priceGroszPerKg &&
    confirmed.totalGrosz === expected.totalGrosz &&
    confirmed.entryType === "SALE" &&
    confirmed.status === "ACTIVE"
  );
}

function auditMatchesSale(
  expectedAuditId: string,
  data: unknown,
  sale: SaleDocument
): boolean {
  if (!isRecord(data)) {
    return false;
  }

  return (
    expectedAuditId === `sale-created-${sale.id}` &&
    data.id === expectedAuditId &&
    data.action === "SALE_CREATED" &&
    data.entityType === "SALE" &&
    data.entityId === sale.id &&
    data.actorUid === sale.createdBy
  );
}

function safeSubtract(left: number, right: number): number {
  const result = left - right;

  if (
    !Number.isSafeInteger(left) ||
    !Number.isSafeInteger(right) ||
    !Number.isSafeInteger(result)
  ) {
    throw new Error("Stan po sprzedazy przekracza bezpieczny zakres liczbowy.");
  }

  return result;
}

function normalizeRequiredText(value: string, message: string): string {
  const normalized = value.trim();

  if (!normalized) {
    throw new Error(message);
  }

  return normalized;
}

function readRequiredText(value: unknown): string {
  return typeof value === "string" && value.trim() ? value.trim() : "";
}

function readNullableText(value: unknown): string | null | undefined {
  if (value === null) {
    return null;
  }

  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function isBusinessDate(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);

  if (!match) {
    return false;
  }

  const date = new Date(
    Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]))
  );
  return (
    date.getUTCFullYear() === Number(match[1]) &&
    date.getUTCMonth() === Number(match[2]) - 1 &&
    date.getUTCDate() === Number(match[3])
  );
}

function assertBusinessDateInSeason(businessDate: string, season: SeasonDocument): void {
  if (
    !isBusinessDate(businessDate) ||
    businessDate < season.startDate ||
    (season.endDate !== null && businessDate > season.endDate)
  ) {
    throw new Error("Data sprzedazy jest poza zakresem wybranego sezonu.");
  }
}

function isSafePositiveInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0;
}

function isSafeNonNegativeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
