import type { HarvestEntryDocument } from "../harvest/harvestSessionDashboard";
import type { HarvestSessionStatus } from "../harvest/harvestSessionState";
import type { HarvestSessionDocument } from "../harvest/openHarvestSession";

export const DEVICE_CONFLICT_RESOLUTION_OPTIONS = [
  "KEEP_SEPARATE_SESSIONS",
  "ACCEPT_REMOTE_SESSION_STATE",
  "MARK_SESSION_REVIEWED",
  "CANCEL_LOCAL_PENDING_CHANGES"
] as const;

export type DeviceConflictResolutionOption =
  (typeof DEVICE_CONFLICT_RESOLUTION_OPTIONS)[number];

export type DeviceConflictSessionSnapshot = Pick<
  HarvestSessionDocument,
  | "businessDate"
  | "createdDeviceId"
  | "id"
  | "revision"
  | "status"
  | "totalEntryCount"
  | "workerId"
  | "workerNameSnapshot"
> & {
  closedDeviceId?: string | null;
  pendingSync?: boolean;
};

export type DeviceConflictEntrySnapshot = Pick<
  HarvestEntryDocument,
  "createdDeviceId" | "id" | "pendingSync" | "sequenceNumber" | "sessionId" | "status"
>;

export type DeviceConflictFindingCode =
  | "POSSIBLE_BUSINESS_DUPLICATE"
  | "SAME_SESSION_CHANGED_ON_OTHER_DEVICE"
  | "SESSION_REVISION_DIVERGED"
  | "ENTRY_AFTER_REMOTE_CLOSE"
  | "MULTI_DEVICE_ENTRIES";

export type DeviceConflictFindingSeverity = "INFO" | "REVIEW_REQUIRED";

export type DeviceConflictFinding = {
  code: DeviceConflictFindingCode;
  deviceIds: string[];
  entryIds: string[];
  message: string;
  sessionIds: string[];
  severity: DeviceConflictFindingSeverity;
};

export type DeviceConflictAdminReview = {
  primaryActionLabel: string;
  required: boolean;
  resolutionOptions: readonly DeviceConflictResolutionOption[];
  title: string;
};

export type DeviceConflictEvaluation = {
  adminReview: DeviceConflictAdminReview;
  automaticMergeAllowed: false;
  businessKey: string;
  currentDeviceId: string;
  entriesPreserved: true;
  findings: DeviceConflictFinding[];
  localSession: DeviceConflictSessionSnapshot;
  paymentBlocked: boolean;
  recommendedSessionStatus: HarvestSessionStatus;
  remoteSession: DeviceConflictSessionSnapshot | null;
  sessionsPreserved: true;
  status:
    "NO_DEVICE_CONFLICT" | "MULTI_DEVICE_ENTRIES_TRACKED" | "DEVICE_REVIEW_REQUIRED";
};

export function evaluateDeviceConflict({
  currentDeviceId,
  entries,
  localSession,
  otherSessionsSameBusinessKey = [],
  remoteSession = null
}: {
  currentDeviceId: string;
  entries: readonly DeviceConflictEntrySnapshot[];
  localSession: DeviceConflictSessionSnapshot;
  otherSessionsSameBusinessKey?: readonly DeviceConflictSessionSnapshot[];
  remoteSession?: DeviceConflictSessionSnapshot | null;
}): DeviceConflictEvaluation {
  const normalizedCurrentDeviceId = normalizeRequiredText(
    currentDeviceId,
    "Konflikt urzadzen wymaga biezacego urzadzenia."
  );
  const normalizedLocalSession = normalizeSession(localSession);
  const normalizedRemoteSession = remoteSession ? normalizeSession(remoteSession) : null;
  const normalizedEntries = entries.map(normalizeEntry);
  const duplicateSessions = otherSessionsSameBusinessKey
    .map(normalizeSession)
    .filter((session) => isSameBusinessKey(session, normalizedLocalSession))
    .filter((session) => session.id !== normalizedLocalSession.id);
  const findings: DeviceConflictFinding[] = [
    ...createDuplicateSessionFindings(normalizedLocalSession, duplicateSessions),
    ...createSameSessionFindings(normalizedLocalSession, normalizedRemoteSession),
    ...createClosedOnOtherDeviceFindings({
      entries: normalizedEntries,
      localSession: normalizedLocalSession,
      remoteSession: normalizedRemoteSession
    }),
    ...createMultiDeviceEntryFindings(normalizedLocalSession, normalizedEntries)
  ];
  const reviewRequired = findings.some(
    (finding) => finding.severity === "REVIEW_REQUIRED"
  );

  return {
    adminReview: createAdminReview(reviewRequired),
    automaticMergeAllowed: false,
    businessKey: createBusinessKey(normalizedLocalSession),
    currentDeviceId: normalizedCurrentDeviceId,
    entriesPreserved: true,
    findings,
    localSession: normalizedLocalSession,
    paymentBlocked: reviewRequired,
    recommendedSessionStatus: reviewRequired
      ? "REVIEW_REQUIRED"
      : normalizedLocalSession.status,
    remoteSession: normalizedRemoteSession,
    sessionsPreserved: true,
    status: resolveEvaluationStatus(reviewRequired, findings)
  };
}

function createDuplicateSessionFindings(
  localSession: DeviceConflictSessionSnapshot,
  duplicateSessions: readonly DeviceConflictSessionSnapshot[]
): DeviceConflictFinding[] {
  if (duplicateSessions.length === 0) {
    return [];
  }

  return [
    {
      code: "POSSIBLE_BUSINESS_DUPLICATE",
      deviceIds: collectDeviceIds([localSession, ...duplicateSessions]),
      entryIds: [],
      message:
        "Istnieja niezalezne sesje tej samej osoby i daty. System zachowuje oba zestawy danych i nie laczy ich automatycznie.",
      sessionIds: collectSessionIds([localSession, ...duplicateSessions]),
      severity: "REVIEW_REQUIRED"
    }
  ];
}

function createSameSessionFindings(
  localSession: DeviceConflictSessionSnapshot,
  remoteSession: DeviceConflictSessionSnapshot | null
): DeviceConflictFinding[] {
  if (remoteSession?.id !== localSession.id) {
    return [];
  }

  const findings: DeviceConflictFinding[] = [];
  const deviceIds = collectDeviceIds([localSession, remoteSession]);
  const sessionIds = [localSession.id];

  if (deviceIds.length > 1) {
    findings.push({
      code: "SAME_SESSION_CHANGED_ON_OTHER_DEVICE",
      deviceIds,
      entryIds: [],
      message:
        "Ta sama sesja ma zapis z innego urzadzenia. Przed dalsza praca wymagany jest przeglad administratora.",
      sessionIds,
      severity: "REVIEW_REQUIRED"
    });
  }

  if (remoteSession.revision !== localSession.revision) {
    findings.push({
      code: "SESSION_REVISION_DIVERGED",
      deviceIds,
      entryIds: [],
      message: "Lokalna i serwerowa rewizja dokumentu sesji roznia sie.",
      sessionIds,
      severity: "REVIEW_REQUIRED"
    });
  }

  return findings;
}

function createClosedOnOtherDeviceFindings({
  entries,
  localSession,
  remoteSession
}: {
  entries: readonly DeviceConflictEntrySnapshot[];
  localSession: DeviceConflictSessionSnapshot;
  remoteSession: DeviceConflictSessionSnapshot | null;
}): DeviceConflictFinding[] {
  if (remoteSession?.id !== localSession.id) {
    return [];
  }

  if (remoteSession.status !== "CLOSED") {
    return [];
  }

  const closingDeviceId = remoteSession.closedDeviceId ?? remoteSession.createdDeviceId;
  const pendingEntriesFromOtherDevices = entries.filter(
    (entry) =>
      entry.sessionId === localSession.id &&
      entry.pendingSync &&
      entry.createdDeviceId !== closingDeviceId
  );

  if (pendingEntriesFromOtherDevices.length === 0) {
    return [];
  }

  return [
    {
      code: "ENTRY_AFTER_REMOTE_CLOSE",
      deviceIds: collectEntryDeviceIds(pendingEntriesFromOtherDevices),
      entryIds: pendingEntriesFromOtherDevices.map((entry) => entry.id).sort(),
      message:
        "Sesja zostala zamknieta na jednym urzadzeniu, a drugie ma dalsze lokalne wpisy oczekujace synchronizacji.",
      sessionIds: [localSession.id],
      severity: "REVIEW_REQUIRED"
    }
  ];
}

function createMultiDeviceEntryFindings(
  localSession: DeviceConflictSessionSnapshot,
  entries: readonly DeviceConflictEntrySnapshot[]
): DeviceConflictFinding[] {
  const sessionEntries = entries.filter((entry) => entry.sessionId === localSession.id);
  const deviceIds = collectEntryDeviceIds(sessionEntries);

  if (deviceIds.length < 2) {
    return [];
  }

  return [
    {
      code: "MULTI_DEVICE_ENTRIES",
      deviceIds,
      entryIds: sessionEntries.map((entry) => entry.id).sort(),
      message:
        "Wpisy tej sesji pochodza z wielu urzadzen. Dane sa zachowane osobno i widoczne w przegladzie.",
      sessionIds: [localSession.id],
      severity: "INFO"
    }
  ];
}

function createAdminReview(reviewRequired: boolean): DeviceConflictAdminReview {
  if (!reviewRequired) {
    return {
      primaryActionLabel: "Brak przegladu",
      required: false,
      resolutionOptions: [],
      title: "Brak konfliktu urzadzen"
    };
  }

  return {
    primaryActionLabel: "Przejrzyj konflikt urzadzen",
    required: true,
    resolutionOptions: DEVICE_CONFLICT_RESOLUTION_OPTIONS,
    title: "Konflikt pracy na dwoch urzadzeniach"
  };
}

function resolveEvaluationStatus(
  reviewRequired: boolean,
  findings: readonly DeviceConflictFinding[]
): DeviceConflictEvaluation["status"] {
  if (reviewRequired) {
    return "DEVICE_REVIEW_REQUIRED";
  }

  if (findings.some((finding) => finding.code === "MULTI_DEVICE_ENTRIES")) {
    return "MULTI_DEVICE_ENTRIES_TRACKED";
  }

  return "NO_DEVICE_CONFLICT";
}

function isSameBusinessKey(
  left: DeviceConflictSessionSnapshot,
  right: DeviceConflictSessionSnapshot
): boolean {
  return left.workerId === right.workerId && left.businessDate === right.businessDate;
}

function createBusinessKey(session: DeviceConflictSessionSnapshot): string {
  return `${session.workerId}:${session.businessDate}`;
}

function collectSessionIds(sessions: readonly DeviceConflictSessionSnapshot[]): string[] {
  return Array.from(new Set(sessions.map((session) => session.id))).sort();
}

function collectDeviceIds(sessions: readonly DeviceConflictSessionSnapshot[]): string[] {
  return Array.from(new Set(sessions.map((session) => session.createdDeviceId))).sort();
}

function collectEntryDeviceIds(
  entries: readonly DeviceConflictEntrySnapshot[]
): string[] {
  return Array.from(new Set(entries.map((entry) => entry.createdDeviceId))).sort();
}

function normalizeSession(
  session: DeviceConflictSessionSnapshot
): DeviceConflictSessionSnapshot {
  return {
    ...session,
    businessDate: normalizeBusinessDate(session.businessDate),
    closedDeviceId: normalizeOptionalText(session.closedDeviceId),
    createdDeviceId: normalizeRequiredText(
      session.createdDeviceId,
      "Sesja konfliktu urzadzen wymaga urzadzenia tworzacego."
    ),
    id: normalizeRequiredText(session.id, "Sesja konfliktu urzadzen wymaga ID."),
    pendingSync: session.pendingSync === true,
    revision: normalizeRevision(session.revision),
    totalEntryCount: normalizeEntryCount(session.totalEntryCount),
    workerId: normalizeRequiredText(
      session.workerId,
      "Sesja konfliktu urzadzen wymaga zbieracza."
    ),
    workerNameSnapshot: normalizeRequiredText(
      session.workerNameSnapshot,
      "Sesja konfliktu urzadzen wymaga nazwy zbieracza."
    )
  };
}

function normalizeEntry(entry: DeviceConflictEntrySnapshot): DeviceConflictEntrySnapshot {
  return {
    ...entry,
    createdDeviceId: normalizeRequiredText(
      entry.createdDeviceId,
      "Wpis konfliktu urzadzen wymaga urzadzenia tworzacego."
    ),
    id: normalizeRequiredText(entry.id, "Wpis konfliktu urzadzen wymaga ID."),
    pendingSync: entry.pendingSync,
    sequenceNumber: normalizeSequenceNumber(entry.sequenceNumber),
    sessionId: normalizeRequiredText(
      entry.sessionId,
      "Wpis konfliktu urzadzen wymaga sesji."
    )
  };
}

function normalizeRequiredText(value: string, message: string): string {
  const trimmed = value.trim();

  if (!trimmed) {
    throw new Error(message);
  }

  return trimmed;
}

function normalizeOptionalText(value: string | null | undefined): string | null {
  if (value === null || value === undefined) {
    return null;
  }

  const trimmed = value.trim();

  return trimmed.length > 0 ? trimmed : null;
}

function normalizeBusinessDate(value: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(Date.parse(value))) {
    throw new Error("Data konfliktu urzadzen musi miec format YYYY-MM-DD.");
  }

  return value;
}

function normalizeRevision(revision: number): number {
  if (!Number.isSafeInteger(revision) || revision < 1) {
    throw new Error("Rewizja sesji konfliktu urzadzen musi byc dodatnia.");
  }

  return revision;
}

function normalizeEntryCount(value: number): number {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error("Liczba wpisow sesji konfliktu urzadzen musi byc nieujemna.");
  }

  return value;
}

function normalizeSequenceNumber(value: number): number {
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new Error("Numer wpisu konfliktu urzadzen musi byc dodatni.");
  }

  return value;
}
