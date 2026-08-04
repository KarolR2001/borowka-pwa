import { createHash, randomUUID } from "node:crypto";
import {
  constants as fsConstants,
  chmod,
  copyFile,
  lstat,
  mkdir,
  readFile,
  stat,
  writeFile
} from "node:fs/promises";
import { homedir } from "node:os";
import { basename, dirname, extname, relative, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";

export const MIGRATION_SOURCE_CUSTODY_FORMAT = "BOROWKA_MIGRATION_SOURCE_CUSTODY";
export const MIGRATION_SOURCE_CUSTODY_VERSION = 1;

/** @type {Set<HtmlVersionStatus>} */
const HTML_VERSION_STATUSES = new Set([
  "MULTIPLE_VERSIONS",
  "NOT_APPLICABLE",
  "SINGLE_VERSION_CONFIRMED",
  "UNCONFIRMED"
]);
/** @type {Set<XlsxStatus>} */
const XLSX_STATUSES = new Set(["NOT_AVAILABLE", "OBTAINED", "REQUESTED", "UNKNOWN"]);

/** @typedef {"MULTIPLE_VERSIONS" | "NOT_APPLICABLE" | "SINGLE_VERSION_CONFIRMED" | "UNCONFIRMED"} HtmlVersionStatus */
/** @typedef {"NOT_AVAILABLE" | "OBTAINED" | "REQUESTED" | "UNKNOWN"} XlsxStatus */
/** @typedef {"PRIMARY_SOURCE" | "SOURCE_XLSX"} SourceRole */

/**
 * @typedef {object} InspectedSource
 * @property {string} absolutePath
 * @property {number} byteLength
 * @property {string} extension
 * @property {string} fileName
 * @property {string} modifiedAtIso
 * @property {SourceRole} role
 * @property {string} sha256
 */

/**
 * @typedef {object} CustodyFile
 * @property {number} byteLength
 * @property {string | null} extension
 * @property {string} modifiedAtIso
 * @property {string} originalCopy
 * @property {string} originalFileName
 * @property {string} provenance
 * @property {SourceRole} role
 * @property {string} sha256
 * @property {string} workingCopy
 */

/**
 * @typedef {object} CustodyManifest
 * @property {{ generatedFileMode: "0600", manifestFileMode: "0400", originalFileMode: "0400", privateDirectoryMode: "0700", repositoryPolicy: "NEVER_COMMIT_SOURCE_DATA" }} accessPolicy
 * @property {string} capturedAtIso
 * @property {string} custodyId
 * @property {CustodyFile[]} files
 * @property {{ name: typeof MIGRATION_SOURCE_CUSTODY_FORMAT, version: typeof MIGRATION_SOURCE_CUSTODY_VERSION }} format
 * @property {string} provenance
 * @property {{ analysisAllowed: boolean, htmlAssessmentComplete: boolean, sourceCopiesSecured: true, xlsxAssessmentComplete: boolean }} readiness
 * @property {{ htmlVersionStatus: HtmlVersionStatus, xlsxStatus: XlsxStatus }} sourceAssessment
 */

/**
 * @typedef {object} SecureMigrationSourceOptions
 * @property {string} [capturedAtIso]
 * @property {unknown} htmlVersionStatus
 * @property {unknown} [inputPath]
 * @property {unknown[] | null} [inputPaths]
 * @property {unknown} provenance
 * @property {string} [vaultDir]
 * @property {string | null} [xlsxPath]
 * @property {unknown} xlsxStatus
 */

/**
 * @param {SecureMigrationSourceOptions} options
 * @returns {Promise<{ manifest: CustodyManifest, manifestPath: string }>}
 */
export async function secureMigrationSource({
  capturedAtIso = new Date().toISOString(),
  htmlVersionStatus,
  inputPath,
  inputPaths = null,
  provenance,
  vaultDir = defaultMigrationVaultDir(),
  xlsxPath = null,
  xlsxStatus
}) {
  const capturedAt = normalizeIso(capturedAtIso);
  const normalizedProvenance = requiredText(
    provenance,
    "Podaj pochodzenie pliku przez --source."
  );
  const normalizedHtmlVersionStatus = requiredStatus(
    htmlVersionStatus,
    HTML_VERSION_STATUSES,
    "Nieprawidlowy status wersji HTML."
  );
  const normalizedXlsxStatus = requiredStatus(
    xlsxStatus,
    XLSX_STATUSES,
    "Nieprawidlowy status XLSX."
  );

  const resolvedVaultDir = resolve(vaultDir);
  const requestedInputPaths = inputPaths ?? (inputPath === undefined ? [] : [inputPath]);
  if (requestedInputPaths.length === 0) {
    throw new Error("Podaj co najmniej jeden plik zrodlowy przez --input.");
  }
  const primaries = await Promise.all(
    requestedInputPaths.map((path) =>
      inspectSourceFile(
        resolve(requiredText(path, "Sciezka pliku zrodlowego nie moze byc pusta.")),
        "PRIMARY_SOURCE"
      )
    )
  );
  const xlsx =
    xlsxPath !== null ? await inspectSourceFile(resolve(xlsxPath), "SOURCE_XLSX") : null;
  const sources = [...primaries, ...(xlsx ? [xlsx] : [])];
  assertDistinctSources(sources);
  assertSourceAssessment({
    htmlVersionStatus: normalizedHtmlVersionStatus,
    primaries,
    xlsx,
    xlsxStatus: normalizedXlsxStatus
  });
  for (const source of sources) {
    assertOutsideVault(source.absolutePath, resolvedVaultDir);
  }

  const originalsDir = resolve(resolvedVaultDir, "originals");
  const workingDir = resolve(resolvedVaultDir, "working");
  const manifestsDir = resolve(resolvedVaultDir, "manifests");
  await secureDirectory(resolvedVaultDir);
  await secureDirectory(originalsDir);
  await secureDirectory(workingDir);
  await secureDirectory(manifestsDir);

  const sourceSetHash = createHash("sha256");
  for (const source of [...sources].sort((left, right) =>
    left.absolutePath.localeCompare(right.absolutePath)
  )) {
    sourceSetHash.update(source.sha256);
    sourceSetHash.update(source.fileName);
  }
  const custodyId = `${dateStamp(capturedAt)}-${sourceSetHash.digest("hex").slice(0, 12)}-${randomUUID().slice(0, 8)}`;
  /** @type {CustodyFile[]} */
  const files = [];

  try {
    for (const source of sources) {
      files.push(
        await preserveSourceFile({
          capturedAt,
          custodyId,
          originalsDir,
          provenance: normalizedProvenance,
          source,
          vaultDir: resolvedVaultDir,
          workingDir
        })
      );
    }
  } finally {
    await chmod(originalsDir, 0o500);
    await assertMode(originalsDir, 0o500, "katalog oryginalow");
  }

  const containsHtml = primaries.some(
    (source) => source.extension === ".html" || source.extension === ".htm"
  );
  const htmlAssessmentComplete = containsHtml
    ? normalizedHtmlVersionStatus !== "UNCONFIRMED"
    : normalizedHtmlVersionStatus === "NOT_APPLICABLE";
  const xlsxAssessmentComplete =
    normalizedXlsxStatus === "OBTAINED" || normalizedXlsxStatus === "NOT_AVAILABLE";
  /** @type {CustodyManifest} */
  const manifest = {
    accessPolicy: {
      generatedFileMode: "0600",
      manifestFileMode: "0400",
      originalFileMode: "0400",
      privateDirectoryMode: "0700",
      repositoryPolicy: "NEVER_COMMIT_SOURCE_DATA"
    },
    capturedAtIso: capturedAt,
    custodyId,
    files,
    format: {
      name: MIGRATION_SOURCE_CUSTODY_FORMAT,
      version: MIGRATION_SOURCE_CUSTODY_VERSION
    },
    provenance: normalizedProvenance,
    readiness: {
      analysisAllowed: htmlAssessmentComplete && xlsxAssessmentComplete,
      htmlAssessmentComplete,
      sourceCopiesSecured: true,
      xlsxAssessmentComplete
    },
    sourceAssessment: {
      htmlVersionStatus: normalizedHtmlVersionStatus,
      xlsxStatus: normalizedXlsxStatus
    }
  };
  const manifestPath = resolve(manifestsDir, `${custodyId}.json`);
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, {
    encoding: "utf8",
    flag: "wx",
    mode: 0o600
  });
  await chmod(manifestPath, 0o400);
  await assertMode(manifestPath, 0o400, "manifest");

  return { manifest, manifestPath };
}

/**
 * @param {unknown} manifestPath
 * @returns {Promise<{ analysisAllowed: boolean, custodyId: string, fileCount: number, valid: true }>}
 */
export async function verifyMigrationSourceCustody(manifestPath) {
  const resolvedManifestPath = resolve(
    requiredText(manifestPath, "Podaj manifest do weryfikacji.")
  );
  const vaultDir = resolve(dirname(resolvedManifestPath), "..");
  const manifestsDir = resolve(vaultDir, "manifests");
  if (dirname(resolvedManifestPath) !== manifestsDir) {
    throw new Error("Manifest musi znajdowac sie w katalogu manifests sejfu.");
  }

  await assertDirectory(vaultDir, "sejf migracji");
  await assertDirectory(resolve(vaultDir, "originals"), "katalog oryginalow");
  await assertDirectory(resolve(vaultDir, "working"), "katalog kopii roboczych");
  await assertDirectory(manifestsDir, "katalog manifestow");
  await assertRegularFile(resolvedManifestPath, "manifest");
  await assertMode(vaultDir, 0o700, "sejf migracji");
  await assertMode(resolve(vaultDir, "originals"), 0o500, "katalog oryginalow");
  await assertMode(resolve(vaultDir, "working"), 0o700, "katalog kopii roboczych");
  await assertMode(manifestsDir, 0o700, "katalog manifestow");
  await assertMode(resolvedManifestPath, 0o400, "manifest");

  const manifest = parseCustodyManifest(await readFile(resolvedManifestPath, "utf8"));
  for (const file of manifest.files) {
    await verifyManifestFile(vaultDir, file, "originalCopy", "originals", 0o400);
    await verifyManifestFile(vaultDir, file, "workingCopy", "working", 0o600);
  }

  return {
    analysisAllowed: manifest.readiness.analysisAllowed,
    custodyId: manifest.custodyId,
    fileCount: manifest.files.length,
    valid: true
  };
}

/**
 * @param {string} absolutePath
 * @param {SourceRole} role
 * @returns {Promise<InspectedSource>}
 */
async function inspectSourceFile(absolutePath, role) {
  const sourceStat = await lstat(absolutePath).catch(() => /** @type {null} */ (null));
  if (!sourceStat?.isFile() || sourceStat.isSymbolicLink()) {
    throw new Error(`Zrodlo migracji nie jest zwyklym plikiem: ${absolutePath}`);
  }
  const bytes = await readFile(absolutePath);
  return {
    absolutePath,
    byteLength: bytes.byteLength,
    extension: extname(absolutePath).toLowerCase(),
    fileName: basename(absolutePath),
    modifiedAtIso: sourceStat.mtime.toISOString(),
    role,
    sha256: createHash("sha256").update(bytes).digest("hex")
  };
}

/**
 * @param {{ capturedAt: string, custodyId: string, originalsDir: string, provenance: string, source: InspectedSource, vaultDir: string, workingDir: string }} input
 * @returns {Promise<CustodyFile>}
 */
async function preserveSourceFile({
  capturedAt,
  custodyId,
  originalsDir,
  provenance,
  source,
  vaultDir,
  workingDir
}) {
  const safeName = sanitizeFileName(source.fileName);
  const originalPath = resolve(originalsDir, `${source.sha256}--${safeName}`);
  const workingPath = resolve(
    workingDir,
    `${dateStamp(capturedAt)}--${custodyId.slice(-8)}--${source.sha256.slice(
      0,
      12
    )}--${safeName}`
  );

  await copyOriginalOnce(source, originalPath);
  await copyFile(source.absolutePath, workingPath, fsConstants.COPYFILE_EXCL);
  await chmod(workingPath, 0o600);
  await assertMode(workingPath, 0o600, "kopia robocza");

  const copiedOriginal = await inspectCopiedFile(originalPath);
  const copiedWorking = await inspectCopiedFile(workingPath);
  if (
    copiedOriginal.sha256 !== source.sha256 ||
    copiedWorking.sha256 !== source.sha256 ||
    copiedOriginal.byteLength !== source.byteLength ||
    copiedWorking.byteLength !== source.byteLength
  ) {
    throw new Error(`Kopia zrodla nie przeszla kontroli: ${source.fileName}`);
  }

  return {
    byteLength: source.byteLength,
    extension: source.extension === "" ? null : source.extension,
    modifiedAtIso: source.modifiedAtIso,
    originalCopy: toVaultPath(vaultDir, originalPath),
    originalFileName: source.fileName,
    provenance,
    role: source.role,
    sha256: source.sha256,
    workingCopy: toVaultPath(vaultDir, workingPath)
  };
}

/**
 * @param {InspectedSource} source
 * @param {string} originalPath
 */
async function copyOriginalOnce(source, originalPath) {
  try {
    await copyFile(source.absolutePath, originalPath, fsConstants.COPYFILE_EXCL);
    await chmod(originalPath, 0o400);
    await assertMode(originalPath, 0o400, "kopia oryginalu");
  } catch (error) {
    if (!hasErrorCode(error, "EEXIST")) {
      throw error;
    }
    const existing = await inspectCopiedFile(originalPath);
    if (existing.sha256 !== source.sha256 || existing.byteLength !== source.byteLength) {
      throw new Error(`Istniejaca kopia oryginalu jest niespojna: ${source.fileName}`);
    }
    await assertMode(originalPath, 0o400, "kopia oryginalu");
  }
}

/**
 * @param {string} path
 * @returns {Promise<{ byteLength: number, sha256: string }>}
 */
async function inspectCopiedFile(path) {
  await assertRegularFile(path, "kopia zrodla");
  const bytes = await readFile(path);
  return {
    byteLength: bytes.byteLength,
    sha256: createHash("sha256").update(bytes).digest("hex")
  };
}

/**
 * @param {string} vaultDir
 * @param {CustodyFile} file
 * @param {"originalCopy" | "workingCopy"} field
 * @param {"originals" | "working"} expectedDirectory
 * @param {number} mode
 */
async function verifyManifestFile(vaultDir, file, field, expectedDirectory, mode) {
  const path = resolveVaultFile(vaultDir, file[field], expectedDirectory);
  await assertMode(path, mode, `${expectedDirectory}/${file.originalFileName}`);
  const inspected = await inspectCopiedFile(path);
  if (inspected.sha256 !== file.sha256 || inspected.byteLength !== file.byteLength) {
    throw new Error(`Niezgodna kopia ${field}: ${file.originalFileName}`);
  }
}

/** @param {string} path */
async function secureDirectory(path) {
  await mkdir(path, { mode: 0o700, recursive: true });
  await assertDirectory(path, "katalog prywatny");
  await chmod(path, 0o700);
  await assertMode(path, 0o700, "katalog prywatny");
}

/**
 * @param {string} path
 * @param {string} label
 */
async function assertDirectory(path, label) {
  const directoryStat = await lstat(path).catch(() => /** @type {null} */ (null));
  if (!directoryStat?.isDirectory() || directoryStat.isSymbolicLink()) {
    throw new Error(`${label} nie jest zwyklym katalogiem: ${path}`);
  }
}

/**
 * @param {string} path
 * @param {string} label
 */
async function assertRegularFile(path, label) {
  const fileStat = await lstat(path).catch(() => /** @type {null} */ (null));
  if (!fileStat?.isFile() || fileStat.isSymbolicLink()) {
    throw new Error(`${label} nie jest zwyklym plikiem: ${path}`);
  }
}

/**
 * @param {string} path
 * @param {number} expectedMode
 * @param {string} label
 */
async function assertMode(path, expectedMode, label) {
  const actualMode = (await stat(path)).mode & 0o777;
  if (actualMode !== expectedMode) {
    throw new Error(
      `System plikow nie wymusza bezpiecznych praw dla ${label}: oczekiwano ${expectedMode.toString(
        8
      )}, otrzymano ${actualMode.toString(8)}. Uzyj linuksowego systemu plikow WSL.`
    );
  }
}

/**
 * @param {{ htmlVersionStatus: HtmlVersionStatus, primaries: InspectedSource[], xlsx: InspectedSource | null, xlsxStatus: XlsxStatus }} input
 */
function assertSourceAssessment({ htmlVersionStatus, primaries, xlsx, xlsxStatus }) {
  const containsHtml = primaries.some(
    (source) => source.extension === ".html" || source.extension === ".htm"
  );
  if (containsHtml && htmlVersionStatus === "NOT_APPLICABLE") {
    throw new Error("Plik HTML wymaga jawnej oceny wersji arkusza.");
  }
  if (!containsHtml && htmlVersionStatus !== "NOT_APPLICABLE") {
    throw new Error("Status wersji HTML dla pliku innego typu musi byc NOT_APPLICABLE.");
  }
  if (xlsx && xlsx.extension !== ".xlsx") {
    throw new Error("Plik przekazany przez --xlsx musi miec rozszerzenie .xlsx.");
  }
  if (xlsx && xlsxStatus !== "OBTAINED") {
    throw new Error("Dostarczony XLSX wymaga statusu OBTAINED.");
  }
  if (
    !xlsx &&
    xlsxStatus === "OBTAINED" &&
    !primaries.some((source) => source.extension === ".xlsx")
  ) {
    throw new Error("Status OBTAINED wymaga pliku XLSX.");
  }
}

/** @param {InspectedSource[]} sources */
function assertDistinctSources(sources) {
  const absolutePaths = sources.map((source) => source.absolutePath);
  if (new Set(absolutePaths).size !== absolutePaths.length) {
    throw new Error("Kazdy plik zrodlowy moze wystapic w zestawie tylko raz.");
  }
}

/**
 * @param {string} serialized
 * @returns {CustodyManifest}
 */
function parseCustodyManifest(serialized) {
  /** @type {unknown} */
  let value;
  try {
    value = /** @type {unknown} */ (JSON.parse(serialized));
  } catch {
    throw new Error("Manifest migracji nie jest poprawnym JSON.");
  }
  const record = asRecord(value);
  const format = asRecord(record?.format);
  const readiness = asRecord(record?.readiness);
  const files = record?.files;
  if (
    !record ||
    format?.name !== MIGRATION_SOURCE_CUSTODY_FORMAT ||
    format.version !== MIGRATION_SOURCE_CUSTODY_VERSION ||
    typeof record.custodyId !== "string" ||
    !Array.isArray(files) ||
    files.length === 0 ||
    typeof readiness?.analysisAllowed !== "boolean"
  ) {
    throw new Error("Manifest migracji ma nieprawidlowy format.");
  }
  for (const file of files) {
    const fileRecord = asRecord(file);
    if (
      !fileRecord ||
      typeof fileRecord.originalFileName !== "string" ||
      typeof fileRecord.originalCopy !== "string" ||
      typeof fileRecord.workingCopy !== "string" ||
      !Number.isSafeInteger(fileRecord.byteLength) ||
      Number(fileRecord.byteLength) < 0 ||
      typeof fileRecord.sha256 !== "string" ||
      !/^[a-f0-9]{64}$/.test(fileRecord.sha256)
    ) {
      throw new Error("Manifest migracji zawiera nieprawidlowy wpis pliku.");
    }
  }
  return /** @type {CustodyManifest} */ (value);
}

/**
 * @param {string} vaultDir
 * @param {string} relativePath
 * @param {string} expectedDirectory
 * @returns {string}
 */
function resolveVaultFile(vaultDir, relativePath, expectedDirectory) {
  const path = resolve(vaultDir, relativePath);
  const expectedRoot = resolve(vaultDir, expectedDirectory);
  const pathFromRoot = relative(expectedRoot, path);
  if (
    pathFromRoot === "" ||
    pathFromRoot === ".." ||
    pathFromRoot.startsWith(`..${sep}`)
  ) {
    throw new Error(`Manifest wskazuje plik poza katalogiem ${expectedDirectory}.`);
  }
  return path;
}

/**
 * @param {string} sourcePath
 * @param {string} vaultDir
 */
function assertOutsideVault(sourcePath, vaultDir) {
  const pathFromVault = relative(vaultDir, sourcePath);
  if (
    pathFromVault === "" ||
    (!pathFromVault.startsWith(`..${sep}`) && pathFromVault !== "..")
  ) {
    throw new Error("Nie rejestruj ponownie pliku znajdujacego sie w sejfie migracji.");
  }
}

/**
 * @template {string} T
 * @param {unknown} value
 * @param {Set<T>} allowed
 * @param {string} message
 * @returns {T}
 */
function requiredStatus(value, allowed, message) {
  if (typeof value !== "string" || !allowed.has(/** @type {T} */ (value))) {
    throw new Error(message);
  }
  return /** @type {T} */ (value);
}

/**
 * @param {unknown} value
 * @returns {string}
 */
function normalizeIso(value) {
  const normalized = requiredText(value, "Brak czasu zabezpieczenia zrodla.");
  const date = new Date(normalized);
  if (Number.isNaN(date.getTime())) {
    throw new Error("Nieprawidlowy czas zabezpieczenia zrodla.");
  }
  return date.toISOString();
}

/**
 * @param {unknown} value
 * @param {string} message
 * @returns {string}
 */
function requiredText(value, message) {
  const normalized = typeof value === "string" ? value.trim() : "";
  if (!normalized) {
    throw new Error(message);
  }
  return normalized;
}

/**
 * @param {string} value
 * @returns {string}
 */
function sanitizeFileName(value) {
  const sanitized = value.replace(/[^a-zA-Z0-9._-]+/g, "_").replace(/^\.+/, "");
  return sanitized === "" ? "source-file" : sanitized;
}

/**
 * @param {string} iso
 * @returns {string}
 */
function dateStamp(iso) {
  return iso.replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

/**
 * @param {string} vaultDir
 * @param {string} path
 * @returns {string}
 */
function toVaultPath(vaultDir, path) {
  return relative(vaultDir, path).split(sep).join("/");
}

/** @returns {string} */
function defaultMigrationVaultDir() {
  return resolve(homedir(), ".local", "share", "borowka-pwa", "migration-private");
}

/**
 * @param {string[]} argv
 * @returns {SecureMigrationSourceOptions}
 */
function parseCliArguments(argv) {
  const allowedKeys = new Set([
    "--html-version-status",
    "--input",
    "--source",
    "--vault-dir",
    "--xlsx",
    "--xlsx-status"
  ]);
  /** @type {Map<string, string>} */
  const values = new Map();
  /** @type {string[]} */
  const inputPaths = [];
  if (argv.length % 2 !== 0) {
    throw new Error("Argumenty musza miec postac --nazwa wartosc.");
  }
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index];
    const value = argv[index + 1];
    if (!key.startsWith("--") || value.startsWith("--")) {
      throw new Error("Argumenty musza miec postac --nazwa wartosc.");
    }
    if (!allowedKeys.has(key)) {
      throw new Error(`Nieznany argument: ${key}`);
    }
    if (key === "--input") {
      inputPaths.push(value);
      continue;
    }
    if (values.has(key)) {
      throw new Error(`Argument podano wielokrotnie: ${key}`);
    }
    values.set(key, value);
  }
  return {
    htmlVersionStatus: values.get("--html-version-status"),
    inputPaths,
    provenance: values.get("--source"),
    vaultDir: values.get("--vault-dir") ?? defaultMigrationVaultDir(),
    xlsxPath: values.get("--xlsx") ?? null,
    xlsxStatus: values.get("--xlsx-status")
  };
}

/**
 * @param {unknown} value
 * @returns {Record<string, unknown> | null}
 */
function asRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? /** @type {Record<string, unknown>} */ (value)
    : null;
}

/**
 * @param {unknown} error
 * @param {string} code
 */
function hasErrorCode(error, code) {
  return asRecord(error)?.code === code;
}

/** @returns {Promise<void>} */
async function main() {
  const result = await secureMigrationSource(
    parseCliArguments(Array.from(process.argv.slice(2), String))
  );
  process.stdout.write(
    `${JSON.stringify({
      analysisAllowed: result.manifest.readiness.analysisAllowed,
      custodyId: result.manifest.custodyId,
      manifestPath: result.manifestPath
    })}\n`
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(
    /** @param {unknown} error */ (error) => {
      process.stderr.write(
        `${error instanceof Error ? error.message : "Nieznany blad."}\n`
      );
      process.exitCode = 1;
    }
  );
}
