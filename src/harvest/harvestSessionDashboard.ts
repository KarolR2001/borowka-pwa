import { getFirebaseServices } from "../config/firebaseServices";
import {
  SEASONS_COLLECTION,
  type SeasonDocument,
  type SettlementCalculationBasis
} from "../domain/domainConfiguration";
import type { UserProfile } from "../domain/identity";
import { decodeSeason } from "../seasons/seasons";
import {
  type ActiveHarvestSessionEntryItem,
  type ActiveHarvestSessionView
} from "./ActiveHarvestSessionPanel";
import {
  HARVEST_ENTRIES_COLLECTION,
  HARVEST_SESSIONS_COLLECTION,
  HARVEST_SESSION_STATUSES,
  type HarvestSessionStatus
} from "./harvestSessionState";
import {
  calculateHarvestSessionTotals,
  type CalculableHarvestEntry
} from "./harvestSessionCalculation";
import type { HarvestSessionDocument } from "./openHarvestSession";

type FirebaseEnv = Record<string, string | boolean | undefined>;

export type HarvestEntryDocument = {
  id: string;
  sessionId: string;
  seasonId: string;
  workerId: string;
  businessDate: string;
  status: "ACTIVE" | "CANCELLED";
  sequenceNumber: number;
  quantityMilli: number;
  weightG: number | null;
  amountPreviewGrosz: number | null;
  stockWeightG: number | null;
  pendingSync: boolean;
  createdBy: string;
  createdDeviceId: string;
  createdAtDevice: unknown;
  createdAtServer: unknown;
  replacesEntryId: string | null;
  cancellationReason: string | null;
  cancelledBy: string | null;
  cancelledAtServer: unknown;
  revision: number;
};

export type HarvestSessionDashboardDocument = {
  id: string;
  data: unknown;
};

export type InvalidHarvestDashboardDocument = {
  id: string;
  reason: string;
};

export type HarvestSessionDashboardResult = {
  openSessions: HarvestSessionDocument[];
  closedSessions: HarvestSessionDocument[];
  selectedSessionId: string | null;
  selectedSessionView: ActiveHarvestSessionView | null;
  invalidSessions: InvalidHarvestDashboardDocument[];
  invalidEntries: InvalidHarvestDashboardDocument[];
  invalidSeasons: InvalidHarvestDashboardDocument[];
};

export type OperatorHarvestSessionDashboardInput = {
  actorProfile: UserProfile;
  selectedSessionId?: string | null;
  isOnline: boolean;
};

type HarvestSessionDecodeResult =
  | {
      status: "FOUND";
      session: HarvestSessionDocument;
    }
  | {
      status: "INVALID";
      reason: string;
    };

type HarvestEntryDecodeResult =
  | {
      status: "FOUND";
      entry: HarvestEntryDocument;
    }
  | {
      status: "INVALID";
      reason: string;
    };

export async function listOperatorHarvestSessionDashboard(
  env: FirebaseEnv,
  input: OperatorHarvestSessionDashboardInput
): Promise<HarvestSessionDashboardResult> {
  assertHarvestDashboardRole(input.actorProfile);

  const { firestore } = await getFirebaseServices(env);
  const { collection, getDocs, limit, orderBy, query, where } =
    await import("firebase/firestore/lite");
  const sessionQueries = [
    getDocs(
      query(
        collection(firestore, HARVEST_SESSIONS_COLLECTION),
        where("status", "==", "OPEN"),
        orderBy("businessDate", "desc"),
        orderBy("createdAtServer", "desc"),
        limit(100)
      )
    )
  ];

  if (input.actorProfile.role === "ADMIN") {
    sessionQueries.push(
      getDocs(
        query(
          collection(firestore, HARVEST_SESSIONS_COLLECTION),
          where("status", "==", "CLOSED"),
          orderBy("businessDate", "desc"),
          orderBy("createdAtServer", "desc"),
          limit(100)
        )
      )
    );
  }

  const [sessionsSnapshots, seasonsSnapshot] = await Promise.all([
    Promise.all(sessionQueries),
    getDocs(
      query(collection(firestore, SEASONS_COLLECTION), where("status", "==", "OPEN"))
    )
  ]);
  const sessionDocuments = sessionsSnapshots.flatMap((snapshot) =>
    snapshot.docs.map((documentSnapshot) => ({
      id: documentSnapshot.id,
      data: documentSnapshot.data()
    }))
  );
  const seasonDocuments = seasonsSnapshot.docs.map((documentSnapshot) => ({
    id: documentSnapshot.id,
    data: documentSnapshot.data()
  }));
  const withoutEntries = buildHarvestSessionDashboard({
    sessionDocuments,
    entryDocuments: [],
    seasonDocuments,
    selectedSessionId: input.selectedSessionId,
    actorProfile: input.actorProfile,
    isOnline: input.isOnline
  });
  const selectedSessionId = withoutEntries.selectedSessionId;

  if (!selectedSessionId) {
    return withoutEntries;
  }

  const entriesSnapshot = await getDocs(
    query(
      collection(firestore, HARVEST_ENTRIES_COLLECTION),
      where("sessionId", "==", selectedSessionId),
      orderBy("sequenceNumber", "asc"),
      limit(500)
    )
  );

  return buildHarvestSessionDashboard({
    sessionDocuments,
    entryDocuments: entriesSnapshot.docs.map((documentSnapshot) => ({
      id: documentSnapshot.id,
      data: documentSnapshot.data()
    })),
    seasonDocuments,
    selectedSessionId,
    actorProfile: input.actorProfile,
    isOnline: input.isOnline
  });
}

export function buildHarvestSessionDashboard({
  sessionDocuments,
  entryDocuments,
  seasonDocuments,
  selectedSessionId,
  actorProfile,
  isOnline
}: {
  sessionDocuments: HarvestSessionDashboardDocument[];
  entryDocuments: HarvestSessionDashboardDocument[];
  seasonDocuments: HarvestSessionDashboardDocument[];
  selectedSessionId?: string | null;
  actorProfile?: Pick<UserProfile, "uid" | "role"> | null;
  isOnline: boolean;
}): HarvestSessionDashboardResult {
  const sessions: HarvestSessionDocument[] = [];
  const entries: HarvestEntryDocument[] = [];
  const seasons: SeasonDocument[] = [];
  const invalidSessions: InvalidHarvestDashboardDocument[] = [];
  const invalidEntries: InvalidHarvestDashboardDocument[] = [];
  const invalidSeasons: InvalidHarvestDashboardDocument[] = [];

  for (const document of sessionDocuments) {
    const decoded = decodeHarvestSession(document.id, document.data);

    if (decoded.status === "FOUND") {
      sessions.push(decoded.session);
    } else {
      invalidSessions.push({ id: document.id, reason: decoded.reason });
    }
  }

  for (const document of entryDocuments) {
    const decoded = decodeHarvestEntry(document.id, document.data);

    if (decoded.status === "FOUND") {
      entries.push(decoded.entry);
    } else {
      invalidEntries.push({ id: document.id, reason: decoded.reason });
    }
  }

  for (const document of seasonDocuments) {
    const decoded = decodeSeason(document.id, document.data);

    if (decoded.status === "FOUND") {
      seasons.push(decoded.season);
    } else {
      invalidSeasons.push({ id: document.id, reason: decoded.reason });
    }
  }

  const openSessions = sessions
    .filter((session) => session.status === "OPEN")
    .sort(compareSessionsForDashboard);
  const closedSessions = sessions
    .filter((session) => session.status === "CLOSED")
    .sort(compareSessionsForDashboard);
  const selectedSession =
    openSessions.find((session) => session.id === selectedSessionId) ??
    openSessions.at(0) ??
    null;

  return {
    openSessions,
    closedSessions,
    selectedSessionId: selectedSession?.id ?? null,
    selectedSessionView: selectedSession
      ? createActiveSessionView({
          session: selectedSession,
          entries: entries.filter((entry) => entry.sessionId === selectedSession.id),
          seasons,
          actorProfile: actorProfile ?? null,
          isOnline
        })
      : null,
    invalidSessions: sortInvalidDocuments(invalidSessions),
    invalidEntries: sortInvalidDocuments(invalidEntries),
    invalidSeasons: sortInvalidDocuments(invalidSeasons)
  };
}

export function decodeHarvestSession(
  expectedId: string,
  data: unknown
): HarvestSessionDecodeResult {
  if (!isRecord(data)) {
    return invalidHarvestSession("Sesja ma nieprawidlowy format.");
  }

  const id = readRequiredString(data, "id");
  const seasonId = readRequiredString(data, "seasonId");
  const workerId = readRequiredString(data, "workerId");
  const workerNameSnapshot = readRequiredString(data, "workerNameSnapshot");
  const businessDate = readRequiredString(data, "businessDate");
  const status = data.status;
  const planIdSnapshot = readRequiredString(data, "planIdSnapshot");
  const planNameSnapshot = readRequiredString(data, "planNameSnapshot");
  const calculationBasisSnapshot = data.calculationBasisSnapshot;
  const unitLabelSnapshot = readRequiredString(data, "unitLabelSnapshot");
  const unitLabelPluralSnapshot =
    readRequiredString(data, "unitLabelPluralSnapshot") ?? unitLabelSnapshot ?? "";
  const rateVersionIdSnapshot = readRequiredString(data, "rateVersionIdSnapshot");
  const rateGroszSnapshot = readPositiveInteger(data.rateGroszSnapshot);
  const weightRequiredSnapshot = data.weightRequiredSnapshot;
  const quantityPrecisionSnapshot = readQuantityPrecision(data.quantityPrecisionSnapshot);
  const allowBatchQuantitySnapshot =
    typeof data.allowBatchQuantitySnapshot === "boolean"
      ? data.allowBatchQuantitySnapshot
      : true;
  const totalEntryCount = readNonNegativeInteger(data.totalEntryCount);
  const totalQuantityMilli = readNonNegativeInteger(data.totalQuantityMilli);
  const totalWeightG = readNonNegativeInteger(data.totalWeightG);
  const amountDueGrosz = readNullableNonNegativeInteger(data.amountDueGrosz);
  const calculationVersion = readRequiredString(data, "calculationVersion");
  const note = readNullableString(data.note);
  const createdBy = readRequiredString(data, "createdBy");
  const createdDeviceId = readRequiredString(data, "createdDeviceId");
  const closedBy = readNullableString(data.closedBy);
  const paymentId = readNullableString(data.paymentId);
  const cancelledBy = readNullableString(data.cancelledBy);
  const cancellationReason = readNullableString(data.cancellationReason);
  const revision = readPositiveInteger(data.revision);
  const legacyImport = data.legacyImport;
  const legacySourceRows = data.legacySourceRows;

  if (id !== expectedId) {
    return invalidHarvestSession("Sesja ma niezgodny identyfikator.");
  }

  if (
    !id ||
    !seasonId ||
    !workerId ||
    !workerNameSnapshot ||
    !businessDate ||
    !planIdSnapshot ||
    !planNameSnapshot ||
    !unitLabelSnapshot ||
    !rateVersionIdSnapshot ||
    !calculationVersion ||
    !createdBy ||
    !createdDeviceId
  ) {
    return invalidHarvestSession("Sesja nie ma wymaganych danych.");
  }

  if (!isBusinessDate(businessDate)) {
    return invalidHarvestSession("Sesja ma nieprawidlowa date biznesowa.");
  }

  if (!isHarvestSessionStatus(status)) {
    return invalidHarvestSession("Sesja ma nieznany status.");
  }

  if (!isSettlementCalculationBasis(calculationBasisSnapshot)) {
    return invalidHarvestSession("Sesja ma nieznana podstawe rozliczenia.");
  }

  if (
    rateGroszSnapshot === null ||
    quantityPrecisionSnapshot === null ||
    totalEntryCount === null ||
    totalQuantityMilli === null ||
    totalWeightG === null ||
    amountDueGrosz === undefined ||
    revision === null
  ) {
    return invalidHarvestSession("Sesja ma nieprawidlowe wartosci liczbowe.");
  }

  if (typeof weightRequiredSnapshot !== "boolean") {
    return invalidHarvestSession("Sesja ma nieprawidlowe wymaganie wagi.");
  }

  if (
    note === undefined ||
    closedBy === undefined ||
    paymentId === undefined ||
    cancelledBy === undefined ||
    cancellationReason === undefined
  ) {
    return invalidHarvestSession("Sesja ma nieprawidlowe pola opcjonalne.");
  }

  if (typeof legacyImport !== "boolean" || !isStringArray(legacySourceRows)) {
    return invalidHarvestSession("Sesja ma nieprawidlowe pola importu historycznego.");
  }

  return {
    status: "FOUND",
    session: {
      id,
      seasonId,
      workerId,
      workerNameSnapshot,
      businessDate,
      status,
      planIdSnapshot,
      planNameSnapshot,
      calculationBasisSnapshot,
      unitLabelSnapshot,
      unitLabelPluralSnapshot,
      rateVersionIdSnapshot,
      rateGroszSnapshot,
      weightRequiredSnapshot,
      quantityPrecisionSnapshot,
      allowBatchQuantitySnapshot,
      totalEntryCount,
      totalQuantityMilli,
      totalWeightG,
      amountDueGrosz,
      calculationVersion,
      note,
      createdBy,
      createdDeviceId,
      createdAtDevice: data.createdAtDevice,
      createdAtServer: data.createdAtServer,
      updatedAtServer: data.updatedAtServer ?? null,
      closedAtDevice: data.closedAtDevice ?? null,
      closedAtServer: data.closedAtServer ?? null,
      closedBy,
      paidAt: data.paidAt ?? null,
      paymentId,
      cancelledAt: data.cancelledAt ?? null,
      cancelledBy,
      cancellationReason,
      revision,
      legacyImport,
      legacySourceRows
    }
  };
}

export function decodeHarvestEntry(
  expectedId: string,
  data: unknown
): HarvestEntryDecodeResult {
  if (!isRecord(data)) {
    return invalidHarvestEntry("Wpis ma nieprawidlowy format.");
  }

  const id = readRequiredString(data, "id");
  const sessionId = readRequiredString(data, "sessionId");
  const seasonId = readRequiredString(data, "seasonId");
  const workerId = readRequiredString(data, "workerId");
  const businessDate = readRequiredString(data, "businessDate");
  const status = data.status;
  const sequenceNumber = readPositiveInteger(data.sequenceNumber);
  const quantityMilli = readPositiveInteger(data.quantityMilli);
  const weightG = readNullablePositiveInteger(data.weightG);
  const amountPreviewGrosz = readNullableNonNegativeInteger(data.amountPreviewGrosz);
  const stockWeightG = readNullablePositiveInteger(data.stockWeightG);
  const pendingSync = data.pendingSync;
  const createdBy = readRequiredString(data, "createdBy");
  const createdDeviceId = readRequiredString(data, "createdDeviceId");
  const replacesEntryId = readNullableString(data.replacesEntryId);
  const cancellationReason = readNullableString(data.cancellationReason);
  const cancelledBy = readNullableString(data.cancelledBy);
  const revision = readPositiveInteger(data.revision);

  if (id !== expectedId) {
    return invalidHarvestEntry("Wpis ma niezgodny identyfikator.");
  }

  if (
    !id ||
    !sessionId ||
    !seasonId ||
    !workerId ||
    !businessDate ||
    !createdBy ||
    !createdDeviceId
  ) {
    return invalidHarvestEntry("Wpis nie ma wymaganych danych.");
  }

  if (!isBusinessDate(businessDate)) {
    return invalidHarvestEntry("Wpis ma nieprawidlowa date biznesowa.");
  }

  if (status !== "ACTIVE" && status !== "CANCELLED") {
    return invalidHarvestEntry("Wpis ma nieznany status.");
  }

  if (
    sequenceNumber === null ||
    quantityMilli === null ||
    weightG === undefined ||
    amountPreviewGrosz === undefined ||
    stockWeightG === undefined ||
    revision === null
  ) {
    return invalidHarvestEntry("Wpis ma nieprawidlowe wartosci liczbowe.");
  }

  if (typeof pendingSync !== "boolean") {
    return invalidHarvestEntry("Wpis ma nieprawidlowy status synchronizacji.");
  }

  if (
    replacesEntryId === undefined ||
    cancellationReason === undefined ||
    cancelledBy === undefined
  ) {
    return invalidHarvestEntry("Wpis ma nieprawidlowe pola opcjonalne.");
  }

  return {
    status: "FOUND",
    entry: {
      id,
      sessionId,
      seasonId,
      workerId,
      businessDate,
      status,
      sequenceNumber,
      quantityMilli,
      weightG,
      amountPreviewGrosz,
      stockWeightG,
      pendingSync,
      createdBy,
      createdDeviceId,
      createdAtDevice: data.createdAtDevice,
      createdAtServer: data.createdAtServer,
      replacesEntryId,
      cancellationReason,
      cancelledBy,
      cancelledAtServer: data.cancelledAtServer ?? null,
      revision
    }
  };
}

function createActiveSessionView({
  session,
  entries,
  seasons,
  actorProfile,
  isOnline
}: {
  session: HarvestSessionDocument;
  entries: HarvestEntryDocument[];
  seasons: SeasonDocument[];
  actorProfile: Pick<UserProfile, "uid" | "role"> | null;
  isOnline: boolean;
}): ActiveHarvestSessionView {
  const sortedEntries = entries.sort(
    (left, right) => left.sequenceNumber - right.sequenceNumber
  );
  const calculableEntries: CalculableHarvestEntry[] = sortedEntries.map((entry) => ({
    id: entry.id,
    status: entry.status,
    quantityMilli: entry.quantityMilli,
    weightG: entry.weightG
  }));
  const totals = calculateHarvestSessionTotals({
    session,
    entries: calculableEntries
  });
  const season = seasons.find((candidate) => candidate.id === session.seasonId);
  const viewSession: HarvestSessionDocument = {
    ...session,
    totalEntryCount: totals.activeEntryCount,
    totalQuantityMilli: totals.totalQuantityMilli,
    totalWeightG: totals.totalWeightG
  };
  const pendingWriteCount = sortedEntries.filter((entry) => entry.pendingSync).length;

  return {
    session: viewSession,
    seasonName: season?.name ?? session.seasonId,
    createdByName: session.createdBy,
    deviceName: session.createdDeviceId,
    entries: sortedEntries.map((entry) =>
      toActiveSessionEntryItem({
        actorProfile,
        entry,
        pendingWriteCount,
        session
      })
    ),
    estimatedAmountGrosz: totals.amountDueGrosz,
    pendingWriteCount,
    isOnline,
    canAddEntry: canActorAddEntry(actorProfile, session),
    canCloseSession:
      canActorCloseSession(actorProfile, session) && pendingWriteCount === 0,
    statusNotice: null
  };
}

function canActorAddEntry(
  actorProfile: Pick<UserProfile, "uid" | "role"> | null,
  session: HarvestSessionDocument
): boolean {
  if (!actorProfile || session.status !== "OPEN") {
    return false;
  }

  return actorProfile.role === "ADMIN" || session.createdBy === actorProfile.uid;
}

function canActorCloseSession(
  actorProfile: Pick<UserProfile, "uid" | "role"> | null,
  session: HarvestSessionDocument
): boolean {
  if (!actorProfile || session.status !== "OPEN") {
    return false;
  }

  return actorProfile.role === "ADMIN" || session.createdBy === actorProfile.uid;
}

function toActiveSessionEntryItem({
  actorProfile,
  entry,
  pendingWriteCount,
  session
}: {
  actorProfile: Pick<UserProfile, "uid" | "role"> | null;
  entry: HarvestEntryDocument;
  pendingWriteCount: number;
  session: HarvestSessionDocument;
}): ActiveHarvestSessionEntryItem {
  return {
    id: entry.id,
    sequenceNumber: entry.sequenceNumber,
    quantityMilli: entry.quantityMilli,
    weightG: entry.weightG,
    amountPreviewGrosz: entry.amountPreviewGrosz,
    status: entry.status,
    createdAtLabel: formatTimeLabel(entry.createdAtDevice),
    pendingSync: entry.pendingSync,
    createdByName: entry.createdBy,
    correctionLabel:
      entry.status === "CANCELLED"
        ? (entry.cancellationReason ?? "Anulowano")
        : entry.replacesEntryId
          ? `Zastepuje ${entry.replacesEntryId}`
          : null,
    canEdit: false,
    canCancel:
      actorProfile?.role === "ADMIN" &&
      session.status === "OPEN" &&
      session.paymentId === null &&
      entry.status === "ACTIVE" &&
      !entry.pendingSync &&
      pendingWriteCount === 0
  };
}

function assertHarvestDashboardRole(actorProfile: UserProfile): void {
  if (actorProfile.role !== "ADMIN" && actorProfile.role !== "OPERATOR") {
    throw new Error("Pulpit sesji zbioru wymaga roli administratora albo operatora.");
  }
}

function compareSessionsForDashboard(
  left: HarvestSessionDocument,
  right: HarvestSessionDocument
): number {
  const byDate = right.businessDate.localeCompare(left.businessDate);

  return byDate === 0
    ? left.workerNameSnapshot.localeCompare(right.workerNameSnapshot, "pl")
    : byDate;
}

function sortInvalidDocuments(
  documents: InvalidHarvestDashboardDocument[]
): InvalidHarvestDashboardDocument[] {
  return documents.sort((left, right) => left.id.localeCompare(right.id, "pl"));
}

function invalidHarvestSession(reason: string): HarvestSessionDecodeResult {
  return {
    status: "INVALID",
    reason
  };
}

function invalidHarvestEntry(reason: string): HarvestEntryDecodeResult {
  return {
    status: "INVALID",
    reason
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readRequiredString(data: Record<string, unknown>, field: string): string | null {
  const value = data[field];

  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

function readNullableString(value: unknown): string | null | undefined {
  if (value === null || value === undefined) {
    return null;
  }

  return typeof value === "string" ? value : undefined;
}

function readPositiveInteger(value: unknown): number | null {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0
    ? value
    : null;
}

function readNonNegativeInteger(value: unknown): number | null {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0
    ? value
    : null;
}

function readNullablePositiveInteger(value: unknown): number | null | undefined {
  if (value === null || value === undefined) {
    return null;
  }

  return readPositiveInteger(value) ?? undefined;
}

function readNullableNonNegativeInteger(value: unknown): number | null | undefined {
  if (value === null || value === undefined) {
    return null;
  }

  return readNonNegativeInteger(value) ?? undefined;
}

function readQuantityPrecision(value: unknown): number | null {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= 3
    ? value
    : null;
}

function isHarvestSessionStatus(value: unknown): value is HarvestSessionStatus {
  return (
    typeof value === "string" &&
    HARVEST_SESSION_STATUSES.includes(value as HarvestSessionStatus)
  );
}

function isSettlementCalculationBasis(
  value: unknown
): value is SettlementCalculationBasis {
  return value === "WEIGHT" || value === "QUANTITY";
}

function isBusinessDate(value: string): boolean {
  const match = /^\d{4}-\d{2}-\d{2}$/.exec(value);
  const parsed = Date.parse(`${value}T00:00:00.000Z`);

  return (
    Boolean(match) &&
    !Number.isNaN(parsed) &&
    new Date(parsed).toISOString().slice(0, 10) === value
  );
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function formatTimeLabel(value: unknown): string {
  const date = toDate(value);

  if (!date) {
    return "brak czasu";
  }

  return new Intl.DateTimeFormat("pl-PL", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Warsaw"
  }).format(date);
}

function toDate(value: unknown): Date | null {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value;
  }

  if (typeof value === "string") {
    const parsed = new Date(value);

    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  if (isTimestampLike(value)) {
    const parsed = value.toDate();

    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  return null;
}

type TimestampLike = {
  toDate: () => Date;
};

function isTimestampLike(value: unknown): value is TimestampLike {
  if (!isRecord(value)) {
    return false;
  }

  return typeof value.toDate === "function";
}
