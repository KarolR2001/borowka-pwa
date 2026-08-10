// @vitest-environment node
/* eslint-disable @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-return, @typescript-eslint/restrict-plus-operands */

import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";

import { strToU8, unzipSync, zipSync } from "fflate";

import {
  createFullCloudExportArchive,
  FULL_CLOUD_EXPORT_COLLECTIONS
} from "../../src/reports/fullCloudExport.ts";
import {
  validateFullCloudExportArchive,
  verifyFullCloudExportCopies
} from "../../scripts/verify-full-cloud-export.mjs";

const adminProfile = {
  active: true,
  displayName: "Admin Portability",
  email: "admin-portability@example.test",
  offlineConsent: false,
  registrationStatus: "APPROVED",
  role: "ADMIN",
  uid: "admin-portability",
  workerId: null
};

describe("full cloud export portability", () => {
  let directory;

  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), "borowka-export-portability-"));
  });

  afterEach(async () => {
    await rm(directory, { force: true, recursive: true });
  });

  it("validates two independent copies and reconstructs counts and season totals", async () => {
    const archive = await createArchive();
    const firstPath = join(directory, "location-a", archive.filename);
    const secondPath = join(directory, "location-b", archive.filename);
    await Promise.all([
      writeArchive(firstPath, archive.bytes),
      writeArchive(secondPath, archive.bytes)
    ]);

    const report = await verifyFullCloudExportCopies([firstPath, secondPath]);

    expect(report).toMatchObject({
      archive: {
        authentication: { included: false },
        collectionCount: FULL_CLOUD_EXPORT_COLLECTIONS.length,
        documentCount: 6,
        environment: {
          appEnvironment: "development",
          firebaseProjectId: "borowka-pwa-dev"
        },
        omissionCount: 0,
        seasonTotals: [
          {
            accruedGrosz: 5000,
            activePaymentGrosz: 5000,
            activeRevenueGrosz: 3000,
            availableWeightG: 8000,
            confirmedHarvestWeightG: 10_000,
            entryCount: 1,
            paymentCount: 1,
            saleCount: 1,
            seasonId: "season-current",
            sessionCount: 1,
            soldWeightG: 2000
          }
        ]
      },
      copies: [{ path: resolve(firstPath) }, { path: resolve(secondPath) }],
      format: {
        name: "BOROWKA_FULL_CLOUD_EXPORT_PORTABILITY_REPORT",
        version: 1
      },
      valid: true
    });
    expect(report.copies[0].archiveSha256).toBe(report.copies[1].archiveSha256);
  });

  it("rejects a modified data file even when the ZIP can still be opened", async () => {
    const archive = await createArchive();
    const files = unzipSync(archive.bytes);
    files["collections/sales.json"] = strToU8(
      JSON.stringify({ collection: "sales", documents: [] })
    );

    expect(() => validateFullCloudExportArchive(zipSync(files))).toThrow(
      "sales.json: niezgodny rozmiar"
    );
  });

  it("rejects manifest totals changed without modifying checksummed data files", async () => {
    const archive = await createArchive();
    const files = unzipSync(archive.bytes);
    const manifest = JSON.parse(new TextDecoder().decode(files["manifest.json"]));
    manifest.summary.documentCount += 1;
    files["manifest.json"] = strToU8(`${JSON.stringify(manifest)}\n`);

    expect(() => validateFullCloudExportArchive(zipSync(files))).toThrow(
      "niezgodna laczna liczbe dokumentow"
    );
  });

  it("requires distinct, identical archive copies", async () => {
    const archive = await createArchive();
    const firstPath = join(directory, "first.zip");
    const secondPath = join(directory, "second.zip");
    await writeFile(firstPath, archive.bytes);
    await writeFile(secondPath, corruptZip(archive.bytes));

    await expect(verifyFullCloudExportCopies([firstPath, firstPath])).rejects.toThrow(
      "rozne sciezki"
    );
    await expect(verifyFullCloudExportCopies([firstPath, secondPath])).rejects.toThrow();
  });
});

async function createArchive() {
  const collections = FULL_CLOUD_EXPORT_COLLECTIONS.map((name) => ({
    documents: [],
    name
  }));
  collection(collections, "seasons").documents.push({
    data: { id: "season-current", status: "OPEN" },
    id: "season-current"
  });
  collection(collections, "harvestSessions").documents.push({
    data: {
      amountDueGrosz: 5000,
      seasonId: "season-current",
      status: "CLOSED",
      totalWeightG: 10_000
    },
    id: "session-1"
  });
  collection(collections, "harvestEntries").documents.push({
    data: { seasonId: "season-current", status: "ACTIVE" },
    id: "entry-1"
  });
  collection(collections, "payments").documents.push({
    data: { amountGrosz: 5000, seasonId: "season-current", status: "ACTIVE" },
    id: "payment-1"
  });
  collection(collections, "sales").documents.push({
    data: {
      entryType: "SALE",
      seasonId: "season-current",
      status: "ACTIVE",
      totalGrosz: 3000,
      weightG: 2000
    },
    id: "sale-1"
  });
  collection(collections, "workers").documents.push({
    data: { active: true, displayName: "Synthetic Worker" },
    id: "worker-1"
  });

  return createFullCloudExportArchive({
    actorProfile: adminProfile,
    appEnvironment: "development",
    collections,
    exportedAtIso: "2026-08-10T12:00:00.000Z",
    firebaseProjectId: "borowka-pwa-dev"
  });
}

function collection(collections, name) {
  const found = collections.find((candidate) => candidate.name === name);
  if (!found) throw new Error(`Missing collection ${name}.`);
  return found;
}

async function writeArchive(path, bytes) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, bytes);
}

function corruptZip(bytes) {
  const corrupted = Uint8Array.from(bytes);
  corrupted[Math.floor(corrupted.length / 2)] ^= 0xff;
  return corrupted;
}
