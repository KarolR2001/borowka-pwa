import { getFirebaseServices } from "../config/firebaseServices";
import { SEASONS_COLLECTION } from "../domain/domainConfiguration";
import { decodeUserProfile, type UserProfile } from "../domain/identity";
import { decodeSeason } from "../seasons/seasons";
import {
  SALES_COLLECTION,
  decodeSaleDocument,
  type SaleDocument
} from "./saleStockPreflight";

type FirebaseEnv = Record<string, string | boolean | undefined>;

export const USERS_COLLECTION = "users";

export type SaleDirectoryFilters = {
  authorUid: string;
  entryType: SaleDocument["entryType"] | "ALL";
  fromDate: string;
  seasonId: string;
  status: SaleDocument["status"] | "ALL";
  toDate: string;
};

export const defaultSaleDirectoryFilters: SaleDirectoryFilters = {
  authorUid: "",
  entryType: "ALL",
  fromDate: "",
  seasonId: "",
  status: "ALL",
  toDate: ""
};

export type AdminSaleDirectoryItem = SaleDocument & {
  authorName: string;
  cancelledAtIso: string | null;
  cancelledByName: string | null;
  createdAtIso: string | null;
  seasonName: string;
};

export type AdminSaleDirectoryResult = {
  invalidSaleCount: number;
  invalidSeasonCount: number;
  invalidUserCount: number;
  sales: AdminSaleDirectoryItem[];
};

export type AdminSaleDirectorySummary = {
  activeCount: number;
  activeRevenueGrosz: number;
  cancelledCount: number;
  correctionCount: number;
  importedCount: number;
  ordinarySaleCount: number;
  totalCount: number;
};

type RawDocument = {
  data: unknown;
  id: string;
};

export async function listAdminSales(
  env: FirebaseEnv,
  actorProfile: UserProfile
): Promise<AdminSaleDirectoryResult> {
  assertAdmin(actorProfile);
  const { firestore } = await getFirebaseServices(env);
  const { collection, getDocsFromServer } = await import("firebase/firestore");
  const [saleSnapshot, seasonSnapshot, userSnapshot] = await Promise.all([
    getDocsFromServer(collection(firestore, SALES_COLLECTION)),
    getDocsFromServer(collection(firestore, SEASONS_COLLECTION)),
    getDocsFromServer(collection(firestore, USERS_COLLECTION))
  ]);

  return buildAdminSaleDirectory({
    saleDocuments: toRawDocuments(saleSnapshot.docs),
    seasonDocuments: toRawDocuments(seasonSnapshot.docs),
    userDocuments: toRawDocuments(userSnapshot.docs)
  });
}

export function buildAdminSaleDirectory({
  saleDocuments,
  seasonDocuments,
  userDocuments
}: {
  saleDocuments: readonly RawDocument[];
  seasonDocuments: readonly RawDocument[];
  userDocuments: readonly RawDocument[];
}): AdminSaleDirectoryResult {
  const seasonNames = new Map<string, string>();
  const userNames = new Map<string, string>();
  let invalidSeasonCount = 0;
  let invalidUserCount = 0;

  for (const document of seasonDocuments) {
    const decoded = decodeSeason(document.id, document.data);

    if (decoded.status === "FOUND") {
      seasonNames.set(decoded.season.id, decoded.season.name);
    } else {
      invalidSeasonCount += 1;
    }
  }

  for (const document of userDocuments) {
    const decoded = decodeUserProfile(document.id, document.data);

    if (decoded.status === "FOUND") {
      userNames.set(decoded.profile.uid, decoded.profile.displayName);
    } else {
      invalidUserCount += 1;
    }
  }

  const sales: AdminSaleDirectoryItem[] = [];
  let invalidSaleCount = 0;

  for (const document of saleDocuments) {
    const sale = decodeSaleDocument(document.id, document.data);

    if (!sale) {
      invalidSaleCount += 1;
      continue;
    }

    sales.push({
      ...sale,
      authorName: userNames.get(sale.createdBy) ?? sale.createdBy,
      cancelledAtIso: saleTimestampToIso(sale.cancelledAt),
      cancelledByName: sale.cancelledBy
        ? (userNames.get(sale.cancelledBy) ?? sale.cancelledBy)
        : null,
      createdAtIso: saleTimestampToIso(sale.createdAtServer),
      seasonName: seasonNames.get(sale.seasonId) ?? sale.seasonId
    });
  }

  return {
    invalidSaleCount,
    invalidSeasonCount,
    invalidUserCount,
    sales: sales.sort(compareSales)
  };
}

export function filterAdminSales(
  sales: readonly AdminSaleDirectoryItem[],
  filters: SaleDirectoryFilters
): AdminSaleDirectoryItem[] {
  return sales.filter(
    (sale) =>
      (!filters.seasonId || sale.seasonId === filters.seasonId) &&
      (!filters.authorUid || sale.createdBy === filters.authorUid) &&
      (filters.entryType === "ALL" || sale.entryType === filters.entryType) &&
      (filters.status === "ALL" || sale.status === filters.status) &&
      (!filters.fromDate || sale.businessDate >= filters.fromDate) &&
      (!filters.toDate || sale.businessDate <= filters.toDate)
  );
}

export function summarizeAdminSales(
  sales: readonly AdminSaleDirectoryItem[]
): AdminSaleDirectorySummary {
  return sales.reduce<AdminSaleDirectorySummary>(
    (summary, sale) => {
      summary.totalCount += 1;

      if (sale.entryType === "SALE") {
        summary.ordinarySaleCount += 1;
      } else {
        summary.correctionCount += 1;
      }

      if (sale.legacyImport) {
        summary.importedCount += 1;
      }

      if (sale.status === "CANCELLED") {
        summary.cancelledCount += 1;
        return summary;
      }

      summary.activeCount += 1;
      summary.activeRevenueGrosz = safeAdd(
        summary.activeRevenueGrosz,
        activeSaleRevenueImpact(sale)
      );
      return summary;
    },
    {
      activeCount: 0,
      activeRevenueGrosz: 0,
      cancelledCount: 0,
      correctionCount: 0,
      importedCount: 0,
      ordinarySaleCount: 0,
      totalCount: 0
    }
  );
}

export function activeSaleRevenueImpact(sale: SaleDocument): number {
  if (sale.status === "CANCELLED") {
    return 0;
  }

  if (sale.entryType === "CORRECTION" && sale.correctionDirection === "INCREASE_STOCK") {
    return -sale.totalGrosz;
  }

  return sale.totalGrosz;
}

export function saleTimestampToIso(value: unknown): string | null {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value.toISOString();
  }

  if (isTimestampLike(value)) {
    const date = value.toDate();
    return date instanceof Date && !Number.isNaN(date.getTime())
      ? date.toISOString()
      : null;
  }

  if (typeof value === "string") {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date.toISOString();
  }

  return null;
}

function compareSales(
  left: AdminSaleDirectoryItem,
  right: AdminSaleDirectoryItem
): number {
  return (
    right.businessDate.localeCompare(left.businessDate) ||
    (right.createdAtIso ?? "").localeCompare(left.createdAtIso ?? "") ||
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
    profile.role !== "ADMIN" ||
    !profile.active ||
    profile.registrationStatus !== "APPROVED"
  ) {
    throw new Error("Lista sprzedazy wymaga aktywnego administratora.");
  }
}

function safeAdd(left: number, right: number): number {
  const result = left + right;

  if (!Number.isSafeInteger(result)) {
    throw new Error("Suma przychodu sprzedazy przekracza bezpieczny zakres.");
  }

  return result;
}

function isTimestampLike(value: unknown): value is { toDate: () => unknown } {
  return (
    value !== null &&
    typeof value === "object" &&
    "toDate" in value &&
    typeof value.toDate === "function"
  );
}
