// @vitest-environment node

import { strFromU8, unzipSync } from "fflate";

import type { UserProfile } from "../domain/identity";
import {
  createFullCloudExportArchive,
  FULL_CLOUD_EXPORT_COLLECTIONS,
  FULL_CLOUD_EXPORT_FORMAT,
  type FullCloudExportSourceCollection
} from "./fullCloudExport";

const adminProfile: UserProfile = {
  active: true,
  displayName: "Admin Export",
  email: "admin-export@example.test",
  offlineConsent: false,
  registrationStatus: "APPROVED",
  role: "ADMIN",
  uid: "admin-export",
  workerId: null
};

describe("full portable cloud export", () => {
  it("creates a checksummed ZIP with all collections and control totals", async () => {
    const archive = await createFullCloudExportArchive({
      actorProfile: adminProfile,
      appEnvironment: "development",
      collections: populatedCollections(),
      exportedAtIso: "2026-08-04T20:00:00.000Z",
      firebaseProjectId: "borowka-pwa-dev"
    });
    const files = unzipSync(archive.bytes);

    expect(Object.keys(files).sort()).toEqual(
      [
        ...FULL_CLOUD_EXPORT_COLLECTIONS.map((name) => `collections/${name}.json`),
        "errors.json",
        "manifest.json"
      ].sort()
    );
    expect(archive.filename).toBe(
      "borowka-full-cloud-export-2026-08-04T20-00-00-000Z.zip"
    );
    expect(archive.manifest).toMatchObject({
      environment: {
        appEnvironment: "development",
        firebaseProjectId: "borowka-pwa-dev",
        source: "FIRESTORE_SERVER"
      },
      exportedBy: {
        email: adminProfile.email,
        role: "ADMIN",
        uid: adminProfile.uid
      },
      format: {
        name: FULL_CLOUD_EXPORT_FORMAT,
        purpose: "PORTABLE_ARCHIVE",
        version: 1
      },
      omissions: { count: 1, path: "errors.json" },
      summary: {
        collectionCount: FULL_CLOUD_EXPORT_COLLECTIONS.length,
        legacyDocumentCount: 1
      }
    });
    expect(archive.manifest.files).toHaveLength(FULL_CLOUD_EXPORT_COLLECTIONS.length + 1);
    for (const file of archive.manifest.files) {
      expect(file.byteLength).toBeGreaterThan(0);
      expect(file.sha256).toMatch(/^[a-f0-9]{64}$/);
    }
    expect(archive.manifest.seasonTotals).toEqual([
      {
        accruedGrosz: 5000,
        activePaymentGrosz: 3000,
        activeRevenueGrosz: 6000,
        availableWeightG: 7000,
        confirmedHarvestWeightG: 10_000,
        entryCount: 2,
        importedDocumentCount: 1,
        paymentCount: 2,
        saleCount: 3,
        seasonId: "season-1",
        sessionCount: 2,
        soldWeightG: 3000
      }
    ]);

    const parsedManifest: unknown = JSON.parse(
      strFromU8(requiredFile(files, "manifest.json"))
    );
    expect(parsedManifest).toEqual(archive.manifest);
    expect(strFromU8(requiredFile(files, "collections/auditEvents.json"))).toContain(
      '"__type": "timestamp"'
    );
    expect(strFromU8(requiredFile(files, "collections/auditEvents.json"))).toContain(
      '"iso": "2026-08-04T19:00:00.000Z"'
    );
    expect(strFromU8(requiredFile(files, "errors.json"))).toContain(
      '"documentId": "device-invalid"'
    );
  });

  it("normalizes collection order and keeps empty seasons in control totals", async () => {
    const collections = emptyCollections();
    collectionByName(collections, "seasons").documents = [
      { data: { id: "season-empty", status: "PLANNED" }, id: "season-empty" }
    ];

    const archive = await createFullCloudExportArchive({
      actorProfile: adminProfile,
      appEnvironment: "development",
      collections: [...collections].reverse(),
      exportedAtIso: "2026-08-04T20:00:00.000Z",
      firebaseProjectId: "borowka-pwa-dev"
    });

    expect(archive.manifest.collections.map((collection) => collection.name)).toEqual(
      FULL_CLOUD_EXPORT_COLLECTIONS
    );
    expect(archive.manifest.seasonTotals).toEqual([
      expect.objectContaining({
        availableWeightG: 0,
        seasonId: "season-empty",
        sessionCount: 0
      })
    ]);
  });

  it("rejects a non-admin and an incomplete collection set", async () => {
    await expect(
      createFullCloudExportArchive({
        actorProfile: { ...adminProfile, role: "OPERATOR" },
        appEnvironment: "development",
        collections: emptyCollections(),
        exportedAtIso: "2026-08-04T20:00:00.000Z",
        firebaseProjectId: "borowka-pwa-dev"
      })
    ).rejects.toThrow("administratora");
    await expect(
      createFullCloudExportArchive({
        actorProfile: adminProfile,
        appEnvironment: "development",
        collections: emptyCollections().slice(1),
        exportedAtIso: "2026-08-04T20:00:00.000Z",
        firebaseProjectId: "borowka-pwa-dev"
      })
    ).rejects.toThrow("kompletnego zestawu");
  });
});

function populatedCollections(): FullCloudExportSourceCollection[] {
  const collections = emptyCollections();
  collectionByName(collections, "seasons").documents = [
    { data: { id: "season-1", status: "OPEN" }, id: "season-1" }
  ];
  collectionByName(collections, "harvestSessions").documents = [
    {
      data: {
        amountDueGrosz: 5000,
        legacyImport: true,
        seasonId: "season-1",
        status: "CLOSED",
        totalWeightG: 10_000
      },
      id: "session-closed"
    },
    {
      data: {
        amountDueGrosz: null,
        legacyImport: false,
        seasonId: "season-1",
        status: "OPEN",
        totalWeightG: 2000
      },
      id: "session-open"
    }
  ];
  collectionByName(collections, "harvestEntries").documents = [
    { data: { seasonId: "season-1", status: "ACTIVE" }, id: "entry-1" },
    { data: { seasonId: "season-1", status: "CANCELLED" }, id: "entry-2" }
  ];
  collectionByName(collections, "payments").documents = [
    {
      data: { amountGrosz: 3000, seasonId: "season-1", status: "ACTIVE" },
      id: "payment-active"
    },
    {
      data: { amountGrosz: 1000, seasonId: "season-1", status: "CANCELLED" },
      id: "payment-cancelled"
    }
  ];
  collectionByName(collections, "sales").documents = [
    {
      data: {
        entryType: "SALE",
        seasonId: "season-1",
        status: "ACTIVE",
        totalGrosz: 8000,
        weightG: 4000
      },
      id: "sale-active"
    },
    {
      data: {
        correctionDirection: "INCREASE_STOCK",
        entryType: "CORRECTION",
        seasonId: "season-1",
        status: "ACTIVE",
        totalGrosz: 2000,
        weightG: 1000
      },
      id: "correction-increase"
    },
    {
      data: {
        entryType: "SALE",
        seasonId: "season-1",
        status: "CANCELLED",
        totalGrosz: 4000,
        weightG: 2000
      },
      id: "sale-cancelled"
    }
  ];
  collectionByName(collections, "auditEvents").documents = [
    {
      data: {
        createdAtServer: {
          toDate: () => new Date("2026-08-04T19:00:00.000Z")
        }
      },
      id: "audit-1"
    }
  ];
  collectionByName(collections, "devices").documents = [
    {
      data: { unsupported: () => "not portable" },
      id: "device-invalid"
    }
  ];
  return collections;
}

function emptyCollections(): FullCloudExportSourceCollection[] {
  return FULL_CLOUD_EXPORT_COLLECTIONS.map((name) => ({ documents: [], name }));
}

function collectionByName(
  collections: FullCloudExportSourceCollection[],
  name: FullCloudExportSourceCollection["name"]
): { documents: FullCloudExportSourceCollection["documents"]; name: typeof name } {
  const collection = collections.find((candidate) => candidate.name === name);
  if (!collection) {
    throw new Error(`Missing test collection ${name}.`);
  }
  return collection;
}

function requiredFile(
  files: Partial<Record<string, Uint8Array>>,
  path: string
): Uint8Array {
  const file = files[path];
  if (!file) {
    throw new Error(`Missing archive file ${path}.`);
  }
  return file;
}
