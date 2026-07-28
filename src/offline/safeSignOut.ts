import type { UserRole } from "../domain/identity";
import type { SyncDocumentMetadataInput } from "./pendingWriteMetadata";
import { buildSyncCenterModel, type SyncCenterSessionSummary } from "./syncCenter";

export const DEVICE_CLEAR_CONFIRMATION = "WYCZYSC URZADZENIE";

export type SafeSignOutSessionSummary = Pick<
  SyncCenterSessionSummary,
  "businessDate" | "lastError" | "pendingDocumentCount" | "sessionId" | "workerName"
>;

export type SafeSignOutModel = {
  canClearDevice: boolean;
  canSignOut: boolean;
  pendingDocumentCount: number;
  sessions: SafeSignOutSessionSummary[];
  status: "CLEAR_TO_SIGN_OUT" | "PENDING_DATA";
  unassignedPendingDocumentCount: number;
};

export function buildSafeSignOutModel(
  documents: readonly SyncDocumentMetadataInput[],
  role: UserRole
): SafeSignOutModel {
  const syncCenter = buildSyncCenterModel(documents);
  const pendingDocumentCount =
    syncCenter.metadataSummary.localSavedCount +
    syncCenter.metadataSummary.pendingSyncCount +
    syncCenter.metadataSummary.rejectedCount +
    syncCenter.metadataSummary.remoteChangedCount;
  const sessionPendingDocumentCount = syncCenter.sessions.reduce(
    (total, session) => total + session.pendingDocumentCount,
    0
  );
  const hasPendingData = pendingDocumentCount > 0;

  return {
    canClearDevice: !hasPendingData && (role === "ADMIN" || role === "OPERATOR"),
    canSignOut: !hasPendingData,
    pendingDocumentCount,
    sessions: syncCenter.sessions.map(
      ({
        businessDate,
        lastError,
        pendingDocumentCount: sessionDocumentCount,
        sessionId,
        workerName
      }) => ({
        businessDate,
        lastError,
        pendingDocumentCount: sessionDocumentCount,
        sessionId,
        workerName
      })
    ),
    status: hasPendingData ? "PENDING_DATA" : "CLEAR_TO_SIGN_OUT",
    unassignedPendingDocumentCount: Math.max(
      0,
      pendingDocumentCount - sessionPendingDocumentCount
    )
  };
}

export function canConfirmDeviceClear(
  model: SafeSignOutModel,
  confirmation: string
): boolean {
  return (
    model.canClearDevice &&
    confirmation.trim().toUpperCase() === DEVICE_CLEAR_CONFIRMATION
  );
}
