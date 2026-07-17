import {
  createAuditEventDraft,
  createAuditEventId,
  type AuditAction,
  type AuditSummary
} from "../audit/auditEvents";
import { getFirebaseServices } from "../config/firebaseServices";
import {
  SEASONS_COLLECTION,
  type SeasonDocument,
  type SeasonStatus
} from "../domain/domainConfiguration";
import type { UserProfile } from "../domain/identity";

type FirebaseEnv = Record<string, string | boolean | undefined>;

export type SeasonDocumentSnapshot = {
  id: string;
  data: unknown;
};

export type InvalidSeason = {
  id: string;
  reason: string;
};

export type SeasonDirectoryResult = {
  seasons: SeasonDocument[];
  invalidSeasons: InvalidSeason[];
};

export type SeasonDirectoryScope = "ADMIN" | "OPERATOR";

export type SeasonDirectoryListInput = {
  viewerRole: SeasonDirectoryScope;
};

export type SeasonStatusFilter = SeasonStatus | "ALL";
export type SeasonIdFilter = string;
export type SeasonStatusAction = "OPEN" | "CLOSE" | "REOPEN" | "ARCHIVE" | "SET_DEFAULT";

export type SeasonFilters = {
  search: string;
  status: SeasonStatusFilter;
};

export type CreateSeasonInput = {
  actorProfile: UserProfile;
  name: string;
  startDate: string;
  endDate?: string | null;
  status: SeasonStatus;
  isDefault: boolean;
  allowDateOverlap: boolean;
  deviceId: string;
};

export type SeasonStatusUpdateInput = {
  actorProfile: UserProfile;
  targetSeason: SeasonDocument;
  action: SeasonStatusAction;
  reason: string;
  deviceId: string;
};

export type PreparedSeasonCreate = {
  season: SeasonDocument;
  overlappingSeasons: SeasonDocument[];
  auditAction: AuditAction;
  beforeSummary: AuditSummary | null;
  afterSummary: AuditSummary;
  reason: string | null;
  deviceId: string;
};

export type PreparedSeasonStatusUpdate = {
  season: SeasonDocument;
  auditAction: AuditAction;
  beforeSummary: AuditSummary;
  afterSummary: AuditSummary;
  reason: string;
  deviceId: string;
};

export type SeasonDecodeResult =
  | {
      status: "FOUND";
      season: SeasonDocument;
    }
  | {
      status: "INVALID";
      reason: string;
    };

export const defaultSeasonFilters: SeasonFilters = {
  search: "",
  status: "ALL"
};

export async function listSeasons(
  env: FirebaseEnv,
  input: SeasonDirectoryListInput = { viewerRole: "ADMIN" }
): Promise<SeasonDirectoryResult> {
  const { firestore } = await getFirebaseServices(env);
  const { collection, getDocs, query, where } = await import("firebase/firestore/lite");
  const seasonsCollection = collection(firestore, SEASONS_COLLECTION);
  const seasonsQuery =
    input.viewerRole === "ADMIN"
      ? seasonsCollection
      : query(seasonsCollection, where("status", "==", "OPEN"));
  const snapshot = await getDocs(seasonsQuery);
  const documents = snapshot.docs.map((documentSnapshot) => ({
    id: documentSnapshot.id,
    data: documentSnapshot.data()
  }));

  return decodeSeasonDocuments(documents);
}

export async function createSeason(
  env: FirebaseEnv,
  input: CreateSeasonInput
): Promise<PreparedSeasonCreate> {
  const { firestore } = await getFirebaseServices(env);
  const { Timestamp, collection, doc, getDocs, serverTimestamp, writeBatch } =
    await import("firebase/firestore/lite");
  const currentSeasons = await listSeasons(env);
  const seasonId = createSeasonId(input.name, input.startDate);
  const prepared = prepareSeasonCreate(currentSeasons.seasons, {
    ...input,
    id: seasonId,
    createdAt: serverTimestamp()
  });
  const batch = writeBatch(firestore);

  if (prepared.season.isDefault) {
    const existingSeasons = await getDocs(collection(firestore, SEASONS_COLLECTION));

    for (const existingSeason of existingSeasons.docs) {
      batch.update(existingSeason.ref, {
        isDefault: false
      });
    }
  }

  batch.set(doc(firestore, SEASONS_COLLECTION, prepared.season.id), prepared.season);
  const auditId = createAuditEventId();
  batch.set(
    doc(firestore, "auditEvents", auditId),
    createAuditEventDraft({
      id: auditId,
      actorUid: input.actorProfile.uid,
      actorRoleSnapshot: input.actorProfile.role,
      action: prepared.auditAction,
      entityType: "SEASON",
      entityId: prepared.season.id,
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

export async function updateSeasonStatus(
  env: FirebaseEnv,
  input: SeasonStatusUpdateInput
): Promise<PreparedSeasonStatusUpdate> {
  const { firestore } = await getFirebaseServices(env);
  const { Timestamp, collection, doc, getDocs, serverTimestamp, writeBatch } =
    await import("firebase/firestore/lite");
  const prepared = prepareSeasonStatusUpdate({
    ...input,
    changedAt: serverTimestamp()
  });
  const batch = writeBatch(firestore);

  if (input.action === "SET_DEFAULT") {
    const existingSeasons = await getDocs(collection(firestore, SEASONS_COLLECTION));

    for (const existingSeason of existingSeasons.docs) {
      batch.update(existingSeason.ref, {
        isDefault: existingSeason.id === prepared.season.id
      });
    }
  } else {
    batch.update(doc(firestore, SEASONS_COLLECTION, prepared.season.id), {
      status: prepared.season.status,
      closedAt: prepared.season.closedAt,
      closedBy: prepared.season.closedBy,
      reopenedAt: prepared.season.reopenedAt
    });
  }

  const auditId = createAuditEventId();
  batch.set(
    doc(firestore, "auditEvents", auditId),
    createAuditEventDraft({
      id: auditId,
      actorUid: input.actorProfile.uid,
      actorRoleSnapshot: input.actorProfile.role,
      action: prepared.auditAction,
      entityType: "SEASON",
      entityId: prepared.season.id,
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

export function prepareSeasonCreate(
  existingSeasons: SeasonDocument[],
  input: CreateSeasonInput & { id: string; createdAt: unknown }
): PreparedSeasonCreate {
  assertAdmin(input.actorProfile);

  const id = normalizeRequiredText(input.id, "Sezon wymaga identyfikatora.");
  const name = normalizeRequiredText(input.name, "Podaj nazwe sezonu.");
  const startDate = normalizeBusinessDate(input.startDate, "Podaj date poczatku.");
  const endDate = normalizeOptionalBusinessDate(input.endDate);
  const deviceId = normalizeRequiredText(
    input.deviceId,
    "Brak identyfikatora urzadzenia dla audytu."
  );

  if (input.status !== "PLANNED" && input.status !== "OPEN") {
    throw new Error("Nowy sezon moze byc planowany albo otwarty.");
  }

  assertDateRange(startDate, endDate);

  const overlappingSeasons = findOverlappingSeasons(
    {
      id,
      startDate,
      endDate
    },
    existingSeasons
  );

  if (overlappingSeasons.length > 0 && !input.allowDateOverlap) {
    throw new Error("Zakres dat nachodzi na istniejacy sezon.");
  }

  const season: SeasonDocument = {
    id,
    name,
    startDate,
    endDate,
    status: input.status,
    isDefault: input.isDefault,
    createdAt: input.createdAt,
    createdBy: input.actorProfile.uid,
    closedAt: null,
    closedBy: null,
    reopenedAt: null
  };

  return {
    season,
    overlappingSeasons,
    auditAction: "SEASON_CREATED",
    beforeSummary: null,
    afterSummary: seasonAuditSummary(season),
    reason: overlappingSeasons.length > 0 ? "Utworzono z nakladajacym okresem." : null,
    deviceId
  };
}

export function prepareSeasonStatusUpdate(
  input: SeasonStatusUpdateInput & { changedAt: unknown }
): PreparedSeasonStatusUpdate {
  assertAdmin(input.actorProfile);

  const reason = normalizeRequiredText(
    input.reason,
    "Podaj powod zmiany statusu sezonu."
  );
  const deviceId = normalizeRequiredText(
    input.deviceId,
    "Brak identyfikatora urzadzenia dla audytu."
  );
  const beforeSummary = seasonAuditSummary(input.targetSeason);
  let season: SeasonDocument;
  let auditAction: AuditAction;

  switch (input.action) {
    case "OPEN":
      if (input.targetSeason.status !== "PLANNED") {
        throw new Error("Otworzyc mozna tylko sezon planowany.");
      }
      season = {
        ...input.targetSeason,
        status: "OPEN"
      };
      auditAction = "SEASON_OPENED";
      break;
    case "CLOSE":
      if (input.targetSeason.status !== "OPEN") {
        throw new Error("Zamknac mozna tylko sezon otwarty.");
      }
      season = {
        ...input.targetSeason,
        status: "CLOSED",
        closedAt: input.changedAt,
        closedBy: input.actorProfile.uid
      };
      auditAction = "SEASON_CLOSED";
      break;
    case "REOPEN":
      if (input.targetSeason.status !== "CLOSED") {
        throw new Error("Ponownie otworzyc mozna tylko sezon zamkniety.");
      }
      season = {
        ...input.targetSeason,
        status: "OPEN",
        reopenedAt: input.changedAt
      };
      auditAction = "SEASON_REOPENED";
      break;
    case "ARCHIVE":
      if (input.targetSeason.status === "OPEN") {
        throw new Error("Nie archiwizuj otwartego sezonu.");
      }
      if (input.targetSeason.isDefault) {
        throw new Error("Nie archiwizuj sezonu domyslnego.");
      }
      season = {
        ...input.targetSeason,
        status: "ARCHIVED"
      };
      auditAction = "SEASON_ARCHIVED";
      break;
    case "SET_DEFAULT":
      if (input.targetSeason.status === "ARCHIVED") {
        throw new Error("Sezon archiwalny nie moze byc domyslny.");
      }
      if (input.targetSeason.isDefault) {
        throw new Error("Ten sezon jest juz domyslny.");
      }
      season = {
        ...input.targetSeason,
        isDefault: true
      };
      auditAction = "SEASON_DEFAULT_CHANGED";
      break;
  }

  return {
    season,
    auditAction,
    beforeSummary,
    afterSummary: seasonAuditSummary(season),
    reason,
    deviceId
  };
}

export function decodeSeason(expectedId: string, data: unknown): SeasonDecodeResult {
  if (!isRecord(data)) {
    return invalidSeason("Sezon ma nieprawidlowy format.");
  }

  const id = readRequiredString(data, "id");
  const name = readRequiredString(data, "name");
  const startDate = readRequiredString(data, "startDate");
  const endDate = data.endDate;
  const status = data.status;
  const isDefault = data.isDefault;
  const createdBy = readRequiredString(data, "createdBy");
  const closedBy = data.closedBy ?? null;

  if (!id || id !== expectedId) {
    return invalidSeason("Sezon ma niezgodny identyfikator.");
  }

  if (!name || !startDate || !createdBy) {
    return invalidSeason("Sezon nie ma wymaganych danych.");
  }

  if (!isSeasonStatus(status)) {
    return invalidSeason("Sezon ma nieznany status.");
  }

  if (typeof isDefault !== "boolean") {
    return invalidSeason("Sezon ma nieprawidlowy status domyslny.");
  }

  if (!isBusinessDate(startDate)) {
    return invalidSeason("Sezon ma nieprawidlowa date poczatku.");
  }

  if (endDate !== null && (typeof endDate !== "string" || !isBusinessDate(endDate))) {
    return invalidSeason("Sezon ma nieprawidlowa date konca.");
  }

  if (closedBy !== null && typeof closedBy !== "string") {
    return invalidSeason("Sezon ma nieprawidlowe pole closedBy.");
  }

  try {
    assertDateRange(startDate, endDate);
  } catch (error: unknown) {
    return invalidSeason(error instanceof Error ? error.message : "Niepoprawny sezon.");
  }

  return {
    status: "FOUND",
    season: {
      id,
      name,
      startDate,
      endDate,
      status,
      isDefault,
      createdAt: data.createdAt,
      createdBy,
      closedAt: data.closedAt ?? null,
      closedBy,
      reopenedAt: data.reopenedAt ?? null
    }
  };
}

export function decodeSeasonDocuments(
  documents: SeasonDocumentSnapshot[]
): SeasonDirectoryResult {
  const seasons: SeasonDocument[] = [];
  const invalidSeasons: InvalidSeason[] = [];

  for (const document of documents) {
    const decoded = decodeSeason(document.id, document.data);

    if (decoded.status === "FOUND") {
      seasons.push(decoded.season);
    } else {
      invalidSeasons.push({
        id: document.id,
        reason: decoded.reason
      });
    }
  }

  return {
    seasons: sortSeasons(seasons),
    invalidSeasons: invalidSeasons.sort((left, right) =>
      left.id.localeCompare(right.id, "pl")
    )
  };
}

export function filterSeasons(
  seasons: SeasonDocument[],
  filters: SeasonFilters
): SeasonDocument[] {
  const search = filters.search.trim().toLocaleLowerCase("pl-PL");

  return seasons.filter((season) => {
    if (filters.status !== "ALL" && season.status !== filters.status) {
      return false;
    }

    if (!search) {
      return true;
    }

    return (
      season.name.toLocaleLowerCase("pl-PL").includes(search) ||
      season.id.toLocaleLowerCase("pl-PL").includes(search)
    );
  });
}

export function filterBySeasonId<T extends { seasonId: string }>(
  records: T[],
  seasonId: SeasonIdFilter
): T[] {
  if (seasonId === "ALL") {
    return records;
  }

  return records.filter((record) => record.seasonId === seasonId);
}

export function findOverlappingSeasons(
  candidate: Pick<SeasonDocument, "id" | "startDate" | "endDate">,
  seasons: SeasonDocument[]
): SeasonDocument[] {
  return seasons.filter((season) => {
    if (season.id === candidate.id || season.status === "ARCHIVED") {
      return false;
    }

    return dateRangesOverlap(
      candidate.startDate,
      candidate.endDate,
      season.startDate,
      season.endDate
    );
  });
}

export function seasonStatusLabel(status: SeasonStatus): string {
  switch (status) {
    case "PLANNED":
      return "Planowany";
    case "OPEN":
      return "Otwarty";
    case "CLOSED":
      return "Zamkniety";
    case "ARCHIVED":
      return "Archiwalny";
  }
}

export function isSeasonStatus(value: unknown): value is SeasonStatus {
  return (
    value === "PLANNED" || value === "OPEN" || value === "CLOSED" || value === "ARCHIVED"
  );
}

export function createSeasonId(name: string, startDate: string): string {
  const slug = normalizeRequiredText(name, "Podaj nazwe sezonu.")
    .toLocaleLowerCase("pl-PL")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);

  return `season-${startDate}-${slug || "nowy"}`;
}

function sortSeasons(seasons: SeasonDocument[]): SeasonDocument[] {
  return [...seasons].sort((left, right) => {
    if (left.isDefault !== right.isDefault) {
      return left.isDefault ? -1 : 1;
    }

    return right.startDate.localeCompare(left.startDate);
  });
}

function seasonAuditSummary(season: SeasonDocument): AuditSummary {
  return {
    seasonId: season.id,
    name: season.name,
    startDate: season.startDate,
    endDate: season.endDate,
    status: season.status,
    isDefault: season.isDefault
  };
}

function assertAdmin(profile: UserProfile): void {
  if (
    profile.role !== "ADMIN" ||
    !profile.active ||
    profile.registrationStatus !== "APPROVED"
  ) {
    throw new Error("Operacja sezonu wymaga aktywnego administratora.");
  }
}

function dateRangesOverlap(
  leftStart: string,
  leftEnd: string | null,
  rightStart: string,
  rightEnd: string | null
): boolean {
  const leftEndValue = leftEnd ?? "9999-12-31";
  const rightEndValue = rightEnd ?? "9999-12-31";

  return leftStart <= rightEndValue && rightStart <= leftEndValue;
}

function assertDateRange(startDate: string, endDate: string | null): void {
  if (endDate && endDate < startDate) {
    throw new Error("Data konca sezonu nie moze byc wczesniejsza niz poczatek.");
  }
}

function normalizeBusinessDate(value: string, message: string): string {
  const normalized = normalizeRequiredText(value, message);

  if (!isBusinessDate(normalized)) {
    throw new Error(message);
  }

  return normalized;
}

function normalizeOptionalBusinessDate(value: string | null | undefined): string | null {
  if (value === null || value === undefined || value.trim() === "") {
    return null;
  }

  return normalizeBusinessDate(value, "Podaj poprawna date konca.");
}

function isBusinessDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }

  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function normalizeRequiredText(value: string, message: string): string {
  const trimmed = value.trim().replace(/\s+/g, " ");

  if (!trimmed) {
    throw new Error(message);
  }

  return trimmed;
}

function readRequiredString(data: Record<string, unknown>, key: string): string | null {
  const value = data[key];

  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();

  return trimmed.length > 0 ? trimmed : null;
}

function invalidSeason(reason: string): SeasonDecodeResult {
  return {
    status: "INVALID",
    reason
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
