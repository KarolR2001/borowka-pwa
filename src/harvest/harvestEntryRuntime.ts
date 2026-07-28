import { AUDIT_EVENTS_COLLECTION, createAuditEventId } from "../audit/auditEvents";
import { getFirebaseServices } from "../config/firebaseServices";
import type { UserProfile } from "../domain/identity";
import {
  createHarvestOperationAuditEventDraft,
  harvestEntryAuditSummary
} from "./harvestAudit";
import {
  classifyHarvestEntrySaveIntent,
  reserveHarvestEntryIdentity,
  type HarvestEntryIdentity
} from "./harvestEntryIdempotency";
import {
  validateHarvestEntryDraft,
  type HarvestEntryNextSessionTotals,
  type ValidatedHarvestEntryDraft
} from "./harvestEntryValidation";
import {
  decodeHarvestEntry,
  decodeHarvestSession,
  type HarvestEntryDocument
} from "./harvestSessionDashboard";
import {
  calculateHarvestSessionTotals,
  type CalculableHarvestEntry
} from "./harvestSessionCalculation";
import {
  HARVEST_ENTRIES_COLLECTION,
  HARVEST_SESSIONS_COLLECTION
} from "./harvestSessionState";
import type { HarvestSessionDocument } from "./openHarvestSession";

type FirebaseEnv = Record<string, string | boolean | undefined>;

export type AddHarvestEntryOnlineInput = {
  actorProfile: UserProfile;
  sessionId: string;
  quantityMilli: number;
  weightG: number | null;
  isOnline: boolean;
  createdDeviceId: string;
  identity?: HarvestEntryIdentity | null;
};

export type AddHarvestEntryOnlineResult = {
  entry: HarvestEntryDocument;
  selectedSessionId: string;
  message: string;
  nextSessionTotals: HarvestEntryNextSessionTotals;
};

export type PrepareHarvestEntryDocumentInput = {
  actorProfile: UserProfile;
  session: HarvestSessionDocument;
  entries: HarvestEntryDocument[];
  quantityMilli: number;
  weightG: number | null;
  isOnline: boolean;
  createdDeviceId: string;
  createdAtDevice: unknown;
  createdAtServer: unknown;
  identity?: HarvestEntryIdentity | null;
};

export async function addHarvestEntryOnline(
  env: FirebaseEnv,
  input: AddHarvestEntryOnlineInput
): Promise<AddHarvestEntryOnlineResult> {
  assertHarvestEntryActor(input.actorProfile);

  if (!input.isOnline) {
    throw new Error("Dodanie wpisu online wymaga polaczenia.");
  }

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
  } = await import("firebase/firestore");
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

  const entriesSnapshot = await getDocs(
    query(
      collection(firestore, HARVEST_ENTRIES_COLLECTION),
      where("sessionId", "==", decodedSession.session.id),
      orderBy("sequenceNumber", "asc")
    )
  );
  const entries = entriesSnapshot.docs.map((documentSnapshot) => {
    const decodedEntry = decodeHarvestEntry(documentSnapshot.id, documentSnapshot.data());

    if (decodedEntry.status !== "FOUND") {
      throw new Error(decodedEntry.reason);
    }

    return decodedEntry.entry;
  });
  const existingRetry = input.identity
    ? entries.find((entry) => entry.id === input.identity?.id)
    : undefined;

  if (existingRetry) {
    assertActorCanAddEntryToSession(
      input.actorProfile,
      withCurrentSessionTotals(decodedSession.session, entries)
    );
    assertMatchingHarvestEntryRetry(input, existingRetry);

    return {
      entry: existingRetry,
      selectedSessionId: existingRetry.sessionId,
      message: `Wpis #${String(existingRetry.sequenceNumber)} juz istnieje.`,
      nextSessionTotals: createNextSessionTotals(decodedSession.session, entries)
    };
  }

  const createdAtDevice = Timestamp.now();
  const createdAtServer = serverTimestamp();
  const prepared = prepareHarvestEntryDocument({
    actorProfile: input.actorProfile,
    session: decodedSession.session,
    entries,
    quantityMilli: input.quantityMilli,
    weightG: input.weightG,
    isOnline: input.isOnline,
    createdDeviceId: input.createdDeviceId,
    createdAtDevice,
    createdAtServer,
    identity: input.identity
  });
  const auditId = createAuditEventId();
  const batch = writeBatch(firestore);

  batch.set(
    doc(firestore, HARVEST_ENTRIES_COLLECTION, prepared.entry.id),
    prepared.entry
  );
  batch.set(
    doc(firestore, AUDIT_EVENTS_COLLECTION, auditId),
    createHarvestOperationAuditEventDraft({
      id: auditId,
      actorProfile: input.actorProfile,
      action: "HARVEST_ENTRY_CREATED",
      entityId: prepared.entry.id,
      businessDate: prepared.entry.businessDate,
      beforeSummary: null,
      afterSummary: harvestEntryAuditSummary(prepared.entry),
      reason: null,
      createdAtDevice,
      createdAtServer,
      deviceId: prepared.entry.createdDeviceId
    })
  );

  await batch.commit();

  return {
    entry: prepared.entry,
    selectedSessionId: prepared.entry.sessionId,
    message: `Dodano wpis #${String(prepared.entry.sequenceNumber)}.`,
    nextSessionTotals: prepared.validated.nextSessionTotals
  };
}

export function prepareHarvestEntryDocument(input: PrepareHarvestEntryDocumentInput): {
  entry: HarvestEntryDocument;
  validated: ValidatedHarvestEntryDraft;
} {
  assertHarvestEntryActor(input.actorProfile);

  const currentSession = withCurrentSessionTotals(input.session, input.entries);
  assertActorCanAddEntryToSession(input.actorProfile, currentSession);

  const identity =
    input.identity ??
    reserveHarvestEntryIdentity({
      nextSequenceNumber: nextHarvestEntrySequenceNumber(input.entries)
    });
  const saveIntent = classifyHarvestEntrySaveIntent({
    entryId: identity.id,
    knownEntryIds: input.entries.map((entry) => entry.id)
  });

  if (saveIntent.status !== "NEW_DOCUMENT") {
    throw new Error("Wpis o tym identyfikatorze juz istnieje.");
  }

  const validated = validateHarvestEntryDraft({
    actorProfile: input.actorProfile,
    session: currentSession,
    draft: {
      id: identity.id,
      sequenceNumber: identity.sequenceNumber,
      sessionId: currentSession.id,
      seasonId: currentSession.seasonId,
      workerId: currentSession.workerId,
      businessDate: currentSession.businessDate,
      createdBy: input.actorProfile.uid,
      quantityMilli: input.quantityMilli,
      weightG: input.weightG
    },
    isOnline: input.isOnline
  });

  return {
    validated,
    entry: {
      id: validated.id,
      sessionId: validated.sessionId,
      seasonId: validated.seasonId,
      workerId: validated.workerId,
      businessDate: validated.businessDate,
      status: "ACTIVE",
      sequenceNumber: validated.sequenceNumber,
      quantityMilli: validated.quantityMilli,
      weightG: validated.weightG,
      amountPreviewGrosz: validated.amountPreviewGrosz,
      stockWeightG: validated.stockWeightG,
      pendingSync: false,
      createdBy: validated.createdBy,
      createdDeviceId: input.createdDeviceId,
      createdAtDevice: input.createdAtDevice,
      createdAtServer: input.createdAtServer,
      replacesEntryId: null,
      cancellationReason: null,
      cancelledBy: null,
      cancelledAtServer: null,
      revision: 1
    }
  };
}

export function withCurrentSessionTotals(
  session: HarvestSessionDocument,
  entries: readonly HarvestEntryDocument[]
): HarvestSessionDocument {
  const totals = calculateHarvestSessionTotals({
    session,
    entries: entries.map(toCalculableHarvestEntry)
  });

  return {
    ...session,
    totalEntryCount: totals.activeEntryCount,
    totalQuantityMilli: totals.totalQuantityMilli,
    totalWeightG: totals.totalWeightG
  };
}

export function nextHarvestEntrySequenceNumber(
  entries: readonly Pick<HarvestEntryDocument, "sequenceNumber">[]
): number {
  return entries.reduce((next, entry) => Math.max(next, entry.sequenceNumber + 1), 1);
}

function createNextSessionTotals(
  session: HarvestSessionDocument,
  entries: readonly HarvestEntryDocument[]
): HarvestEntryNextSessionTotals {
  const totals = calculateHarvestSessionTotals({
    session,
    entries: entries.map(toCalculableHarvestEntry)
  });

  return {
    totalEntryCount: totals.activeEntryCount,
    totalQuantityMilli: totals.totalQuantityMilli,
    totalWeightG: totals.totalWeightG,
    estimatedAmountGrosz: totals.amountDueGrosz
  };
}

function assertMatchingHarvestEntryRetry(
  input: AddHarvestEntryOnlineInput,
  entry: HarvestEntryDocument
): void {
  if (
    input.identity?.sequenceNumber !== entry.sequenceNumber ||
    input.sessionId !== entry.sessionId ||
    input.quantityMilli !== entry.quantityMilli ||
    input.weightG !== entry.weightG ||
    input.createdDeviceId !== entry.createdDeviceId ||
    input.actorProfile.uid !== entry.createdBy
  ) {
    throw new Error(
      "Ponowienie wpisu ma ten sam UUID, ale inny payload. Wymagany jest przeglad."
    );
  }
}

function toCalculableHarvestEntry(entry: HarvestEntryDocument): CalculableHarvestEntry {
  return {
    id: entry.id,
    status: entry.status,
    quantityMilli: entry.quantityMilli,
    weightG: entry.weightG
  };
}

function assertHarvestEntryActor(actorProfile: UserProfile): void {
  if (
    !actorProfile.active ||
    actorProfile.registrationStatus !== "APPROVED" ||
    (actorProfile.role !== "ADMIN" && actorProfile.role !== "OPERATOR")
  ) {
    throw new Error("Dodanie wpisu wymaga aktywnego administratora albo operatora.");
  }
}

function assertActorCanAddEntryToSession(
  actorProfile: UserProfile,
  session: HarvestSessionDocument
): void {
  if (actorProfile.role === "ADMIN" || session.createdBy === actorProfile.uid) {
    return;
  }

  throw new Error("Operator moze dodawac wpisy tylko do prowadzonej przez siebie sesji.");
}
