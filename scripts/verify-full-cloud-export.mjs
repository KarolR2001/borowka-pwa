/* eslint-disable @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-return */

import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { strFromU8, unzipSync } from "fflate";

const FORMAT_NAME = "BOROWKA_FULL_CLOUD_EXPORT";
const FORMAT_VERSION = 2;
const REPORT_NAME = "BOROWKA_FULL_CLOUD_EXPORT_PORTABILITY_REPORT";
const REPORT_VERSION = 1;
const COLLECTIONS = [
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
];

export function validateFullCloudExportArchive(input) {
  const archiveBytes = asBytes(input);
  const archiveSha256 = sha256Hex(archiveBytes);
  const files = unzipArchive(archiveBytes);
  const paths = Object.keys(files).sort();

  for (const path of paths) {
    assertSafeArchivePath(path);
  }

  const manifest = parseJsonFile(files, "manifest.json");
  const manifestRecord = requiredRecord(manifest, "manifest.json musi byc obiektem.");
  validateManifestIdentity(manifestRecord);

  const manifestCollections = requiredArray(
    manifestRecord.collections,
    "Manifest wymaga listy kolekcji."
  );
  const manifestFiles = requiredArray(
    manifestRecord.files,
    "Manifest wymaga listy plikow."
  );
  const collectionEntries = validateCollectionManifest(manifestCollections);
  const fileEntries = validateFileManifest(manifestFiles);
  const expectedDataPaths = [
    ...COLLECTIONS.map((name) => `collections/${name}.json`),
    "errors.json"
  ];

  assertSameStringSet(paths, [...expectedDataPaths, "manifest.json"], "archiwum ZIP");
  assertSameStringSet([...fileEntries.keys()], expectedDataPaths, "manifest plikow");

  const restoredCollections = [];
  let documentCount = 0;
  let legacyDocumentCount = 0;

  for (const name of COLLECTIONS) {
    const path = `collections/${name}.json`;
    const bytes = requiredFile(files, path);
    const fileEntry = requiredMapEntry(fileEntries, path, "Brak pliku w manifescie.");
    validateFileIntegrity(path, bytes, fileEntry);

    const payload = requiredRecord(
      parseJsonBytes(bytes, path),
      `${path} musi zawierac obiekt.`
    );
    if (payload.collection !== name) {
      throw new Error(`${path} ma niezgodna nazwe kolekcji.`);
    }
    const documents = requiredArray(
      payload.documents,
      `${path} wymaga listy dokumentow.`
    );
    const normalizedDocuments = validateDocuments(path, documents);
    const collectionEntry = requiredMapEntry(
      collectionEntries,
      name,
      "Brak kolekcji w manifescie."
    );
    const collectionLegacyCount = normalizedDocuments.filter((document) =>
      isLegacyDocument(document.data)
    ).length;

    assertEqualInteger(
      collectionEntry.documentCount,
      normalizedDocuments.length,
      `${path}: niezgodna liczba dokumentow w manifescie.`
    );
    assertEqualInteger(
      fileEntry.documentCount,
      normalizedDocuments.length,
      `${path}: niezgodna liczba dokumentow w manifescie pliku.`
    );
    assertEqualInteger(
      collectionEntry.legacyDocumentCount,
      collectionLegacyCount,
      `${path}: niezgodna liczba dokumentow legacy.`
    );
    if (collectionEntry.path !== path) {
      throw new Error(`${path}: niezgodna sciezka kolekcji w manifescie.`);
    }

    restoredCollections.push({ documents: normalizedDocuments, name });
    documentCount = safeAdd(documentCount, normalizedDocuments.length);
    legacyDocumentCount = safeAdd(legacyDocumentCount, collectionLegacyCount);
  }

  const errorsBytes = requiredFile(files, "errors.json");
  const errorsFileEntry = requiredMapEntry(
    fileEntries,
    "errors.json",
    "Brak errors.json w manifescie."
  );
  validateFileIntegrity("errors.json", errorsBytes, errorsFileEntry);
  if (errorsFileEntry.documentCount !== null) {
    throw new Error("errors.json musi miec documentCount rowne null.");
  }
  const errors = requiredRecord(
    parseJsonBytes(errorsBytes, "errors.json"),
    "errors.json musi zawierac obiekt."
  );
  const omissions = requiredArray(errors.omissions, "errors.json wymaga listy pominiec.");
  assertEqualInteger(
    errors.omittedDocumentCount,
    omissions.length,
    "errors.json ma niezgodna liczbe pominiec."
  );

  const omissionManifest = requiredRecord(
    manifestRecord.omissions,
    "Manifest wymaga informacji o pominieciach."
  );
  if (omissionManifest.path !== "errors.json") {
    throw new Error("Manifest ma nieprawidlowa sciezke raportu pominiec.");
  }
  assertEqualInteger(
    omissionManifest.count,
    omissions.length,
    "Manifest ma niezgodna liczbe pominiec."
  );

  const summary = requiredRecord(manifestRecord.summary, "Manifest wymaga podsumowania.");
  assertEqualInteger(
    summary.collectionCount,
    COLLECTIONS.length,
    "Manifest ma niezgodna liczbe kolekcji."
  );
  assertEqualInteger(
    summary.documentCount,
    documentCount,
    "Manifest ma niezgodna laczna liczbe dokumentow."
  );
  assertEqualInteger(
    summary.legacyDocumentCount,
    legacyDocumentCount,
    "Manifest ma niezgodna laczna liczbe dokumentow legacy."
  );

  const calculatedSeasonTotals = calculateSeasonTotals(restoredCollections);
  const manifestSeasonTotals = requiredArray(
    manifestRecord.seasonTotals,
    "Manifest wymaga sum kontrolnych sezonow."
  );
  if (stableJson(manifestSeasonTotals) !== stableJson(calculatedSeasonTotals)) {
    throw new Error("Manifest ma niezgodne sumy kontrolne sezonow.");
  }

  const application = requiredRecord(
    manifestRecord.application,
    "Manifest wymaga metadanych aplikacji."
  );
  for (const field of [
    "buildDate",
    "buildId",
    "calculationVersion",
    "name",
    "schemaVersion",
    "version"
  ]) {
    requiredText(application[field], `Manifest wymaga application.${field}.`);
  }
  const environment = requiredRecord(
    manifestRecord.environment,
    "Manifest wymaga metadanych srodowiska."
  );
  const exportedBy = requiredRecord(
    manifestRecord.exportedBy,
    "Manifest wymaga autora eksportu."
  );
  if (environment.source !== "FIRESTORE_SERVER") {
    throw new Error("Eksport nie pochodzi z serwera Firestore.");
  }
  if (exportedBy.role !== "ADMIN") {
    throw new Error("Pelny eksport nie ma administratora jako autora.");
  }
  const exportedAtIso = normalizeIso(manifestRecord.exportedAtIso);

  return {
    application: {
      calculationVersion: application.calculationVersion,
      name: application.name,
      schemaVersion: application.schemaVersion,
      version: application.version
    },
    archiveSha256,
    authentication: {
      included: false,
      limitation:
        "Konta Firebase Authentication nie sa czescia eksportu Firestore i wymagaja odrebnej procedury odtworzenia."
    },
    collectionCount: COLLECTIONS.length,
    documentCount,
    environment: {
      appEnvironment: requiredText(
        environment.appEnvironment,
        "Manifest wymaga nazwy srodowiska."
      ),
      firebaseProjectId: requiredText(
        environment.firebaseProjectId,
        "Manifest wymaga identyfikatora projektu Firebase."
      )
    },
    exportedAtIso,
    exportedBy: {
      email: requiredText(exportedBy.email, "Manifest wymaga e-maila autora."),
      uid: requiredText(exportedBy.uid, "Manifest wymaga UID autora.")
    },
    format: { name: FORMAT_NAME, version: FORMAT_VERSION },
    legacyDocumentCount,
    omissionCount: omissions.length,
    seasonTotals: calculatedSeasonTotals
  };
}

export async function verifyFullCloudExportCopies(paths) {
  if (!Array.isArray(paths) || paths.length < 2) {
    throw new Error("Test przenosnosci wymaga co najmniej dwoch kopii archiwum.");
  }
  const resolvedPaths = paths.map((path) => resolve(requiredText(path, "Brak sciezki.")));
  if (new Set(resolvedPaths).size !== resolvedPaths.length) {
    throw new Error("Kopie eksportu musza miec rozne sciezki.");
  }

  const copies = [];
  for (const path of resolvedPaths) {
    const report = validateFullCloudExportArchive(await readFile(path));
    copies.push({ path, report });
  }
  const expectedSha256 = copies[0].report.archiveSha256;
  if (copies.some((copy) => copy.report.archiveSha256 !== expectedSha256)) {
    throw new Error("Kopie eksportu nie sa identyczne.");
  }

  return {
    archive: copies[0].report,
    copies: copies.map((copy) => ({
      archiveSha256: copy.report.archiveSha256,
      path: copy.path
    })),
    format: { name: REPORT_NAME, version: REPORT_VERSION },
    valid: true,
    verifiedAtIso: new Date().toISOString()
  };
}

function validateManifestIdentity(manifest) {
  const format = requiredRecord(manifest.format, "Manifest wymaga opisu formatu.");
  const expected = {
    dataScope: "ALL_FIRESTORE_COLLECTIONS",
    name: FORMAT_NAME,
    purpose: "PORTABLE_ARCHIVE",
    source: "FIRESTORE_SERVER",
    version: FORMAT_VERSION
  };
  for (const [key, value] of Object.entries(expected)) {
    if (format[key] !== value) {
      throw new Error(`Nieobslugiwany format eksportu: format.${key}.`);
    }
  }
}

function validateCollectionManifest(entries) {
  const result = new Map();
  for (const value of entries) {
    const entry = requiredRecord(value, "Wpis kolekcji w manifescie musi byc obiektem.");
    const name = requiredText(entry.name, "Wpis kolekcji wymaga nazwy.");
    if (result.has(name)) {
      throw new Error(`Manifest powtarza kolekcje ${name}.`);
    }
    result.set(name, entry);
  }
  assertSameStringSet([...result.keys()], COLLECTIONS, "manifest kolekcji");
  return result;
}

function validateFileManifest(entries) {
  const result = new Map();
  for (const value of entries) {
    const entry = requiredRecord(value, "Wpis pliku w manifescie musi byc obiektem.");
    const path = requiredText(entry.path, "Wpis pliku wymaga sciezki.");
    assertSafeArchivePath(path);
    if (result.has(path)) {
      throw new Error(`Manifest powtarza plik ${path}.`);
    }
    result.set(path, entry);
  }
  return result;
}

function validateDocuments(path, documents) {
  const ids = new Set();
  return documents.map((value) => {
    const document = requiredRecord(value, `${path}: dokument musi byc obiektem.`);
    const id = requiredText(document.id, `${path}: dokument wymaga ID.`);
    if (ids.has(id)) {
      throw new Error(`${path}: powtorzone ID dokumentu ${id}.`);
    }
    ids.add(id);
    return {
      data: requiredRecord(document.data, `${path}: dokument ${id} wymaga danych.`),
      id
    };
  });
}

function validateFileIntegrity(path, bytes, entry) {
  assertEqualInteger(
    entry.byteLength,
    bytes.byteLength,
    `${path}: niezgodny rozmiar pliku.`
  );
  const expectedSha256 = requiredText(entry.sha256, `${path}: brak SHA-256.`);
  if (!/^[a-f0-9]{64}$/.test(expectedSha256) || sha256Hex(bytes) !== expectedSha256) {
    throw new Error(`${path}: niezgodna suma SHA-256.`);
  }
}

function calculateSeasonTotals(collections) {
  const totals = new Map();
  for (const collection of collections) {
    for (const document of collection.documents) {
      const data = document.data;
      const seasonId =
        collection.name === "seasons"
          ? (optionalText(data.id) ?? optionalText(document.id))
          : optionalText(data.seasonId);
      if (!seasonId) continue;

      const season = totals.get(seasonId) ?? emptySeasonTotals(seasonId);
      if (isLegacyDocument(data)) {
        season.importedDocumentCount = safeAdd(season.importedDocumentCount, 1);
      }
      if (collection.name === "harvestSessions") {
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
      } else if (collection.name === "harvestEntries") {
        season.entryCount = safeAdd(season.entryCount, 1);
      } else if (collection.name === "payments") {
        season.paymentCount = safeAdd(season.paymentCount, 1);
        if (data.status === "ACTIVE") {
          season.activePaymentGrosz = safeAdd(
            season.activePaymentGrosz,
            safeInteger(data.amountGrosz)
          );
        }
      } else if (collection.name === "sales") {
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
      }
      totals.set(seasonId, season);
    }
  }

  return [...totals.values()]
    .map((season) => ({
      ...season,
      availableWeightG: safeAdd(season.confirmedHarvestWeightG, -season.soldWeightG)
    }))
    .sort((left, right) => left.seasonId.localeCompare(right.seasonId));
}

function emptySeasonTotals(seasonId) {
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

function isLegacyDocument(value) {
  return (
    value.legacyImport === true ||
    (typeof value.legacySourceRow === "string" && value.legacySourceRow.length > 0) ||
    (Array.isArray(value.legacySourceRows) && value.legacySourceRows.length > 0)
  );
}

function unzipArchive(bytes) {
  try {
    return unzipSync(bytes);
  } catch {
    throw new Error("Nie mozna otworzyc archiwum ZIP eksportu.");
  }
}

function parseJsonFile(files, path) {
  return parseJsonBytes(requiredFile(files, path), path);
}

function parseJsonBytes(bytes, path) {
  try {
    return JSON.parse(strFromU8(bytes));
  } catch {
    throw new Error(`${path} nie zawiera poprawnego JSON.`);
  }
}

function requiredFile(files, path) {
  const file = files[path];
  if (!(file instanceof Uint8Array)) {
    throw new Error(`Brak wymaganego pliku ${path}.`);
  }
  return file;
}

function assertSafeArchivePath(path) {
  if (
    !path ||
    path.startsWith("/") ||
    path.includes("\\") ||
    path.split("/").some((part) => part === "" || part === "." || part === "..")
  ) {
    throw new Error(`Niebezpieczna sciezka w archiwum: ${path}.`);
  }
}

function assertSameStringSet(actual, expected, label) {
  const actualSorted = [...actual].sort();
  const expectedSorted = [...expected].sort();
  if (stableJson(actualSorted) !== stableJson(expectedSorted)) {
    throw new Error(`${label} nie zawiera oczekiwanego kompletnego zestawu.`);
  }
}

function assertEqualInteger(actual, expected, message) {
  if (!Number.isSafeInteger(actual) || actual !== expected) {
    throw new Error(message);
  }
}

function requiredMapEntry(map, key, message) {
  const value = map.get(key);
  if (!value) throw new Error(message);
  return value;
}

function requiredRecord(value, message) {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(message);
  }
  return value;
}

function requiredArray(value, message) {
  if (!Array.isArray(value)) throw new Error(message);
  return value;
}

function requiredText(value, message) {
  if (typeof value !== "string" || !value.trim()) throw new Error(message);
  return value.trim();
}

function optionalText(value) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function normalizeIso(value) {
  const text = requiredText(value, "Manifest wymaga czasu eksportu UTC.");
  const date = new Date(text);
  if (Number.isNaN(date.getTime()) || date.toISOString() !== text) {
    throw new Error("Manifest ma nieprawidlowy czas eksportu UTC.");
  }
  return text;
}

function safeInteger(value) {
  return Number.isSafeInteger(value) ? value : 0;
}

function safeAdd(left, right) {
  if (typeof left !== "number" || typeof right !== "number") {
    throw new Error("Suma kontrolna eksportu wymaga liczb.");
  }
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

function sha256Hex(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function asBytes(value) {
  if (!(value instanceof Uint8Array)) {
    throw new Error("Walidator wymaga bajtow archiwum ZIP.");
  }
  return value;
}

function stableJson(value) {
  return JSON.stringify(canonicalJson(value));
}

function canonicalJson(value) {
  if (Array.isArray(value)) {
    return value.map(canonicalJson);
  }
  if (typeof value === "object" && value !== null) {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, canonicalJson(value[key])])
    );
  }
  return value;
}

function parseCliArguments(argv) {
  const paths = [];
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--archive") {
      const path = argv[index + 1];
      if (!path) throw new Error("Opcja --archive wymaga sciezki.");
      paths.push(path);
      index += 1;
    } else if (argument === "--help") {
      return { help: true, paths: [] };
    } else {
      throw new Error(`Nieznana opcja: ${argument}.`);
    }
  }
  return { help: false, paths };
}

async function runCli() {
  const { help, paths } = parseCliArguments(process.argv.slice(2));
  if (help) {
    process.stdout.write(
      "Uzycie: npm run export:verify-portability -- --archive <kopia-1.zip> --archive <kopia-2.zip>\n"
    );
    return;
  }
  const report = await verifyFullCloudExportCopies(paths);
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
}

const isMain = resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  // Promise rejection callbacks do not expose a typed error value in JavaScript.
  // eslint-disable-next-line @typescript-eslint/use-unknown-in-catch-callback-variable
  runCli().catch((error) => {
    process.stderr.write(
      `${error instanceof Error ? error.message : "Nieznany blad."}\n`
    );
    process.exitCode = 1;
  });
}
