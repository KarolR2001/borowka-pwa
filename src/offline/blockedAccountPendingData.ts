import type { UserProfile } from "../domain/identity";
import type { SyncCenterModel, SyncCenterSessionSummary } from "./syncCenter";

export const BLOCKED_ACCOUNT_PENDING_DATA_RESOLUTION_OPTIONS = [
  "TEMPORARY_REACTIVATION",
  "CONTROLLED_IMPORT",
  "KEEP_LOCAL_DATA_UNTIL_DECISION"
] as const;

export type BlockedAccountPendingDataResolutionOption =
  (typeof BLOCKED_ACCOUNT_PENDING_DATA_RESOLUTION_OPTIONS)[number];

export type BlockedAccountPendingDataAdminHandoff = {
  deviceId: string;
  documentIds: string[];
  email: string;
  pendingDocumentCount: number;
  sessionIds: string[];
  userUid: string;
};

export type BlockedAccountPendingDataEvaluation =
  | {
      adminHandoff: null;
      automaticRetryAllowed: true;
      emergencyExportRequired: false;
      localDataPreserved: true;
      message: string;
      paymentBlocked: false;
      resolutionOptions: [];
      status: "ACCOUNT_CAN_CONTINUE";
    }
  | {
      adminHandoff: BlockedAccountPendingDataAdminHandoff;
      automaticRetryAllowed: false;
      emergencyExportRequired: true;
      localDataPreserved: true;
      message: string;
      paymentBlocked: true;
      resolutionOptions: readonly BlockedAccountPendingDataResolutionOption[];
      status: "BLOCKED_ACCOUNT_PENDING_DATA";
    };

export function evaluateBlockedAccountPendingData({
  currentDeviceId,
  model,
  profile
}: {
  currentDeviceId: string;
  model: SyncCenterModel;
  profile: UserProfile;
}): BlockedAccountPendingDataEvaluation {
  const deviceId = normalizeRequiredText(
    currentDeviceId,
    "Blokada konta z danymi lokalnymi wymaga urzadzenia."
  );
  const pendingDocumentCount = countPendingDocuments(model.sessions);
  const accountBlocked = !profile.active || profile.registrationStatus === "BLOCKED";

  if (!accountBlocked || pendingDocumentCount === 0) {
    return {
      adminHandoff: null,
      automaticRetryAllowed: true,
      emergencyExportRequired: false,
      localDataPreserved: true,
      message: "Konto moze kontynuowac standardowa synchronizacje.",
      paymentBlocked: false,
      resolutionOptions: [],
      status: "ACCOUNT_CAN_CONTINUE"
    };
  }

  return {
    adminHandoff: {
      deviceId,
      documentIds: collectPendingDocumentIds(model.sessions),
      email: normalizeRequiredText(
        profile.email,
        "Blokada konta z danymi lokalnymi wymaga e-maila."
      ),
      pendingDocumentCount,
      sessionIds: collectSessionIds(model.sessions),
      userUid: normalizeRequiredText(
        profile.uid,
        "Blokada konta z danymi lokalnymi wymaga konta."
      )
    },
    automaticRetryAllowed: false,
    emergencyExportRequired: true,
    localDataPreserved: true,
    message:
      "Konto jest zablokowane, a urzadzenie ma lokalne dane oczekujace. Dane pozostaja lokalnie, automatyczne ponawianie jest wstrzymane i wymagany jest eksport awaryjny albo decyzja administratora.",
    paymentBlocked: true,
    resolutionOptions: BLOCKED_ACCOUNT_PENDING_DATA_RESOLUTION_OPTIONS,
    status: "BLOCKED_ACCOUNT_PENDING_DATA"
  };
}

function countPendingDocuments(sessions: readonly SyncCenterSessionSummary[]): number {
  return sessions.reduce((total, session) => total + session.pendingDocumentCount, 0);
}

function collectSessionIds(sessions: readonly SyncCenterSessionSummary[]): string[] {
  return sessions.map((session) => session.sessionId).sort();
}

function collectPendingDocumentIds(
  sessions: readonly SyncCenterSessionSummary[]
): string[] {
  return sessions
    .flatMap((session) =>
      session.documents
        .filter((document) => document.status !== "SYNCED")
        .map((document) => document.id)
    )
    .sort();
}

function normalizeRequiredText(value: string, message: string): string {
  const trimmed = value.trim();

  if (!trimmed) {
    throw new Error(message);
  }

  return trimmed;
}
