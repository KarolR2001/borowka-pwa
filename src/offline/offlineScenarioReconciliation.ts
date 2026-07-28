import type { WorkerRateVersionDocument } from "../domain/domainConfiguration";
import type { UserProfile } from "../domain/identity";
import type { HarvestEntryDocument } from "../harvest/harvestSessionDashboard";
import type { HarvestSessionDocument } from "../harvest/openHarvestSession";
import {
  evaluateBlockedAccountPendingData,
  type BlockedAccountPendingDataEvaluation
} from "./blockedAccountPendingData";
import {
  evaluateDeviceConflict,
  type DeviceConflictEvaluation,
  type DeviceConflictSessionSnapshot
} from "./deviceConflict";
import { evaluateOfflineRateConflict, type RateConflictEvaluation } from "./rateConflict";
import type { SyncCenterModel } from "./syncCenter";

export type OfflineScenarioReconciliationStatus =
  "CLEAR" | "REVIEW_REQUIRED" | "BLOCKED_ACCOUNT";

export type OfflineScenarioReconciliation = {
  account: BlockedAccountPendingDataEvaluation;
  automaticRetryAllowed: boolean;
  device: DeviceConflictEvaluation;
  emergencyExportRequired: boolean;
  findingCodes: string[];
  localDataPreserved: true;
  paymentBlocked: boolean;
  rate: RateConflictEvaluation;
  recommendedSessionStatus: HarvestSessionDocument["status"];
  reviewRequired: boolean;
  status: OfflineScenarioReconciliationStatus;
};

export function evaluateOfflineScenarioReconciliation({
  currentDeviceId,
  currentRateVersions,
  entries,
  localSession,
  model,
  otherSessionsSameBusinessKey = [],
  profile,
  remoteSession = null
}: {
  currentDeviceId: string;
  currentRateVersions: readonly WorkerRateVersionDocument[];
  entries: readonly HarvestEntryDocument[];
  localSession: HarvestSessionDocument;
  model: SyncCenterModel;
  otherSessionsSameBusinessKey?: readonly DeviceConflictSessionSnapshot[];
  profile: UserProfile;
  remoteSession?: DeviceConflictSessionSnapshot | null;
}): OfflineScenarioReconciliation {
  const account = evaluateBlockedAccountPendingData({
    currentDeviceId,
    model,
    profile
  });
  const rate = evaluateOfflineRateConflict({
    currentRateVersions,
    session: localSession
  });
  const device = evaluateDeviceConflict({
    currentDeviceId,
    entries,
    localSession,
    otherSessionsSameBusinessKey,
    remoteSession
  });
  const accountBlocked = account.status === "BLOCKED_ACCOUNT_PENDING_DATA";
  const reviewRequired =
    accountBlocked || rate.reviewRequired || device.adminReview.required;
  const findingCodes = [
    ...(accountBlocked ? ["BLOCKED_ACCOUNT_PENDING_DATA"] : []),
    ...(rate.reviewRequired ? ["RATE_REVIEW_REQUIRED"] : []),
    ...device.findings.map((finding) => finding.code)
  ];

  return {
    account,
    automaticRetryAllowed: account.automaticRetryAllowed,
    device,
    emergencyExportRequired: account.emergencyExportRequired,
    findingCodes: Array.from(new Set(findingCodes)).sort(),
    localDataPreserved: true,
    paymentBlocked:
      account.paymentBlocked || rate.paymentBlocked || device.paymentBlocked,
    rate,
    recommendedSessionStatus: reviewRequired ? "REVIEW_REQUIRED" : localSession.status,
    reviewRequired,
    status: accountBlocked
      ? "BLOCKED_ACCOUNT"
      : reviewRequired
        ? "REVIEW_REQUIRED"
        : "CLEAR"
  };
}
