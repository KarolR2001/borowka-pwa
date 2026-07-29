import { getFirebaseServices } from "../config/firebaseServices";
import { SEASONS_COLLECTION } from "../domain/domainConfiguration";
import type { UserProfile } from "../domain/identity";
import { HARVEST_SESSIONS_COLLECTION } from "../harvest/harvestSessionState";
import { PAYMENTS_COLLECTION } from "../payments/pendingPayments";
import { buildPickerHarvestList, type PickerHarvestListItem } from "./pickerHarvestList";
import {
  buildPickerPaymentList,
  type PickerPaymentListItem,
  type PickerPaymentSessionSummary
} from "./pickerPaymentList";
import { readPickerReportExportSetting } from "./pickerReportExportSettings";

type FirebaseEnv = Record<string, string | boolean | undefined>;
type RawDocument = { data: unknown; id: string };

export type PickerDataExportFilters = {
  fromDate: string;
  seasonId: string;
  toDate: string;
};

export const defaultPickerDataExportFilters: PickerDataExportFilters = {
  fromDate: "",
  seasonId: "",
  toDate: ""
};

export type PickerDataExportResult = {
  dataSource: "SERVER" | "CACHE";
  enabled: boolean;
  invalidPaymentCount: number;
  invalidSeasonCount: number;
  invalidSessionCount: number;
  missingSourceSessionCount: number;
  payments: PickerPaymentListItem[];
  refreshedAtIso: string;
  seasons: { id: string; name: string }[];
  sessions: PickerHarvestListItem[];
  sessionSummaries: PickerPaymentSessionSummary[];
  settingUpdatedAtIso: string;
  workerId: string;
};

export type FilteredPickerDataExport = {
  filters: PickerDataExportFilters;
  payments: PickerPaymentListItem[];
  seasonLabel: string;
  sessions: PickerHarvestListItem[];
  summary: {
    accruedAmountGrosz: number;
    cancelledPaymentAmountGrosz: number;
    paidAmountGrosz: number;
    remainingAmountGrosz: number;
  };
};

export async function loadPickerDataExport(
  env: FirebaseEnv,
  input: {
    actorProfile: UserProfile;
    isOnline: boolean;
  }
): Promise<PickerDataExportResult> {
  const workerId = assertPicker(input.actorProfile);
  const setting = await readPickerReportExportSetting(env, input);
  const refreshedAtIso = new Date().toISOString();

  if (!setting.enabled) {
    return {
      dataSource: setting.dataSource,
      enabled: false,
      invalidPaymentCount: 0,
      invalidSeasonCount: 0,
      invalidSessionCount: 0,
      missingSourceSessionCount: 0,
      payments: [],
      refreshedAtIso,
      seasons: [],
      sessions: [],
      sessionSummaries: [],
      settingUpdatedAtIso: setting.updatedAtIso,
      workerId
    };
  }

  const { firestore } = await getFirebaseServices(env);
  const { collection, getDocsFromCache, getDocsFromServer, orderBy, query, where } =
    await import("firebase/firestore");
  const readDocuments = input.isOnline ? getDocsFromServer : getDocsFromCache;
  const [sessionSnapshot, paymentSnapshot, seasonSnapshot] = await Promise.all([
    readDocuments(
      query(
        collection(firestore, HARVEST_SESSIONS_COLLECTION),
        where("workerId", "==", workerId),
        orderBy("businessDate", "desc"),
        orderBy("createdAtServer", "desc")
      )
    ),
    readDocuments(
      query(
        collection(firestore, PAYMENTS_COLLECTION),
        where("workerId", "==", workerId),
        orderBy("paidBusinessDate", "desc")
      )
    ),
    readDocuments(collection(firestore, SEASONS_COLLECTION))
  ]);
  const dataSource =
    setting.dataSource === "CACHE" ||
    sessionSnapshot.metadata.fromCache ||
    paymentSnapshot.metadata.fromCache ||
    seasonSnapshot.metadata.fromCache
      ? "CACHE"
      : "SERVER";
  const sessionDocuments = toRawDocuments(sessionSnapshot.docs);
  const seasonDocuments = toRawDocuments(seasonSnapshot.docs);
  const harvestResult = buildPickerHarvestList({
    actorProfile: input.actorProfile,
    dataSource,
    refreshedAtIso,
    seasonDocuments,
    sessionDocuments,
    syncDocuments: []
  });
  const paymentResult = buildPickerPaymentList({
    actorProfile: input.actorProfile,
    dataSource,
    paymentDocuments: toRawDocuments(paymentSnapshot.docs),
    refreshedAtIso,
    seasonDocuments,
    sessionDocuments
  });

  return {
    dataSource,
    enabled: true,
    invalidPaymentCount: paymentResult.invalidPaymentCount,
    invalidSeasonCount: Math.max(
      harvestResult.invalidSeasonCount,
      paymentResult.invalidSeasonCount
    ),
    invalidSessionCount: Math.max(
      harvestResult.invalidSessionCount,
      paymentResult.invalidSessionCount
    ),
    missingSourceSessionCount: paymentResult.missingSourceSessionCount,
    payments: paymentResult.payments,
    refreshedAtIso,
    seasons: harvestResult.seasons,
    sessions: harvestResult.items,
    sessionSummaries: paymentResult.sessions,
    settingUpdatedAtIso: setting.updatedAtIso,
    workerId
  };
}

export function filterPickerDataExport(
  result: PickerDataExportResult,
  filters: PickerDataExportFilters
): FilteredPickerDataExport {
  if (!result.enabled) {
    throw new Error("Eksport wlasnych danych jest wylaczony.");
  }

  const normalizedFilters = normalizeFilters(filters);
  const sessions = result.sessions.filter(
    (session) =>
      (!normalizedFilters.seasonId || session.seasonId === normalizedFilters.seasonId) &&
      (!normalizedFilters.fromDate ||
        session.businessDate >= normalizedFilters.fromDate) &&
      (!normalizedFilters.toDate || session.businessDate <= normalizedFilters.toDate)
  );
  const payments = result.payments.filter(
    (payment) =>
      (!normalizedFilters.seasonId || payment.seasonId === normalizedFilters.seasonId) &&
      (!normalizedFilters.fromDate ||
        payment.paidBusinessDate >= normalizedFilters.fromDate) &&
      (!normalizedFilters.toDate || payment.paidBusinessDate <= normalizedFilters.toDate)
  );
  const sessionIds = new Set(sessions.map((session) => session.sessionId));
  const officialSessionIds = new Set(
    result.sessionSummaries
      .filter(
        (session) =>
          sessionIds.has(session.sessionId) &&
          (session.status === "CLOSED" || session.status === "PAID")
      )
      .map((session) => session.sessionId)
  );
  const accruedAmountGrosz = safeSum(
    sessions
      .filter((session) => officialSessionIds.has(session.sessionId))
      .map((session) => session.amountDueGrosz ?? 0)
  );
  const paidAmountGrosz = safeSum(
    payments
      .filter((payment) => payment.status === "ACTIVE")
      .map((payment) => payment.amountGrosz)
  );

  return {
    filters: normalizedFilters,
    payments,
    seasonLabel:
      result.seasons.find((season) => season.id === normalizedFilters.seasonId)?.name ??
      (normalizedFilters.seasonId || "Wszystkie sezony"),
    sessions,
    summary: {
      accruedAmountGrosz,
      cancelledPaymentAmountGrosz: safeSum(
        payments
          .filter((payment) => payment.status === "CANCELLED")
          .map((payment) => payment.amountGrosz)
      ),
      paidAmountGrosz,
      remainingAmountGrosz: accruedAmountGrosz - paidAmountGrosz
    }
  };
}

export function createPickerDataExportCsv({
  exportedAtIso,
  filtered,
  result
}: {
  exportedAtIso: string;
  filtered: FilteredPickerDataExport;
  result: PickerDataExportResult;
}): string {
  const normalizedExportedAtIso = normalizeIso(exportedAtIso);
  const sessionMap = new Map(
    result.sessions.map((session) => [session.sessionId, session])
  );
  const metadataRows = [
    ["Raport", "Wlasne dane pickera"],
    ["Wygenerowano UTC", normalizedExportedAtIso],
    ["Zrodlo danych", result.dataSource === "SERVER" ? "SERWER" : "CACHE"],
    [
      "Kompletnosc",
      result.dataSource === "SERVER" ? "PELNY ODCZYT SERWERA" : "NIEPELNY - DANE Z CACHE"
    ],
    ["Id zbieracza", result.workerId],
    ["Sezon", filtered.seasonLabel],
    ["Zakres od", filtered.filters.fromDate || "bez ograniczenia"],
    ["Zakres do", filtered.filters.toDate || "bez ograniczenia"],
    ["Naliczono PLN", formatCsvMoney(filtered.summary.accruedAmountGrosz)],
    ["Wyplacono PLN", formatCsvMoney(filtered.summary.paidAmountGrosz)],
    ["Pozostalo PLN", formatCsvMoney(filtered.summary.remainingAmountGrosz)],
    [
      "Anulowane wyplaty PLN",
      formatCsvMoney(filtered.summary.cancelledPaymentAmountGrosz)
    ]
  ];
  const headers = [
    "Typ rekordu",
    "Id sezonu",
    "Sezon",
    "Id sesji",
    "Data sesji",
    "Status sesji",
    "Plan",
    "Jednostka",
    "Ilosc",
    "Ilosc milli",
    "Kg",
    "Gramy",
    "Naliczenie PLN",
    "Naliczenie grosze",
    "Id wyplaty",
    "Data wyplaty",
    "Status wyplaty",
    "Metoda wyplaty",
    "Kwota wyplaty PLN",
    "Kwota wyplaty grosze"
  ];
  const sessionRows = filtered.sessions.map((session) => [
    "NALICZENIE",
    session.seasonId,
    session.seasonName,
    session.sessionId,
    session.businessDate,
    session.status,
    session.planName,
    session.unitLabelPlural,
    formatCsvDecimal(session.totalQuantityMilli),
    String(session.totalQuantityMilli),
    formatCsvDecimal(session.totalWeightG),
    String(session.totalWeightG),
    session.amountDueGrosz === null ? "" : formatCsvMoney(session.amountDueGrosz),
    session.amountDueGrosz === null ? "" : String(session.amountDueGrosz),
    "",
    "",
    "",
    "",
    "",
    ""
  ]);
  const paymentRows = filtered.payments.map((payment) => {
    const session = sessionMap.get(payment.sessionId);

    return [
      "WYPLATA",
      payment.seasonId,
      payment.seasonName,
      payment.sessionId,
      payment.sessionBusinessDate ?? "",
      session?.status ?? "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      payment.id,
      payment.paidBusinessDate,
      payment.status,
      payment.paymentMethod,
      formatCsvMoney(payment.amountGrosz),
      String(payment.amountGrosz)
    ];
  });
  const rows = [...metadataRows, [], headers, ...sessionRows, ...paymentRows];

  return `\uFEFFsep=;\r\n${rows
    .map((row) => row.map(escapeCsvCell).join(";"))
    .join("\r\n")}\r\n`;
}

export function createPickerDataExportFilename(exportedAtIso: string): string {
  return `borowka-moje-dane-${normalizeIso(exportedAtIso).replace(/[:.]/g, "-")}.csv`;
}

function normalizeFilters(filters: PickerDataExportFilters): PickerDataExportFilters {
  const fromDate = normalizeOptionalDate(filters.fromDate);
  const toDate = normalizeOptionalDate(filters.toDate);
  const seasonId = filters.seasonId.trim();

  if (fromDate && toDate && fromDate > toDate) {
    throw new Error("Data poczatkowa eksportu nie moze byc pozniejsza od koncowej.");
  }

  return { fromDate, seasonId, toDate };
}

function normalizeOptionalDate(value: string): string {
  const normalized = value.trim();

  if (normalized && !/^\d{4}-\d{2}-\d{2}$/.test(normalized)) {
    throw new Error("Eksport zawiera nieprawidlowa date.");
  }

  return normalized;
}

function normalizeIso(value: string): string {
  const normalized = value.trim();
  const date = new Date(normalized);

  if (!normalized || Number.isNaN(date.getTime())) {
    throw new Error("Eksport wymaga poprawnego czasu wygenerowania.");
  }

  return date.toISOString();
}

function formatCsvMoney(amountGrosz: number): string {
  const sign = amountGrosz < 0 ? "-" : "";
  const absolute = Math.abs(amountGrosz);

  return `${sign}${String(Math.trunc(absolute / 100))},${String(absolute % 100).padStart(2, "0")}`;
}

function formatCsvDecimal(valueMilli: number): string {
  const sign = valueMilli < 0 ? "-" : "";
  const absolute = Math.abs(valueMilli);
  const whole = Math.trunc(absolute / 1000);
  const fraction = String(absolute % 1000)
    .padStart(3, "0")
    .replace(/0+$/, "");

  return `${sign}${String(whole)}${fraction ? `,${fraction}` : ""}`;
}

function escapeCsvCell(value: string): string {
  const protectedValue = /^[=+\-@]/.test(value) ? `'${value}` : value;

  return `"${protectedValue.replace(/"/g, '""')}"`;
}

function safeSum(values: readonly number[]): number {
  let total = 0;

  for (const value of values) {
    if (!Number.isSafeInteger(value)) {
      throw new Error("Eksport zawiera kwote poza bezpiecznym zakresem.");
    }

    total += value;

    if (!Number.isSafeInteger(total)) {
      throw new Error("Suma eksportu przekracza bezpieczny zakres.");
    }
  }

  return total;
}

function assertPicker(profile: UserProfile): string {
  if (
    !profile.active ||
    profile.registrationStatus !== "APPROVED" ||
    profile.role !== "PICKER" ||
    !profile.workerId
  ) {
    throw new Error("Eksport wlasnych danych wymaga aktywnego pickera z workerId.");
  }

  return profile.workerId;
}

function toRawDocuments(
  documents: readonly {
    data(options?: { serverTimestamps?: "estimate" }): unknown;
    id: string;
  }[]
): RawDocument[] {
  return documents.map((document) => ({
    data: document.data({ serverTimestamps: "estimate" }),
    id: document.id
  }));
}
