import {
  initializeTestEnvironment,
  type RulesTestEnvironment
} from "@firebase/rules-unit-testing";
import {
  collection,
  disableNetwork,
  doc,
  getDoc,
  getDocFromCache,
  getDocs,
  getDocsFromCache,
  orderBy,
  query,
  setDoc,
  where
} from "firebase/firestore";
import { readFileSync } from "node:fs";

import { APP_META } from "../../src/config/appMeta";
import {
  createInitialDomainSeed,
  createInitialDomainSeedWrites
} from "../../src/domain/domainConfiguration";
import type { UserProfile } from "../../src/domain/identity";
import {
  createFirestoreSynchronizationApi,
  createSynchronizationRequest
} from "../../src/offline/automaticSynchronization";
import {
  createMemoryConfigurationCacheStorage,
  type ConfigurationCacheSnapshot
} from "../../src/offline/configurationCache";
import { createMemoryFirestoreSyncJournal } from "../../src/offline/firestoreSyncJournal";
import {
  addHarvestEntryOffline,
  closeHarvestSessionOffline,
  openHarvestSessionOffline
} from "../../src/offline/offlineHarvestFirestoreRuntime";

const projectId = "demo-borowka-pwa-offline-runtime";
const deviceId = "device-offline-integration-1";
const seedTimestamp = new Date("2026-07-17T08:00:00.000Z");
const seed = createInitialDomainSeed({ createdAt: seedTimestamp });

const firebaseServicesMock = vi.hoisted(() => ({
  getFirebaseServices: vi.fn()
}));

vi.mock("../../src/config/firebaseServices", () => ({
  getFirebaseServices: firebaseServicesMock.getFirebaseServices
}));

const operatorProfile: UserProfile = {
  uid: "operator-offline-1",
  email: "operator-offline-1@example.test",
  displayName: "Operator Offline",
  role: "OPERATOR",
  workerId: null,
  active: true,
  registrationStatus: "APPROVED",
  offlineConsent: true
};

let testEnvironment: RulesTestEnvironment | undefined;

beforeAll(async () => {
  testEnvironment = await initializeTestEnvironment({
    projectId,
    firestore: {
      host: "127.0.0.1",
      port: 8080,
      rules: readFileSync("firestore.rules", "utf8")
    }
  });
});

beforeEach(async () => {
  await testEnvironment?.clearFirestore();
  firebaseServicesMock.getFirebaseServices.mockReset();
  await seedServerConfiguration();
});

afterAll(async () => {
  await testEnvironment?.cleanup();
});

describe("offline harvest Firestore runtime", () => {
  it("persists OFF-T01 locally and synchronizes one session with ten unique entries", async () => {
    if (!testEnvironment) {
      throw new Error("Rules test environment was not initialized.");
    }

    const operatorFirestore = testEnvironment
      .authenticatedContext(operatorProfile.uid, {
        email: operatorProfile.email
      })
      .firestore();
    const journal = createMemoryFirestoreSyncJournal();
    const configurationStorage = createMemoryConfigurationCacheStorage([
      createConfigurationSnapshot()
    ]);

    firebaseServicesMock.getFirebaseServices.mockResolvedValue({
      firestore: operatorFirestore
    });

    await disableNetwork(operatorFirestore);

    const opened = await openHarvestSessionOffline(
      {},
      {
        actorProfile: operatorProfile,
        seasonId: seed.seasons[0].id,
        workerId: seed.workers[0].id,
        businessDate: "2026-07-17",
        note: "OFF-T01",
        secondSessionReason: null,
        isOnline: false,
        createdDeviceId: deviceId,
        persistentDataCacheReady: true,
        serviceWorkerReady: true
      },
      {
        configurationStorage,
        journal
      }
    );

    expect(opened.status).toBe("CREATED_OFFLINE");
    if (opened.status !== "CREATED_OFFLINE") {
      throw new Error("Expected a newly created offline session.");
    }

    for (let entryIndex = 0; entryIndex < 10; entryIndex += 1) {
      await addHarvestEntryOffline(
        {},
        {
          actorProfile: operatorProfile,
          sessionId: opened.session.id,
          quantityMilli: 1000,
          weightG: 1000,
          isOnline: false,
          createdDeviceId: deviceId
        },
        { journal }
      );
    }

    const closed = await closeHarvestSessionOffline(
      {},
      {
        actorProfile: operatorProfile,
        sessionId: opened.session.id,
        confirmationAccepted: true,
        isOnline: false,
        deviceId
      },
      { journal }
    );

    expect(closed.session).toMatchObject({
      status: "CLOSED",
      totalEntryCount: 10,
      totalQuantityMilli: 10_000,
      totalWeightG: 10_000,
      amountDueGrosz: 10_000
    });

    const cachedSession = await getDocFromCache(
      doc(operatorFirestore, "harvestSessions", opened.session.id)
    );
    const cachedEntries = await getDocsFromCache(
      query(
        collection(operatorFirestore, "harvestEntries"),
        where("sessionId", "==", opened.session.id),
        orderBy("sequenceNumber", "asc")
      )
    );

    expect(cachedSession.data()?.status).toBe("CLOSED");
    expect(cachedEntries.docs).toHaveLength(10);
    expect(new Set(cachedEntries.docs.map((entry) => entry.id)).size).toBe(10);
    const persistedJournalRecords = await journal.list({
      deviceId,
      userUid: operatorProfile.uid
    });
    const restartedJournal = createMemoryFirestoreSyncJournal(persistedJournalRecords);

    expect(persistedJournalRecords).toHaveLength(23);

    const synchronizationResult = await createFirestoreSynchronizationApi(
      restartedJournal
    ).synchronize(
      {},
      createSynchronizationRequest({
        deviceId,
        pendingDocumentCount: persistedJournalRecords.length,
        requestedAtIso: new Date().toISOString(),
        trigger: "ONLINE_RESTORED",
        userRole: operatorProfile.role,
        userUid: operatorProfile.uid
      })
    );

    expect(synchronizationResult.status).toBe("SUCCESS");
    expect(
      await restartedJournal.list({ deviceId, userUid: operatorProfile.uid })
    ).toEqual([]);

    const serverSession = await getDoc(
      doc(operatorFirestore, "harvestSessions", opened.session.id)
    );
    const serverEntries = await getDocs(
      query(
        collection(operatorFirestore, "harvestEntries"),
        where("sessionId", "==", opened.session.id),
        orderBy("sequenceNumber", "asc")
      )
    );

    expect(serverSession.data()).toMatchObject({
      status: "CLOSED",
      totalEntryCount: 10,
      totalQuantityMilli: 10_000,
      totalWeightG: 10_000,
      amountDueGrosz: 10_000
    });
    expect(serverEntries.docs).toHaveLength(10);
    expect(new Set(serverEntries.docs.map((entry) => entry.id)).size).toBe(10);
    expect(serverEntries.docs.every((entry) => entry.data().pendingSync === false)).toBe(
      true
    );
  }, 30_000);
});

async function seedServerConfiguration(): Promise<void> {
  if (!testEnvironment) {
    throw new Error("Rules test environment was not initialized.");
  }

  await testEnvironment.withSecurityRulesDisabled(async (context) => {
    const firestore = context.firestore();

    await Promise.all([
      ...createInitialDomainSeedWrites(seed).map((write) =>
        setDoc(doc(firestore, write.collectionPath, write.documentId), write.data)
      ),
      setDoc(doc(firestore, "users", operatorProfile.uid), operatorProfile)
    ]);
  });
}

function createConfigurationSnapshot(): ConfigurationCacheSnapshot {
  const season = seed.seasons[0];

  return {
    id: `${operatorProfile.uid}:${deviceId}`,
    version: 1,
    preparedAtIso: "2026-07-17T08:00:00.000Z",
    appVersion: APP_META.version,
    schemaVersion: APP_META.schemaVersion,
    calculationVersion: APP_META.calculationVersion,
    userUid: operatorProfile.uid,
    deviceId,
    viewerRole: "OPERATOR",
    account: {
      uid: operatorProfile.uid,
      email: operatorProfile.email,
      displayName: operatorProfile.displayName,
      role: operatorProfile.role,
      workerId: operatorProfile.workerId ?? null,
      offlineConsent: true
    },
    activeSeason: {
      id: season.id,
      name: season.name,
      startDate: season.startDate,
      endDate: season.endDate,
      status: season.status,
      isDefault: season.isDefault
    },
    workers: seed.workers.map((worker) => ({
      id: worker.id,
      displayName: worker.displayName,
      normalizedName: worker.normalizedName,
      active: worker.active,
      currentPlanId: worker.currentPlanId,
      currentRateVersionId: worker.currentRateVersionId
    })),
    plans: seed.settlementPlans.map((plan) => ({
      id: plan.id,
      name: plan.name,
      code: plan.code,
      calculationBasis: plan.calculationBasis,
      unitLabelSingular: plan.unitLabelSingular,
      unitLabelPlural: plan.unitLabelPlural,
      unitSymbol: plan.unitSymbol,
      quantityPrecision: plan.quantityPrecision,
      weightRequired: plan.weightRequired,
      allowBatchQuantity: plan.allowBatchQuantity,
      active: plan.active
    })),
    rateVersions: seed.workerRateVersions.map((rate) => ({
      id: rate.id,
      workerId: rate.workerId,
      planId: rate.planId,
      rateGroszPerUnit: rate.rateGroszPerUnit,
      validFrom: rate.validFrom,
      validTo: rate.validTo,
      active: rate.active,
      supersedesRateId: rate.supersedesRateId
    })),
    openSessions: [],
    invalidDocumentCount: 0
  };
}
