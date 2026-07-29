import {
  AUDIT_EVENTS_COLLECTION,
  createAuditEventDraft,
  type AuditEventDocument
} from "../audit/auditEvents";
import { getFirebaseServices } from "../config/firebaseServices";
import type { UserProfile } from "../domain/identity";
import { publishSaleStockMovement } from "../stock/operationalStockMovement";
import {
  assertPreparedSaleCorrection,
  refreshPreparedSaleCorrectionStock,
  type PreparedSaleCorrection
} from "./saleCorrectionPreparation";
import {
  SALES_COLLECTION,
  decodeSaleDocument,
  readFreshSaleStockForSeason,
  type FreshSaleStock,
  type SaleDocument
} from "./saleStockPreflight";

type FirebaseEnv = Record<string, string | boolean | undefined>;

export type SaleCorrectionCheck = {
  checkedAtIso: string;
  correction: PreparedSaleCorrection;
  correctionId: string;
  expectedAvailableWeightG: number;
  stockChanged: boolean;
};

export type SaleCorrectionCheckResult =
  | {
      check: SaleCorrectionCheck;
      status: "CONFIRMATION_REQUIRED";
    }
  | {
      check: SaleCorrectionCheck;
      message: string;
      status: "BLOCKED";
    };

export type CheckSaleCorrectionInput = {
  actorProfile: UserProfile;
  correctionId?: string;
  isOnline: boolean;
  preparedCorrection: PreparedSaleCorrection;
};

export type CreateSaleCorrectionInput = {
  actorProfile: UserProfile;
  check: SaleCorrectionCheck;
  deviceId: string;
  isOnline: boolean;
};

export type SaleCorrectionConfirmedResult = {
  auditEvent: AuditEventDocument;
  concurrentStockChangeDetected: boolean;
  correction: SaleDocument;
  message: string;
  postWriteAvailableWeightG: number;
  status: "CONFIRMED";
};

export type CreateSaleCorrectionResult =
  | SaleCorrectionConfirmedResult
  | {
      check: SaleCorrectionCheck;
      message: string;
      status: "RECONFIRMATION_REQUIRED";
    }
  | {
      check: SaleCorrectionCheck;
      message: string;
      status: "BLOCKED";
    };

export async function checkSaleCorrection(
  env: FirebaseEnv,
  input: CheckSaleCorrectionInput
): Promise<SaleCorrectionCheckResult> {
  assertAdminOnline(input.actorProfile, input.isOnline);
  assertPreparedSaleCorrection(input.preparedCorrection);
  const freshStock = await readFreshSaleStockForSeason(
    env,
    input.actorProfile,
    input.preparedCorrection.seasonId,
    input.isOnline,
    input.preparedCorrection.businessDate
  );

  return evaluateSaleCorrectionCheck({
    correctionId: input.correctionId ?? createSaleCorrectionId(),
    freshStock,
    preparedCorrection: input.preparedCorrection
  });
}

export async function createSaleCorrection(
  env: FirebaseEnv,
  input: CreateSaleCorrectionInput
): Promise<CreateSaleCorrectionResult> {
  assertAdminOnline(input.actorProfile, input.isOnline);
  assertSaleCorrectionCheck(input.check);
  const deviceId = normalizeRequiredText(
    input.deviceId,
    "Korekta wymaga identyfikatora urzadzenia."
  );
  const freshStock = await readFreshSaleStockForSeason(
    env,
    input.actorProfile,
    input.check.correction.seasonId,
    input.isOnline,
    input.check.correction.businessDate
  );
  const refreshedResult = evaluateSaleCorrectionCheck({
    correctionId: input.check.correctionId,
    freshStock,
    preparedCorrection: input.check.correction
  });

  if (refreshedResult.status === "BLOCKED") {
    return refreshedResult;
  }

  if (freshStock.context.availableWeightG !== input.check.expectedAvailableWeightG) {
    return {
      check: refreshedResult.check,
      message:
        "Stan zmienil sie po potwierdzeniu. Sprawdz skutki korekty i potwierdz ponownie.",
      status: "RECONFIRMATION_REQUIRED"
    };
  }

  const { firestore } = await getFirebaseServices(env);
  const { Timestamp, doc, getDocFromServer, serverTimestamp, writeBatch } =
    await import("firebase/firestore");
  const createdAtServer = serverTimestamp();
  const creationAttemptId = `sale-correction-attempt-${input.check.correctionId}`;
  const correction = prepareSaleCorrectionDocument({
    actorProfile: input.actorProfile,
    correctionId: input.check.correctionId,
    createdAtServer,
    creationAttemptId,
    preparedCorrection: refreshedResult.check.correction
  });
  const auditEvent = prepareSaleCorrectionAudit({
    actorProfile: input.actorProfile,
    correctionId: correction.id,
    createdAtDevice: Timestamp.now(),
    createdAtServer,
    deviceId,
    preparedCorrection: refreshedResult.check.correction
  });
  const correctionRef = doc(firestore, SALES_COLLECTION, correction.id);
  const auditRef = doc(firestore, AUDIT_EVENTS_COLLECTION, auditEvent.id);
  const batch = writeBatch(firestore);
  batch.set(correctionRef, correction);
  batch.set(auditRef, auditEvent);

  let writeError: unknown = null;

  try {
    await batch.commit();
  } catch (error) {
    writeError = error;
  }

  const [correctionSnapshot, auditSnapshot] = await Promise.all([
    getDocFromServer(correctionRef),
    getDocFromServer(auditRef)
  ]);
  const confirmedCorrection = correctionSnapshot.exists()
    ? decodeSaleDocument(correctionSnapshot.id, correctionSnapshot.data())
    : null;

  if (
    confirmedCorrection === null ||
    !correctionMatchesAttempt(confirmedCorrection, correction, creationAttemptId) ||
    !auditSnapshot.exists() ||
    !auditMatchesCorrection(auditSnapshot.id, auditSnapshot.data(), correction)
  ) {
    throw new Error(
      writeError instanceof Error
        ? `Nie udalo sie potwierdzic zapisu korekty: ${writeError.message}`
        : "Nie udalo sie potwierdzic zapisu korekty."
    );
  }

  await publishSaleStockMovement(firestore, confirmedCorrection, input.actorProfile.uid);

  const postWriteStock = await readFreshSaleStockForSeason(
    env,
    input.actorProfile,
    correction.seasonId,
    input.isOnline,
    correction.businessDate
  );
  const expectedPostWriteWeightG = safeAdd(
    input.check.expectedAvailableWeightG,
    refreshedResult.check.correction.stockImpactG
  );
  const concurrentStockChangeDetected =
    postWriteStock.context.availableWeightG !== expectedPostWriteWeightG;

  return {
    auditEvent,
    concurrentStockChangeDetected,
    correction: confirmedCorrection,
    message: concurrentStockChangeDetected
      ? "Korekta zapisana. Stan zmienil sie rownolegle i zostal ponownie przeliczony."
      : "Korekta sprzedazy zostala zapisana i potwierdzona przez serwer.",
    postWriteAvailableWeightG: postWriteStock.context.availableWeightG,
    status: "CONFIRMED"
  };
}

export function evaluateSaleCorrectionCheck({
  correctionId,
  freshStock,
  preparedCorrection
}: {
  correctionId: string;
  freshStock: FreshSaleStock;
  preparedCorrection: PreparedSaleCorrection;
}): SaleCorrectionCheckResult {
  assertPreparedSaleCorrection(preparedCorrection);
  const normalizedCorrectionId = normalizeRequiredText(
    correctionId,
    "Kontrola korekty wymaga identyfikatora."
  );
  const correction = refreshPreparedSaleCorrectionStock(
    preparedCorrection,
    freshStock.context
  );
  const check: SaleCorrectionCheck = {
    checkedAtIso: freshStock.context.refreshedAtIso,
    correction,
    correctionId: normalizedCorrectionId,
    expectedAvailableWeightG: freshStock.context.availableWeightG,
    stockChanged:
      freshStock.context.availableWeightG !== preparedCorrection.availableWeightG
  };

  if (freshStock.invalidDocumentCount > 0) {
    return {
      check,
      message:
        "Stan zawiera nieprawidlowe dokumenty zrodlowe. Korekta zostala zablokowana.",
      status: "BLOCKED"
    };
  }

  return {
    check,
    status: "CONFIRMATION_REQUIRED"
  };
}

export function prepareSaleCorrectionDocument({
  actorProfile,
  correctionId,
  createdAtServer,
  creationAttemptId,
  preparedCorrection
}: {
  actorProfile: UserProfile;
  correctionId: string;
  createdAtServer: unknown;
  creationAttemptId: string;
  preparedCorrection: PreparedSaleCorrection;
}): SaleDocument {
  assertAdmin(actorProfile);
  assertPreparedSaleCorrection(preparedCorrection);

  return {
    businessDate: preparedCorrection.businessDate,
    calculationVersion: preparedCorrection.calculationVersion,
    cancellationReason: null,
    cancelledAt: null,
    cancelledBy: null,
    correctionDirection: preparedCorrection.correctionDirection,
    createdAtServer,
    createdBy: normalizeRequiredText(
      actorProfile.uid,
      "Korekta wymaga identyfikatora administratora."
    ),
    creationAttemptId: normalizeRequiredText(
      creationAttemptId,
      "Korekta wymaga identyfikatora proby zapisu."
    ),
    entryType: "CORRECTION",
    id: normalizeRequiredText(correctionId, "Korekta wymaga identyfikatora."),
    legacyImport: false,
    legacySourceRow: null,
    note: preparedCorrection.note,
    priceGroszPerKg: preparedCorrection.priceGroszPerKg,
    seasonId: preparedCorrection.seasonId,
    status: "ACTIVE",
    totalGrosz: preparedCorrection.revenueMagnitudeGrosz,
    weightG: preparedCorrection.weightG
  };
}

export function prepareSaleCorrectionAudit({
  actorProfile,
  correctionId,
  createdAtDevice,
  createdAtServer,
  deviceId,
  preparedCorrection
}: {
  actorProfile: UserProfile;
  correctionId: string;
  createdAtDevice: unknown;
  createdAtServer: unknown;
  deviceId: string;
  preparedCorrection: PreparedSaleCorrection;
}): AuditEventDocument {
  assertAdmin(actorProfile);
  assertPreparedSaleCorrection(preparedCorrection);
  const auditId = `sale-correction-created-${correctionId}`;

  return createAuditEventDraft({
    action: "SALE_CORRECTION_CREATED",
    actorRoleSnapshot: actorProfile.role,
    actorUid: actorProfile.uid,
    afterSummary: {
      calculationVersion: preparedCorrection.calculationVersion,
      correctionDirection: preparedCorrection.correctionDirection,
      entryType: "CORRECTION",
      projectedStockWeightG: preparedCorrection.projectedAvailableWeightG,
      revenueImpactGrosz: preparedCorrection.revenueImpactGrosz,
      saleId: correctionId,
      seasonId: preparedCorrection.seasonId,
      status: "ACTIVE",
      totalGrosz: preparedCorrection.revenueMagnitudeGrosz,
      weightG: preparedCorrection.weightG
    },
    beforeSummary: {
      availableStockWeightG: preparedCorrection.availableWeightG,
      seasonId: preparedCorrection.seasonId
    },
    businessDate: preparedCorrection.businessDate,
    createdAtDevice,
    createdAtServer,
    deviceId,
    entityId: correctionId,
    entityType: "SALE",
    id: auditId,
    reason: preparedCorrection.note
  });
}

export function createSaleCorrectionId(
  randomUuid: () => string = () => crypto.randomUUID()
): string {
  const id = normalizeRequiredText(
    randomUuid(),
    "Nie udalo sie utworzyc identyfikatora korekty."
  );

  if (id.length > 80) {
    throw new Error("Identyfikator korekty jest zbyt dlugi.");
  }

  return id;
}

function assertSaleCorrectionCheck(check: SaleCorrectionCheck): void {
  assertPreparedSaleCorrection(check.correction);
  normalizeRequiredText(check.correctionId, "Kontrola korekty wymaga identyfikatora.");

  if (
    !Number.isSafeInteger(check.expectedAvailableWeightG) ||
    check.expectedAvailableWeightG !== check.correction.availableWeightG ||
    check.correction.projectedAvailableWeightG !==
      check.expectedAvailableWeightG + check.correction.stockImpactG ||
    Number.isNaN(new Date(check.checkedAtIso).getTime())
  ) {
    throw new Error("Kontrola korekty ma nieprawidlowy stan.");
  }
}

function correctionMatchesAttempt(
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
    confirmed.correctionDirection === expected.correctionDirection &&
    confirmed.weightG === expected.weightG &&
    confirmed.priceGroszPerKg === expected.priceGroszPerKg &&
    confirmed.totalGrosz === expected.totalGrosz &&
    confirmed.note === expected.note &&
    confirmed.entryType === "CORRECTION" &&
    confirmed.status === "ACTIVE"
  );
}

function auditMatchesCorrection(
  expectedAuditId: string,
  data: unknown,
  correction: SaleDocument
): boolean {
  if (!isRecord(data)) {
    return false;
  }

  return (
    expectedAuditId === `sale-correction-created-${correction.id}` &&
    data.id === expectedAuditId &&
    data.action === "SALE_CORRECTION_CREATED" &&
    data.entityType === "SALE" &&
    data.entityId === correction.id &&
    data.actorUid === correction.createdBy &&
    data.reason === correction.note
  );
}

function assertAdminOnline(actorProfile: UserProfile, isOnline: boolean): void {
  assertAdmin(actorProfile);

  if (!isOnline) {
    throw new Error("Korekta sprzedazy wymaga aktywnego polaczenia.");
  }
}

function assertAdmin(actorProfile: UserProfile): void {
  if (
    actorProfile.role !== "ADMIN" ||
    !actorProfile.active ||
    actorProfile.registrationStatus !== "APPROVED"
  ) {
    throw new Error("Korekte moze zapisac tylko aktywny administrator.");
  }
}

function safeAdd(left: number, right: number): number {
  const result = left + right;

  if (
    !Number.isSafeInteger(left) ||
    !Number.isSafeInteger(right) ||
    !Number.isSafeInteger(result)
  ) {
    throw new Error("Stan po korekcie przekracza bezpieczny zakres liczbowy.");
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
