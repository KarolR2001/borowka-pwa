import { getFirebaseServices } from "../config/firebaseServices";
import { SEASONS_COLLECTION } from "../domain/domainConfiguration";
import type { UserProfile } from "../domain/identity";
import { decodeHarvestSession } from "../harvest/harvestSessionDashboard";
import { HARVEST_SESSIONS_COLLECTION } from "../harvest/harvestSessionState";
import type { HarvestSessionDocument } from "../harvest/openHarvestSession";
import { decodeSeason } from "../seasons/seasons";
import type { PaymentMethod } from "./paymentConfirmation";
import {
  decodePaymentDocument,
  paymentTimestampToIso,
  type PaymentDocument
} from "./paymentWrite";
import { PAYMENTS_COLLECTION, type PaymentStatus } from "./pendingPayments";

type FirebaseEnv = Record<string, string | boolean | undefined>;

export type PaymentDirectoryStatusFilter = "ALL" | "ACTIVE" | "CANCELLED" | "IMPORTED";

export type PaymentDirectoryFilters = {
  method: PaymentMethod | "ALL";
  paidFromDate: string;
  paidToDate: string;
  seasonId: string;
  sessionFromDate: string;
  sessionToDate: string;
  status: PaymentDirectoryStatusFilter;
  workerId: string;
};

export const defaultPaymentDirectoryFilters: PaymentDirectoryFilters = {
  method: "ALL",
  paidFromDate: "",
  paidToDate: "",
  seasonId: "",
  sessionFromDate: "",
  sessionToDate: "",
  status: "ALL",
  workerId: ""
};

export type PaymentSourceSessionDetails = {
  businessDate: string;
  calculationBasis: HarvestSessionDocument["calculationBasisSnapshot"];
  closedAtIso: string | null;
  closedBy: string | null;
  planName: string;
  rateGrosz: number;
  revision: number;
  status: HarvestSessionDocument["status"];
  totalEntryCount: number;
  totalQuantityMilli: number;
  totalWeightG: number;
  unitLabel: string;
};

export type AdminPaymentDirectoryItem = {
  amountGrosz: number;
  cancellationReason: string | null;
  cancelledAtIso: string | null;
  cancelledBy: string | null;
  createdAtIso: string | null;
  createdBy: string;
  id: string;
  legacyImport: boolean;
  note: string | null;
  paidBusinessDate: string;
  paymentMethod: PaymentMethod;
  seasonId: string;
  seasonName: string;
  sessionId: string;
  sourceSession: PaymentSourceSessionDetails | null;
  status: PaymentStatus;
  workerId: string;
  workerName: string;
};

export type AdminPaymentDirectoryResult = {
  invalidPaymentCount: number;
  invalidSeasonCount: number;
  invalidSessionCount: number;
  missingSourceSessionCount: number;
  payments: AdminPaymentDirectoryItem[];
};

export type AdminPaymentSummary = {
  activeAmountGrosz: number;
  activeCount: number;
  cancelledCount: number;
  importedCount: number;
  totalCount: number;
};

type RawDocument = {
  data: unknown;
  id: string;
};

export async function listAdminPayments(
  env: FirebaseEnv,
  actorProfile: UserProfile
): Promise<AdminPaymentDirectoryResult> {
  assertAdmin(actorProfile);

  const { firestore } = await getFirebaseServices(env);
  const { collection, getDocsFromServer } = await import("firebase/firestore");
  const [paymentSnapshot, sessionSnapshot, seasonSnapshot] = await Promise.all([
    getDocsFromServer(collection(firestore, PAYMENTS_COLLECTION)),
    getDocsFromServer(collection(firestore, HARVEST_SESSIONS_COLLECTION)),
    getDocsFromServer(collection(firestore, SEASONS_COLLECTION))
  ]);

  return buildAdminPaymentDirectory({
    paymentDocuments: toRawDocuments(paymentSnapshot.docs),
    seasonDocuments: toRawDocuments(seasonSnapshot.docs),
    sessionDocuments: toRawDocuments(sessionSnapshot.docs)
  });
}

export function buildAdminPaymentDirectory({
  paymentDocuments,
  seasonDocuments,
  sessionDocuments
}: {
  paymentDocuments: readonly RawDocument[];
  seasonDocuments: readonly RawDocument[];
  sessionDocuments: readonly RawDocument[];
}): AdminPaymentDirectoryResult {
  const sessions = new Map<
    string,
    Extract<ReturnType<typeof decodeHarvestSession>, { status: "FOUND" }>["session"]
  >();
  const seasonNames = new Map<string, string>();
  let invalidSessionCount = 0;
  let invalidSeasonCount = 0;

  for (const document of sessionDocuments) {
    const decoded = decodeHarvestSession(document.id, document.data);

    if (decoded.status === "FOUND") {
      sessions.set(decoded.session.id, decoded.session);
    } else {
      invalidSessionCount += 1;
    }
  }

  for (const document of seasonDocuments) {
    const decoded = decodeSeason(document.id, document.data);

    if (decoded.status === "FOUND") {
      seasonNames.set(decoded.season.id, decoded.season.name);
    } else {
      invalidSeasonCount += 1;
    }
  }

  const payments: AdminPaymentDirectoryItem[] = [];
  let invalidPaymentCount = 0;
  let missingSourceSessionCount = 0;

  for (const document of paymentDocuments) {
    const payment = decodePaymentDocument(document.id, document.data);

    if (!payment) {
      invalidPaymentCount += 1;
      continue;
    }

    const sourceSession = sessions.get(payment.sessionId);

    if (!sourceSession) {
      missingSourceSessionCount += 1;
    }

    payments.push(
      createDirectoryItem(
        payment,
        seasonNames.get(payment.seasonId) ?? payment.seasonId,
        sourceSession
      )
    );
  }

  return {
    invalidPaymentCount,
    invalidSeasonCount,
    invalidSessionCount,
    missingSourceSessionCount,
    payments: payments.sort(comparePayments)
  };
}

export function filterAdminPayments(
  payments: readonly AdminPaymentDirectoryItem[],
  filters: PaymentDirectoryFilters
): AdminPaymentDirectoryItem[] {
  return payments.filter((payment) => {
    const sessionDate = payment.sourceSession?.businessDate ?? null;

    return (
      (!filters.seasonId || payment.seasonId === filters.seasonId) &&
      (!filters.workerId || payment.workerId === filters.workerId) &&
      (filters.method === "ALL" || payment.paymentMethod === filters.method) &&
      matchesStatus(payment, filters.status) &&
      (!filters.paidFromDate || payment.paidBusinessDate >= filters.paidFromDate) &&
      (!filters.paidToDate || payment.paidBusinessDate <= filters.paidToDate) &&
      (!filters.sessionFromDate ||
        (sessionDate !== null && sessionDate >= filters.sessionFromDate)) &&
      (!filters.sessionToDate ||
        (sessionDate !== null && sessionDate <= filters.sessionToDate))
    );
  });
}

export function summarizeAdminPayments(
  payments: readonly AdminPaymentDirectoryItem[]
): AdminPaymentSummary {
  return payments.reduce<AdminPaymentSummary>(
    (summary, payment) => {
      summary.totalCount += 1;

      if (payment.status === "ACTIVE") {
        summary.activeCount += 1;
        summary.activeAmountGrosz += payment.amountGrosz;
      } else {
        summary.cancelledCount += 1;
      }

      if (payment.legacyImport) {
        summary.importedCount += 1;
      }

      return summary;
    },
    {
      activeAmountGrosz: 0,
      activeCount: 0,
      cancelledCount: 0,
      importedCount: 0,
      totalCount: 0
    }
  );
}

export function createAdminPaymentCsv(
  payments: readonly AdminPaymentDirectoryItem[]
): string {
  const headers = [
    "Id wyplaty",
    "Id sesji",
    "Sezon",
    "Zbieracz",
    "Data wyplaty",
    "Data sesji",
    "Kwota PLN",
    "Metoda",
    "Status",
    "Import historyczny",
    "Autor wyplaty",
    "Czas serwera",
    "Notatka",
    "Anulowal",
    "Czas anulowania",
    "Powod anulowania"
  ];
  const rows = payments.map((payment) => [
    payment.id,
    payment.sessionId,
    payment.seasonName,
    payment.workerName,
    payment.paidBusinessDate,
    payment.sourceSession?.businessDate ?? "",
    formatCsvMoney(payment.amountGrosz),
    payment.paymentMethod,
    payment.status,
    payment.legacyImport ? "TAK" : "NIE",
    payment.createdBy,
    payment.createdAtIso ?? "",
    payment.note ?? "",
    payment.cancelledBy ?? "",
    payment.cancelledAtIso ?? "",
    payment.cancellationReason ?? ""
  ]);

  return `\uFEFFsep=;\r\n${[headers, ...rows]
    .map((row) => row.map(escapeCsvCell).join(";"))
    .join("\r\n")}\r\n`;
}

export function createAdminPaymentCsvFilename(exportedAtIso: string): string {
  const date = new Date(exportedAtIso);

  if (Number.isNaN(date.getTime())) {
    throw new Error("Eksport wyplat wymaga poprawnego czasu.");
  }

  return `borowka-wyplaty-${date.toISOString().replace(/[:.]/g, "-")}.csv`;
}

function createDirectoryItem(
  payment: PaymentDocument,
  seasonName: string,
  sourceSession:
    | Extract<ReturnType<typeof decodeHarvestSession>, { status: "FOUND" }>["session"]
    | undefined
): AdminPaymentDirectoryItem {
  return {
    amountGrosz: payment.amountGrosz,
    cancellationReason: payment.cancellationReason,
    cancelledAtIso: paymentTimestampToIso(payment.cancelledAt),
    cancelledBy: payment.cancelledBy,
    createdAtIso: paymentTimestampToIso(payment.createdAtServer),
    createdBy: payment.createdBy,
    id: payment.id,
    legacyImport: payment.legacyImport,
    note: payment.note,
    paidBusinessDate: payment.paidBusinessDate,
    paymentMethod: payment.paymentMethod,
    seasonId: payment.seasonId,
    seasonName,
    sessionId: payment.sessionId,
    sourceSession: sourceSession
      ? {
          businessDate: sourceSession.businessDate,
          calculationBasis: sourceSession.calculationBasisSnapshot,
          closedAtIso: paymentTimestampToIso(
            sourceSession.closedAtServer ?? sourceSession.closedAtDevice
          ),
          closedBy: sourceSession.closedBy,
          planName: sourceSession.planNameSnapshot,
          rateGrosz: sourceSession.rateGroszSnapshot,
          revision: sourceSession.revision,
          status: sourceSession.status,
          totalEntryCount: sourceSession.totalEntryCount,
          totalQuantityMilli: sourceSession.totalQuantityMilli,
          totalWeightG: sourceSession.totalWeightG,
          unitLabel: sourceSession.unitLabelPluralSnapshot
        }
      : null,
    status: payment.status,
    workerId: payment.workerId,
    workerName: payment.workerNameSnapshot
  };
}

function matchesStatus(
  payment: AdminPaymentDirectoryItem,
  status: PaymentDirectoryStatusFilter
): boolean {
  if (status === "ALL") {
    return true;
  }

  if (status === "IMPORTED") {
    return payment.legacyImport;
  }

  return payment.status === status;
}

function comparePayments(
  left: AdminPaymentDirectoryItem,
  right: AdminPaymentDirectoryItem
): number {
  return (
    right.paidBusinessDate.localeCompare(left.paidBusinessDate) ||
    (right.createdAtIso ?? "").localeCompare(left.createdAtIso ?? "") ||
    left.workerName.localeCompare(right.workerName, "pl") ||
    left.id.localeCompare(right.id)
  );
}

function toRawDocuments(
  documents: readonly {
    data: (options?: { serverTimestamps?: "estimate" }) => unknown;
    id: string;
  }[]
): RawDocument[] {
  return documents.map((document) => ({
    data: document.data({ serverTimestamps: "estimate" }),
    id: document.id
  }));
}

function assertAdmin(profile: UserProfile): void {
  if (
    !profile.active ||
    profile.registrationStatus !== "APPROVED" ||
    profile.role !== "ADMIN"
  ) {
    throw new Error("Lista wyplat wymaga aktywnego administratora.");
  }
}

function formatCsvMoney(amountGrosz: number): string {
  const whole = Math.trunc(amountGrosz / 100);
  const fraction = String(amountGrosz % 100).padStart(2, "0");

  return `${String(whole)},${fraction}`;
}

function escapeCsvCell(value: string): string {
  const protectedValue = /^[=+\-@]/.test(value) ? `'${value}` : value;

  return `"${protectedValue.replace(/"/g, '""')}"`;
}
