import { strToU8, zipSync } from "fflate";
import type { Query, QuerySnapshot } from "firebase/firestore";

import { APP_META } from "../config/appMeta";
import { getFirebaseServices } from "../config/firebaseServices";
import type { UserProfile } from "../domain/identity";

type FirebaseEnv = Record<string, string | boolean | undefined>;

export const FULL_CLOUD_EXPORT_FORMAT = "BOROWKA_FULL_CLOUD_EXPORT";
export const FULL_CLOUD_EXPORT_FORMAT_VERSION = 1;
export const FULL_CLOUD_EXPORT_PAGE_SIZE = 500;
export const FULL_CLOUD_EXPORT_COLLECTIONS = [
  "appSettings",
  "auditEvents",
  "devices",
  "harvestEntries",
  "harvestSessions",
  "issueReports",
  "operationalStockMovements",
  "payments",
  "registrationInvitations",
  "sales",
  "seasons",
  "settlementPlans",
  "users",
  "workerRateVersions",
  "workers"
] as const;

export type FullCloudExportCollectionName =
  (typeof FULL_CLOUD_EXPORT_COLLECTIONS)[number];

export type FullCloudExportSourceDocument = {
  data: unknown;
  id: string;
};

export type FullCloudExportSourceCollection = {
  documents: readonly FullCloudExportSourceDocument[];
  name: FullCloudExportCollectionName;
};

export type FullCloudExportOmission = {
  collection: FullCloudExportCollectionName;
  documentId: string;
  reason: string;
};

export type FullCloudExportSeasonTotals = {
  accruedGrosz: number;
  activePaymentGrosz: number;
  activeRevenueGrosz: number;
  availableWeightG: number;
  confirmedHarvestWeightG: number;
  entryCount: number;
  importedDocumentCount: number;
  paymentCount: number;
  saleCount: number;
  seasonId: string;
  sessionCount: number;
  soldWeightG: number;
};

export type FullCloudExportManifest = {
  application: {
    buildDate: string;
    buildId: string;
    calculationVersion: string;
    name: string;
    schemaVersion: string;
    version: string;
  };
  collections: {
    documentCount: number;
    legacyDocumentCount: number;
    name: FullCloudExportCollectionName;
    path: string;
  }[];
  environment: {
    appEnvironment: string;
    firebaseProjectId: string;
    source: "FIRESTORE_SERVER";
  };
  exportedAtIso: string;
  exportedBy: {
    email: string;
    role: "ADMIN";
    uid: string;
  };
  files: {
    byteLength: number;
    documentCount: number | null;
    path: string;
    sha256: string;
  }[];
  format: {
    name: typeof FULL_CLOUD_EXPORT_FORMAT;
    purpose: "PORTABLE_ARCHIVE";
    version: typeof FULL_CLOUD_EXPORT_FORMAT_VERSION;
  };
  omissions: {
    count: number;
    path: "errors.json";
  };
  seasonTotals: FullCloudExportSeasonTotals[];
  summary: {
    collectionCount: number;
    documentCount: number;
    legacyDocumentCount: number;
  };
};

export type FullCloudExportArchive = {
  bytes: Uint8Array;
  filename: string;
  manifest: FullCloudExportManifest;
  omissions: FullCloudExportOmission[];
};

export type FullCloudExportProgress = {
  completedCollectionCount: number;
  currentCollection: FullCloudExportCollectionName;
  totalCollectionCount: number;
};

export async function loadFullCloudExport(
  env: FirebaseEnv,
  input: {
    actorProfile: UserProfile;
    exportedAtIso?: string;
    isOnline: boolean;
    onProgress?: (progress: FullCloudExportProgress) => void;
  }
): Promise<FullCloudExportArchive> {
  assertAdminOnline(input.actorProfile, input.isOnline);
  const projectId = requiredText(
    env.VITE_FIREBASE_PROJECT_ID,
    "Pelny eksport wymaga identyfikatora projektu Firebase."
  );
  const { firestore } = await getFirebaseServices(env);
  const { collection, documentId, getDocsFromServer, limit, orderBy, query, startAfter } =
    await import("firebase/firestore");
  const collections: FullCloudExportSourceCollection[] = [];

  for (const [index, collectionName] of FULL_CLOUD_EXPORT_COLLECTIONS.entries()) {
    const documents: FullCloudExportSourceDocument[] = [];
    let lastDocumentId: string | null = null;

    for (;;) {
      const pageQuery: Query =
        lastDocumentId === null
          ? query(
              collection(firestore, collectionName),
              orderBy(documentId()),
              limit(FULL_CLOUD_EXPORT_PAGE_SIZE)
            )
          : query(
              collection(firestore, collectionName),
              orderBy(documentId()),
              startAfter(lastDocumentId),
              limit(FULL_CLOUD_EXPORT_PAGE_SIZE)
            );
      const snapshot: QuerySnapshot = await getDocsFromServer(pageQuery);

      for (const document of snapshot.docs) {
        documents.push({
          data: document.data({ serverTimestamps: "estimate" }),
          id: document.id
        });
      }

      if (snapshot.docs.length < FULL_CLOUD_EXPORT_PAGE_SIZE) {
        break;
      }

      lastDocumentId = snapshot.docs.at(-1)?.id ?? null;
      if (lastDocumentId === null) {
        throw new Error("Eksport nie moze kontynuowac stronicowania kolekcji.");
      }
    }

    collections.push({ documents, name: collectionName });
    input.onProgress?.({
      completedCollectionCount: index + 1,
      currentCollection: collectionName,
      totalCollectionCount: FULL_CLOUD_EXPORT_COLLECTIONS.length
    });
  }

  return createFullCloudExportArchive({
    actorProfile: input.actorProfile,
    appEnvironment: APP_META.environment,
    collections,
    exportedAtIso: input.exportedAtIso ?? new Date().toISOString(),
    firebaseProjectId: projectId
  });
}

export async function createFullCloudExportArchive({
  actorProfile,
  appEnvironment,
  collections,
  exportedAtIso,
  firebaseProjectId
}: {
  actorProfile: UserProfile;
  appEnvironment: string;
  collections: readonly FullCloudExportSourceCollection[];
  exportedAtIso: string;
  firebaseProjectId: string;
}): Promise<FullCloudExportArchive> {
  assertAdminOnline(actorProfile, true);
  assertCompleteCollectionSet(collections);
  const normalizedExportedAtIso = normalizeIso(exportedAtIso);
  const normalizedProjectId = requiredText(
    firebaseProjectId,
    "Pelny eksport wymaga identyfikatora projektu Firebase."
  );
  const normalizedEnvironment = requiredText(
    appEnvironment,
    "Pelny eksport wymaga nazwy srodowiska."
  );
  const omissions: FullCloudExportOmission[] = [];
  const files = new Map<string, Uint8Array>();
  const collectionManifest: FullCloudExportManifest["collections"] = [];
  const includedCollections: FullCloudExportSourceCollection[] = [];
  let totalDocumentCount = 0;
  let totalLegacyDocumentCount = 0;

  const orderedCollections = [...collections].sort(
    (left, right) =>
      FULL_CLOUD_EXPORT_COLLECTIONS.indexOf(left.name) -
      FULL_CLOUD_EXPORT_COLLECTIONS.indexOf(right.name)
  );

  for (const sourceCollection of orderedCollections) {
    const exportedDocuments: { data: PortableJsonValue; id: string }[] = [];
    const includedDocuments: FullCloudExportSourceDocument[] = [];
    let legacyDocumentCount = 0;
    const sortedDocuments = [...sourceCollection.documents].sort((left, right) =>
      left.id.localeCompare(right.id)
    );

    for (const document of sortedDocuments) {
      try {
        const id = requiredText(document.id, "Dokument eksportu wymaga ID.");
        exportedDocuments.push({
          data: toPortableJson(document.data),
          id
        });
        includedDocuments.push(document);
        if (isLegacyDocument(document.data)) {
          legacyDocumentCount += 1;
        }
      } catch (error) {
        omissions.push({
          collection: sourceCollection.name,
          documentId: document.id,
          reason: errorMessage(error)
        });
      }
    }

    const path = `collections/${sourceCollection.name}.json`;
    files.set(
      path,
      jsonBytes({
        collection: sourceCollection.name,
        documents: exportedDocuments
      })
    );
    collectionManifest.push({
      documentCount: exportedDocuments.length,
      legacyDocumentCount,
      name: sourceCollection.name,
      path
    });
    includedCollections.push({
      documents: includedDocuments,
      name: sourceCollection.name
    });
    totalDocumentCount = safeAdd(totalDocumentCount, exportedDocuments.length);
    totalLegacyDocumentCount = safeAdd(totalLegacyDocumentCount, legacyDocumentCount);
  }

  const errorsPath = "errors.json";
  files.set(
    errorsPath,
    jsonBytes({
      omittedDocumentCount: omissions.length,
      omissions
    })
  );
  const fileManifest: FullCloudExportManifest["files"] = [];

  for (const [path, bytes] of files) {
    fileManifest.push({
      byteLength: bytes.byteLength,
      documentCount:
        collectionManifest.find((collection) => collection.path === path)
          ?.documentCount ?? null,
      path,
      sha256: await sha256Hex(bytes)
    });
  }

  const manifest: FullCloudExportManifest = {
    application: {
      buildDate: APP_META.buildDate,
      buildId: APP_META.buildId,
      calculationVersion: APP_META.calculationVersion,
      name: APP_META.name,
      schemaVersion: APP_META.schemaVersion,
      version: APP_META.version
    },
    collections: collectionManifest,
    environment: {
      appEnvironment: normalizedEnvironment,
      firebaseProjectId: normalizedProjectId,
      source: "FIRESTORE_SERVER"
    },
    exportedAtIso: normalizedExportedAtIso,
    exportedBy: {
      email: requiredText(actorProfile.email, "Pelny eksport wymaga e-maila autora."),
      role: "ADMIN",
      uid: requiredText(actorProfile.uid, "Pelny eksport wymaga UID autora.")
    },
    files: fileManifest,
    format: {
      name: FULL_CLOUD_EXPORT_FORMAT,
      purpose: "PORTABLE_ARCHIVE",
      version: FULL_CLOUD_EXPORT_FORMAT_VERSION
    },
    omissions: {
      count: omissions.length,
      path: "errors.json"
    },
    seasonTotals: calculateSeasonTotals(includedCollections),
    summary: {
      collectionCount: collectionManifest.length,
      documentCount: totalDocumentCount,
      legacyDocumentCount: totalLegacyDocumentCount
    }
  };
  files.set("manifest.json", jsonBytes(manifest));

  return {
    bytes: zipSync(Object.fromEntries(files), { level: 6 }),
    filename: `borowka-full-cloud-export-${normalizedExportedAtIso.replace(
      /[:.]/g,
      "-"
    )}.zip`,
    manifest,
    omissions
  };
}

function calculateSeasonTotals(
  collections: readonly FullCloudExportSourceCollection[]
): FullCloudExportSeasonTotals[] {
  const totals = new Map<string, MutableSeasonTotals>();

  for (const sourceCollection of collections) {
    for (const document of sourceCollection.documents) {
      const data = asRecord(document.data);
      const seasonId =
        sourceCollection.name === "seasons"
          ? (optionalText(data?.id) ?? optionalText(document.id))
          : optionalText(data?.seasonId);
      if (!data || !seasonId) {
        continue;
      }

      const season = totals.get(seasonId) ?? emptySeasonTotals(seasonId);
      if (isLegacyDocument(data)) {
        season.importedDocumentCount = safeAdd(season.importedDocumentCount, 1);
      }

      switch (sourceCollection.name) {
        case "harvestSessions":
          season.sessionCount = safeAdd(season.sessionCount, 1);
          if (data.status === "CLOSED" || data.status === "PAID") {
            season.confirmedHarvestWeightG = safeAdd(
              season.confirmedHarvestWeightG,
              safeInteger(data.totalWeightG)
            );
            season.accruedGrosz = safeAdd(
              season.accruedGrosz,
              safeInteger(data.amountDueGrosz)
            );
          }
          break;
        case "harvestEntries":
          season.entryCount = safeAdd(season.entryCount, 1);
          break;
        case "payments":
          season.paymentCount = safeAdd(season.paymentCount, 1);
          if (data.status === "ACTIVE") {
            season.activePaymentGrosz = safeAdd(
              season.activePaymentGrosz,
              safeInteger(data.amountGrosz)
            );
          }
          break;
        case "sales":
          season.saleCount = safeAdd(season.saleCount, 1);
          if (data.status === "ACTIVE") {
            const direction =
              data.entryType === "CORRECTION" &&
              data.correctionDirection === "INCREASE_STOCK"
                ? -1
                : 1;
            season.soldWeightG = safeAdd(
              season.soldWeightG,
              direction * safeInteger(data.weightG)
            );
            season.activeRevenueGrosz = safeAdd(
              season.activeRevenueGrosz,
              direction * safeInteger(data.totalGrosz)
            );
          }
          break;
      }

      totals.set(seasonId, season);
    }
  }

  return Array.from(totals.values())
    .map((season) => ({
      ...season,
      availableWeightG: safeAdd(season.confirmedHarvestWeightG, -season.soldWeightG)
    }))
    .sort((left, right) => left.seasonId.localeCompare(right.seasonId));
}

function assertCompleteCollectionSet(
  collections: readonly FullCloudExportSourceCollection[]
): void {
  const names = collections.map((collection) => collection.name);

  if (
    names.length !== FULL_CLOUD_EXPORT_COLLECTIONS.length ||
    new Set(names).size !== names.length ||
    FULL_CLOUD_EXPORT_COLLECTIONS.some((name) => !names.includes(name))
  ) {
    throw new Error("Pelny eksport wymaga kompletnego zestawu kolekcji.");
  }
}

function assertAdminOnline(profile: UserProfile, isOnline: boolean): void {
  if (
    !profile.active ||
    profile.registrationStatus !== "APPROVED" ||
    profile.role !== "ADMIN"
  ) {
    throw new Error("Pelny eksport chmury wymaga aktywnego administratora.");
  }

  if (!isOnline) {
    throw new Error("Pelny eksport chmury wymaga polaczenia z serwerem.");
  }
}

function toPortableJson(value: unknown): PortableJsonValue {
  if (value === null || typeof value === "string" || typeof value === "boolean") {
    return value;
  }

  if (typeof value === "number") {
    if (Number.isFinite(value)) {
      return value;
    }

    return {
      __type: "number",
      value: Number.isNaN(value) ? "NaN" : value > 0 ? "Infinity" : "-Infinity"
    };
  }

  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) {
      throw new Error("Dokument zawiera nieprawidlowa date.");
    }
    return { __type: "date", iso: value.toISOString() };
  }

  if (value instanceof Uint8Array) {
    return {
      __type: "bytes",
      hex: Array.from(value, (byte) => byte.toString(16).padStart(2, "0")).join("")
    };
  }

  if (Array.isArray(value)) {
    return value.map(toPortableJson);
  }

  const record = asRecord(value);
  if (!record) {
    throw new Error("Dokument zawiera nieprzenoszalna wartosc.");
  }

  if (typeof record.toDate === "function") {
    const toDate = record.toDate as () => unknown;
    const timestampDate = toDate.call(value);
    if (!(timestampDate instanceof Date) || Number.isNaN(timestampDate.getTime())) {
      throw new Error("Dokument zawiera nieprawidlowy timestamp.");
    }
    return { __type: "timestamp", iso: timestampDate.toISOString() };
  }

  if (
    typeof record.path === "string" &&
    typeof record.id === "string" &&
    "firestore" in record
  ) {
    return { __type: "reference", path: record.path };
  }

  if (typeof record.latitude === "number" && typeof record.longitude === "number") {
    return {
      __type: "geopoint",
      latitude: record.latitude,
      longitude: record.longitude
    };
  }

  const portable: Record<string, PortableJsonValue> = {};
  for (const key of Object.keys(record).sort()) {
    portable[key] = toPortableJson(record[key]);
  }
  return portable;
}

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const input = new Uint8Array(bytes.byteLength);
  input.set(bytes);
  const digest = await globalThis.crypto.subtle.digest("SHA-256", input.buffer);
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0")
  ).join("");
}

function jsonBytes(value: unknown): Uint8Array {
  return strToU8(`${JSON.stringify(value, null, 2)}\n`);
}

function emptySeasonTotals(seasonId: string): MutableSeasonTotals {
  return {
    accruedGrosz: 0,
    activePaymentGrosz: 0,
    activeRevenueGrosz: 0,
    confirmedHarvestWeightG: 0,
    entryCount: 0,
    importedDocumentCount: 0,
    paymentCount: 0,
    saleCount: 0,
    seasonId,
    sessionCount: 0,
    soldWeightG: 0
  };
}

function safeInteger(value: unknown): number {
  return Number.isSafeInteger(value) ? (value as number) : 0;
}

function safeAdd(left: number, right: number): number {
  const result = left + right;
  if (
    !Number.isSafeInteger(left) ||
    !Number.isSafeInteger(right) ||
    !Number.isSafeInteger(result)
  ) {
    throw new Error("Suma kontrolna eksportu przekracza bezpieczny zakres.");
  }
  return result;
}

function isLegacyDocument(value: unknown): boolean {
  const record = asRecord(value);
  if (!record) {
    return false;
  }

  return (
    record.legacyImport === true ||
    (typeof record.legacySourceRow === "string" && record.legacySourceRow.length > 0) ||
    (Array.isArray(record.legacySourceRows) && record.legacySourceRows.length > 0)
  );
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function optionalText(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function requiredText(value: unknown, message: string): string {
  const normalized = optionalText(value);
  if (!normalized) {
    throw new Error(message);
  }
  return normalized;
}

function normalizeIso(value: string): string {
  const normalized = requiredText(value, "Pelny eksport wymaga czasu UTC.");
  const parsed = new Date(normalized);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error("Pelny eksport wymaga poprawnego czasu UTC.");
  }
  return parsed.toISOString();
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Nieznany blad eksportu.";
}

type PortableJsonPrimitive = boolean | null | number | string;
type PortableJsonValue =
  PortableJsonPrimitive | PortableJsonValue[] | { [key: string]: PortableJsonValue };

type MutableSeasonTotals = Omit<FullCloudExportSeasonTotals, "availableWeightG">;
