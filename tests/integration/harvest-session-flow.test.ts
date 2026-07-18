import {
  assertFails,
  initializeTestEnvironment,
  type RulesTestContext,
  type RulesTestEnvironment
} from "@firebase/rules-unit-testing";
import {
  Timestamp,
  collection,
  doc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  type QuerySnapshot
} from "firebase/firestore";
import { readFileSync } from "node:fs";
import {
  createInitialDomainSeed,
  createInitialDomainSeedWrites
} from "../../src/domain/domainConfiguration";
import type { UserProfile } from "../../src/domain/identity";
import {
  calculateHarvestSessionTotals,
  type CalculableHarvestEntry
} from "../../src/harvest/harvestSessionCalculation";
import { validateHarvestEntryDraft } from "../../src/harvest/harvestEntryValidation";
import { prepareCloseHarvestSessionOnline } from "../../src/harvest/closeHarvestSession";
import {
  prepareOpenHarvestSession,
  type HarvestSessionDocument
} from "../../src/harvest/openHarvestSession";

const projectId = "demo-borowka-pwa-harvest-integration";
const createdAtDevice = Timestamp.fromDate(new Date("2026-07-17T08:00:00.000Z"));
const closedAtDevice = Timestamp.fromDate(new Date("2026-07-17T10:00:00.000Z"));
const deviceId = "device-integration-1";
const seed = createInitialDomainSeed({ createdAt: createdAtDevice });

let testEnv: RulesTestEnvironment | undefined;

type TestFirestore = ReturnType<RulesTestContext["firestore"]>;

const adminProfile: UserProfile = {
  uid: "admin-1",
  email: "admin-1@example.test",
  displayName: "Admin",
  role: "ADMIN",
  active: true,
  registrationStatus: "APPROVED",
  offlineConsent: true
};

const operatorProfile: UserProfile = {
  uid: "operator-1",
  email: "operator-1@example.test",
  displayName: "Operator",
  role: "OPERATOR",
  active: true,
  registrationStatus: "APPROVED",
  offlineConsent: true
};

const pickerProfile: UserProfile = {
  uid: "picker-anna",
  email: "picker-anna@example.test",
  displayName: "Picker Anna",
  role: "PICKER",
  workerId: "worker-anna-test",
  active: true,
  registrationStatus: "APPROVED",
  offlineConsent: true
};

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    projectId,
    firestore: {
      host: "127.0.0.1",
      port: 8080,
      rules: readFileSync("firestore.rules", "utf8")
    }
  });
});

afterEach(async () => {
  await testEnv?.clearFirestore();
});

afterAll(async () => {
  await testEnv?.cleanup();
});

describe("harvest session integration flow", () => {
  it("creates one session with ten entries, closes it and blocks further operator entries", async () => {
    await seedConfiguration();
    const operatorDb = getActorFirestore("operator-1");
    const preparedOpen = prepareOpenHarvestSession({
      actorProfile: operatorProfile,
      id: "session-integration-1",
      season: seed.seasons[0],
      worker: seed.workers[0],
      plans: seed.settlementPlans,
      rateVersions: seed.workerRateVersions,
      businessDate: "2026-07-17",
      existingSessions: [],
      isOnline: true,
      createdDeviceId: deviceId,
      createdAtDevice
    });

    if (preparedOpen.status !== "CREATED") {
      throw new Error("Expected integration session to be created.");
    }

    const openedSession = preparedOpen.session;
    await setDoc(doc(operatorDb, "harvestSessions", openedSession.id), {
      ...openedSession,
      createdAtServer: serverTimestamp()
    });

    const observedEntryIds: string[][] = [];
    const observedAmounts: number[] = [];
    const entriesQuery = query(
      collection(operatorDb, "harvestEntries"),
      where("sessionId", "==", openedSession.id),
      orderBy("sequenceNumber", "asc")
    );
    const unsubscribe = onSnapshot(entriesQuery, (snapshot) => {
      const entries = decodeCalculableEntries(snapshot);
      observedEntryIds.push(snapshot.docs.map((entrySnapshot) => entrySnapshot.id));
      observedAmounts.push(
        calculateHarvestSessionTotals({
          session: openedSession,
          entries
        }).amountDueGrosz
      );
    });

    try {
      await waitForCondition(
        () => observedEntryIds.length > 0,
        "Initial harvest entry listener snapshot did not arrive."
      );

      const writtenEntries = await writeTenHarvestEntries(operatorDb, openedSession);

      await waitForCondition(
        () => observedEntryIds.some((entryIds) => entryIds.length === 10),
        "Harvest entry listener did not observe ten entries."
      );

      const finalObservedIds = observedEntryIds.at(-1) ?? [];
      expect(finalObservedIds).toHaveLength(10);
      expect(new Set(finalObservedIds).size).toBe(10);
      expect(observedAmounts.at(-1)).toBe(10_000);

      const persistedEntries = decodeCalculableEntries(await getDocs(entriesQuery));
      const trustedTotals = calculateHarvestSessionTotals({
        session: openedSession,
        entries: persistedEntries
      });

      expect(persistedEntries).toHaveLength(10);
      expect(trustedTotals).toMatchObject({
        activeEntryCount: 10,
        totalQuantityMilli: 10_000,
        totalWeightG: 10_000,
        amountDueGrosz: 10_000
      });
      expect(writtenEntries).toHaveLength(10);

      const closeResult = prepareCloseHarvestSessionOnline({
        actorProfile: operatorProfile,
        session: openedSession,
        entries: persistedEntries,
        season: seed.seasons[0],
        worker: seed.workers[0],
        rateVersion: seed.workerRateVersions[0],
        isOnline: true,
        pendingWriteCount: 0,
        confirmationAccepted: true,
        closedAtDevice,
        closedAtServer: serverTimestamp(),
        auditId: "audit-close-integration-1",
        deviceId
      });
      await updateDoc(
        doc(operatorDb, "harvestSessions", openedSession.id),
        closeResult.sessionUpdate
      );
      expect(closeResult.auditEvent.action).toBe("HARVEST_SESSION_CLOSED");

      await assertFails(
        setDoc(
          doc(operatorDb, "harvestEntries", "entry-after-close"),
          buildHarvestEntryDocument({
            session: openedSession,
            sequenceNumber: 11,
            quantityMilli: 1000,
            createdAtDevice: Timestamp.fromDate(new Date("2026-07-17T10:10:00.000Z"))
          }).document
        )
      );
    } finally {
      unsubscribe();
    }
  });
});

async function seedConfiguration(): Promise<void> {
  if (!testEnv) {
    throw new Error("Rules test environment was not initialized.");
  }

  await testEnv.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    const seedWrites = createInitialDomainSeedWrites(seed).map((write) =>
      setDoc(doc(db, write.collectionPath, write.documentId), write.data)
    );
    const userWrites = [adminProfile, operatorProfile, pickerProfile].map((profile) =>
      setDoc(doc(db, "users", profile.uid), profile)
    );

    await Promise.all([...seedWrites, ...userWrites]);
  });
}

function getActorFirestore(uid: string): TestFirestore {
  if (!testEnv) {
    throw new Error("Rules test environment was not initialized.");
  }

  return testEnv.authenticatedContext(uid, { email: `${uid}@example.test` }).firestore();
}

async function writeTenHarvestEntries(
  firestore: TestFirestore,
  session: HarvestSessionDocument
): Promise<CalculableHarvestEntry[]> {
  const entries: CalculableHarvestEntry[] = [];
  let runningSession = session;

  for (let index = 1; index <= 10; index += 1) {
    const entry = buildHarvestEntryDocument({
      session: runningSession,
      sequenceNumber: index,
      quantityMilli: 1000,
      createdAtDevice: Timestamp.fromDate(
        new Date(`2026-07-17T08:${String(index).padStart(2, "0")}:00.000Z`)
      )
    });
    await setDoc(doc(firestore, "harvestEntries", entry.document.id), entry.document);
    entries.push({
      id: entry.document.id,
      status: "ACTIVE",
      quantityMilli: entry.document.quantityMilli,
      weightG: entry.document.weightG
    });
    runningSession = {
      ...runningSession,
      totalEntryCount: entry.nextSessionTotals.totalEntryCount,
      totalQuantityMilli: entry.nextSessionTotals.totalQuantityMilli,
      totalWeightG: entry.nextSessionTotals.totalWeightG
    };
  }

  return entries;
}

function buildHarvestEntryDocument({
  session,
  sequenceNumber,
  quantityMilli,
  createdAtDevice
}: {
  session: HarvestSessionDocument;
  sequenceNumber: number;
  quantityMilli: number;
  createdAtDevice: Timestamp;
}) {
  const id = `entry-${String(sequenceNumber).padStart(2, "0")}`;
  const validated = validateHarvestEntryDraft({
    actorProfile: operatorProfile,
    session,
    draft: {
      id,
      sequenceNumber,
      sessionId: session.id,
      seasonId: session.seasonId,
      workerId: session.workerId,
      businessDate: session.businessDate,
      createdBy: operatorProfile.uid,
      quantityMilli,
      weightG: quantityMilli
    },
    isOnline: true
  });

  return {
    document: {
      id,
      sessionId: validated.sessionId,
      seasonId: validated.seasonId,
      workerId: validated.workerId,
      businessDate: validated.businessDate,
      status: "ACTIVE" as const,
      sequenceNumber: validated.sequenceNumber,
      quantityMilli: validated.quantityMilli,
      weightG: validated.weightG,
      amountPreviewGrosz: validated.amountPreviewGrosz,
      stockWeightG: validated.stockWeightG,
      pendingSync: false,
      createdBy: validated.createdBy,
      createdDeviceId: deviceId,
      createdAtDevice,
      createdAtServer: serverTimestamp(),
      replacesEntryId: null,
      cancellationReason: null,
      cancelledBy: null,
      cancelledAtServer: null,
      revision: 1
    },
    nextSessionTotals: validated.nextSessionTotals
  };
}

function decodeCalculableEntries(snapshot: QuerySnapshot): CalculableHarvestEntry[] {
  return snapshot.docs.map((entrySnapshot) => {
    const data = entrySnapshot.data();

    return {
      id: readString(data.id, entrySnapshot.id),
      status: data.status === "CANCELLED" ? "CANCELLED" : "ACTIVE",
      quantityMilli: readNumber(data.quantityMilli),
      weightG: data.weightG === null ? null : readNumber(data.weightG)
    };
  });
}

function readString(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim().length > 0 ? value : fallback;
}

function readNumber(value: unknown): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value)) {
    throw new Error("Persisted harvest entry has an invalid numeric field.");
  }

  return value;
}

async function waitForCondition(
  predicate: () => boolean,
  errorMessage: string
): Promise<void> {
  const startedAt = Date.now();

  while (Date.now() - startedAt < 5000) {
    if (predicate()) {
      return;
    }

    await sleep(25);
  }

  throw new Error(errorMessage);
}

async function sleep(milliseconds: number): Promise<void> {
  await new Promise<void>((resolve) => {
    setTimeout(resolve, milliseconds);
  });
}
