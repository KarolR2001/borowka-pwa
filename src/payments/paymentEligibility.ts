import { getFirebaseServices } from "../config/firebaseServices";
import {
  SEASONS_COLLECTION,
  WORKERS_COLLECTION,
  type SeasonDocument,
  type WorkerDocument
} from "../domain/domainConfiguration";
import { decodeUserProfile, type UserProfile } from "../domain/identity";
import {
  decodeHarvestEntry,
  decodeHarvestSession,
  type HarvestEntryDocument
} from "../harvest/harvestSessionDashboard";
import { verifyHarvestSessionAggregatesFromEntries } from "../harvest/harvestSessionTrustBoundary";
import {
  HARVEST_ENTRIES_COLLECTION,
  HARVEST_SESSIONS_COLLECTION
} from "../harvest/harvestSessionState";
import type { HarvestSessionDocument } from "../harvest/openHarvestSession";
import type { SyncDocumentMetadataInput } from "../offline/pendingWriteMetadata";
import { evaluateSyncDocumentMetadata } from "../offline/pendingWriteMetadata";
import { decodeSeason } from "../seasons/seasons";
import { decodeWorker } from "../workers/workerDirectory";
import {
  PAYMENTS_COLLECTION,
  decodePaymentSummary,
  type PaymentSummary
} from "./pendingPayments";

type FirebaseEnv = Record<string, string | boolean | undefined>;

export type PaymentEligibilityBlockerCode =
  | "ADMIN_REQUIRED"
  | "ONLINE_REQUIRED"
  | "ADMIN_PROFILE_INACTIVE"
  | "SESSION_NOT_FOUND"
  | "SESSION_NOT_CLOSED"
  | "ACTIVE_PAYMENT_EXISTS"
  | "SESSION_REVIEW_REQUIRED"
  | "PENDING_SYNCHRONIZATION"
  | "OFFICIAL_AMOUNT_MISSING"
  | "OFFICIAL_AMOUNT_STALE"
  | "SEASON_NOT_FOUND"
  | "SEASON_NOT_ELIGIBLE"
  | "WORKER_NOT_FOUND"
  | "PAYMENT_ID_OCCUPIED"
  | "PAYMENT_DOCUMENT_INVALID";

export type PaymentEligibilityBlocker = {
  code: PaymentEligibilityBlockerCode;
  message: string;
  nextStep: string;
};

export type PaymentEligibilityResult = {
  amountDueGrosz: number | null;
  blockers: PaymentEligibilityBlocker[];
  checkedAtIso: string;
  paymentId: string;
  sessionId: string;
  sessionRevision: number | null;
  status: "ELIGIBLE" | "BLOCKED";
};

export type CheckPaymentEligibilityInput = {
  actorProfile: UserProfile;
  isOnline: boolean;
  sessionId: string;
  syncDocuments: readonly SyncDocumentMetadataInput[];
};

type PaymentDocumentState =
  | { status: "MISSING" }
  | { status: "VALID"; payment: PaymentSummary }
  | {
      status: "INVALID";
      active: boolean;
      referencedSessionId: string | null;
    };

export async function checkPaymentEligibility(
  env: FirebaseEnv,
  input: CheckPaymentEligibilityInput
): Promise<PaymentEligibilityResult> {
  const sessionId = normalizeRequiredId(input.sessionId);

  if (!input.isOnline) {
    return evaluatePaymentEligibility({
      actorProfile: input.actorProfile,
      checkedAt: new Date(),
      entries: [],
      invalidEntryCount: 0,
      isOnline: false,
      paymentState: { status: "MISSING" },
      season: null,
      serverChecksAvailable: false,
      session: null,
      sessionId,
      syncDocuments: input.syncDocuments,
      worker: null
    });
  }

  const { firestore } = await getFirebaseServices(env);
  const { collection, doc, getDocFromServer, getDocsFromServer, query, where } =
    await import("firebase/firestore");
  const profileSnapshot = await getDocFromServer(
    doc(firestore, "users", input.actorProfile.uid)
  );
  const profile = profileSnapshot.exists()
    ? decodeUserProfile(profileSnapshot.id, profileSnapshot.data())
    : null;
  const actorProfile =
    profile?.status === "FOUND"
      ? profile.profile
      : {
          ...input.actorProfile,
          active: false,
          registrationStatus: "BLOCKED" as const
        };

  if (
    actorProfile.role !== "ADMIN" ||
    !actorProfile.active ||
    actorProfile.registrationStatus !== "APPROVED"
  ) {
    return evaluatePaymentEligibility({
      actorProfile,
      checkedAt: new Date(),
      entries: [],
      invalidEntryCount: 0,
      isOnline: true,
      paymentState: { status: "MISSING" },
      season: null,
      serverChecksAvailable: false,
      session: null,
      sessionId,
      syncDocuments: input.syncDocuments,
      worker: null
    });
  }

  const sessionSnapshot = await getDocFromServer(
    doc(firestore, HARVEST_SESSIONS_COLLECTION, sessionId)
  );
  const decodedSession = sessionSnapshot.exists()
    ? decodeHarvestSession(
        sessionSnapshot.id,
        sessionSnapshot.data({ serverTimestamps: "estimate" })
      )
    : null;
  const session = decodedSession?.status === "FOUND" ? decodedSession.session : null;

  if (!session) {
    return evaluatePaymentEligibility({
      actorProfile,
      checkedAt: new Date(),
      entries: [],
      invalidEntryCount: sessionSnapshot.exists() ? 1 : 0,
      isOnline: true,
      paymentState: { status: "MISSING" },
      season: null,
      serverChecksAvailable: true,
      session: null,
      sessionId,
      syncDocuments: input.syncDocuments,
      worker: null
    });
  }

  const [entriesSnapshot, seasonSnapshot, workerSnapshot, paymentSnapshot] =
    await Promise.all([
      getDocsFromServer(
        query(
          collection(firestore, HARVEST_ENTRIES_COLLECTION),
          where("sessionId", "==", session.id)
        )
      ),
      getDocFromServer(doc(firestore, SEASONS_COLLECTION, session.seasonId)),
      getDocFromServer(doc(firestore, WORKERS_COLLECTION, session.workerId)),
      getDocFromServer(doc(firestore, PAYMENTS_COLLECTION, session.id))
    ]);
  const entries: HarvestEntryDocument[] = [];
  let invalidEntryCount = 0;

  for (const entrySnapshot of entriesSnapshot.docs) {
    const decoded = decodeHarvestEntry(
      entrySnapshot.id,
      entrySnapshot.data({ serverTimestamps: "estimate" })
    );

    if (decoded.status === "FOUND") {
      entries.push(decoded.entry);
    } else {
      invalidEntryCount += 1;
    }
  }

  const decodedSeason = seasonSnapshot.exists()
    ? decodeSeason(
        seasonSnapshot.id,
        seasonSnapshot.data({ serverTimestamps: "estimate" })
      )
    : null;
  const decodedWorker = workerSnapshot.exists()
    ? decodeWorker(
        workerSnapshot.id,
        workerSnapshot.data({ serverTimestamps: "estimate" })
      )
    : null;

  return evaluatePaymentEligibility({
    actorProfile,
    checkedAt: new Date(),
    entries,
    invalidEntryCount,
    isOnline: true,
    paymentState: decodePaymentDocumentState(paymentSnapshot),
    season: decodedSeason?.status === "FOUND" ? decodedSeason.season : null,
    serverChecksAvailable: true,
    session,
    sessionId,
    syncDocuments: input.syncDocuments,
    worker: decodedWorker?.status === "FOUND" ? decodedWorker.worker : null
  });
}

export function evaluatePaymentEligibility({
  actorProfile,
  checkedAt = new Date(),
  entries,
  invalidEntryCount,
  isOnline,
  paymentState,
  season,
  serverChecksAvailable,
  session,
  sessionId,
  syncDocuments,
  worker
}: {
  actorProfile: UserProfile;
  checkedAt?: Date;
  entries: readonly HarvestEntryDocument[];
  invalidEntryCount: number;
  isOnline: boolean;
  paymentState: PaymentDocumentState;
  season: SeasonDocument | null;
  serverChecksAvailable: boolean;
  session: HarvestSessionDocument | null;
  sessionId: string;
  syncDocuments: readonly SyncDocumentMetadataInput[];
  worker: WorkerDocument | null;
}): PaymentEligibilityResult {
  const blockers: PaymentEligibilityBlocker[] = [];

  if (actorProfile.role !== "ADMIN") {
    blockers.push(
      blocker(
        "ADMIN_REQUIRED",
        "Wyplate moze przygotowac tylko administrator.",
        "Zaloguj sie na aktywne konto administratora."
      )
    );
  }

  if (!actorProfile.active || actorProfile.registrationStatus !== "APPROVED") {
    blockers.push(
      blocker(
        "ADMIN_PROFILE_INACTIVE",
        "Profil administratora nie jest aktywny.",
        "Reaktywuj albo zatwierdz profil przed rozliczeniem."
      )
    );
  }

  if (!isOnline) {
    blockers.push(
      blocker(
        "ONLINE_REQUIRED",
        "Wyplata wymaga aktualnego polaczenia z Firestore.",
        "Odzyskaj internet i ponow kontrole."
      )
    );
  }

  if (serverChecksAvailable) {
    addServerBlockers({
      blockers,
      entries,
      invalidEntryCount,
      paymentState,
      season,
      session,
      sessionId,
      syncDocuments,
      worker
    });
  }

  return {
    amountDueGrosz: session?.amountDueGrosz ?? null,
    blockers,
    checkedAtIso: checkedAt.toISOString(),
    paymentId: sessionId,
    sessionId,
    sessionRevision: session?.revision ?? null,
    status: blockers.length === 0 ? "ELIGIBLE" : "BLOCKED"
  };
}

function addServerBlockers({
  blockers,
  entries,
  invalidEntryCount,
  paymentState,
  season,
  session,
  sessionId,
  syncDocuments,
  worker
}: {
  blockers: PaymentEligibilityBlocker[];
  entries: readonly HarvestEntryDocument[];
  invalidEntryCount: number;
  paymentState: PaymentDocumentState;
  season: SeasonDocument | null;
  session: HarvestSessionDocument | null;
  sessionId: string;
  syncDocuments: readonly SyncDocumentMetadataInput[];
  worker: WorkerDocument | null;
}): void {
  if (!session) {
    blockers.push(
      blocker(
        "SESSION_NOT_FOUND",
        "Sesja nie istnieje albo ma nieprawidlowy format w Firestore.",
        "Odswiez dane i sprawdz sesje w diagnostyce."
      )
    );
    return;
  }

  if (session.status === "REVIEW_REQUIRED") {
    blockers.push(
      blocker(
        "SESSION_REVIEW_REQUIRED",
        "Sesja ma nierozstrzygniety konflikt.",
        "Rozwiaz konflikt sesji przed wyplata."
      )
    );
  } else if (session.status !== "CLOSED") {
    blockers.push(
      blocker(
        "SESSION_NOT_CLOSED",
        `Sesja ma status ${session.status}, a wyplata wymaga CLOSED.`,
        "Zamknij sesje albo wybierz inna pozycje."
      )
    );
  }

  if (
    session.paymentId !== null ||
    (paymentState.status === "VALID" && paymentState.payment.status === "ACTIVE")
  ) {
    blockers.push(
      blocker(
        "ACTIVE_PAYMENT_EXISTS",
        "Sesja ma juz aktywna wyplate.",
        "Otworz istniejaca wyplate zamiast tworzyc kolejna."
      )
    );
  } else if (paymentState.status === "INVALID") {
    blockers.push(
      blocker(
        paymentState.active && paymentState.referencedSessionId !== sessionId
          ? "PAYMENT_ID_OCCUPIED"
          : "PAYMENT_DOCUMENT_INVALID",
        paymentState.active && paymentState.referencedSessionId !== sessionId
          ? "Identyfikator wyplaty jest zajety przez inna aktywna sesje."
          : "Dokument wyplaty ma nieprawidlowy format.",
        "Wyjasnij dokument wyplaty przed kontynuacja."
      )
    );
  }

  if (
    invalidEntryCount > 0 ||
    entries.some((entry) => entry.pendingSync) ||
    hasPendingSessionDocuments(sessionId, syncDocuments)
  ) {
    blockers.push(
      blocker(
        "PENDING_SYNCHRONIZATION",
        "Nie wszystkie wpisy i zmiany sesji sa potwierdzone.",
        "Zakoncz synchronizacje i ponow kontrole."
      )
    );
  }

  if (session.amountDueGrosz === null) {
    blockers.push(
      blocker(
        "OFFICIAL_AMOUNT_MISSING",
        "Sesja nie ma oficjalnej kwoty do wyplaty.",
        "Przelicz i ponownie zamknij sesje."
      )
    );
  } else if (!isSessionAmountCurrent(session, entries, invalidEntryCount)) {
    blockers.push(
      blocker(
        "OFFICIAL_AMOUNT_STALE",
        "Kwota lub agregaty sesji nie odpowiadaja ostatniej rewizji wpisow.",
        "Skieruj sesje do przegladu i ponownego przeliczenia."
      )
    );
  }

  if (!season) {
    blockers.push(
      blocker(
        "SEASON_NOT_FOUND",
        "Sezon sesji nie istnieje albo ma nieprawidlowy format.",
        "Przywroc konfiguracje sezonu przed wyplata."
      )
    );
  } else if (season.status !== "OPEN" && season.status !== "CLOSED") {
    blockers.push(
      blocker(
        "SEASON_NOT_ELIGIBLE",
        `Sezon o statusie ${season.status} nie pozwala na wyplate.`,
        "Otworz albo prawidlowo zamknij sezon przed rozliczeniem."
      )
    );
  }

  if (!worker) {
    blockers.push(
      blocker(
        "WORKER_NOT_FOUND",
        "Zbieracz sesji nie istnieje w Firestore.",
        "Przywroc historyczny rekord zbieracza; archiwizacja sama nie blokuje wyplaty."
      )
    );
  }
}

function isSessionAmountCurrent(
  session: HarvestSessionDocument,
  entries: readonly HarvestEntryDocument[],
  invalidEntryCount: number
): boolean {
  if (invalidEntryCount > 0) {
    return false;
  }

  try {
    return (
      verifyHarvestSessionAggregatesFromEntries({
        session,
        entries,
        officialAmountPolicy: "REQUIRED"
      }).status === "CONSISTENT"
    );
  } catch {
    return false;
  }
}

function decodePaymentDocumentState(snapshot: {
  data: (options?: { serverTimestamps?: "estimate" }) => unknown;
  exists: () => boolean;
  id: string;
}): PaymentDocumentState {
  if (!snapshot.exists()) {
    return { status: "MISSING" };
  }

  const data = snapshot.data({ serverTimestamps: "estimate" });
  const payment = decodePaymentSummary(snapshot.id, data);

  if (payment) {
    return { status: "VALID", payment };
  }

  return {
    status: "INVALID",
    active: isRecord(data) && data.status === "ACTIVE",
    referencedSessionId:
      isRecord(data) && typeof data.sessionId === "string"
        ? data.sessionId.trim() || null
        : null
  };
}

function hasPendingSessionDocuments(
  sessionId: string,
  syncDocuments: readonly SyncDocumentMetadataInput[]
): boolean {
  return syncDocuments.some(
    (document) =>
      (document.id === sessionId || document.sessionId === sessionId) &&
      evaluateSyncDocumentMetadata(document).status !== "SYNCED"
  );
}

function blocker(
  code: PaymentEligibilityBlockerCode,
  message: string,
  nextStep: string
): PaymentEligibilityBlocker {
  return { code, message, nextStep };
}

function normalizeRequiredId(value: string): string {
  const normalized = value.trim();

  if (!normalized) {
    throw new Error("Kontrola wyplaty wymaga identyfikatora sesji.");
  }

  return normalized;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
