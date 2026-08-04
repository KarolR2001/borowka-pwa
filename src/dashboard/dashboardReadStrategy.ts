import type { QueryConstraint, WhereFilterOp } from "firebase/firestore";

import type { ResolvedDashboardPeriod } from "./dashboardPeriod";

export const FIRESTORE_AGGREGATION_BATCH_SIZE = 1000;
export const OPERATOR_OPEN_SESSION_LIMIT = 100;
export const OPERATOR_RECENT_SESSION_LIMIT = 8;

export type DashboardScale = {
  harvestEntryCount: number;
  harvestSessionCount: number;
  operationalStockMovementCount: number;
  paymentCount: number;
  saleCount: number;
  seasonCount: number;
  workerCount: number;
};

export type DashboardReadEstimate = {
  admin: {
    aggregateBilledReadUpperBound: number;
    previousDocumentReads: number;
  };
  operator: {
    aggregateBilledReadUpperBound: number;
    boundedDocumentReads: number;
  };
  picker: {
    averageSelectedSeasonDocumentReads: number;
    previousAverageDocumentReads: number;
  };
};

export const PRD_EXPECTED_MAX_SCALE: DashboardScale = {
  harvestEntryCount: 200_000,
  harvestSessionCount: 20_000,
  operationalStockMovementCount: 40_000,
  paymentCount: 20_000,
  saleCount: 20_000,
  seasonCount: 10,
  workerCount: 200
};

export function estimateDashboardReads(scale: DashboardScale): DashboardReadEstimate {
  assertScale(scale);
  const averageSessionsPerWorker = Math.ceil(
    scale.harvestSessionCount / Math.max(scale.workerCount, 1)
  );
  const averagePaymentsPerWorker = Math.ceil(
    scale.paymentCount / Math.max(scale.workerCount, 1)
  );
  const averageSessionsPerWorkerSeason = Math.ceil(
    averageSessionsPerWorker / Math.max(scale.seasonCount, 1)
  );
  const averagePaymentsPerWorkerSeason = Math.ceil(
    averagePaymentsPerWorker / Math.max(scale.seasonCount, 1)
  );

  return {
    admin: {
      aggregateBilledReadUpperBound:
        scale.seasonCount +
        aggregatePartitionUpperBound(scale.harvestSessionCount, 3) +
        aggregatePartitionUpperBound(scale.saleCount, 3) +
        aggregatePartitionUpperBound(scale.paymentCount, 1) +
        aggregatePartitionUpperBound(scale.workerCount, 1),
      previousDocumentReads:
        scale.seasonCount +
        scale.harvestSessionCount +
        scale.saleCount +
        scale.paymentCount +
        scale.workerCount
    },
    operator: {
      aggregateBilledReadUpperBound:
        aggregatePartitionUpperBound(scale.operationalStockMovementCount, 1) +
        aggregatePartitionUpperBound(scale.harvestSessionCount, 2),
      boundedDocumentReads:
        scale.seasonCount +
        Math.min(scale.harvestSessionCount, OPERATOR_OPEN_SESSION_LIMIT) +
        Math.min(scale.harvestSessionCount, OPERATOR_RECENT_SESSION_LIMIT)
    },
    picker: {
      averageSelectedSeasonDocumentReads:
        1 +
        scale.seasonCount +
        averageSessionsPerWorkerSeason +
        averagePaymentsPerWorkerSeason,
      previousAverageDocumentReads:
        1 + scale.seasonCount + averageSessionsPerWorker + averagePaymentsPerWorker
    }
  };
}

export function dashboardPeriodQueryConstraints(
  fieldPath: "businessDate" | "paidBusinessDate",
  period: Pick<ResolvedDashboardPeriod, "fromDate" | "toDate">,
  createWhere: (
    fieldPath: string,
    opStr: WhereFilterOp,
    value: unknown
  ) => QueryConstraint
): QueryConstraint[] {
  const constraints: QueryConstraint[] = [];

  if (period.fromDate !== null) {
    constraints.push(createWhere(fieldPath, ">=", period.fromDate));
  }

  if (period.toDate !== null) {
    constraints.push(createWhere(fieldPath, "<=", period.toDate));
  }

  return constraints;
}

function aggregatePartitionUpperBound(documentCount: number, partitionCount: number) {
  if (partitionCount <= 0 || !Number.isSafeInteger(partitionCount)) {
    throw new Error("Liczba zapytan agregujacych musi byc dodatnia.");
  }

  if (documentCount === 0) {
    return partitionCount;
  }

  return Math.ceil(documentCount / FIRESTORE_AGGREGATION_BATCH_SIZE) + partitionCount - 1;
}

function assertScale(scale: DashboardScale): void {
  for (const value of Object.values(scale)) {
    if (!Number.isSafeInteger(value) || value < 0) {
      throw new Error("Skala pomiaru odczytow musi zawierac nieujemne liczby calkowite.");
    }
  }
}
