import { AUDIT_EVENTS_COLLECTION, createAuditEventId } from "../audit/auditEvents";
import { getFirebaseServices } from "../config/firebaseServices";
import {
  SEASONS_COLLECTION,
  WORKERS_COLLECTION,
  WORKER_RATE_VERSIONS_COLLECTION,
  type SeasonDocument,
  type WorkerDocument,
  type WorkerRateVersionDocument
} from "../domain/domainConfiguration";
import type { UserProfile } from "../domain/identity";
import { decodeSeason } from "../seasons/seasons";
import { decodeWorker } from "../workers/workerDirectory";
import { decodeWorkerRateVersion } from "../plans/settlementPlans";
import {
  prepareCloseHarvestSessionOnline,
  type PreparedCloseHarvestSessionOnline
} from "./closeHarvestSession";
import {
  decodeHarvestEntry,
  decodeHarvestSession,
  type HarvestEntryDocument
} from "./harvestSessionDashboard";
import type { CalculableHarvestEntry } from "./harvestSessionCalculation";
import {
  HARVEST_ENTRIES_COLLECTION,
  HARVEST_SESSIONS_COLLECTION
} from "./harvestSessionState";
import type { HarvestSessionDocument } from "./openHarvestSession";

type FirebaseEnv = Record<string, string | boolean | undefined>;

export type CloseHarvestSessionOnlineInput = {
  actorProfile: UserProfile;
  sessionId: string;
  confirmationAccepted: boolean;
  isOnline: boolean;
  deviceId: string;
};

export type CloseHarvestSessionOnlineResult = {
  session: HarvestSessionDocument;
  selectedSessionId: string | null;
  message: string;
  confirmationSummary: PreparedCloseHarvestSessionOnline["confirmationSummary"];
};

export type PrepareRuntimeCloseHarvestSessionInput = {
  actorProfile: UserProfile;
  session: HarvestSessionDocument;
  entries: HarvestEntryDocument[];
  season: SeasonDocument;
  worker: WorkerDocument;
  rateVersion: WorkerRateVersionDocument | null;
  confirmationAccepted: boolean;
  isOnline: boolean;
  closedAtDevice: unknown;
  closedAtServer: unknown;
  auditId: string;
  deviceId: string;
};

export async function closeHarvestSessionOnline(
  env: FirebaseEnv,
  input: CloseHarvestSessionOnlineInput
): Promise<CloseHarvestSessionOnlineResult> {
  assertCloseHarvestSessionActor(input.actorProfile);

  const { firestore } = await getFirebaseServices(env);
  const {
    Timestamp,
    collection,
    doc,
    getDoc,
    getDocs,
    orderBy,
    query,
    serverTimestamp,
    where,
    writeBatch
  } = await import("firebase/firestore/lite");
  const sessionSnapshot = await getDoc(
    doc(firestore, HARVEST_SESSIONS_COLLECTION, input.sessionId)
  );

  if (!sessionSnapshot.exists()) {
    throw new Error("Nie znaleziono sesji zbioru.");
  }

  const decodedSession = decodeHarvestSession(sessionSnapshot.id, sessionSnapshot.data());

  if (decodedSession.status !== "FOUND") {
    throw new Error(decodedSession.reason);
  }

  const [entriesSnapshot, seasonSnapshot, workerSnapshot, rateVersionSnapshot] =
    await Promise.all([
      getDocs(
        query(
          collection(firestore, HARVEST_ENTRIES_COLLECTION),
          where("sessionId", "==", decodedSession.session.id),
          orderBy("sequenceNumber", "asc")
        )
      ),
      getDoc(doc(firestore, SEASONS_COLLECTION, decodedSession.session.seasonId)),
      getDoc(doc(firestore, WORKERS_COLLECTION, decodedSession.session.workerId)),
      getDoc(
        doc(
          firestore,
          WORKER_RATE_VERSIONS_COLLECTION,
          decodedSession.session.rateVersionIdSnapshot
        )
      )
    ]);
  const entries = entriesSnapshot.docs.map((entrySnapshot) => {
    const decodedEntry = decodeHarvestEntry(entrySnapshot.id, entrySnapshot.data());

    if (decodedEntry.status !== "FOUND") {
      throw new Error(decodedEntry.reason);
    }

    return decodedEntry.entry;
  });
  const season = decodeRequiredSeason(seasonSnapshot.id, seasonSnapshot.data());
  const worker = decodeRequiredWorker(workerSnapshot.id, workerSnapshot.data());
  const rateVersion = rateVersionSnapshot.exists()
    ? decodeRequiredRateVersion(rateVersionSnapshot.id, rateVersionSnapshot.data())
    : null;
  const closedAtDevice = Timestamp.now();
  const closedAtServer = serverTimestamp();
  const prepared = prepareRuntimeCloseHarvestSession({
    actorProfile: input.actorProfile,
    session: decodedSession.session,
    entries,
    season,
    worker,
    rateVersion,
    confirmationAccepted: input.confirmationAccepted,
    isOnline: input.isOnline,
    closedAtDevice,
    closedAtServer,
    auditId: createAuditEventId(),
    deviceId: input.deviceId
  });
  const batch = writeBatch(firestore);

  batch.update(
    doc(firestore, HARVEST_SESSIONS_COLLECTION, prepared.session.id),
    prepared.sessionUpdate
  );
  batch.set(
    doc(firestore, AUDIT_EVENTS_COLLECTION, prepared.auditEvent.id),
    prepared.auditEvent
  );

  await batch.commit();

  return {
    session: prepared.session,
    selectedSessionId: null,
    message: `Zamknieto sesje dla ${prepared.session.workerNameSnapshot}.`,
    confirmationSummary: prepared.confirmationSummary
  };
}

export function prepareRuntimeCloseHarvestSession(
  input: PrepareRuntimeCloseHarvestSessionInput
): PreparedCloseHarvestSessionOnline {
  assertCloseHarvestSessionActor(input.actorProfile);
  assertActorCanCloseSession(input.actorProfile, input.session);

  return prepareCloseHarvestSessionOnline({
    actorProfile: input.actorProfile,
    session: input.session,
    entries: input.entries.map(toCalculableHarvestEntry),
    season: input.season,
    worker: input.worker,
    rateVersion: input.rateVersion,
    isOnline: input.isOnline,
    pendingWriteCount: input.entries.filter((entry) => entry.pendingSync).length,
    confirmationAccepted: input.confirmationAccepted,
    closedAtDevice: input.closedAtDevice,
    closedAtServer: input.closedAtServer,
    auditId: input.auditId,
    deviceId: input.deviceId
  });
}

function toCalculableHarvestEntry(entry: HarvestEntryDocument): CalculableHarvestEntry {
  return {
    id: entry.id,
    status: entry.status,
    quantityMilli: entry.quantityMilli,
    weightG: entry.weightG
  };
}

function decodeRequiredSeason(id: string, data: unknown): SeasonDocument {
  const decoded = decodeSeason(id, data);

  if (decoded.status !== "FOUND") {
    throw new Error(decoded.reason);
  }

  return decoded.season;
}

function decodeRequiredWorker(id: string, data: unknown): WorkerDocument {
  const decoded = decodeWorker(id, data);

  if (decoded.status !== "FOUND") {
    throw new Error(decoded.reason);
  }

  return decoded.worker;
}

function decodeRequiredRateVersion(id: string, data: unknown): WorkerRateVersionDocument {
  const decoded = decodeWorkerRateVersion(id, data);

  if (decoded.status !== "FOUND") {
    throw new Error(decoded.reason);
  }

  return decoded.rateVersion;
}

function assertCloseHarvestSessionActor(actorProfile: UserProfile): void {
  if (
    !actorProfile.active ||
    actorProfile.registrationStatus !== "APPROVED" ||
    (actorProfile.role !== "ADMIN" && actorProfile.role !== "OPERATOR")
  ) {
    throw new Error("Zamkniecie sesji wymaga aktywnego administratora albo operatora.");
  }
}

function assertActorCanCloseSession(
  actorProfile: UserProfile,
  session: HarvestSessionDocument
): void {
  if (actorProfile.role === "ADMIN" || session.createdBy === actorProfile.uid) {
    return;
  }

  throw new Error("Operator moze zamknac tylko prowadzona przez siebie sesje.");
}
