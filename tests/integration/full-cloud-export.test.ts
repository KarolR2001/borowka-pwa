// @vitest-environment node

import {
  initializeTestEnvironment,
  type RulesTestEnvironment
} from "@firebase/rules-unit-testing";
import { strFromU8, unzipSync } from "fflate";
import { Timestamp, doc, setDoc } from "firebase/firestore";
import { readFileSync } from "node:fs";

import type { UserProfile } from "../../src/domain/identity";
import {
  FULL_CLOUD_EXPORT_COLLECTIONS,
  loadFullCloudExport
} from "../../src/reports/fullCloudExport";

const projectId = "demo-borowka-pwa-full-cloud-export";

const firebaseServicesMock = vi.hoisted(() => ({
  getFirebaseServices: vi.fn()
}));

vi.mock("../../src/config/firebaseServices", () => ({
  getFirebaseServices: firebaseServicesMock.getFirebaseServices
}));

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

let testEnvironment: RulesTestEnvironment | undefined;

beforeAll(async () => {
  testEnvironment = await initializeTestEnvironment({
    firestore: {
      host: "127.0.0.1",
      port: 8080,
      rules: readFileSync("firestore.rules", "utf8")
    },
    projectId
  });
}, 30_000);

beforeEach(async () => {
  await testEnvironment?.clearFirestore();
  firebaseServicesMock.getFirebaseServices.mockReset();

  if (!testEnvironment) {
    throw new Error("Rules test environment was not initialized.");
  }

  await testEnvironment.withSecurityRulesDisabled(async (context) => {
    const firestore = context.firestore();
    await Promise.all(
      FULL_CLOUD_EXPORT_COLLECTIONS.map((collectionName) =>
        setDoc(
          doc(
            firestore,
            collectionName,
            collectionName === "users" ? adminProfile.uid : `${collectionName}-1`
          ),
          exportDocument(collectionName)
        )
      )
    );
  });

  firebaseServicesMock.getFirebaseServices.mockReturnValue({
    firestore: testEnvironment
      .authenticatedContext(adminProfile.uid, { email: adminProfile.email })
      .firestore()
  });
});

afterAll(async () => {
  await testEnvironment?.cleanup();
});

describe("full cloud export Firestore read", () => {
  it("reads every business collection through rules and creates the portable archive", async () => {
    const progress: string[] = [];

    const archive = await loadFullCloudExport(
      { VITE_FIREBASE_PROJECT_ID: projectId },
      {
        actorProfile: adminProfile,
        exportedAtIso: "2026-08-04T20:00:00.000Z",
        isOnline: true,
        onProgress: (value) => {
          progress.push(value.currentCollection);
        }
      }
    );

    expect(progress).toEqual(FULL_CLOUD_EXPORT_COLLECTIONS);
    expect(archive.manifest.summary).toEqual({
      collectionCount: FULL_CLOUD_EXPORT_COLLECTIONS.length,
      documentCount: FULL_CLOUD_EXPORT_COLLECTIONS.length,
      legacyDocumentCount: 1
    });
    expect(archive.manifest.collections.every((value) => value.documentCount === 1)).toBe(
      true
    );
    expect(archive.manifest.seasonTotals).toHaveLength(1);
    expect(archive.manifest.seasonTotals[0]?.accruedGrosz).toBe(2500);
    expect(archive.manifest.seasonTotals[0]?.availableWeightG).toBe(4000);
    expect(archive.manifest.seasonTotals[0]?.confirmedHarvestWeightG).toBe(5000);
    expect(archive.manifest.seasonTotals[0]?.seasonId).toBe("season-2026");
    expect(archive.manifest.seasonTotals[0]?.soldWeightG).toBe(1000);
    expect(archive.omissions).toEqual([]);

    const files = unzipSync(archive.bytes);
    expect(Object.keys(files)).toHaveLength(FULL_CLOUD_EXPORT_COLLECTIONS.length + 2);
    for (const collectionName of FULL_CLOUD_EXPORT_COLLECTIONS) {
      const content = strFromU8(
        requiredFile(files, `collections/${collectionName}.json`)
      );
      expect(content).toContain(`"collection": "${collectionName}"`);
    }
  }, 30_000);
});

function exportDocument(
  collectionName: (typeof FULL_CLOUD_EXPORT_COLLECTIONS)[number]
): Record<string, unknown> {
  if (collectionName === "users") {
    return adminProfile;
  }
  if (collectionName === "seasons") {
    return { id: "season-2026", name: "Sezon 2026", status: "OPEN" };
  }
  if (collectionName === "harvestSessions") {
    return {
      amountDueGrosz: 2500,
      id: "harvestSessions-1",
      legacyImport: true,
      seasonId: "season-2026",
      status: "CLOSED",
      totalWeightG: 5000
    };
  }
  if (collectionName === "sales") {
    return {
      entryType: "SALE",
      id: "sales-1",
      seasonId: "season-2026",
      status: "ACTIVE",
      totalGrosz: 4000,
      weightG: 1000
    };
  }

  return {
    createdAt: Timestamp.fromDate(new Date("2026-08-04T19:00:00.000Z")),
    id: `${collectionName}-1`,
    seasonId: "season-2026"
  };
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
