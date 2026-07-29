import {
  AUDIT_EVENTS_COLLECTION,
  createAuditEventDraft,
  decodeAuditEvent,
  type AuditEventDocument
} from "../audit/auditEvents";
import { getFirebaseServices } from "../config/firebaseServices";
import { SEASONS_COLLECTION } from "../domain/domainConfiguration";
import type { UserProfile } from "../domain/identity";
import { decodeSeason } from "../seasons/seasons";
import {
  SALES_COLLECTION,
  decodeSaleDocument,
  readFreshSaleStockForSeason,
  type SaleDocument
} from "./saleStockPreflight";

type FirebaseEnv = Record<string, string | boolean | undefined>;

export const SALE_CANCELLATION_REASON_MIN_LENGTH = 3;
export const SALE_CANCELLATION_REASON_MAX_LENGTH = 200;

export type SaleCancellationImpact = {
  revenueImpactGrosz: number;
  stockImpactG: number;
};

export type SaleCancellationCandidate = {
  sale: SaleDocument;
  seasonName: string;
};

export type ListSaleCancellationCandidatesInput = {
  actorProfile: UserProfile;
  isOnline: boolean;
};

export type CancelSaleInput = {
  actorProfile: UserProfile;
  confirmed: boolean;
  deviceId: string;
  isOnline: boolean;
  reason: string;
  saleId: string;
};

export type SaleCancellationUpdate = Pick<
  SaleDocument,
  "cancellationReason" | "cancelledAt" | "cancelledBy" | "status"
>;

export type PreparedSaleCancellation = {
  auditEvent: AuditEventDocument;
  cancelledSale: SaleDocument;
  impact: SaleCancellationImpact;
  saleUpdate: SaleCancellationUpdate;
};

export type SaleCancellationResult = {
  auditEvent: AuditEventDocument;
  cancelledSale: SaleDocument;
  impact: SaleCancellationImpact;
  message: string;
  postWriteAvailableWeightG: number;
  status: "CANCELLED";
};

export async function listSaleCancellationCandidates(
  env: FirebaseEnv,
  input: ListSaleCancellationCandidatesInput
): Promise<SaleCancellationCandidate[]> {
  assertAdminOnline(input.actorProfile, input.isOnline);
  const { firestore } = await getFirebaseServices(env);
  const { collection, getDocsFromServer } = await import("firebase/firestore");
  const [salesSnapshot, seasonsSnapshot] = await Promise.all([
    getDocsFromServer(collection(firestore, SALES_COLLECTION)),
    getDocsFromServer(collection(firestore, SEASONS_COLLECTION))
  ]);
  const seasonNames = new Map<string, string>();

  for (const snapshot of seasonsSnapshot.docs) {
    const decoded = decodeSeason(snapshot.id, snapshot.data());

    if (decoded.status === "FOUND") {
      seasonNames.set(decoded.season.id, decoded.season.name);
    }
  }

  return salesSnapshot.docs
    .map((snapshot) => decodeSaleDocument(snapshot.id, snapshot.data()))
    .filter((sale): sale is SaleDocument => sale?.status === "ACTIVE")
    .map((sale) => ({
      sale,
      seasonName: seasonNames.get(sale.seasonId) ?? sale.seasonId
    }))
    .sort(
      (left, right) =>
        right.sale.businessDate.localeCompare(left.sale.businessDate) ||
        right.sale.id.localeCompare(left.sale.id)
    );
}

export async function cancelSale(
  env: FirebaseEnv,
  input: CancelSaleInput
): Promise<SaleCancellationResult> {
  assertAdminOnline(input.actorProfile, input.isOnline);
  const saleId = requiredText(
    input.saleId,
    "Anulowanie wymaga identyfikatora operacji sprzedazy."
  );
  const deviceId = requiredText(
    input.deviceId,
    "Anulowanie wymaga identyfikatora urzadzenia."
  );
  const normalizedReason = normalizeCancellationReason(input.reason);

  if (!input.confirmed) {
    throw new Error("Potwierdz skutki anulowania operacji sprzedazy.");
  }

  const { firestore } = await getFirebaseServices(env);
  const { Timestamp, doc, getDocFromServer, runTransaction, serverTimestamp } =
    await import("firebase/firestore");
  const saleRef = doc(firestore, SALES_COLLECTION, saleId);
  const auditId = createSaleCancellationAuditId(saleId);
  const auditRef = doc(firestore, AUDIT_EVENTS_COLLECTION, auditId);
  let writeError: unknown = null;

  try {
    await runTransaction(firestore, async (transaction) => {
      const saleSnapshot = await transaction.get(saleRef);

      if (!saleSnapshot.exists()) {
        throw new Error("Nie znaleziono operacji sprzedazy do anulowania.");
      }

      const sale = decodeSaleDocument(saleSnapshot.id, saleSnapshot.data());

      if (!sale) {
        throw new Error("Operacja sprzedazy ma nieprawidlowy format.");
      }

      const committedAt = serverTimestamp();
      const prepared = prepareSaleCancellation({
        ...input,
        auditId,
        cancelledAt: committedAt,
        createdAtDevice: Timestamp.now(),
        createdAtServer: committedAt,
        deviceId,
        reason: normalizedReason,
        sale,
        saleId
      });

      transaction.update(saleRef, prepared.saleUpdate);
      transaction.set(auditRef, prepared.auditEvent);
    });
  } catch (error) {
    writeError = error;
  }

  const [saleSnapshot, auditSnapshot] = await Promise.all([
    getDocFromServer(saleRef),
    getDocFromServer(auditRef)
  ]);
  const cancelledSale = saleSnapshot.exists()
    ? decodeSaleDocument(saleSnapshot.id, saleSnapshot.data())
    : null;
  const decodedAudit = auditSnapshot.exists()
    ? decodeAuditEvent(auditSnapshot.id, auditSnapshot.data())
    : null;

  if (
    cancelledSale?.status !== "CANCELLED" ||
    cancelledSale.cancelledBy !== input.actorProfile.uid ||
    cancelledSale.cancellationReason !== normalizedReason ||
    decodedAudit?.status !== "FOUND" ||
    !auditMatchesCancellation(decodedAudit.event, cancelledSale, normalizedReason)
  ) {
    throw new Error(
      writeError instanceof Error
        ? `Nie udalo sie potwierdzic anulowania: ${writeError.message}`
        : "Serwer nie potwierdzil anulowania operacji sprzedazy."
    );
  }

  const impact = calculateSaleCancellationImpact(cancelledSale);
  const postWriteStock = await readFreshSaleStockForSeason(
    env,
    input.actorProfile,
    cancelledSale.seasonId,
    input.isOnline,
    cancelledSale.businessDate,
    { requireOpenSeason: false }
  );

  return {
    auditEvent: decodedAudit.event,
    cancelledSale,
    impact,
    message:
      "Operacja sprzedazy zostala anulowana. Dokument i powod pozostaly w historii.",
    postWriteAvailableWeightG: postWriteStock.context.availableWeightG,
    status: "CANCELLED"
  };
}

export function prepareSaleCancellation({
  actorProfile,
  auditId,
  cancelledAt,
  confirmed,
  createdAtDevice,
  createdAtServer,
  deviceId,
  isOnline,
  reason,
  sale,
  saleId
}: CancelSaleInput & {
  auditId: string;
  cancelledAt: unknown;
  createdAtDevice: unknown;
  createdAtServer: unknown;
  sale: SaleDocument;
}): PreparedSaleCancellation {
  assertAdminOnline(actorProfile, isOnline);

  if (!confirmed) {
    throw new Error("Potwierdz skutki anulowania operacji sprzedazy.");
  }

  const normalizedSaleId = requiredText(
    saleId,
    "Anulowanie wymaga identyfikatora operacji sprzedazy."
  );
  const normalizedReason = normalizeCancellationReason(reason);

  if (
    sale.id !== normalizedSaleId ||
    sale.status !== "ACTIVE" ||
    sale.cancelledAt !== null ||
    sale.cancelledBy !== null ||
    sale.cancellationReason !== null
  ) {
    throw new Error("Operacja sprzedazy nie jest juz aktywna. Odswiez dane.");
  }

  const saleUpdate: SaleCancellationUpdate = {
    cancellationReason: normalizedReason,
    cancelledAt,
    cancelledBy: actorProfile.uid,
    status: "CANCELLED"
  };
  const cancelledSale = { ...sale, ...saleUpdate };
  const impact = calculateSaleCancellationImpact(sale);
  const auditEvent = createAuditEventDraft({
    action: "SALE_CANCELLED",
    actorRoleSnapshot: actorProfile.role,
    actorUid: actorProfile.uid,
    afterSummary: saleCancellationAuditSummary(cancelledSale, impact),
    beforeSummary: saleCancellationAuditSummary(sale, calculateActiveSaleImpact(sale)),
    businessDate: sale.businessDate,
    createdAtDevice,
    createdAtServer,
    deviceId: requiredText(deviceId, "Anulowanie wymaga identyfikatora urzadzenia."),
    entityId: sale.id,
    entityType: "SALE",
    id: requiredText(auditId, "Anulowanie wymaga identyfikatora audytu."),
    reason: normalizedReason
  });

  return {
    auditEvent,
    cancelledSale,
    impact,
    saleUpdate
  };
}

export function calculateSaleCancellationImpact(
  sale: SaleDocument
): SaleCancellationImpact {
  const activeImpact = calculateActiveSaleImpact(sale);

  return {
    revenueImpactGrosz: -activeImpact.revenueImpactGrosz,
    stockImpactG: -activeImpact.stockImpactG
  };
}

export function createSaleCancellationAuditId(saleId: string): string {
  return `sale-cancelled-${requiredText(
    saleId,
    "Anulowanie wymaga identyfikatora operacji sprzedazy."
  )}`;
}

function calculateActiveSaleImpact(sale: SaleDocument): SaleCancellationImpact {
  if (sale.entryType === "SALE") {
    return {
      revenueImpactGrosz: sale.totalGrosz,
      stockImpactG: -sale.weightG
    };
  }

  if (sale.correctionDirection === "INCREASE_STOCK") {
    return {
      revenueImpactGrosz: -sale.totalGrosz,
      stockImpactG: sale.weightG
    };
  }

  if (sale.correctionDirection === "DECREASE_STOCK") {
    return {
      revenueImpactGrosz: sale.totalGrosz,
      stockImpactG: -sale.weightG
    };
  }

  throw new Error("Korekta sprzedazy nie ma prawidlowego kierunku.");
}

function saleCancellationAuditSummary(
  sale: SaleDocument,
  impact: SaleCancellationImpact
) {
  return {
    correctionDirection: sale.correctionDirection,
    entryType: sale.entryType,
    revenueImpactGrosz: impact.revenueImpactGrosz,
    saleId: sale.id,
    seasonId: sale.seasonId,
    status: sale.status,
    stockImpactG: impact.stockImpactG,
    totalGrosz: sale.totalGrosz,
    weightG: sale.weightG
  };
}

function auditMatchesCancellation(
  auditEvent: AuditEventDocument,
  sale: SaleDocument,
  reason: string
): boolean {
  return (
    auditEvent.action === "SALE_CANCELLED" &&
    auditEvent.entityType === "SALE" &&
    auditEvent.entityId === sale.id &&
    auditEvent.businessDate === sale.businessDate &&
    auditEvent.reason === reason &&
    auditEvent.afterSummary?.saleId === sale.id &&
    auditEvent.afterSummary.status === "CANCELLED"
  );
}

function normalizeCancellationReason(value: string): string {
  const normalized = value.trim();

  if (
    normalized.length < SALE_CANCELLATION_REASON_MIN_LENGTH ||
    normalized.length > SALE_CANCELLATION_REASON_MAX_LENGTH
  ) {
    throw new Error(
      `Powod anulowania musi miec od ${String(
        SALE_CANCELLATION_REASON_MIN_LENGTH
      )} do ${String(SALE_CANCELLATION_REASON_MAX_LENGTH)} znakow.`
    );
  }

  return normalized;
}

function assertAdminOnline(profile: UserProfile, isOnline: boolean): void {
  if (
    profile.role !== "ADMIN" ||
    !profile.active ||
    profile.registrationStatus !== "APPROVED"
  ) {
    throw new Error("Operacje sprzedazy moze anulowac tylko aktywny administrator.");
  }

  if (!isOnline) {
    throw new Error("Anulowanie operacji sprzedazy wymaga polaczenia z internetem.");
  }
}

function requiredText(value: string, message: string): string {
  const normalized = value.trim();

  if (!normalized) {
    throw new Error(message);
  }

  return normalized;
}
