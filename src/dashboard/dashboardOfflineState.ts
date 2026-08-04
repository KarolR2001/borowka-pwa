import { decodeHarvestSession } from "../harvest/harvestSessionDashboard";
import type { HarvestSessionDocument } from "../harvest/openHarvestSession";
import type { SyncDocumentMetadataInput } from "../offline/pendingWriteMetadata";
import { summarizeSyncDocumentMetadata } from "../offline/pendingWriteMetadata";
import {
  businessDateMatchesPeriod,
  type ResolvedDashboardPeriod
} from "./dashboardPeriod";

const DASHBOARD_SNAPSHOT_SCHEMA_VERSION = 1;
const DASHBOARD_SNAPSHOT_KEY_PREFIX = "borowka.dashboard-snapshot.v1";

export type DashboardSnapshotKind = "ADMIN" | "OPERATOR";

export type DashboardSnapshotStorage = Pick<
  Storage,
  "getItem" | "removeItem" | "setItem"
>;

export type DashboardSnapshot<T> = {
  payload: T;
  savedAtIso: string;
};

export type LocalDashboardProjection = {
  pendingConfirmedSessionCount: number;
  pendingConfirmedWeightG: number;
  pendingSessionCount: number;
  projectedAvailableWeightG: number | null;
};

type StoredDashboardSnapshot = {
  kind: DashboardSnapshotKind;
  ownerUid: string;
  payload: unknown;
  savedAtIso: string;
  schemaVersion: number;
};

export function saveDashboardSnapshot({
  kind,
  ownerUid,
  payload,
  savedAtIso = new Date().toISOString(),
  storage = resolveStorage()
}: {
  kind: DashboardSnapshotKind;
  ownerUid: string;
  payload: unknown;
  savedAtIso?: string;
  storage?: DashboardSnapshotStorage | null;
}): void {
  if (!storage) {
    return;
  }

  const normalizedOwnerUid = requiredText(ownerUid);
  const normalizedSavedAtIso = normalizeIso(savedAtIso);

  try {
    storage.setItem(
      snapshotKey(kind, normalizedOwnerUid),
      JSON.stringify({
        kind,
        ownerUid: normalizedOwnerUid,
        payload,
        savedAtIso: normalizedSavedAtIso,
        schemaVersion: DASHBOARD_SNAPSHOT_SCHEMA_VERSION
      } satisfies StoredDashboardSnapshot)
    );
  } catch {
    // Brak miejsca na snapshot nie moze blokowac odczytu online.
  }
}

export function loadDashboardSnapshot<T>({
  isPayload,
  kind,
  ownerUid,
  storage = resolveStorage()
}: {
  isPayload: (value: unknown) => value is T;
  kind: DashboardSnapshotKind;
  ownerUid: string;
  storage?: DashboardSnapshotStorage | null;
}): DashboardSnapshot<T> | null {
  if (!storage) {
    return null;
  }

  const normalizedOwnerUid = requiredText(ownerUid);

  try {
    const serialized = storage.getItem(snapshotKey(kind, normalizedOwnerUid));
    if (!serialized) {
      return null;
    }

    const parsed: unknown = JSON.parse(serialized);
    if (
      !isRecord(parsed) ||
      parsed.schemaVersion !== DASHBOARD_SNAPSHOT_SCHEMA_VERSION ||
      parsed.kind !== kind ||
      parsed.ownerUid !== normalizedOwnerUid ||
      typeof parsed.savedAtIso !== "string" ||
      !isIso(parsed.savedAtIso) ||
      !isPayload(parsed.payload)
    ) {
      return null;
    }

    return {
      payload: parsed.payload,
      savedAtIso: parsed.savedAtIso
    };
  } catch {
    return null;
  }
}

export function clearDashboardSnapshots({
  ownerUid,
  storage = resolveStorage()
}: {
  ownerUid: string;
  storage?: DashboardSnapshotStorage | null;
}): void {
  if (!storage) {
    return;
  }

  const normalizedOwnerUid = requiredText(ownerUid);

  try {
    storage.removeItem(snapshotKey("ADMIN", normalizedOwnerUid));
    storage.removeItem(snapshotKey("OPERATOR", normalizedOwnerUid));
  } catch {
    // Czyszczenie innych danych lokalnych powinno byc kontynuowane mimo bledu storage.
  }
}

export function calculateLocalDashboardProjection({
  officialAvailableWeightG,
  period = null,
  seasonId,
  syncDocuments
}: {
  officialAvailableWeightG: number | null;
  period?: Pick<ResolvedDashboardPeriod, "fromDate" | "toDate"> | null;
  seasonId: string | null;
  syncDocuments: readonly SyncDocumentMetadataInput[];
}): LocalDashboardProjection {
  const pendingSessions = new Map<string, HarvestSessionDocument>();

  if (seasonId) {
    const syncSummary = summarizeSyncDocumentMetadata(syncDocuments);

    for (const document of syncSummary.documents) {
      if (
        document.kind !== "HARVEST_SESSION" ||
        (document.status !== "LOCAL_SAVED" && document.status !== "PENDING_SYNC")
      ) {
        continue;
      }

      const decoded = decodeHarvestSession(document.id, document.localSnapshot);
      if (
        decoded.status !== "FOUND" ||
        decoded.session.seasonId !== seasonId ||
        (period !== null &&
          !businessDateMatchesPeriod(decoded.session.businessDate, period))
      ) {
        continue;
      }

      pendingSessions.set(decoded.session.id, decoded.session);
    }
  }

  let pendingConfirmedSessionCount = 0;
  let pendingConfirmedWeightG = 0;

  for (const session of pendingSessions.values()) {
    if (session.status !== "CLOSED" && session.status !== "PAID") {
      continue;
    }

    pendingConfirmedSessionCount += 1;
    pendingConfirmedWeightG = safeAdd(pendingConfirmedWeightG, session.totalWeightG);
  }

  return {
    pendingConfirmedSessionCount,
    pendingConfirmedWeightG,
    pendingSessionCount: pendingSessions.size,
    projectedAvailableWeightG:
      officialAvailableWeightG === null
        ? null
        : safeAdd(officialAvailableWeightG, pendingConfirmedWeightG)
  };
}

function snapshotKey(kind: DashboardSnapshotKind, ownerUid: string): string {
  return `${DASHBOARD_SNAPSHOT_KEY_PREFIX}.${kind.toLowerCase()}.${encodeURIComponent(
    ownerUid
  )}`;
}

function resolveStorage(): DashboardSnapshotStorage | null {
  try {
    return (globalThis as { localStorage?: Storage }).localStorage ?? null;
  } catch {
    return null;
  }
}

function requiredText(value: string): string {
  const normalized = value.trim();
  if (!normalized) {
    throw new Error("Snapshot pulpitu wymaga identyfikatora uzytkownika.");
  }
  return normalized;
}

function normalizeIso(value: string): string {
  if (!isIso(value)) {
    throw new Error("Snapshot pulpitu wymaga poprawnego czasu zapisu.");
  }
  return new Date(value).toISOString();
}

function isIso(value: string): boolean {
  return !Number.isNaN(Date.parse(value));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function safeAdd(left: number, right: number): number {
  const result = left + right;
  if (
    !Number.isSafeInteger(left) ||
    !Number.isSafeInteger(right) ||
    !Number.isSafeInteger(result)
  ) {
    throw new Error("Lokalna prognoza stanu przekracza bezpieczny zakres.");
  }
  return result;
}
