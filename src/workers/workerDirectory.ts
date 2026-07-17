import {
  AUDIT_EVENTS_COLLECTION,
  createAuditEventDraft,
  createAuditEventId,
  decodeAuditEvent,
  type AuditAction,
  type AuditEventDocument,
  type AuditSummary
} from "../audit/auditEvents";
import { getFirebaseServices } from "../config/firebaseServices";
import {
  SETTLEMENT_PLANS_COLLECTION,
  WORKERS_COLLECTION,
  WORKER_RATE_VERSIONS_COLLECTION,
  normalizeWorkerName,
  type SettlementPlanDocument,
  type WorkerDocument,
  type WorkerRateVersionDocument
} from "../domain/domainConfiguration";
import { formatKilograms, formatMoney } from "../domain/format";
import {
  decodeUserProfile,
  normalizeEmail,
  roleRequiresWorkerId,
  type UserProfile
} from "../domain/identity";
import { decodeSettlementPlan, decodeWorkerRateVersion } from "../plans/settlementPlans";

type FirebaseEnv = Record<string, string | boolean | undefined>;

export type WorkerDirectoryScope = "ADMIN" | "OPERATOR";

export type WorkerDirectoryListInput = {
  viewerRole: WorkerDirectoryScope;
};

export type CreateWorkerInput = {
  actorProfile: UserProfile;
  displayName: string;
  planId: string;
  rateGroszPerUnit: number;
  validFrom: string;
  phone?: string | null;
  emailContact?: string | null;
  notes?: string | null;
  confirmSimilarName: boolean;
  deviceId: string;
};

export type CreateWorkerRateVersionInput = {
  actorProfile: UserProfile;
  workerId: string;
  expectedCurrentRateVersionId?: string | null;
  planId: string;
  rateGroszPerUnit: number;
  validFrom: string;
  note?: string | null;
  confirmBackdatedRate: boolean;
  confirmHistoricalSnapshotsUnchanged: boolean;
  confirmPeriodWarning: boolean;
  deviceId: string;
  businessDate?: string | null;
};

export type UpdateWorkerAccountLinkInput = {
  actorProfile: UserProfile;
  workerId: string;
  targetUid?: string | null;
  reason: string;
  confirmPrivacyNotice: boolean;
  deviceId: string;
};

export type ArchiveWorkerConfirmations = {
  confirmOpenSessionsReviewed: boolean;
  confirmDueAmountReviewed: boolean;
  confirmActiveAccountRemains: boolean;
  confirmCurrentRateReviewed: boolean;
  confirmFutureRatesReviewed: boolean;
};

export type ArchiveWorkerInput = {
  actorProfile: UserProfile;
  workerId: string;
  reason: string;
  confirmations: ArchiveWorkerConfirmations;
  deviceId: string;
  businessDate?: string | null;
};

export type PreparedWorkerCreate = {
  worker: WorkerDocument;
  rateVersion: WorkerRateVersionDocument;
  auditAction: AuditAction;
  beforeSummary: AuditSummary | null;
  afterSummary: AuditSummary;
  reason: string | null;
  deviceId: string;
  similarNameWarning: string | null;
};

export type PreparedWorkerRateVersionCreate = {
  worker: WorkerDocument;
  rateVersion: WorkerRateVersionDocument;
  previousRateVersion: WorkerRateVersionDocument;
  auditAction: AuditAction;
  beforeSummary: AuditSummary;
  afterSummary: AuditSummary;
  reason: string | null;
  deviceId: string;
  backdatedWarning: string | null;
  periodWarning: string | null;
};

export type PreparedWorkerAccountLinkUpdate = {
  worker: WorkerDocument;
  linkedProfile: UserProfile | null;
  releasedProfile: UserProfile | null;
  auditAction: AuditAction;
  beforeSummary: AuditSummary;
  afterSummary: AuditSummary;
  reason: string;
  deviceId: string;
  privacyWarning: string;
};

export type PreparedWorkerArchive = {
  worker: WorkerDocument;
  auditAction: AuditAction;
  beforeSummary: AuditSummary;
  afterSummary: AuditSummary;
  reason: string;
  deviceId: string;
  warnings: string[];
};

export type WorkerDocumentSnapshot = {
  id: string;
  data: unknown;
};

export type WorkerDirectoryUserSnapshot = {
  id: string;
  data: unknown;
};

export type WorkerDirectoryAuditEventSnapshot = {
  id: string;
  data: unknown;
};

export type InvalidWorker = {
  id: string;
  reason: string;
};

export type WorkerSeasonSummary = {
  totalKgGrams: number | null;
  earnedGrosz: number | null;
  paidGrosz: number | null;
  dueGrosz: number | null;
};

export type WorkerDirectoryListItem = WorkerDocument & {
  currentPlan: SettlementPlanDocument | null;
  currentRateVersion: WorkerRateVersionDocument | null;
  rateVersions: WorkerRateVersionDocument[];
  linkedUser: UserProfile | null;
  auditEvents: AuditEventDocument[];
  warnings: string[];
  seasonSummary: WorkerSeasonSummary;
};

export type InvalidWorkerDirectoryDocument = {
  id: string;
  reason: string;
};

export type WorkerDirectoryResult = {
  workers: WorkerDirectoryListItem[];
  plans: SettlementPlanDocument[];
  profiles: UserProfile[];
  invalidWorkers: InvalidWorkerDirectoryDocument[];
  invalidPlans: InvalidWorkerDirectoryDocument[];
  invalidRateVersions: InvalidWorkerDirectoryDocument[];
  invalidProfiles: InvalidWorkerDirectoryDocument[];
  invalidAuditEvents: InvalidWorkerDirectoryDocument[];
};

export type WorkerActivityFilter = "ACTIVE" | "ARCHIVED" | "ALL";
export type WorkerSortKey = "NAME" | "TOTAL_KG" | "EARNED";

export type WorkerRateHistoryStatus = "CURRENT" | "FUTURE" | "PAST" | "INACTIVE";

export type WorkerRateHistoryItem = {
  rateVersion: WorkerRateVersionDocument;
  status: WorkerRateHistoryStatus;
  warnings: string[];
};

export type WorkerRateConsistencyLevel = "OK" | "WARNING" | "ERROR";

export type WorkerRateConsistencyCheck = {
  id: string;
  level: WorkerRateConsistencyLevel;
  label: string;
  detail: string;
};

export type WorkerRateConsistencyReport = {
  level: WorkerRateConsistencyLevel;
  checks: WorkerRateConsistencyCheck[];
  limitations: string[];
};

export type WorkerDirectoryFilters = {
  search: string;
  activity: WorkerActivityFilter;
  planId: string;
  sort: WorkerSortKey;
};

export type WorkerDecodeResult =
  | {
      status: "FOUND";
      worker: WorkerDocument;
    }
  | {
      status: "INVALID";
      reason: string;
    };

export const defaultWorkerDirectoryFilters: WorkerDirectoryFilters = {
  search: "",
  activity: "ALL",
  planId: "ALL",
  sort: "NAME"
};

export async function listWorkerDirectory(
  env: FirebaseEnv,
  input: WorkerDirectoryListInput
): Promise<WorkerDirectoryResult> {
  const { firestore } = await getFirebaseServices(env);
  const { collection, getDocs, query, where } = await import("firebase/firestore/lite");

  const workersQuery =
    input.viewerRole === "ADMIN"
      ? collection(firestore, WORKERS_COLLECTION)
      : query(collection(firestore, WORKERS_COLLECTION), where("active", "==", true));
  const plansQuery =
    input.viewerRole === "ADMIN"
      ? collection(firestore, SETTLEMENT_PLANS_COLLECTION)
      : query(
          collection(firestore, SETTLEMENT_PLANS_COLLECTION),
          where("active", "==", true)
        );
  const ratesQuery =
    input.viewerRole === "ADMIN"
      ? collection(firestore, WORKER_RATE_VERSIONS_COLLECTION)
      : query(
          collection(firestore, WORKER_RATE_VERSIONS_COLLECTION),
          where("active", "==", true)
        );

  const [
    workersSnapshot,
    plansSnapshot,
    rateVersionsSnapshot,
    usersSnapshot,
    auditEventsSnapshot
  ] = await Promise.all([
    getDocs(workersQuery),
    getDocs(plansQuery),
    getDocs(ratesQuery),
    input.viewerRole === "ADMIN"
      ? getDocs(collection(firestore, "users"))
      : Promise.resolve(null),
    input.viewerRole === "ADMIN"
      ? getDocs(collection(firestore, AUDIT_EVENTS_COLLECTION))
      : Promise.resolve(null)
  ]);

  return buildWorkerDirectory({
    workerDocuments: workersSnapshot.docs.map((documentSnapshot) => ({
      id: documentSnapshot.id,
      data: documentSnapshot.data()
    })),
    planDocuments: plansSnapshot.docs.map((documentSnapshot) => ({
      id: documentSnapshot.id,
      data: documentSnapshot.data()
    })),
    rateVersionDocuments: rateVersionsSnapshot.docs.map((documentSnapshot) => ({
      id: documentSnapshot.id,
      data: documentSnapshot.data()
    })),
    userDocuments:
      usersSnapshot?.docs.map((documentSnapshot) => ({
        id: documentSnapshot.id,
        data: documentSnapshot.data()
      })) ?? [],
    auditEventDocuments:
      auditEventsSnapshot?.docs.map((documentSnapshot) => ({
        id: documentSnapshot.id,
        data: documentSnapshot.data()
      })) ?? []
  });
}

export async function createWorkerWithInitialRate(
  env: FirebaseEnv,
  input: CreateWorkerInput
): Promise<PreparedWorkerCreate> {
  const { firestore } = await getFirebaseServices(env);
  const { Timestamp, doc, serverTimestamp, writeBatch } =
    await import("firebase/firestore/lite");
  const directory = await listWorkerDirectory(env, {
    viewerRole: "ADMIN"
  });
  const workerId = createWorkerId();
  const prepared = prepareWorkerCreate(directory.workers, directory.plans, {
    ...input,
    workerId,
    createdAt: serverTimestamp()
  });
  const auditId = createAuditEventId();
  const batch = writeBatch(firestore);

  batch.set(doc(firestore, WORKERS_COLLECTION, prepared.worker.id), prepared.worker);
  batch.set(
    doc(firestore, WORKER_RATE_VERSIONS_COLLECTION, prepared.rateVersion.id),
    prepared.rateVersion
  );
  batch.set(
    doc(firestore, AUDIT_EVENTS_COLLECTION, auditId),
    createAuditEventDraft({
      id: auditId,
      actorUid: input.actorProfile.uid,
      actorRoleSnapshot: input.actorProfile.role,
      action: prepared.auditAction,
      entityType: "WORKER",
      entityId: prepared.worker.id,
      beforeSummary: prepared.beforeSummary,
      afterSummary: prepared.afterSummary,
      reason: prepared.reason,
      createdAtDevice: Timestamp.now(),
      createdAtServer: serverTimestamp(),
      deviceId: prepared.deviceId
    })
  );

  await batch.commit();

  return prepared;
}

export async function createWorkerRateVersion(
  env: FirebaseEnv,
  input: CreateWorkerRateVersionInput
): Promise<PreparedWorkerRateVersionCreate> {
  const { firestore } = await getFirebaseServices(env);
  const { Timestamp, doc, runTransaction, serverTimestamp } =
    await import("firebase/firestore/lite");
  const directory = await listWorkerDirectory(env, {
    viewerRole: "ADMIN"
  });
  const prefetchedWorker = findWorkerOrThrow(directory.workers, input.workerId);
  const workerId = normalizeRequiredText(input.workerId, "Wybierz zbieracza.");
  const planId = normalizeRequiredText(input.planId, "Wybierz plan rozliczenia.");
  const validFrom = normalizeBusinessDate(input.validFrom);
  const newRateVersionId = createWorkerRateVersionId(workerId, validFrom);
  const workerRef = doc(firestore, WORKERS_COLLECTION, workerId);
  const planRef = doc(firestore, SETTLEMENT_PLANS_COLLECTION, planId);
  const newRateVersionRef = doc(
    firestore,
    WORKER_RATE_VERSIONS_COLLECTION,
    newRateVersionId
  );
  const businessDate = input.businessDate ?? currentBusinessDate();

  return runTransaction(firestore, async (transaction) => {
    const [workerSnapshot, planSnapshot, newRateVersionSnapshot] = await Promise.all([
      transaction.get(workerRef),
      transaction.get(planRef),
      transaction.get(newRateVersionRef)
    ]);

    if (!workerSnapshot.exists()) {
      throw new Error("Wybrany zbieracz nie istnieje.");
    }

    if (!planSnapshot.exists()) {
      throw new Error("Wybrany plan nie istnieje.");
    }

    const currentWorkerDocument = decodeWorkerSnapshotOrThrow(
      workerSnapshot.id,
      workerSnapshot.data()
    );
    const selectedPlan = decodeSettlementPlanSnapshotOrThrow(
      planSnapshot.id,
      planSnapshot.data()
    );
    const previousRateVersionRef = doc(
      firestore,
      WORKER_RATE_VERSIONS_COLLECTION,
      currentWorkerDocument.currentRateVersionId
    );
    const previousRateVersionSnapshot = await transaction.get(previousRateVersionRef);

    if (!previousRateVersionSnapshot.exists()) {
      throw new Error("Brak aktualnej stawki zbieracza do zamkniecia.");
    }

    const previousRateVersion = decodeWorkerRateVersionSnapshotOrThrow(
      previousRateVersionSnapshot.id,
      previousRateVersionSnapshot.data()
    );
    const existingNewRateVersion = newRateVersionSnapshot.exists()
      ? decodeWorkerRateVersionSnapshotOrThrow(
          newRateVersionSnapshot.id,
          newRateVersionSnapshot.data()
        )
      : null;
    const transactionRateVersions = mergeTransactionRateVersions(
      prefetchedWorker.rateVersions,
      previousRateVersion,
      existingNewRateVersion
    );
    const transactionWorker = createTransactionWorkerListItem(
      prefetchedWorker,
      currentWorkerDocument,
      previousRateVersion,
      transactionRateVersions
    );
    const timestamp = serverTimestamp();
    const prepared = prepareWorkerRateVersionCreate(
      transactionWorker,
      mergeTransactionPlans(directory.plans, selectedPlan),
      transactionRateVersions,
      {
        ...input,
        businessDate,
        createdAt: timestamp,
        updatedAt: timestamp
      }
    );
    const auditId = createAuditEventId();

    transaction.set(workerRef, prepared.worker);
    transaction.set(previousRateVersionRef, prepared.previousRateVersion);
    transaction.set(newRateVersionRef, prepared.rateVersion);
    transaction.set(
      doc(firestore, AUDIT_EVENTS_COLLECTION, auditId),
      createAuditEventDraft({
        id: auditId,
        actorUid: input.actorProfile.uid,
        actorRoleSnapshot: input.actorProfile.role,
        action: prepared.auditAction,
        entityType: "WORKER",
        entityId: prepared.worker.id,
        beforeSummary: prepared.beforeSummary,
        afterSummary: prepared.afterSummary,
        reason: prepared.reason,
        createdAtDevice: Timestamp.now(),
        createdAtServer: timestamp,
        deviceId: prepared.deviceId
      })
    );

    return prepared;
  });
}

export async function updateWorkerAccountLink(
  env: FirebaseEnv,
  input: UpdateWorkerAccountLinkInput
): Promise<PreparedWorkerAccountLinkUpdate> {
  const { firestore } = await getFirebaseServices(env);
  const { Timestamp, doc, runTransaction, serverTimestamp } =
    await import("firebase/firestore/lite");
  const directory = await listWorkerDirectory(env, {
    viewerRole: "ADMIN"
  });
  const prefetchedWorker = findWorkerOrThrow(directory.workers, input.workerId);
  const workerId = normalizeRequiredText(input.workerId, "Wybierz zbieracza.");
  const targetUid = normalizeOptionalText(input.targetUid);
  const workerRef = doc(firestore, WORKERS_COLLECTION, workerId);

  return runTransaction(firestore, async (transaction) => {
    const workerSnapshot = await transaction.get(workerRef);

    if (!workerSnapshot.exists()) {
      throw new Error("Wybrany zbieracz nie istnieje.");
    }

    const currentWorkerDocument = decodeWorkerSnapshotOrThrow(
      workerSnapshot.id,
      workerSnapshot.data()
    );
    const currentLinkedUid = currentWorkerDocument.linkedUserUid;
    const userRefs = Array.from(
      new Set([currentLinkedUid, targetUid].filter((uid): uid is string => Boolean(uid)))
    ).map((uid) => doc(firestore, "users", uid));
    const userSnapshots = await Promise.all(
      userRefs.map(async (userRef) => transaction.get(userRef))
    );
    const transactionProfiles = new Map<string, UserProfile>();

    for (const userSnapshot of userSnapshots) {
      if (!userSnapshot.exists()) {
        throw new Error("Wybrane konto uzytkownika nie istnieje.");
      }

      const profile = decodeUserProfileSnapshotOrThrow(
        userSnapshot.id,
        userSnapshot.data()
      );
      transactionProfiles.set(profile.uid, profile);
    }

    const mergedProfiles = mergeTransactionProfiles(
      directory.profiles,
      Array.from(transactionProfiles.values())
    );
    const transactionWorker = createTransactionWorkerAccountListItem(
      prefetchedWorker,
      currentWorkerDocument,
      transactionProfiles.get(currentLinkedUid ?? "") ?? null
    );
    const timestamp = serverTimestamp();
    const prepared = prepareWorkerAccountLinkUpdate(
      transactionWorker,
      directory.workers,
      mergedProfiles,
      {
        ...input,
        targetUid,
        updatedAt: timestamp
      }
    );
    const auditId = createAuditEventId();

    transaction.set(workerRef, prepared.worker);

    if (prepared.releasedProfile) {
      transaction.set(
        doc(firestore, "users", prepared.releasedProfile.uid),
        prepared.releasedProfile
      );
    }

    if (prepared.linkedProfile) {
      transaction.set(
        doc(firestore, "users", prepared.linkedProfile.uid),
        prepared.linkedProfile
      );
    }

    transaction.set(
      doc(firestore, AUDIT_EVENTS_COLLECTION, auditId),
      createAuditEventDraft({
        id: auditId,
        actorUid: input.actorProfile.uid,
        actorRoleSnapshot: input.actorProfile.role,
        action: prepared.auditAction,
        entityType: "WORKER",
        entityId: prepared.worker.id,
        beforeSummary: prepared.beforeSummary,
        afterSummary: prepared.afterSummary,
        reason: prepared.reason,
        createdAtDevice: Timestamp.now(),
        createdAtServer: timestamp,
        deviceId: prepared.deviceId
      })
    );

    return prepared;
  });
}

export async function archiveWorker(
  env: FirebaseEnv,
  input: ArchiveWorkerInput
): Promise<PreparedWorkerArchive> {
  const { firestore } = await getFirebaseServices(env);
  const { Timestamp, doc, runTransaction, serverTimestamp } =
    await import("firebase/firestore/lite");
  const directory = await listWorkerDirectory(env, {
    viewerRole: "ADMIN"
  });
  const prefetchedWorker = findWorkerOrThrow(directory.workers, input.workerId);
  const workerId = normalizeRequiredText(input.workerId, "Wybierz zbieracza.");
  const workerRef = doc(firestore, WORKERS_COLLECTION, workerId);
  const businessDate = input.businessDate ?? currentBusinessDate();

  return runTransaction(firestore, async (transaction) => {
    const workerSnapshot = await transaction.get(workerRef);

    if (!workerSnapshot.exists()) {
      throw new Error("Wybrany zbieracz nie istnieje.");
    }

    const currentWorkerDocument = decodeWorkerSnapshotOrThrow(
      workerSnapshot.id,
      workerSnapshot.data()
    );
    const transactionWorker = createTransactionWorkerArchiveListItem(
      prefetchedWorker,
      currentWorkerDocument
    );
    const timestamp = serverTimestamp();
    const prepared = prepareWorkerArchive(transactionWorker, {
      ...input,
      businessDate,
      archivedAt: timestamp,
      updatedAt: timestamp
    });
    const auditId = createAuditEventId();

    transaction.set(workerRef, prepared.worker);
    transaction.set(
      doc(firestore, AUDIT_EVENTS_COLLECTION, auditId),
      createAuditEventDraft({
        id: auditId,
        actorUid: input.actorProfile.uid,
        actorRoleSnapshot: input.actorProfile.role,
        action: prepared.auditAction,
        entityType: "WORKER",
        entityId: prepared.worker.id,
        beforeSummary: prepared.beforeSummary,
        afterSummary: prepared.afterSummary,
        reason: prepared.reason,
        createdAtDevice: Timestamp.now(),
        createdAtServer: timestamp,
        deviceId: prepared.deviceId
      })
    );

    return prepared;
  });
}

function decodeWorkerSnapshotOrThrow(id: string, data: unknown): WorkerDocument {
  const decoded = decodeWorker(id, data);

  if (decoded.status === "INVALID") {
    throw new Error(decoded.reason);
  }

  return decoded.worker;
}

function decodeUserProfileSnapshotOrThrow(id: string, data: unknown): UserProfile {
  const decoded = decodeUserProfile(id, data);

  if (decoded.status === "INVALID") {
    throw new Error(decoded.reason);
  }

  return decoded.profile;
}

function decodeSettlementPlanSnapshotOrThrow(
  id: string,
  data: unknown
): SettlementPlanDocument {
  const decoded = decodeSettlementPlan(id, data);

  if (decoded.status === "INVALID") {
    throw new Error(decoded.reason);
  }

  return decoded.plan;
}

function decodeWorkerRateVersionSnapshotOrThrow(
  id: string,
  data: unknown
): WorkerRateVersionDocument {
  const decoded = decodeWorkerRateVersion(id, data);

  if (decoded.status === "INVALID") {
    throw new Error(decoded.reason);
  }

  return decoded.rateVersion;
}

function mergeTransactionRateVersions(
  prefetchedRateVersions: WorkerRateVersionDocument[],
  previousRateVersion: WorkerRateVersionDocument,
  existingNewRateVersion: WorkerRateVersionDocument | null
): WorkerRateVersionDocument[] {
  const merged = new Map(
    prefetchedRateVersions.map((rateVersion) => [rateVersion.id, rateVersion])
  );

  merged.set(previousRateVersion.id, previousRateVersion);

  if (existingNewRateVersion) {
    merged.set(existingNewRateVersion.id, existingNewRateVersion);
  }

  return Array.from(merged.values());
}

function mergeTransactionPlans(
  prefetchedPlans: SettlementPlanDocument[],
  selectedPlan: SettlementPlanDocument
): SettlementPlanDocument[] {
  const merged = new Map(prefetchedPlans.map((plan) => [plan.id, plan]));

  merged.set(selectedPlan.id, selectedPlan);

  return Array.from(merged.values());
}

function createTransactionWorkerListItem(
  prefetchedWorker: WorkerDirectoryListItem,
  currentWorkerDocument: WorkerDocument,
  previousRateVersion: WorkerRateVersionDocument,
  rateVersions: WorkerRateVersionDocument[]
): WorkerDirectoryListItem {
  return {
    ...prefetchedWorker,
    ...currentWorkerDocument,
    currentRateVersion: previousRateVersion,
    rateVersions
  };
}

function createTransactionWorkerAccountListItem(
  prefetchedWorker: WorkerDirectoryListItem,
  currentWorkerDocument: WorkerDocument,
  linkedUser: UserProfile | null
): WorkerDirectoryListItem {
  return {
    ...prefetchedWorker,
    ...currentWorkerDocument,
    linkedUser
  };
}

function createTransactionWorkerArchiveListItem(
  prefetchedWorker: WorkerDirectoryListItem,
  currentWorkerDocument: WorkerDocument
): WorkerDirectoryListItem {
  return {
    ...prefetchedWorker,
    ...currentWorkerDocument
  };
}

function mergeTransactionProfiles(
  prefetchedProfiles: UserProfile[],
  transactionProfiles: UserProfile[]
): UserProfile[] {
  const merged = new Map(prefetchedProfiles.map((profile) => [profile.uid, profile]));

  for (const profile of transactionProfiles) {
    merged.set(profile.uid, profile);
  }

  return Array.from(merged.values());
}

export function buildWorkerDirectory({
  workerDocuments,
  planDocuments,
  rateVersionDocuments,
  userDocuments,
  auditEventDocuments = []
}: {
  workerDocuments: WorkerDocumentSnapshot[];
  planDocuments: WorkerDocumentSnapshot[];
  rateVersionDocuments: WorkerDocumentSnapshot[];
  userDocuments: WorkerDirectoryUserSnapshot[];
  auditEventDocuments?: WorkerDirectoryAuditEventSnapshot[];
}): WorkerDirectoryResult {
  const workers: WorkerDocument[] = [];
  const invalidWorkers: InvalidWorkerDirectoryDocument[] = [];
  const plans: SettlementPlanDocument[] = [];
  const invalidPlans: InvalidWorkerDirectoryDocument[] = [];
  const rateVersions: WorkerRateVersionDocument[] = [];
  const invalidRateVersions: InvalidWorkerDirectoryDocument[] = [];
  const profiles: UserProfile[] = [];
  const invalidProfiles: InvalidWorkerDirectoryDocument[] = [];
  const auditEvents: AuditEventDocument[] = [];
  const invalidAuditEvents: InvalidWorkerDirectoryDocument[] = [];

  for (const document of workerDocuments) {
    const decoded = decodeWorker(document.id, document.data);

    if (decoded.status === "FOUND") {
      workers.push(decoded.worker);
    } else {
      invalidWorkers.push({
        id: document.id,
        reason: decoded.reason
      });
    }
  }

  for (const document of planDocuments) {
    const decoded = decodeSettlementPlan(document.id, document.data);

    if (decoded.status === "FOUND") {
      plans.push(decoded.plan);
    } else {
      invalidPlans.push({
        id: document.id,
        reason: decoded.reason
      });
    }
  }

  for (const document of rateVersionDocuments) {
    const decoded = decodeWorkerRateVersion(document.id, document.data);

    if (decoded.status === "FOUND") {
      rateVersions.push(decoded.rateVersion);
    } else {
      invalidRateVersions.push({
        id: document.id,
        reason: decoded.reason
      });
    }
  }

  for (const document of userDocuments) {
    const decoded = decodeUserProfile(document.id, document.data);

    if (decoded.status === "FOUND") {
      profiles.push(decoded.profile);
    } else {
      invalidProfiles.push({
        id: document.id,
        reason: decoded.reason
      });
    }
  }

  for (const document of auditEventDocuments) {
    const decoded = decodeAuditEvent(document.id, document.data);

    if (decoded.status === "FOUND") {
      auditEvents.push(decoded.event);
    } else {
      invalidAuditEvents.push({
        id: document.id,
        reason: decoded.reason
      });
    }
  }

  const planById = new Map(plans.map((plan) => [plan.id, plan]));
  const rateVersionById = new Map(
    rateVersions.map((rateVersion) => [rateVersion.id, rateVersion])
  );
  const rateVersionsByWorkerId = groupRateVersionsByWorkerId(rateVersions);
  const profileByUid = new Map(profiles.map((profile) => [profile.uid, profile]));
  const auditEventsByWorkerId = groupWorkerAuditEvents(auditEvents);

  return {
    workers: sortWorkers(
      workers.map((worker) =>
        buildWorkerListItem(worker, {
          currentPlan: planById.get(worker.currentPlanId) ?? null,
          currentRateVersion: rateVersionById.get(worker.currentRateVersionId) ?? null,
          rateVersions: rateVersionsByWorkerId.get(worker.id) ?? [],
          linkedUser: worker.linkedUserUid
            ? (profileByUid.get(worker.linkedUserUid) ?? null)
            : null,
          auditEvents: auditEventsByWorkerId.get(worker.id) ?? []
        })
      )
    ),
    plans: sortPlans(plans),
    profiles: sortProfiles(profiles),
    invalidWorkers: sortInvalidDocuments(invalidWorkers),
    invalidPlans: sortInvalidDocuments(invalidPlans),
    invalidRateVersions: sortInvalidDocuments(invalidRateVersions),
    invalidProfiles: sortInvalidDocuments(invalidProfiles),
    invalidAuditEvents: sortInvalidDocuments(invalidAuditEvents)
  };
}

export function prepareWorkerCreate(
  existingWorkers: WorkerDocument[],
  plans: SettlementPlanDocument[],
  input: CreateWorkerInput & { workerId: string; createdAt: unknown }
): PreparedWorkerCreate {
  assertAdmin(input.actorProfile);

  const displayName = normalizeRequiredText(input.displayName, "Podaj nazwe zbieracza.");
  const workerId = normalizeRequiredText(
    input.workerId,
    "Brak identyfikatora zbieracza."
  );
  const normalizedName = normalizeWorkerName(displayName);
  const planId = normalizeRequiredText(input.planId, "Wybierz plan rozliczenia.");
  const currentPlan = plans.find((plan) => plan.id === planId);
  const validFrom = normalizeBusinessDate(input.validFrom);
  const rateGroszPerUnit = normalizeRateGrosz(input.rateGroszPerUnit);
  const deviceId = normalizeRequiredText(
    input.deviceId,
    "Brak identyfikatora urzadzenia dla audytu."
  );
  const similarNames = findSimilarWorkerNames(existingWorkers, displayName);

  if (existingWorkers.some((worker) => worker.id === workerId)) {
    throw new Error("Identyfikator zbieracza musi byc unikalny.");
  }

  if (!currentPlan) {
    throw new Error("Wybrany plan nie istnieje.");
  }

  if (!currentPlan.active) {
    throw new Error("Nie mozna przypisac archiwalnego planu.");
  }

  if (similarNames.length > 0 && !input.confirmSimilarName) {
    throw new Error("Potwierdz, ze to inny zbieracz niz podobna osoba na liscie.");
  }

  const rateVersionId = createInitialWorkerRateVersionId(workerId, validFrom);
  const worker: WorkerDocument = {
    id: workerId,
    displayName,
    normalizedName,
    active: true,
    currentPlanId: currentPlan.id,
    currentRateVersionId: rateVersionId,
    linkedUserUid: null,
    phone: normalizeOptionalText(input.phone),
    emailContact: normalizeOptionalEmail(input.emailContact),
    notes: normalizeOptionalText(input.notes),
    createdAt: input.createdAt,
    createdBy: input.actorProfile.uid,
    updatedAt: input.createdAt,
    archivedAt: null,
    legacyName: null
  };
  const rateVersion: WorkerRateVersionDocument = {
    id: rateVersionId,
    workerId,
    planId: currentPlan.id,
    rateGroszPerUnit,
    validFrom,
    validTo: null,
    active: true,
    note: "Pierwsza stawka zbieracza.",
    createdAt: input.createdAt,
    createdBy: input.actorProfile.uid,
    supersedesRateId: null
  };
  const similarNameWarning =
    similarNames.length > 0
      ? `Podobna nazwa: ${similarNames.slice(0, 3).join(", ")}.`
      : null;

  return {
    worker,
    rateVersion,
    auditAction: "WORKER_CREATED",
    beforeSummary: null,
    afterSummary: workerAuditSummary(worker, rateVersion, currentPlan),
    reason: similarNameWarning,
    deviceId,
    similarNameWarning
  };
}

export function prepareWorkerRateVersionCreate(
  currentWorker: WorkerDirectoryListItem,
  plans: SettlementPlanDocument[],
  rateVersions: WorkerRateVersionDocument[],
  input: CreateWorkerRateVersionInput & {
    createdAt: unknown;
    updatedAt: unknown;
  }
): PreparedWorkerRateVersionCreate {
  assertAdmin(input.actorProfile);

  const workerId = normalizeRequiredText(input.workerId, "Wybierz zbieracza.");
  const planId = normalizeRequiredText(input.planId, "Wybierz plan rozliczenia.");
  const currentPlan = plans.find((plan) => plan.id === planId);
  const validFrom = normalizeBusinessDate(input.validFrom);
  const businessDate = normalizeBusinessDate(input.businessDate ?? currentBusinessDate());
  const rateGroszPerUnit = normalizeRateGrosz(input.rateGroszPerUnit);
  const expectedCurrentRateVersionId = normalizeOptionalText(
    input.expectedCurrentRateVersionId
  );
  const deviceId = normalizeRequiredText(
    input.deviceId,
    "Brak identyfikatora urzadzenia dla audytu."
  );

  if (currentWorker.id !== workerId) {
    throw new Error("Wybrany zbieracz ma niezgodny identyfikator.");
  }

  if (!currentWorker.active) {
    throw new Error("Nie mozna dodac stawki archiwalnemu zbieraczowi.");
  }

  if (!currentPlan) {
    throw new Error("Wybrany plan nie istnieje.");
  }

  if (!currentPlan.active) {
    throw new Error("Nie mozna przypisac archiwalnego planu.");
  }

  if (!input.confirmHistoricalSnapshotsUnchanged) {
    throw new Error("Potwierdz, ze historyczne snapshoty nie zostana przeliczone.");
  }

  if (validFrom < businessDate && !input.confirmBackdatedRate) {
    throw new Error("Potwierdz zapis stawki z data wsteczna.");
  }

  if (rateVersions.some((rateVersion) => rateVersion.validFrom === validFrom)) {
    throw new Error("Zbieracz ma juz stawke od tej daty.");
  }

  const previousRateVersion = rateVersions.find(
    (rateVersion) => rateVersion.id === currentWorker.currentRateVersionId
  );

  if (!previousRateVersion) {
    throw new Error("Brak aktualnej stawki zbieracza do zamkniecia.");
  }

  if (
    expectedCurrentRateVersionId &&
    previousRateVersion.id !== expectedCurrentRateVersionId
  ) {
    throw new Error("Stawka zostala zmieniona w innym oknie. Odswiez profil zbieracza.");
  }

  if (!previousRateVersion.active || previousRateVersion.validTo !== null) {
    throw new Error("Aktualna stawka zbieracza nie jest otwarta.");
  }

  if (validFrom <= previousRateVersion.validFrom) {
    throw new Error("Nowa stawka musi zaczynac sie po aktualnej stawce.");
  }

  const rateVersionId = createWorkerRateVersionId(workerId, validFrom);

  if (rateVersions.some((rateVersion) => rateVersion.id === rateVersionId)) {
    throw new Error("Identyfikator wersji stawki musi byc unikalny.");
  }

  const closedPreviousRateVersion: WorkerRateVersionDocument = {
    ...previousRateVersion,
    active: false,
    validTo: addBusinessDays(validFrom, -1)
  };
  const nextRateVersion: WorkerRateVersionDocument = {
    id: rateVersionId,
    workerId,
    planId: currentPlan.id,
    rateGroszPerUnit,
    validFrom,
    validTo: null,
    active: true,
    note: normalizeOptionalText(input.note),
    createdAt: input.createdAt,
    createdBy: input.actorProfile.uid,
    supersedesRateId: previousRateVersion.id
  };
  const nextWorker: WorkerDocument = {
    id: currentWorker.id,
    displayName: currentWorker.displayName,
    normalizedName: currentWorker.normalizedName,
    active: currentWorker.active,
    currentPlanId: currentPlan.id,
    currentRateVersionId: nextRateVersion.id,
    linkedUserUid: currentWorker.linkedUserUid,
    phone: currentWorker.phone,
    emailContact: currentWorker.emailContact,
    notes: currentWorker.notes,
    createdAt: currentWorker.createdAt,
    createdBy: currentWorker.createdBy,
    updatedAt: input.updatedAt,
    archivedAt: currentWorker.archivedAt,
    legacyName: currentWorker.legacyName
  };
  const analyzedHistory = analyzeWorkerRateHistory(
    [
      ...rateVersions.filter((rateVersion) => rateVersion.id !== previousRateVersion.id),
      closedPreviousRateVersion,
      nextRateVersion
    ],
    businessDate
  );
  const periodWarnings = analyzedHistory
    .filter(
      (item) =>
        item.rateVersion.id === closedPreviousRateVersion.id ||
        item.rateVersion.id === nextRateVersion.id
    )
    .flatMap((item) => item.warnings);
  const periodWarning =
    periodWarnings.length > 0
      ? `Ostrzezenia okresow: ${Array.from(new Set(periodWarnings)).join("; ")}`
      : null;

  if (periodWarning && !input.confirmPeriodWarning) {
    throw new Error("Potwierdz zapis mimo ostrzezen okresow stawek.");
  }

  const backdatedWarning = validFrom < businessDate ? "Stawka ma date wsteczna." : null;

  return {
    worker: nextWorker,
    rateVersion: nextRateVersion,
    previousRateVersion: closedPreviousRateVersion,
    auditAction: "WORKER_RATE_CHANGED",
    beforeSummary: workerRateAuditSummary(
      currentWorker,
      previousRateVersion,
      previousRateVersion.planId
    ),
    afterSummary: workerRateAuditSummary(nextWorker, nextRateVersion, currentPlan.id),
    reason: rateChangeReason(backdatedWarning, periodWarning),
    deviceId,
    backdatedWarning,
    periodWarning
  };
}

export function prepareWorkerAccountLinkUpdate(
  currentWorker: WorkerDirectoryListItem,
  workers: WorkerDirectoryListItem[],
  profiles: UserProfile[],
  input: UpdateWorkerAccountLinkInput & {
    updatedAt: unknown;
  }
): PreparedWorkerAccountLinkUpdate {
  assertAdmin(input.actorProfile);

  const workerId = normalizeRequiredText(input.workerId, "Wybierz zbieracza.");
  const targetUid = normalizeOptionalText(input.targetUid);
  const reason = normalizeRequiredText(input.reason, "Podaj powod zmiany powiazania.");
  const deviceId = normalizeRequiredText(
    input.deviceId,
    "Brak identyfikatora urzadzenia dla audytu."
  );

  if (currentWorker.id !== workerId) {
    throw new Error("Wybrany zbieracz ma niezgodny identyfikator.");
  }

  if (!currentWorker.active) {
    throw new Error("Nie mozna zmienic konta archiwalnego zbieracza.");
  }

  if (!input.confirmPrivacyNotice) {
    throw new Error("Potwierdz konsekwencje prywatnosci powiazania konta.");
  }

  const currentLinkedProfile = currentWorker.linkedUserUid
    ? findProfileByUid(profiles, currentWorker.linkedUserUid)
    : null;
  const targetProfile = targetUid ? findProfileByUid(profiles, targetUid) : null;

  if (targetUid && !targetProfile) {
    throw new Error("Wybrane konto uzytkownika nie istnieje.");
  }

  if (
    targetProfile &&
    (!targetProfile.active || targetProfile.registrationStatus !== "APPROVED")
  ) {
    throw new Error("Wybrane konto musi byc aktywne i zatwierdzone.");
  }

  if (
    targetProfile &&
    targetProfile.workerId !== null &&
    targetProfile.workerId !== currentWorker.id
  ) {
    throw new Error("Wybrane konto jest juz powiazane z innym zbieraczem.");
  }

  const workerLinkedToTarget = targetUid
    ? workers.find(
        (worker) => worker.id !== currentWorker.id && worker.linkedUserUid === targetUid
      )
    : null;

  if (workerLinkedToTarget) {
    throw new Error("Wybrane konto jest juz wskazane przez innego zbieracza.");
  }

  if (
    currentLinkedProfile &&
    currentLinkedProfile.workerId !== null &&
    currentLinkedProfile.workerId !== currentWorker.id
  ) {
    throw new Error("Obecne powiazanie konta jest niespojne z profilem zbieracza.");
  }

  const releasesCurrentProfile =
    currentLinkedProfile && currentLinkedProfile.uid !== targetUid;

  if (releasesCurrentProfile && roleRequiresWorkerId(currentLinkedProfile.role)) {
    throw new Error(
      "Konto z rola Zbieracz wymaga powiazania. Najpierw zmien role albo przenies konto."
    );
  }

  const linkedProfile =
    targetProfile && targetProfile.workerId !== currentWorker.id
      ? {
          ...targetProfile,
          workerId: currentWorker.id
        }
      : targetProfile;
  const releasedProfile = releasesCurrentProfile
    ? {
        ...currentLinkedProfile,
        workerId: null
      }
    : null;
  const nextWorker: WorkerDocument = {
    id: currentWorker.id,
    displayName: currentWorker.displayName,
    normalizedName: currentWorker.normalizedName,
    active: currentWorker.active,
    currentPlanId: currentWorker.currentPlanId,
    currentRateVersionId: currentWorker.currentRateVersionId,
    linkedUserUid: linkedProfile?.uid ?? null,
    phone: currentWorker.phone,
    emailContact: currentWorker.emailContact,
    notes: currentWorker.notes,
    createdAt: currentWorker.createdAt,
    createdBy: currentWorker.createdBy,
    updatedAt: input.updatedAt,
    archivedAt: currentWorker.archivedAt,
    legacyName: currentWorker.legacyName
  };

  if (
    nextWorker.linkedUserUid === currentWorker.linkedUserUid &&
    linkedProfile?.workerId === targetProfile?.workerId &&
    releasedProfile === null
  ) {
    throw new Error("Nie wybrano zmiany powiazania konta.");
  }

  const privacyWarning =
    "Powiazane konto zobaczy dane przypisane do tego zbieracza po ponownym pobraniu profilu.";

  return {
    worker: nextWorker,
    linkedProfile,
    releasedProfile,
    auditAction: "USER_WORKER_LINK_CHANGED",
    beforeSummary: workerAccountLinkAuditSummary(currentWorker, currentLinkedProfile),
    afterSummary: workerAccountLinkAuditSummary(nextWorker, linkedProfile),
    reason: `${reason} ${privacyWarning}`,
    deviceId,
    privacyWarning
  };
}

export function prepareWorkerArchive(
  currentWorker: WorkerDirectoryListItem,
  input: ArchiveWorkerInput & {
    archivedAt: unknown;
    updatedAt: unknown;
  }
): PreparedWorkerArchive {
  assertAdmin(input.actorProfile);

  const workerId = normalizeRequiredText(input.workerId, "Wybierz zbieracza.");
  const reason = normalizeRequiredText(input.reason, "Podaj powod archiwizacji.");
  const deviceId = normalizeRequiredText(
    input.deviceId,
    "Brak identyfikatora urzadzenia dla audytu."
  );
  const businessDate = normalizeBusinessDate(input.businessDate ?? currentBusinessDate());

  if (currentWorker.id !== workerId) {
    throw new Error("Wybrany zbieracz ma niezgodny identyfikator.");
  }

  if (!currentWorker.active || currentWorker.archivedAt !== null) {
    throw new Error("Zbieracz jest juz archiwalny.");
  }

  const warnings = buildWorkerArchiveWarnings(currentWorker, businessDate);
  const dueAmountNeedsConfirmation =
    currentWorker.seasonSummary.dueGrosz === null ||
    currentWorker.seasonSummary.dueGrosz > 0;
  const activeAccountNeedsConfirmation = hasActiveLinkedAccount(currentWorker);
  const futureRatesNeedConfirmation =
    findActiveFutureRateVersions(currentWorker, businessDate).length > 0;

  if (!input.confirmations.confirmOpenSessionsReviewed) {
    throw new Error("Potwierdz sprawdzenie otwartych sesji przed archiwizacja.");
  }

  if (dueAmountNeedsConfirmation && !input.confirmations.confirmDueAmountReviewed) {
    throw new Error("Potwierdz sprawdzenie kwoty do wyplaty przed archiwizacja.");
  }

  if (
    activeAccountNeedsConfirmation &&
    !input.confirmations.confirmActiveAccountRemains
  ) {
    throw new Error("Potwierdz, ze powiazane konto pozostaje aktywne.");
  }

  if (!input.confirmations.confirmCurrentRateReviewed) {
    throw new Error("Potwierdz weryfikacje aktualnej stawki zbieracza.");
  }

  if (futureRatesNeedConfirmation && !input.confirmations.confirmFutureRatesReviewed) {
    throw new Error("Potwierdz weryfikacje przyszlych stawek zbieracza.");
  }

  const nextWorker: WorkerDocument = {
    id: currentWorker.id,
    displayName: currentWorker.displayName,
    normalizedName: currentWorker.normalizedName,
    active: false,
    currentPlanId: currentWorker.currentPlanId,
    currentRateVersionId: currentWorker.currentRateVersionId,
    linkedUserUid: currentWorker.linkedUserUid,
    phone: currentWorker.phone,
    emailContact: currentWorker.emailContact,
    notes: currentWorker.notes,
    createdAt: currentWorker.createdAt,
    createdBy: currentWorker.createdBy,
    updatedAt: input.updatedAt,
    archivedAt: input.archivedAt,
    legacyName: currentWorker.legacyName
  };

  return {
    worker: nextWorker,
    auditAction: "WORKER_ARCHIVED",
    beforeSummary: workerArchiveAuditSummary(currentWorker),
    afterSummary: workerArchiveAuditSummary({
      ...currentWorker,
      ...nextWorker
    }),
    reason: buildWorkerArchiveReason(reason, warnings),
    deviceId,
    warnings
  };
}

export function createWorkerId(): string {
  return `worker-${globalThis.crypto.randomUUID()}`;
}

export function createInitialWorkerRateVersionId(
  workerId: string,
  validFrom: string
): string {
  return createWorkerRateVersionId(workerId, validFrom);
}

export function createWorkerRateVersionId(workerId: string, validFrom: string): string {
  return `rate-${normalizeRequiredText(workerId, "Brak identyfikatora zbieracza.")}-${normalizeBusinessDate(validFrom)}`;
}

export function findSimilarWorkerNames(
  workers: WorkerDocument[],
  displayName: string
): string[] {
  const normalizedTarget = compactWorkerName(displayName);

  if (!normalizedTarget) {
    return [];
  }

  return workers
    .filter((worker) => {
      const normalizedWorker = compactWorkerName(worker.displayName);

      return (
        normalizedWorker === normalizedTarget ||
        (normalizedTarget.length >= 6 && normalizedWorker.includes(normalizedTarget)) ||
        (normalizedWorker.length >= 6 && normalizedTarget.includes(normalizedWorker))
      );
    })
    .map((worker) => worker.displayName)
    .sort((left, right) => left.localeCompare(right, "pl"));
}

export function decodeWorker(expectedId: string, data: unknown): WorkerDecodeResult {
  if (!isRecord(data)) {
    return invalidWorker("Zbieracz ma nieprawidlowy format.");
  }

  const id = readRequiredString(data, "id");
  const displayName = readRequiredString(data, "displayName");
  const normalizedName = readRequiredString(data, "normalizedName");
  const currentPlanId = readRequiredString(data, "currentPlanId");
  const currentRateVersionId = readRequiredString(data, "currentRateVersionId");
  const linkedUserUid = data.linkedUserUid ?? null;
  const phone = data.phone ?? null;
  const emailContact = data.emailContact ?? null;
  const notes = data.notes ?? null;
  const createdBy = readRequiredString(data, "createdBy");
  const legacyName = data.legacyName ?? null;

  if (!id || id !== expectedId) {
    return invalidWorker("Zbieracz ma niezgodny identyfikator.");
  }

  if (!displayName || !normalizedName || !currentPlanId || !currentRateVersionId) {
    return invalidWorker("Zbieracz nie ma wymaganych danych.");
  }

  if (typeof data.active !== "boolean") {
    return invalidWorker("Zbieracz ma nieprawidlowy status aktywnosci.");
  }

  if (!createdBy) {
    return invalidWorker("Zbieracz nie ma autora utworzenia.");
  }

  if (linkedUserUid !== null && typeof linkedUserUid !== "string") {
    return invalidWorker("Zbieracz ma nieprawidlowe powiazanie konta.");
  }

  if (phone !== null && typeof phone !== "string") {
    return invalidWorker("Zbieracz ma nieprawidlowy telefon.");
  }

  if (emailContact !== null && typeof emailContact !== "string") {
    return invalidWorker("Zbieracz ma nieprawidlowy e-mail kontaktowy.");
  }

  if (notes !== null && typeof notes !== "string") {
    return invalidWorker("Zbieracz ma nieprawidlowe notatki.");
  }

  if (legacyName !== null && typeof legacyName !== "string") {
    return invalidWorker("Zbieracz ma nieprawidlowa nazwe legacy.");
  }

  return {
    status: "FOUND",
    worker: {
      id,
      displayName,
      normalizedName,
      active: data.active,
      currentPlanId,
      currentRateVersionId,
      linkedUserUid,
      phone,
      emailContact,
      notes,
      createdAt: data.createdAt,
      createdBy,
      updatedAt: data.updatedAt,
      archivedAt: data.archivedAt ?? null,
      legacyName
    }
  };
}

export function filterWorkerDirectory(
  workers: WorkerDirectoryListItem[],
  filters: WorkerDirectoryFilters
): WorkerDirectoryListItem[] {
  const search = normalizeEmail(filters.search);

  return sortFilteredWorkers(
    workers.filter((worker) => {
      if (filters.activity === "ACTIVE" && !worker.active) {
        return false;
      }

      if (filters.activity === "ARCHIVED" && worker.active) {
        return false;
      }

      if (filters.planId !== "ALL" && worker.currentPlanId !== filters.planId) {
        return false;
      }

      if (!search) {
        return true;
      }

      return searchableWorkerText(worker).includes(search);
    }),
    filters.sort
  );
}

export function workerStatusLabel(worker: Pick<WorkerDirectoryListItem, "active">) {
  return worker.active ? "Aktywny" : "Archiwalny";
}

export function workerRateLabel(
  rateVersion: WorkerRateVersionDocument | null | undefined
): string {
  return rateVersion ? formatMoney(rateVersion.rateGroszPerUnit) : "brak";
}

export function analyzeWorkerRateHistory(
  rateVersions: WorkerRateVersionDocument[],
  businessDate: string
): WorkerRateHistoryItem[] {
  const warningsById = new Map<string, string[]>(
    rateVersions.map((rateVersion) => [rateVersion.id, []])
  );
  const sortedAscending = [...rateVersions].sort((left, right) => {
    const validFromDiff = left.validFrom.localeCompare(right.validFrom);

    if (validFromDiff !== 0) {
      return validFromDiff;
    }

    return left.id.localeCompare(right.id, "pl");
  });

  for (const rateVersion of sortedAscending) {
    if (rateVersion.validTo !== null && rateVersion.validTo < rateVersion.validFrom) {
      pushRateWarning(
        warningsById,
        rateVersion.id,
        "Okres konczy sie przed data poczatkowa."
      );
    }
  }

  for (let index = 0; index < sortedAscending.length - 1; index += 1) {
    const current = sortedAscending[index];
    const next = sortedAscending[index + 1];

    if (ratePeriodsOverlap(current, next)) {
      pushRateWarning(
        warningsById,
        current.id,
        `Naklada sie z wersja od ${next.validFrom}.`
      );
      pushRateWarning(
        warningsById,
        next.id,
        `Naklada sie z wersja od ${current.validFrom}.`
      );
      continue;
    }

    if (
      current.validTo !== null &&
      addBusinessDays(current.validTo, 1) < next.validFrom
    ) {
      pushRateWarning(
        warningsById,
        current.id,
        `Przerwa przed wersja od ${next.validFrom}.`
      );
      pushRateWarning(warningsById, next.id, `Przerwa po wersji do ${current.validTo}.`);
    }
  }

  return sortWorkerRateVersions(rateVersions).map((rateVersion) => ({
    rateVersion,
    status: workerRateHistoryStatus(rateVersion, businessDate),
    warnings: warningsById.get(rateVersion.id) ?? []
  }));
}

export function buildWorkerRateConsistencyReport(
  worker: WorkerDirectoryListItem,
  businessDate: string
): WorkerRateConsistencyReport {
  const historyItems = analyzeWorkerRateHistory(worker.rateVersions, businessDate);
  const periodWarnings = Array.from(
    new Set(historyItems.flatMap((historyItem) => historyItem.warnings))
  );
  const openRates = worker.rateVersions.filter(
    (rateVersion) => rateVersion.active && rateVersion.validTo === null
  );
  const currentHistoryItem = historyItems.find(
    (historyItem) => historyItem.rateVersion.id === worker.currentRateVersionId
  );
  const hasCurrentRateReference = Boolean(
    worker.currentRateVersion && currentHistoryItem
  );
  const checks: WorkerRateConsistencyCheck[] = [
    {
      id: "current-rate-reference",
      level: hasCurrentRateReference ? "OK" : "ERROR",
      label: "Aktualna referencja",
      detail:
        hasCurrentRateReference && worker.currentRateVersion
          ? `Profil wskazuje wersje ${worker.currentRateVersion.id}.`
          : "Nie znaleziono wersji stawki wskazanej przez profil."
    },
    {
      id: "open-rate-period",
      level: openRates.length === 1 ? "OK" : "ERROR",
      label: "Otwarty okres",
      detail:
        openRates.length === 1
          ? `Jedna otwarta wersja: ${openRates[0].id}.`
          : `Liczba otwartych wersji: ${String(openRates.length)}.`
    },
    {
      id: "rate-periods",
      level: periodWarnings.length === 0 ? "OK" : "WARNING",
      label: "Okresy stawek",
      detail:
        periodWarnings.length === 0
          ? "Nie wykryto przerw ani nakladania okresow."
          : periodWarnings.join("; ")
    }
  ];

  if (currentHistoryItem?.status === "FUTURE") {
    checks.push({
      id: "future-current-rate",
      level: "WARNING",
      label: "Przyszla referencja",
      detail: "Profil wskazuje stawke przyszla; sesje musza wybierac wersje wedlug daty."
    });
  }

  return {
    level: highestConsistencyLevel(checks),
    checks,
    limitations: [
      "Bez funkcji serwerowej nie ma pelnej gwarancji serializacji dwoch rownoleglych zmian.",
      "Zmiana stawki jest ograniczona do administratora, trybu online i transakcji klienta.",
      "Reguly Firestore i audyt pozostaja warstwa kontroli po stronie zapisu."
    ]
  };
}

function highestConsistencyLevel(
  checks: WorkerRateConsistencyCheck[]
): WorkerRateConsistencyLevel {
  if (checks.some((check) => check.level === "ERROR")) {
    return "ERROR";
  }

  if (checks.some((check) => check.level === "WARNING")) {
    return "WARNING";
  }

  return "OK";
}

export function workerRateHistoryStatusLabel(status: WorkerRateHistoryStatus): string {
  switch (status) {
    case "CURRENT":
      return "Biezaca";
    case "FUTURE":
      return "Przyszla";
    case "PAST":
      return "Historyczna";
    case "INACTIVE":
      return "Nieaktywna";
  }
}

export function workerUnitLabel(plan: SettlementPlanDocument | null | undefined): string {
  return plan ? plan.unitSymbol : "brak";
}

export function workerSummaryKgLabel(value: number | null): string {
  return value === null ? "brak danych" : formatKilograms(value);
}

export function workerSummaryMoneyLabel(value: number | null): string {
  return value === null ? "brak danych" : formatMoney(value);
}

export function isWorkerActivityFilter(
  value: string
): value is WorkerDirectoryFilters["activity"] {
  return value === "ALL" || value === "ACTIVE" || value === "ARCHIVED";
}

export function isWorkerSortKey(value: string): value is WorkerDirectoryFilters["sort"] {
  return value === "NAME" || value === "TOTAL_KG" || value === "EARNED";
}

function buildWorkerListItem(
  worker: WorkerDocument,
  relations: {
    currentPlan: SettlementPlanDocument | null;
    currentRateVersion: WorkerRateVersionDocument | null;
    rateVersions: WorkerRateVersionDocument[];
    linkedUser: UserProfile | null;
    auditEvents: AuditEventDocument[];
  }
): WorkerDirectoryListItem {
  return {
    ...worker,
    currentPlan: relations.currentPlan,
    currentRateVersion: relations.currentRateVersion,
    rateVersions: sortWorkerRateVersions(relations.rateVersions),
    linkedUser: relations.linkedUser,
    auditEvents: sortWorkerAuditEvents(relations.auditEvents),
    warnings: workerWarnings(worker, relations),
    seasonSummary: {
      totalKgGrams: null,
      earnedGrosz: null,
      paidGrosz: null,
      dueGrosz: null
    }
  };
}

function groupRateVersionsByWorkerId(
  rateVersions: WorkerRateVersionDocument[]
): Map<string, WorkerRateVersionDocument[]> {
  const byWorkerId = new Map<string, WorkerRateVersionDocument[]>();

  for (const rateVersion of rateVersions) {
    const existing = byWorkerId.get(rateVersion.workerId) ?? [];

    existing.push(rateVersion);
    byWorkerId.set(rateVersion.workerId, existing);
  }

  return byWorkerId;
}

function groupWorkerAuditEvents(
  auditEvents: AuditEventDocument[]
): Map<string, AuditEventDocument[]> {
  const byWorkerId = new Map<string, AuditEventDocument[]>();

  for (const auditEvent of auditEvents) {
    if (auditEvent.entityType !== "WORKER") {
      continue;
    }

    const existing = byWorkerId.get(auditEvent.entityId) ?? [];

    existing.push(auditEvent);
    byWorkerId.set(auditEvent.entityId, existing);
  }

  return byWorkerId;
}

function workerWarnings(
  worker: WorkerDocument,
  relations: {
    currentPlan: SettlementPlanDocument | null;
    currentRateVersion: WorkerRateVersionDocument | null;
    linkedUser: UserProfile | null;
  }
): string[] {
  const warnings: string[] = [];

  if (!relations.currentPlan) {
    warnings.push("Brak aktualnego planu.");
  } else if (!relations.currentPlan.active) {
    warnings.push("Aktualny plan jest archiwalny.");
  }

  if (!relations.currentRateVersion) {
    warnings.push("Brak aktualnej stawki.");
  } else {
    if (relations.currentRateVersion.workerId !== worker.id) {
      warnings.push("Aktualna stawka wskazuje innego zbieracza.");
    }

    if (relations.currentRateVersion.planId !== worker.currentPlanId) {
      warnings.push("Aktualna stawka wskazuje inny plan.");
    }

    if (!relations.currentRateVersion.active) {
      warnings.push("Aktualna stawka jest nieaktywna.");
    }
  }

  if (worker.linkedUserUid && !relations.linkedUser) {
    warnings.push("Brak powiazanego profilu konta.");
  }

  if (
    worker.linkedUserUid &&
    relations.linkedUser &&
    relations.linkedUser.workerId !== worker.id
  ) {
    warnings.push("Powiazany profil ma inny workerId.");
  }

  if (worker.active && worker.archivedAt !== null) {
    warnings.push("Aktywny zbieracz ma date archiwizacji.");
  }

  return warnings;
}

function sortWorkers(workers: WorkerDirectoryListItem[]): WorkerDirectoryListItem[] {
  return sortFilteredWorkers(workers, "NAME");
}

function sortFilteredWorkers(
  workers: WorkerDirectoryListItem[],
  sort: WorkerSortKey
): WorkerDirectoryListItem[] {
  return [...workers].sort((left, right) => {
    if (sort === "TOTAL_KG") {
      const totalKgDiff = compareNullableDesc(
        left.seasonSummary.totalKgGrams,
        right.seasonSummary.totalKgGrams
      );

      if (totalKgDiff !== 0) {
        return totalKgDiff;
      }
    }

    if (sort === "EARNED") {
      const earnedDiff = compareNullableDesc(
        left.seasonSummary.earnedGrosz,
        right.seasonSummary.earnedGrosz
      );

      if (earnedDiff !== 0) {
        return earnedDiff;
      }
    }

    if (left.active !== right.active) {
      return left.active ? -1 : 1;
    }

    const nameDiff = left.displayName.localeCompare(right.displayName, "pl", {
      sensitivity: "base"
    });

    if (nameDiff !== 0) {
      return nameDiff;
    }

    return left.id.localeCompare(right.id, "pl");
  });
}

function sortWorkerRateVersions(
  rateVersions: WorkerRateVersionDocument[]
): WorkerRateVersionDocument[] {
  return [...rateVersions].sort((left, right) => {
    const validFromDiff = right.validFrom.localeCompare(left.validFrom);

    if (validFromDiff !== 0) {
      return validFromDiff;
    }

    if (left.active !== right.active) {
      return left.active ? -1 : 1;
    }

    return left.id.localeCompare(right.id, "pl");
  });
}

function pushRateWarning(
  warningsById: Map<string, string[]>,
  rateVersionId: string,
  warning: string
): void {
  const warnings = warningsById.get(rateVersionId);

  if (warnings && !warnings.includes(warning)) {
    warnings.push(warning);
  }
}

function ratePeriodsOverlap(
  left: WorkerRateVersionDocument,
  right: WorkerRateVersionDocument
): boolean {
  const leftEnd = left.validTo ?? "9999-12-31";
  const rightEnd = right.validTo ?? "9999-12-31";

  return left.validFrom <= rightEnd && right.validFrom <= leftEnd;
}

function workerRateHistoryStatus(
  rateVersion: WorkerRateVersionDocument,
  businessDate: string
): WorkerRateHistoryStatus {
  if (!rateVersion.active) {
    return "INACTIVE";
  }

  if (rateVersion.validFrom > businessDate) {
    return "FUTURE";
  }

  if (rateVersion.validTo !== null && rateVersion.validTo < businessDate) {
    return "PAST";
  }

  return "CURRENT";
}

function addBusinessDays(value: string, days: number): string {
  const parsed = new Date(`${value}T00:00:00.000Z`);

  parsed.setUTCDate(parsed.getUTCDate() + days);

  return parsed.toISOString().slice(0, 10);
}

function sortWorkerAuditEvents(auditEvents: AuditEventDocument[]): AuditEventDocument[] {
  return [...auditEvents].sort((left, right) => right.id.localeCompare(left.id, "pl"));
}

function compareNullableDesc(left: number | null, right: number | null): number {
  if (left === null && right === null) {
    return 0;
  }

  if (left === null) {
    return 1;
  }

  if (right === null) {
    return -1;
  }

  return right - left;
}

function searchableWorkerText(worker: WorkerDirectoryListItem): string {
  return normalizeEmail(
    [
      worker.id,
      worker.displayName,
      worker.normalizedName,
      worker.currentPlan?.name ?? "",
      worker.currentPlan?.code ?? "",
      worker.linkedUser?.email ?? "",
      worker.linkedUser?.displayName ?? "",
      worker.linkedUserUid ?? ""
    ].join(" ")
  );
}

function sortPlans(plans: SettlementPlanDocument[]): SettlementPlanDocument[] {
  return [...plans].sort((left, right) => {
    if (left.active !== right.active) {
      return left.active ? -1 : 1;
    }

    return left.name.localeCompare(right.name, "pl", {
      sensitivity: "base"
    });
  });
}

function sortProfiles(profiles: UserProfile[]): UserProfile[] {
  return [...profiles].sort((left, right) => {
    if (left.active !== right.active) {
      return left.active ? -1 : 1;
    }

    const roleDiff = left.role.localeCompare(right.role, "pl");

    if (roleDiff !== 0) {
      return roleDiff;
    }

    const nameDiff = left.displayName.localeCompare(right.displayName, "pl", {
      sensitivity: "base"
    });

    if (nameDiff !== 0) {
      return nameDiff;
    }

    return left.email.localeCompare(right.email, "pl", {
      sensitivity: "base"
    });
  });
}

function sortInvalidDocuments(
  documents: InvalidWorkerDirectoryDocument[]
): InvalidWorkerDirectoryDocument[] {
  return [...documents].sort((left, right) => left.id.localeCompare(right.id, "pl"));
}

function workerAuditSummary(
  worker: WorkerDocument,
  rateVersion: WorkerRateVersionDocument,
  plan: SettlementPlanDocument
): AuditSummary {
  return {
    workerId: worker.id,
    displayName: worker.displayName,
    active: worker.active,
    planId: plan.id,
    currentPlanId: worker.currentPlanId,
    rateVersionId: rateVersion.id,
    currentRateVersionId: worker.currentRateVersionId,
    rateGroszPerUnit: rateVersion.rateGroszPerUnit,
    validFrom: rateVersion.validFrom
  };
}

function workerRateAuditSummary(
  worker: WorkerDocument,
  rateVersion: WorkerRateVersionDocument,
  planId: string
): AuditSummary {
  return {
    workerId: worker.id,
    displayName: worker.displayName,
    active: worker.active,
    planId,
    currentPlanId: worker.currentPlanId,
    rateVersionId: rateVersion.id,
    currentRateVersionId: worker.currentRateVersionId,
    rateGroszPerUnit: rateVersion.rateGroszPerUnit,
    validFrom: rateVersion.validFrom,
    validTo: rateVersion.validTo
  };
}

function workerAccountLinkAuditSummary(
  worker: Pick<WorkerDocument, "id" | "displayName" | "linkedUserUid">,
  profile: UserProfile | null
): AuditSummary {
  return {
    workerId: worker.id,
    displayName: worker.displayName,
    uid: profile?.uid ?? worker.linkedUserUid ?? null,
    email: profile?.email ?? null,
    role: profile?.role ?? null
  };
}

function workerArchiveAuditSummary(worker: WorkerDirectoryListItem): AuditSummary {
  return {
    workerId: worker.id,
    displayName: worker.displayName,
    active: worker.active,
    currentPlanId: worker.currentPlanId,
    currentRateVersionId: worker.currentRateVersionId,
    uid: worker.linkedUser?.uid ?? worker.linkedUserUid ?? null,
    email: worker.linkedUser?.email ?? null,
    role: worker.linkedUser?.role ?? null
  };
}

function rateChangeReason(
  backdatedWarning: string | null,
  periodWarning: string | null
): string {
  return [
    "Historyczne snapshoty sesji nie zostana przeliczone.",
    backdatedWarning,
    periodWarning
  ]
    .filter((value): value is string => Boolean(value))
    .join(" ");
}

function buildWorkerArchiveWarnings(
  worker: WorkerDirectoryListItem,
  businessDate: string
): string[] {
  const warnings = [
    "Modul sesji nie jest jeszcze podlaczony; sprawdz otwarte sesje poza systemem."
  ];
  const dueGrosz = worker.seasonSummary.dueGrosz;
  const activeFutureRates = findActiveFutureRateVersions(worker, businessDate);

  if (dueGrosz === null) {
    warnings.push(
      "Kwota do wyplaty nie jest jeszcze wyliczana w module zbieraczy; sprawdz rozliczenia poza systemem."
    );
  } else if (dueGrosz > 0) {
    warnings.push(`Do wyplaty pozostaje ${formatMoney(dueGrosz)}.`);
  }

  if (hasActiveLinkedAccount(worker)) {
    warnings.push(
      "Powiazane aktywne konto pozostanie aktywne i bedzie moglo czytac historyczne dane."
    );
  }

  if (worker.currentRateVersion) {
    warnings.push(
      `Aktualna stawka ${formatMoney(worker.currentRateVersion.rateGroszPerUnit)} od ${worker.currentRateVersion.validFrom} pozostanie w historii.`
    );
  } else {
    warnings.push("Brak aktualnej stawki do weryfikacji przed archiwizacja.");
  }

  if (activeFutureRates.length > 0) {
    warnings.push(
      `Aktywne przyszle stawki pozostana w historii: ${activeFutureRates
        .map((rateVersion) => rateVersion.validFrom)
        .join(", ")}.`
    );
  }

  return warnings;
}

function hasActiveLinkedAccount(worker: WorkerDirectoryListItem): boolean {
  return Boolean(
    worker.linkedUser &&
    worker.linkedUser.active &&
    worker.linkedUser.registrationStatus === "APPROVED"
  );
}

function findActiveFutureRateVersions(
  worker: WorkerDirectoryListItem,
  businessDate: string
): WorkerRateVersionDocument[] {
  return worker.rateVersions
    .filter((rateVersion) => rateVersion.active && rateVersion.validFrom > businessDate)
    .sort((left, right) => {
      const validFromDiff = left.validFrom.localeCompare(right.validFrom);

      if (validFromDiff !== 0) {
        return validFromDiff;
      }

      return left.id.localeCompare(right.id, "pl");
    });
}

function buildWorkerArchiveReason(reason: string, warnings: string[]): string {
  return [reason, ...warnings.map((warning) => `Kontrola: ${warning}`)].join(" ");
}

function findWorkerOrThrow(
  workers: WorkerDirectoryListItem[],
  workerId: string
): WorkerDirectoryListItem {
  const worker = workers.find((item) => item.id === workerId);

  if (!worker) {
    throw new Error("Wybrany zbieracz nie istnieje.");
  }

  return worker;
}

function findProfileByUid(profiles: UserProfile[], uid: string): UserProfile | null {
  return profiles.find((profile) => profile.uid === uid) ?? null;
}

function assertAdmin(profile: UserProfile): void {
  if (
    profile.role !== "ADMIN" ||
    !profile.active ||
    profile.registrationStatus !== "APPROVED"
  ) {
    throw new Error("Utworzenie zbieracza wymaga aktywnego administratora.");
  }
}

function normalizeRequiredText(value: string, message: string): string {
  const normalized = value.trim().replace(/\s+/g, " ");

  if (!normalized) {
    throw new Error(message);
  }

  return normalized;
}

function normalizeOptionalText(value: string | null | undefined): string | null {
  if (value === undefined || value === null) {
    return null;
  }

  const normalized = value.trim().replace(/\s+/g, " ");
  return normalized.length > 0 ? normalized : null;
}

function normalizeOptionalEmail(value: string | null | undefined): string | null {
  const normalized = normalizeOptionalText(value);

  if (!normalized) {
    return null;
  }

  if (!normalized.includes("@")) {
    throw new Error("Podaj poprawny e-mail kontaktowy albo zostaw pole puste.");
  }

  return normalized.toLocaleLowerCase("pl-PL");
}

function normalizeRateGrosz(value: number): number {
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error("Stawka musi byc dodatnia kwota w groszach.");
  }

  return value;
}

function normalizeBusinessDate(value: string): string {
  const normalized = normalizeRequiredText(value, "Podaj date obowiazywania stawki.");

  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) {
    throw new Error("Data obowiazywania musi miec format RRRR-MM-DD.");
  }

  const parsed = new Date(`${normalized}T00:00:00.000Z`);

  if (
    Number.isNaN(parsed.getTime()) ||
    parsed.toISOString().slice(0, 10) !== normalized
  ) {
    throw new Error("Data obowiazywania jest nieprawidlowa.");
  }

  return normalized;
}

function currentBusinessDate(): string {
  return new Date().toISOString().slice(0, 10);
}

function compactWorkerName(value: string): string {
  return value
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("pl-PL")
    .replace(/[^a-z0-9]+/g, "");
}

function invalidWorker(reason: string): WorkerDecodeResult {
  return {
    status: "INVALID",
    reason
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readRequiredString(data: Record<string, unknown>, key: string): string | null {
  const value = data[key];

  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}
