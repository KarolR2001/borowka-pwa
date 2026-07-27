import type { WorkerRateVersionDocument } from "../domain/domainConfiguration";
import type { HarvestSessionDocument } from "../harvest/openHarvestSession";

export const RATE_CONFLICT_RESOLUTION_OPTIONS = [
  "KEEP_LOCAL_SNAPSHOT",
  "APPLY_CURRENT_RATE_BEFORE_CLOSE",
  "CANCEL_SESSION"
] as const;

export type RateConflictResolutionOption =
  (typeof RATE_CONFLICT_RESOLUTION_OPTIONS)[number];

export type RateConflictSessionSnapshot = Pick<
  HarvestSessionDocument,
  | "amountDueGrosz"
  | "businessDate"
  | "id"
  | "planIdSnapshot"
  | "rateGroszSnapshot"
  | "rateVersionIdSnapshot"
  | "status"
  | "workerId"
  | "workerNameSnapshot"
>;

export type RateConflictSnapshotView = {
  planId: string;
  rateGroszPerUnit: number;
  rateVersionId: string;
  validFrom: string;
  validTo: string | null;
  workerId: string;
};

export type RateConflictEvaluation =
  | {
      adminResolutionOptions: readonly ["KEEP_LOCAL_SNAPSHOT"];
      currentEffectiveRate: RateConflictSnapshotView | null;
      localSnapshot: RateConflictSnapshotView;
      message: string;
      paymentBlocked: false;
      preservedAmountDueGrosz: number | null;
      recommendedSessionStatus: RateConflictSessionSnapshot["status"];
      reviewRequired: false;
      status: "SNAPSHOT_STILL_VALID";
    }
  | {
      adminResolutionOptions: readonly RateConflictResolutionOption[];
      currentEffectiveRate: RateConflictSnapshotView | null;
      localSnapshot: RateConflictSnapshotView;
      message: string;
      paymentBlocked: true;
      preservedAmountDueGrosz: number | null;
      recommendedSessionStatus: "REVIEW_REQUIRED";
      reviewRequired: true;
      status: "RATE_REVIEW_REQUIRED";
    };

export function evaluateOfflineRateConflict({
  currentRateVersions,
  session
}: {
  currentRateVersions: readonly WorkerRateVersionDocument[];
  session: RateConflictSessionSnapshot;
}): RateConflictEvaluation {
  const businessDate = normalizeBusinessDate(session.businessDate);
  const snapshotRateVersion = currentRateVersions.find(
    (rateVersion) => rateVersion.id === session.rateVersionIdSnapshot
  );
  const currentEffectiveRate = findCurrentEffectiveRate({
    businessDate,
    planId: session.planIdSnapshot,
    rateVersions: currentRateVersions,
    workerId: session.workerId
  });
  const localSnapshot = createLocalSnapshotView(session, snapshotRateVersion);
  const preservedAmountDueGrosz = normalizeOptionalAmount(session.amountDueGrosz);

  if (
    snapshotRateVersion &&
    rateVersionMatchesSessionSnapshot(snapshotRateVersion, session, businessDate)
  ) {
    return {
      adminResolutionOptions: ["KEEP_LOCAL_SNAPSHOT"],
      currentEffectiveRate: currentEffectiveRate
        ? createRateSnapshotView(currentEffectiveRate)
        : null,
      localSnapshot,
      message: "Snapshot stawki pozostaje zgodny z data biznesowa sesji.",
      paymentBlocked: false,
      preservedAmountDueGrosz,
      recommendedSessionStatus: session.status,
      reviewRequired: false,
      status: "SNAPSHOT_STILL_VALID"
    };
  }

  return {
    adminResolutionOptions: createReviewOptions(currentEffectiveRate),
    currentEffectiveRate: currentEffectiveRate
      ? createRateSnapshotView(currentEffectiveRate)
      : null,
    localSnapshot,
    message: createReviewMessage(snapshotRateVersion, currentEffectiveRate),
    paymentBlocked: true,
    preservedAmountDueGrosz,
    recommendedSessionStatus: "REVIEW_REQUIRED",
    reviewRequired: true,
    status: "RATE_REVIEW_REQUIRED"
  };
}

function rateVersionMatchesSessionSnapshot(
  rateVersion: WorkerRateVersionDocument,
  session: RateConflictSessionSnapshot,
  businessDate: string
): boolean {
  return (
    rateVersion.workerId === session.workerId &&
    rateVersion.planId === session.planIdSnapshot &&
    rateVersion.rateGroszPerUnit === session.rateGroszSnapshot &&
    rateVersion.id === session.rateVersionIdSnapshot &&
    rateVersion.active &&
    isRateEffectiveOn(rateVersion, businessDate)
  );
}

function findCurrentEffectiveRate({
  businessDate,
  planId,
  rateVersions,
  workerId
}: {
  businessDate: string;
  planId: string;
  rateVersions: readonly WorkerRateVersionDocument[];
  workerId: string;
}): WorkerRateVersionDocument | null {
  return (
    rateVersions
      .filter(
        (rateVersion) =>
          rateVersion.workerId === workerId &&
          rateVersion.planId === planId &&
          rateVersion.active &&
          isRateEffectiveOn(rateVersion, businessDate)
      )
      .sort((left, right) => right.validFrom.localeCompare(left.validFrom))[0] ?? null
  );
}

function createLocalSnapshotView(
  session: RateConflictSessionSnapshot,
  snapshotRateVersion: WorkerRateVersionDocument | undefined
): RateConflictSnapshotView {
  return {
    planId: session.planIdSnapshot,
    rateGroszPerUnit: normalizePositiveInteger(session.rateGroszSnapshot),
    rateVersionId: session.rateVersionIdSnapshot,
    validFrom: snapshotRateVersion?.validFrom ?? "nieznany",
    validTo: snapshotRateVersion?.validTo ?? null,
    workerId: session.workerId
  };
}

function createRateSnapshotView(
  rateVersion: WorkerRateVersionDocument
): RateConflictSnapshotView {
  return {
    planId: rateVersion.planId,
    rateGroszPerUnit: normalizePositiveInteger(rateVersion.rateGroszPerUnit),
    rateVersionId: rateVersion.id,
    validFrom: normalizeBusinessDate(rateVersion.validFrom),
    validTo: normalizeOptionalBusinessDate(rateVersion.validTo),
    workerId: rateVersion.workerId
  };
}

function createReviewOptions(
  currentEffectiveRate: WorkerRateVersionDocument | null
): RateConflictResolutionOption[] {
  const options: RateConflictResolutionOption[] = [
    "KEEP_LOCAL_SNAPSHOT",
    "CANCEL_SESSION"
  ];

  if (currentEffectiveRate) {
    options.splice(1, 0, "APPLY_CURRENT_RATE_BEFORE_CLOSE");
  }

  return options;
}

function createReviewMessage(
  snapshotRateVersion: WorkerRateVersionDocument | undefined,
  currentEffectiveRate: WorkerRateVersionDocument | null
): string {
  if (!snapshotRateVersion) {
    return "Nie znaleziono wersji stawki zapisanej w lokalnym snapshocie.";
  }

  if (!currentEffectiveRate) {
    return "Snapshot stawki nie jest juz aktywny dla daty sesji i nie ma aktualnej stawki zastepczej.";
  }

  return "Aktualna stawka serwera rozni sie od lokalnego snapshotu sesji.";
}

function isRateEffectiveOn(
  rateVersion: Pick<WorkerRateVersionDocument, "validFrom" | "validTo">,
  businessDate: string
): boolean {
  const validFrom = normalizeBusinessDate(rateVersion.validFrom);
  const validTo = normalizeOptionalBusinessDate(rateVersion.validTo);

  return validFrom <= businessDate && (validTo === null || businessDate <= validTo);
}

function normalizeBusinessDate(value: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(Date.parse(value))) {
    throw new Error("Data biznesowa konfliktu stawki musi miec format YYYY-MM-DD.");
  }

  return value;
}

function normalizeOptionalBusinessDate(value: string | null): string | null {
  return value === null ? null : normalizeBusinessDate(value);
}

function normalizePositiveInteger(value: number): number {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error("Stawka snapshotu musi byc dodatnia liczba groszy.");
  }

  return value;
}

function normalizeOptionalAmount(value: number | null): number | null {
  if (value === null) {
    return null;
  }

  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error("Kwota sesji musi byc nieujemna liczba groszy.");
  }

  return value;
}
