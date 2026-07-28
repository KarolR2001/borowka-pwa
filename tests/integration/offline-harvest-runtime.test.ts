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
import { addHarvestEntryOnline } from "../../src/harvest/harvestEntryRuntime";
import {
  createFirestoreSynchronizationApi,
  createSynchronizationRequest
} from "../../src/offline/automaticSynchronization";
import {
  createMemoryConfigurationCacheStorage,
  type ConfigurationCacheSnapshot
} from "../../src/offline/configurationCache";
import {
  createMemoryFirestoreSyncJournal,
  toSyncDocumentMetadata
} from "../../src/offline/firestoreSyncJournal";
import {
  addHarvestEntryOffline,
  closeHarvestSessionOffline,
  openHarvestSessionOffline
} from "../../src/offline/offlineHarvestFirestoreRuntime";
import {
  createPwaUpdateRecoveryBaseline,
  evaluatePwaUpdateActivationGate,
  verifyPwaUpdateCompletion,
  type PwaUpdateRecoveryDocument
} from "../../src/pwa/pwaUpdateRecovery";
import { evaluatePwaUpdateDecision } from "../../src/pwa/pwaUpdatePolicy";

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
    expect(await countDocumentsWithoutRules("auditEvents")).toBe(12);
  }, 30_000);

  it("retries OFF-T02 with the same UUID after a lost response without a duplicate", async () => {
    if (!testEnvironment) {
      throw new Error("Rules test environment was not initialized.");
    }

    const operatorFirestore = testEnvironment
      .authenticatedContext(operatorProfile.uid, {
        email: operatorProfile.email
      })
      .firestore();
    const journal = createMemoryFirestoreSyncJournal();

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
        businessDate: "2026-07-18",
        note: "OFF-T02",
        secondSessionReason: null,
        isOnline: false,
        createdDeviceId: deviceId,
        persistentDataCacheReady: true,
        serviceWorkerReady: true
      },
      {
        configurationStorage: createMemoryConfigurationCacheStorage([
          createConfigurationSnapshot()
        ]),
        journal
      }
    );

    if (opened.status !== "CREATED_OFFLINE") {
      throw new Error("Expected OFF-T02 offline session.");
    }

    const identity = {
      id: "off-t02-stable-entry",
      sequenceNumber: 1
    };
    const first = await addHarvestEntryOffline(
      {},
      {
        actorProfile: operatorProfile,
        sessionId: opened.session.id,
        quantityMilli: 1000,
        weightG: 1000,
        isOnline: false,
        createdDeviceId: deviceId,
        identity
      },
      { journal }
    );
    const retry = await addHarvestEntryOffline(
      {},
      {
        actorProfile: operatorProfile,
        sessionId: opened.session.id,
        quantityMilli: 1000,
        weightG: 1000,
        isOnline: false,
        createdDeviceId: deviceId,
        identity
      },
      { journal }
    );
    const pending = await journal.list({
      deviceId,
      userUid: operatorProfile.uid
    });

    expect(retry.entry.id).toBe(first.entry.id);
    expect(retry.message).toBe("Wpis #1 juz istnieje.");
    expect(pending).toHaveLength(4);

    const synchronizationResult = await createFirestoreSynchronizationApi(
      journal
    ).synchronize(
      {},
      createSynchronizationRequest({
        deviceId,
        pendingDocumentCount: pending.length,
        requestedAtIso: new Date().toISOString(),
        trigger: "MANUAL_RETRY",
        userRole: operatorProfile.role,
        userUid: operatorProfile.uid
      })
    );
    const onlineRetry = await addHarvestEntryOnline(
      {},
      {
        actorProfile: operatorProfile,
        sessionId: opened.session.id,
        quantityMilli: 1000,
        weightG: 1000,
        isOnline: true,
        createdDeviceId: deviceId,
        identity
      }
    );
    const serverEntries = await getDocs(
      query(
        collection(operatorFirestore, "harvestEntries"),
        where("sessionId", "==", opened.session.id)
      )
    );

    expect(synchronizationResult.status).toBe("SUCCESS");
    expect(onlineRetry).toMatchObject({
      entry: {
        id: identity.id
      },
      message: "Wpis #1 juz istnieje."
    });
    expect(serverEntries.docs).toHaveLength(1);
    expect(serverEntries.docs[0]?.id).toBe(identity.id);
    expect(await countDocumentsWithoutRules("auditEvents")).toBe(2);
  }, 30_000);

  it("synchronizes version A before activating version B without loss or duplicates", async () => {
    if (!testEnvironment) {
      throw new Error("Rules test environment was not initialized.");
    }

    const operatorFirestore = testEnvironment
      .authenticatedContext(operatorProfile.uid, {
        email: operatorProfile.email
      })
      .firestore();
    const journal = createMemoryFirestoreSyncJournal();

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
        businessDate: "2026-07-19",
        note: "PWA-UPDATE-A-TO-B",
        secondSessionReason: null,
        isOnline: false,
        createdDeviceId: deviceId,
        persistentDataCacheReady: true,
        serviceWorkerReady: true
      },
      {
        configurationStorage: createMemoryConfigurationCacheStorage([
          createConfigurationSnapshot()
        ]),
        journal
      }
    );

    if (opened.status !== "CREATED_OFFLINE") {
      throw new Error("Expected an offline session created by version A.");
    }

    for (let entryIndex = 0; entryIndex < 3; entryIndex += 1) {
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

    await closeHarvestSessionOffline(
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

    const pending = await journal.list({
      deviceId,
      userUid: operatorProfile.uid
    });
    const pendingMetadata = pending.map(toSyncDocumentMetadata);
    const baseline = createPwaUpdateRecoveryBaseline({
      createdAt: new Date("2026-07-19T12:00:00.000Z"),
      pendingDocuments: pendingMetadata,
      sourceVersion: "6.28-a",
      targetVersion: "6.28-b"
    });
    const blockedDecision = evaluatePwaUpdateDecision({
      hasActiveForm: false,
      hasActiveHarvestSession: false,
      syncDocuments: pendingMetadata
    });
    const blockedGate = evaluatePwaUpdateActivationGate({
      baseline,
      confirmedServerDocuments: [],
      currentSyncDocuments: pendingMetadata,
      decision: blockedDecision,
      synchronizationStatus: "FAILED",
      updateAvailable: true
    });

    expect(pending).toHaveLength(9);
    expect(blockedDecision.status).toBe("DEFER_REQUIRED");
    expect(blockedGate.status).toBe("BLOCKED");

    const synchronizationResult = await createFirestoreSynchronizationApi(
      journal
    ).synchronize(
      {},
      createSynchronizationRequest({
        deviceId,
        pendingDocumentCount: pending.length,
        requestedAtIso: new Date().toISOString(),
        trigger: "ONLINE_RESTORED",
        userRole: operatorProfile.role,
        userUid: operatorProfile.uid
      })
    );
    const remaining = await journal.list({
      deviceId,
      userUid: operatorProfile.uid
    });
    const serverSession = await getDoc(
      doc(operatorFirestore, "harvestSessions", opened.session.id)
    );
    const serverEntries = await getDocs(
      query(
        collection(operatorFirestore, "harvestEntries"),
        where("sessionId", "==", opened.session.id)
      )
    );
    const serverAuditIds = await listDocumentIdsWithoutRules("auditEvents");
    const confirmedServerDocuments: PwaUpdateRecoveryDocument[] = [
      ...(serverSession.exists()
        ? [{ id: serverSession.id, kind: "HARVEST_SESSION" as const }]
        : []),
      ...serverEntries.docs.map((entry) => ({
        id: entry.id,
        kind: "HARVEST_ENTRY" as const
      })),
      ...serverAuditIds.map((id) => ({
        id,
        kind: "AUDIT_EVENT" as const
      }))
    ];
    const readyDecision = evaluatePwaUpdateDecision({
      hasActiveForm: false,
      hasActiveHarvestSession: false,
      syncDocuments: remaining.map(toSyncDocumentMetadata)
    });
    const readyGate = evaluatePwaUpdateActivationGate({
      baseline,
      confirmedServerDocuments,
      currentSyncDocuments: remaining.map(toSyncDocumentMetadata),
      decision: readyDecision,
      synchronizationStatus: synchronizationResult.status,
      updateAvailable: true
    });
    const completion = verifyPwaUpdateCompletion({
      activeVersion: "6.28-b",
      baseline,
      gate: readyGate
    });

    expect(synchronizationResult.status).toBe("SUCCESS");
    expect(remaining).toEqual([]);
    expect(serverSession.data()).toMatchObject({
      status: "CLOSED",
      totalEntryCount: 3
    });
    expect(serverEntries.docs).toHaveLength(3);
    expect(new Set(serverEntries.docs.map((entry) => entry.id)).size).toBe(3);
    expect(serverAuditIds).toHaveLength(5);
    expect(confirmedServerDocuments).toHaveLength(baseline.expectedDocuments.length);
    expect(readyGate).toMatchObject({
      blockers: [],
      canActivate: true,
      expectedDocumentCount: 9,
      status: "READY"
    });
    expect(completion).toMatchObject({
      activeVersion: "6.28-b",
      issues: [],
      sourceVersion: "6.28-a",
      status: "PASS",
      targetVersion: "6.28-b"
    });
  }, 30_000);

  it("synchronizes a long OFF-T05 run with four sessions and one hundred entries", async () => {
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

    const sessionIds: string[] = [];
    const entryIds: string[] = [];

    for (let sessionIndex = 0; sessionIndex < 4; sessionIndex += 1) {
      const opened = await openHarvestSessionOffline(
        {},
        {
          actorProfile: operatorProfile,
          seasonId: seed.seasons[0].id,
          workerId: seed.workers[0].id,
          businessDate: `2026-07-${String(19 + sessionIndex).padStart(2, "0")}`,
          note: "OFF-T05",
          secondSessionReason: null,
          isOnline: false,
          createdDeviceId: deviceId,
          persistentDataCacheReady: true,
          serviceWorkerReady: true
        },
        { configurationStorage, journal }
      );

      if (opened.status !== "CREATED_OFFLINE") {
        throw new Error("Expected OFF-T05 offline session.");
      }

      sessionIds.push(opened.session.id);

      for (let entryIndex = 0; entryIndex < 25; entryIndex += 1) {
        const entry = await addHarvestEntryOffline(
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

        entryIds.push(entry.entry.id);
      }

      if (sessionIndex < 2) {
        await closeHarvestSessionOffline(
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
      }
    }

    const pending = await journal.list({
      deviceId,
      userUid: operatorProfile.uid
    });

    expect(pending).toHaveLength(210);

    const restartedJournal = createMemoryFirestoreSyncJournal(pending);
    const synchronizationResult = await createFirestoreSynchronizationApi(
      restartedJournal
    ).synchronize(
      {},
      createSynchronizationRequest({
        deviceId,
        pendingDocumentCount: pending.length,
        requestedAtIso: new Date().toISOString(),
        trigger: "ONLINE_RESTORED",
        userRole: operatorProfile.role,
        userUid: operatorProfile.uid
      })
    );
    const serverSessions = await getDocs(
      collection(operatorFirestore, "harvestSessions")
    );
    const serverEntries = await getDocs(collection(operatorFirestore, "harvestEntries"));

    expect(synchronizationResult.status).toBe("SUCCESS");
    expect(new Set(sessionIds).size).toBe(4);
    expect(new Set(entryIds).size).toBe(100);
    expect(
      serverSessions.docs.filter((session) => sessionIds.includes(session.id))
    ).toHaveLength(4);
    expect(
      serverEntries.docs.filter((entry) => entryIds.includes(entry.id))
    ).toHaveLength(100);
    expect(
      serverSessions.docs.filter(
        (session) => sessionIds.includes(session.id) && session.data().status === "CLOSED"
      )
    ).toHaveLength(2);
    expect(
      serverSessions.docs.filter(
        (session) => sessionIds.includes(session.id) && session.data().status === "OPEN"
      )
    ).toHaveLength(2);
    expect(
      serverEntries.docs
        .filter((entry) => entryIds.includes(entry.id))
        .reduce((sum, entry) => sum + Number(entry.data().quantityMilli), 0)
    ).toBe(100_000);
    expect(await countDocumentsWithoutRules("auditEvents")).toBe(106);
    expect(
      await restartedJournal.list({
        deviceId,
        userUid: operatorProfile.uid
      })
    ).toEqual([]);
  }, 120_000);
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

async function countDocumentsWithoutRules(collectionPath: string): Promise<number> {
  return (await listDocumentIdsWithoutRules(collectionPath)).length;
}

async function listDocumentIdsWithoutRules(collectionPath: string): Promise<string[]> {
  if (!testEnvironment) {
    throw new Error("Rules test environment was not initialized.");
  }

  let documentIds: string[] = [];

  await testEnvironment.withSecurityRulesDisabled(async (context) => {
    const snapshot = await getDocs(collection(context.firestore(), collectionPath));

    documentIds = snapshot.docs.map((document) => document.id);
  });

  return documentIds;
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
