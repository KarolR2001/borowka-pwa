import { AUDIT_EVENTS_COLLECTION, createAuditEventId } from "../audit/auditEvents";
import { getFirebaseServices } from "../config/firebaseServices";
import {
  SEASONS_COLLECTION,
  SETTLEMENT_PLANS_COLLECTION,
  WORKERS_COLLECTION,
  WORKER_RATE_VERSIONS_COLLECTION,
  type SeasonDocument,
  type SettlementPlanDocument,
  type WorkerDocument,
  type WorkerRateVersionDocument
} from "../domain/domainConfiguration";
import type { UserProfile } from "../domain/identity";
import { decodeSettlementPlan, decodeWorkerRateVersion } from "../plans/settlementPlans";
import { decodeSeason } from "../seasons/seasons";
import { decodeWorker } from "../workers/workerDirectory";
import { createHarvestOperationAuditEventDraft } from "./harvestAudit";
import {
  decodeHarvestSession,
  type HarvestSessionDashboardDocument,
  type InvalidHarvestDashboardDocument
} from "./harvestSessionDashboard";
import { HARVEST_SESSIONS_COLLECTION } from "./harvestSessionState";
import {
  createHarvestSessionId,
  prepareOpenHarvestSession,
  type HarvestSessionDocument,
  type HarvestSessionLookup,
  type PrepareOpenHarvestSessionResult
} from "./openHarvestSession";

type FirebaseEnv = Record<string, string | boolean | undefined>;

export type OpenHarvestSessionConfigurationResult = {
  seasons: SeasonDocument[];
  workers: WorkerDocument[];
  plans: SettlementPlanDocument[];
  rateVersions: WorkerRateVersionDocument[];
  openSessions: HarvestSessionLookup[];
  invalidSeasons: InvalidHarvestDashboardDocument[];
  invalidWorkers: InvalidHarvestDashboardDocument[];
  invalidPlans: InvalidHarvestDashboardDocument[];
  invalidRateVersions: InvalidHarvestDashboardDocument[];
  invalidSessions: InvalidHarvestDashboardDocument[];
};

export type ListOpenHarvestSessionConfigurationInput = {
  actorProfile: UserProfile;
  isOnline?: boolean;
};

export type OpenHarvestSessionOnlineInput = {
  actorProfile: UserProfile;
  seasonId: string;
  workerId: string;
  businessDate: string;
  note?: string | null;
  secondSessionReason?: string | null;
  isOnline: boolean;
  createdDeviceId: string;
  persistentDataCacheReady?: boolean;
  serviceWorkerReady?: boolean;
};

export type OpenHarvestSessionOnlineResult =
  | {
      status: "CREATED" | "CREATED_OFFLINE";
      session: HarvestSessionDocument;
      selectedSessionId: string;
      message: string;
      duplicateMode: "FIRST_SESSION" | "SECOND_SESSION_CONFIRMED";
      calculationDescription: string;
    }
  | {
      status: "CONTINUE_EXISTING";
      selectedSessionId: string | null;
      existingOpenSessions: HarvestSessionLookup[];
      canCreateSecondSession: boolean;
      message: string;
    };

export type PrepareRuntimeOpenHarvestSessionInput = OpenHarvestSessionOnlineInput & {
  id: string;
  createdAtDevice: unknown;
};

export async function listOpenHarvestSessionConfiguration(
  env: FirebaseEnv,
  input: ListOpenHarvestSessionConfigurationInput
): Promise<OpenHarvestSessionConfigurationResult> {
  assertOpenHarvestSessionActor(input.actorProfile);

  const { firestore } = await getFirebaseServices(env);
  const { collection, getDocs, getDocsFromCache, limit, orderBy, query, where } =
    await import("firebase/firestore");
  const readQuery = input.isOnline === false ? getDocsFromCache : getDocs;
  const [
    seasonsSnapshot,
    workersSnapshot,
    plansSnapshot,
    rateVersionsSnapshot,
    sessionsSnapshot
  ] = await Promise.all([
    readQuery(
      query(collection(firestore, SEASONS_COLLECTION), where("status", "==", "OPEN"))
    ),
    readQuery(
      query(collection(firestore, WORKERS_COLLECTION), where("active", "==", true))
    ),
    readQuery(
      query(
        collection(firestore, SETTLEMENT_PLANS_COLLECTION),
        where("active", "==", true)
      )
    ),
    readQuery(
      query(
        collection(firestore, WORKER_RATE_VERSIONS_COLLECTION),
        where("active", "==", true)
      )
    ),
    readQuery(
      query(
        collection(firestore, HARVEST_SESSIONS_COLLECTION),
        where("status", "==", "OPEN"),
        orderBy("businessDate", "desc"),
        orderBy("createdAtServer", "desc"),
        limit(200)
      )
    )
  ]);

  return buildOpenHarvestSessionConfiguration({
    seasonDocuments: seasonsSnapshot.docs.map((documentSnapshot) => ({
      id: documentSnapshot.id,
      data: documentSnapshot.data()
    })),
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
    sessionDocuments: sessionsSnapshot.docs.map((documentSnapshot) => ({
      id: documentSnapshot.id,
      data: documentSnapshot.data()
    }))
  });
}

export async function openHarvestSessionOnline(
  env: FirebaseEnv,
  input: OpenHarvestSessionOnlineInput
): Promise<OpenHarvestSessionOnlineResult> {
  assertOpenHarvestSessionActor(input.actorProfile);

  const { firestore } = await getFirebaseServices(env);
  const { Timestamp, doc, serverTimestamp, writeBatch } =
    await import("firebase/firestore");
  const createdAtDevice = Timestamp.now();
  const createdAtServer = serverTimestamp();
  const configuration = await listOpenHarvestSessionConfiguration(env, {
    actorProfile: input.actorProfile,
    isOnline: input.isOnline
  });
  const prepared = prepareRuntimeOpenHarvestSession(configuration, {
    ...input,
    id: createHarvestSessionId(),
    createdAtDevice
  });

  if (prepared.status === "CONTINUE_EXISTING") {
    return {
      status: "CONTINUE_EXISTING",
      selectedSessionId: prepared.existingOpenSessions.at(0)?.id ?? null,
      existingOpenSessions: prepared.existingOpenSessions,
      canCreateSecondSession: prepared.canCreateSecondSession,
      message: prepared.message
    };
  }

  const session: HarvestSessionDocument = {
    ...prepared.session,
    createdAtServer
  };

  if (prepared.auditAction !== "HARVEST_SESSION_CREATED") {
    throw new Error("Otwarcie sesji ma nieprawidlowa akcje audytu.");
  }

  const auditId = createAuditEventId();
  const batch = writeBatch(firestore);

  batch.set(doc(firestore, HARVEST_SESSIONS_COLLECTION, session.id), session);
  batch.set(
    doc(firestore, AUDIT_EVENTS_COLLECTION, auditId),
    createHarvestOperationAuditEventDraft({
      id: auditId,
      actorProfile: input.actorProfile,
      action: prepared.auditAction,
      entityId: session.id,
      businessDate: session.businessDate,
      beforeSummary: prepared.beforeSummary,
      afterSummary: prepared.afterSummary,
      reason: prepared.reason,
      createdAtDevice,
      createdAtServer,
      deviceId: prepared.deviceId
    })
  );

  await batch.commit();

  return {
    status: "CREATED",
    session,
    selectedSessionId: session.id,
    message: `Otworzono sesje dla ${session.workerNameSnapshot}.`,
    duplicateMode: prepared.duplicateMode,
    calculationDescription: prepared.calculationDescription
  };
}

export function buildOpenHarvestSessionConfiguration({
  seasonDocuments,
  workerDocuments,
  planDocuments,
  rateVersionDocuments,
  sessionDocuments
}: {
  seasonDocuments: HarvestSessionDashboardDocument[];
  workerDocuments: HarvestSessionDashboardDocument[];
  planDocuments: HarvestSessionDashboardDocument[];
  rateVersionDocuments: HarvestSessionDashboardDocument[];
  sessionDocuments: HarvestSessionDashboardDocument[];
}): OpenHarvestSessionConfigurationResult {
  const seasons: SeasonDocument[] = [];
  const workers: WorkerDocument[] = [];
  const plans: SettlementPlanDocument[] = [];
  const rateVersions: WorkerRateVersionDocument[] = [];
  const openSessions: HarvestSessionLookup[] = [];
  const invalidSeasons: InvalidHarvestDashboardDocument[] = [];
  const invalidWorkers: InvalidHarvestDashboardDocument[] = [];
  const invalidPlans: InvalidHarvestDashboardDocument[] = [];
  const invalidRateVersions: InvalidHarvestDashboardDocument[] = [];
  const invalidSessions: InvalidHarvestDashboardDocument[] = [];

  for (const document of seasonDocuments) {
    const decoded = decodeSeason(document.id, document.data);

    if (decoded.status === "FOUND" && decoded.season.status === "OPEN") {
      seasons.push(decoded.season);
    } else if (decoded.status === "INVALID") {
      invalidSeasons.push({ id: document.id, reason: decoded.reason });
    }
  }

  for (const document of workerDocuments) {
    const decoded = decodeWorker(document.id, document.data);

    if (decoded.status === "FOUND" && decoded.worker.active) {
      workers.push(decoded.worker);
    } else if (decoded.status === "INVALID") {
      invalidWorkers.push({ id: document.id, reason: decoded.reason });
    }
  }

  for (const document of planDocuments) {
    const decoded = decodeSettlementPlan(document.id, document.data);

    if (decoded.status === "FOUND" && decoded.plan.active) {
      plans.push(decoded.plan);
    } else if (decoded.status === "INVALID") {
      invalidPlans.push({ id: document.id, reason: decoded.reason });
    }
  }

  for (const document of rateVersionDocuments) {
    const decoded = decodeWorkerRateVersion(document.id, document.data);

    if (decoded.status === "FOUND" && decoded.rateVersion.active) {
      rateVersions.push(decoded.rateVersion);
    } else if (decoded.status === "INVALID") {
      invalidRateVersions.push({ id: document.id, reason: decoded.reason });
    }
  }

  for (const document of sessionDocuments) {
    const decoded = decodeHarvestSession(document.id, document.data);

    if (decoded.status === "FOUND" && decoded.session.status === "OPEN") {
      openSessions.push({
        id: decoded.session.id,
        workerId: decoded.session.workerId,
        businessDate: decoded.session.businessDate,
        status: decoded.session.status
      });
    } else if (decoded.status === "INVALID") {
      invalidSessions.push({ id: document.id, reason: decoded.reason });
    }
  }

  return {
    seasons: sortSeasons(seasons),
    workers: sortWorkers(workers),
    plans: sortPlans(plans),
    rateVersions: sortRateVersions(rateVersions),
    openSessions: sortOpenSessionLookups(openSessions),
    invalidSeasons: sortInvalidDocuments(invalidSeasons),
    invalidWorkers: sortInvalidDocuments(invalidWorkers),
    invalidPlans: sortInvalidDocuments(invalidPlans),
    invalidRateVersions: sortInvalidDocuments(invalidRateVersions),
    invalidSessions: sortInvalidDocuments(invalidSessions)
  };
}

export function prepareRuntimeOpenHarvestSession(
  configuration: OpenHarvestSessionConfigurationResult,
  input: PrepareRuntimeOpenHarvestSessionInput
): PrepareOpenHarvestSessionResult {
  assertOpenHarvestSessionActor(input.actorProfile);

  const season = configuration.seasons.find(
    (candidate) => candidate.id === input.seasonId
  );
  const worker = configuration.workers.find(
    (candidate) => candidate.id === input.workerId
  );

  if (!season) {
    throw new Error("Wybierz otwarty sezon.");
  }

  if (!worker) {
    throw new Error("Wybierz aktywnego zbieracza.");
  }

  return prepareOpenHarvestSession({
    actorProfile: input.actorProfile,
    id: input.id,
    season,
    worker,
    plans: configuration.plans,
    rateVersions: configuration.rateVersions,
    businessDate: input.businessDate,
    existingSessions: configuration.openSessions,
    isOnline: input.isOnline,
    note: input.note,
    secondSessionReason: input.secondSessionReason,
    createdDeviceId: input.createdDeviceId,
    createdAtDevice: input.createdAtDevice
  });
}

export function selectDefaultOpenHarvestSeason(
  configuration: OpenHarvestSessionConfigurationResult
): SeasonDocument | null {
  const defaultSeason = configuration.seasons.find((season) => season.isDefault);

  return (
    defaultSeason ?? (configuration.seasons.length > 0 ? configuration.seasons[0] : null)
  );
}

function assertOpenHarvestSessionActor(actorProfile: UserProfile): void {
  if (
    !actorProfile.active ||
    actorProfile.registrationStatus !== "APPROVED" ||
    (actorProfile.role !== "ADMIN" && actorProfile.role !== "OPERATOR")
  ) {
    throw new Error("Otwarcie sesji wymaga aktywnego administratora albo operatora.");
  }
}

function sortSeasons(seasons: SeasonDocument[]): SeasonDocument[] {
  return [...seasons].sort((left, right) => {
    if (left.isDefault !== right.isDefault) {
      return left.isDefault ? -1 : 1;
    }

    return right.startDate.localeCompare(left.startDate);
  });
}

function sortWorkers(workers: WorkerDocument[]): WorkerDocument[] {
  return [...workers].sort((left, right) =>
    left.displayName.localeCompare(right.displayName, "pl", { sensitivity: "base" })
  );
}

function sortPlans(plans: SettlementPlanDocument[]): SettlementPlanDocument[] {
  return [...plans].sort((left, right) =>
    left.name.localeCompare(right.name, "pl", { sensitivity: "base" })
  );
}

function sortRateVersions(
  rateVersions: WorkerRateVersionDocument[]
): WorkerRateVersionDocument[] {
  return [...rateVersions].sort((left, right) => {
    const workerDiff = left.workerId.localeCompare(right.workerId, "pl");

    return workerDiff === 0 ? right.validFrom.localeCompare(left.validFrom) : workerDiff;
  });
}

function sortOpenSessionLookups(
  sessions: HarvestSessionLookup[]
): HarvestSessionLookup[] {
  return [...sessions].sort((left, right) => {
    const dateDiff = right.businessDate.localeCompare(left.businessDate);

    return dateDiff === 0 ? left.id.localeCompare(right.id, "pl") : dateDiff;
  });
}

function sortInvalidDocuments(
  documents: InvalidHarvestDashboardDocument[]
): InvalidHarvestDashboardDocument[] {
  return [...documents].sort((left, right) => left.id.localeCompare(right.id, "pl"));
}
