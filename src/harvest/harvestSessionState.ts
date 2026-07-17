import type { UserRole } from "../domain/identity";

export const HARVEST_SESSIONS_COLLECTION = "harvestSessions";
export const HARVEST_ENTRIES_COLLECTION = "harvestEntries";

export const HARVEST_SESSION_STATUSES = [
  "OPEN",
  "CLOSED",
  "PAID",
  "CANCELLED",
  "REVIEW_REQUIRED"
] as const;

export const HARVEST_SESSION_TRANSITION_TYPES = [
  "CREATE",
  "CLOSE",
  "MARK_REVIEW_REQUIRED",
  "MARK_PAID",
  "CANCEL",
  "REOPEN"
] as const;

export const HARVEST_SESSION_AUDIT_ACTIONS = [
  "HARVEST_SESSION_CREATED",
  "HARVEST_SESSION_CLOSED",
  "HARVEST_SESSION_MARKED_REVIEW_REQUIRED",
  "HARVEST_SESSION_PAID",
  "HARVEST_SESSION_CANCELLED",
  "HARVEST_SESSION_REOPENED"
] as const;

export type HarvestSessionStatus = (typeof HARVEST_SESSION_STATUSES)[number];
export type HarvestSessionTransitionType =
  (typeof HARVEST_SESSION_TRANSITION_TYPES)[number];
export type HarvestSessionAuditAction = (typeof HARVEST_SESSION_AUDIT_ACTIONS)[number];

export type HarvestSessionTransitionRequiredField =
  | "seasonId"
  | "workerId"
  | "workerNameSnapshot"
  | "businessDate"
  | "planIdSnapshot"
  | "planNameSnapshot"
  | "calculationBasisSnapshot"
  | "unitLabelSnapshot"
  | "rateVersionIdSnapshot"
  | "rateGroszSnapshot"
  | "createdBy"
  | "createdDeviceId"
  | "createdAtDevice"
  | "totalEntryCount"
  | "totalQuantityMilli"
  | "totalWeightG"
  | "amountDueGrosz"
  | "calculationVersion"
  | "closedBy"
  | "closedAtDevice"
  | "paymentId"
  | "paidAt"
  | "cancelledBy"
  | "cancelledAt"
  | "cancellationReason"
  | "reason"
  | "revision";

export type HarvestSessionEntriesImpact =
  | "ENTRIES_OPEN_FOR_ACTIVE_EDIT"
  | "ENTRIES_LOCKED"
  | "ENTRIES_LOCKED_BY_PAYMENT"
  | "ENTRIES_REMAIN_HISTORICAL"
  | "ENTRIES_REQUIRE_REVIEW";

export type HarvestSessionAmountImpact =
  | "PREVIEW_ONLY"
  | "OFFICIAL_RECALCULATED"
  | "OFFICIAL_BLOCKED_FOR_REVIEW"
  | "OFFICIAL_PAYMENT_CONFIRMED"
  | "REMOVED_FROM_SETTLEMENTS";

export type HarvestSessionStockImpact =
  | "NO_OFFICIAL_STOCK_IMPACT"
  | "OFFICIAL_STOCK_RECALCULATED"
  | "OFFICIAL_STOCK_LOCKED"
  | "REMOVED_FROM_STOCK_TOTALS";

export type HarvestSessionTransitionDefinition = {
  type: HarvestSessionTransitionType;
  fromStatuses: readonly HarvestSessionStatus[] | null;
  toStatus: HarvestSessionStatus;
  allowedRoles: readonly UserRole[];
  requiresOnline: boolean;
  requiredFields: readonly HarvestSessionTransitionRequiredField[];
  entriesImpact: HarvestSessionEntriesImpact;
  amountImpact: HarvestSessionAmountImpact;
  stockImpact: HarvestSessionStockImpact;
  requiresReason: boolean;
  auditAction: HarvestSessionAuditAction;
  reversibleBy: readonly HarvestSessionTransitionType[];
  reversalNote: string;
};

export type HarvestSessionTransitionDenialCode =
  | "SOURCE_STATUS_REQUIRED"
  | "SOURCE_STATUS_MUST_BE_EMPTY"
  | "SOURCE_STATUS_NOT_ALLOWED"
  | "ROLE_NOT_ALLOWED"
  | "ONLINE_REQUIRED"
  | "REASON_REQUIRED"
  | "ACTIVE_PAYMENT_BLOCKS_TRANSITION"
  | "ACTIVE_ENTRY_REQUIRED"
  | "PAYMENT_ID_REQUIRED";

export type HarvestSessionTransitionCheckInput = {
  type: HarvestSessionTransitionType;
  fromStatus?: HarvestSessionStatus | null;
  actorRole: UserRole;
  isOnline: boolean;
  hasActivePayment?: boolean;
  activeEntryCount?: number | null;
  paymentId?: string | null;
  reason?: string | null;
};

export type HarvestSessionTransitionCheckResult =
  | {
      status: "ALLOWED";
      definition: HarvestSessionTransitionDefinition;
    }
  | {
      status: "DENIED";
      code: HarvestSessionTransitionDenialCode;
      reason: string;
      definition: HarvestSessionTransitionDefinition;
    };

const ADMIN_ONLY = ["ADMIN"] as const satisfies readonly UserRole[];
const SESSION_EDIT_ROLES = ["ADMIN", "OPERATOR"] as const satisfies readonly UserRole[];

const transitionDefinitions = {
  CREATE: {
    type: "CREATE",
    fromStatuses: null,
    toStatus: "OPEN",
    allowedRoles: SESSION_EDIT_ROLES,
    requiresOnline: true,
    requiredFields: [
      "seasonId",
      "workerId",
      "workerNameSnapshot",
      "businessDate",
      "planIdSnapshot",
      "planNameSnapshot",
      "calculationBasisSnapshot",
      "unitLabelSnapshot",
      "rateVersionIdSnapshot",
      "rateGroszSnapshot",
      "createdBy",
      "createdDeviceId",
      "createdAtDevice",
      "revision"
    ],
    entriesImpact: "ENTRIES_OPEN_FOR_ACTIVE_EDIT",
    amountImpact: "PREVIEW_ONLY",
    stockImpact: "NO_OFFICIAL_STOCK_IMPACT",
    requiresReason: false,
    auditAction: "HARVEST_SESSION_CREATED",
    reversibleBy: ["CANCEL"],
    reversalNote: "A created session is not deleted; admin cancellation keeps history."
  },
  CLOSE: {
    type: "CLOSE",
    fromStatuses: ["OPEN"],
    toStatus: "CLOSED",
    allowedRoles: SESSION_EDIT_ROLES,
    requiresOnline: true,
    requiredFields: [
      "totalEntryCount",
      "totalQuantityMilli",
      "totalWeightG",
      "amountDueGrosz",
      "calculationVersion",
      "closedBy",
      "closedAtDevice",
      "revision"
    ],
    entriesImpact: "ENTRIES_LOCKED",
    amountImpact: "OFFICIAL_RECALCULATED",
    stockImpact: "OFFICIAL_STOCK_RECALCULATED",
    requiresReason: false,
    auditAction: "HARVEST_SESSION_CLOSED",
    reversibleBy: ["REOPEN"],
    reversalNote: "Only admin can reopen a closed session without active payment."
  },
  MARK_REVIEW_REQUIRED: {
    type: "MARK_REVIEW_REQUIRED",
    fromStatuses: ["OPEN", "CLOSED"],
    toStatus: "REVIEW_REQUIRED",
    allowedRoles: SESSION_EDIT_ROLES,
    requiresOnline: true,
    requiredFields: ["reason", "revision"],
    entriesImpact: "ENTRIES_REQUIRE_REVIEW",
    amountImpact: "OFFICIAL_BLOCKED_FOR_REVIEW",
    stockImpact: "NO_OFFICIAL_STOCK_IMPACT",
    requiresReason: true,
    auditAction: "HARVEST_SESSION_MARKED_REVIEW_REQUIRED",
    reversibleBy: ["CANCEL"],
    reversalNote:
      "Resolution is an explicit admin review flow; cancellation is the only stage 5.1 reversal."
  },
  MARK_PAID: {
    type: "MARK_PAID",
    fromStatuses: ["CLOSED"],
    toStatus: "PAID",
    allowedRoles: ADMIN_ONLY,
    requiresOnline: true,
    requiredFields: ["paymentId", "paidAt", "revision"],
    entriesImpact: "ENTRIES_LOCKED_BY_PAYMENT",
    amountImpact: "OFFICIAL_PAYMENT_CONFIRMED",
    stockImpact: "OFFICIAL_STOCK_LOCKED",
    requiresReason: false,
    auditAction: "HARVEST_SESSION_PAID",
    reversibleBy: [],
    reversalNote:
      "Payment cancellation belongs to the payout module and must return through an explicit payout flow."
  },
  CANCEL: {
    type: "CANCEL",
    fromStatuses: ["OPEN", "CLOSED", "REVIEW_REQUIRED"],
    toStatus: "CANCELLED",
    allowedRoles: ADMIN_ONLY,
    requiresOnline: true,
    requiredFields: ["cancelledBy", "cancelledAt", "cancellationReason", "revision"],
    entriesImpact: "ENTRIES_REMAIN_HISTORICAL",
    amountImpact: "REMOVED_FROM_SETTLEMENTS",
    stockImpact: "REMOVED_FROM_STOCK_TOTALS",
    requiresReason: true,
    auditAction: "HARVEST_SESSION_CANCELLED",
    reversibleBy: [],
    reversalNote:
      "A cancelled session remains historical and is not restored in stage 5.1."
  },
  REOPEN: {
    type: "REOPEN",
    fromStatuses: ["CLOSED"],
    toStatus: "OPEN",
    allowedRoles: ADMIN_ONLY,
    requiresOnline: true,
    requiredFields: ["reason", "revision"],
    entriesImpact: "ENTRIES_OPEN_FOR_ACTIVE_EDIT",
    amountImpact: "PREVIEW_ONLY",
    stockImpact: "NO_OFFICIAL_STOCK_IMPACT",
    requiresReason: true,
    auditAction: "HARVEST_SESSION_REOPENED",
    reversibleBy: ["CLOSE", "CANCEL"],
    reversalNote:
      "The next close recalculates official totals; admin can also cancel before payment."
  }
} as const satisfies Record<
  HarvestSessionTransitionType,
  HarvestSessionTransitionDefinition
>;

const statusLabels: Record<HarvestSessionStatus, string> = {
  OPEN: "W toku",
  CLOSED: "Do wyplaty",
  PAID: "Wyplacono",
  CANCELLED: "Anulowano",
  REVIEW_REQUIRED: "Wymaga przegladu"
};

export function isHarvestSessionStatus(value: unknown): value is HarvestSessionStatus {
  return HARVEST_SESSION_STATUSES.includes(value as HarvestSessionStatus);
}

export function isHarvestSessionTransitionType(
  value: unknown
): value is HarvestSessionTransitionType {
  return HARVEST_SESSION_TRANSITION_TYPES.includes(value as HarvestSessionTransitionType);
}

export function harvestSessionStatusLabel(status: HarvestSessionStatus): string {
  return statusLabels[status];
}

export function listHarvestSessionTransitionDefinitions(): HarvestSessionTransitionDefinition[] {
  return HARVEST_SESSION_TRANSITION_TYPES.map(getHarvestSessionTransitionDefinition);
}

export function getHarvestSessionTransitionDefinition(
  type: HarvestSessionTransitionType
): HarvestSessionTransitionDefinition {
  return transitionDefinitions[type];
}

export function canRolePerformHarvestSessionTransition(
  role: UserRole,
  type: HarvestSessionTransitionType
): boolean {
  return getHarvestSessionTransitionDefinition(type).allowedRoles.includes(role);
}

export function checkHarvestSessionTransition(
  input: HarvestSessionTransitionCheckInput
): HarvestSessionTransitionCheckResult {
  const definition = getHarvestSessionTransitionDefinition(input.type);
  const sourceStatusCheck = checkSourceStatus(input.fromStatus, definition);

  if (sourceStatusCheck) {
    return denied(definition, sourceStatusCheck.code, sourceStatusCheck.reason);
  }

  if (!definition.allowedRoles.includes(input.actorRole)) {
    return denied(
      definition,
      "ROLE_NOT_ALLOWED",
      "Ta rola nie moze wykonac przejscia statusu sesji."
    );
  }

  if (definition.requiresOnline && !input.isOnline) {
    return denied(
      definition,
      "ONLINE_REQUIRED",
      "Przejscie statusu sesji wymaga aktywnego polaczenia."
    );
  }

  if (definition.requiresReason && !hasRequiredText(input.reason)) {
    return denied(
      definition,
      "REASON_REQUIRED",
      "Przejscie statusu sesji wymaga powodu."
    );
  }

  if (input.type === "CLOSE" && !hasPositiveInteger(input.activeEntryCount)) {
    return denied(definition, "ACTIVE_ENTRY_REQUIRED", "Nie mozna zamknac pustej sesji.");
  }

  if (input.type === "MARK_PAID" && !hasRequiredText(input.paymentId)) {
    return denied(
      definition,
      "PAYMENT_ID_REQUIRED",
      "Oznaczenie sesji jako wyplaconej wymaga identyfikatora wyplaty."
    );
  }

  if ((input.type === "CANCEL" || input.type === "REOPEN") && input.hasActivePayment) {
    return denied(
      definition,
      "ACTIVE_PAYMENT_BLOCKS_TRANSITION",
      "Aktywna wyplata blokuje to przejscie statusu sesji."
    );
  }

  return {
    status: "ALLOWED",
    definition
  };
}

export function assertHarvestSessionTransitionAllowed(
  input: HarvestSessionTransitionCheckInput
): HarvestSessionTransitionDefinition {
  const result = checkHarvestSessionTransition(input);

  if (result.status === "DENIED") {
    throw new Error(result.reason);
  }

  return result.definition;
}

function checkSourceStatus(
  fromStatus: HarvestSessionStatus | null | undefined,
  definition: HarvestSessionTransitionDefinition
): {
  code: HarvestSessionTransitionDenialCode;
  reason: string;
} | null {
  if (definition.fromStatuses === null) {
    return fromStatus === null || fromStatus === undefined
      ? null
      : {
          code: "SOURCE_STATUS_MUST_BE_EMPTY",
          reason: "Utworzenie sesji nie moze miec statusu zrodlowego."
        };
  }

  if (!fromStatus) {
    return {
      code: "SOURCE_STATUS_REQUIRED",
      reason: "Przejscie statusu sesji wymaga statusu zrodlowego."
    };
  }

  if (!definition.fromStatuses.includes(fromStatus)) {
    return {
      code: "SOURCE_STATUS_NOT_ALLOWED",
      reason: "Przejscie statusu sesji nie jest dozwolone z tego statusu."
    };
  }

  return null;
}

function denied(
  definition: HarvestSessionTransitionDefinition,
  code: HarvestSessionTransitionDenialCode,
  reason: string
): HarvestSessionTransitionCheckResult {
  return {
    status: "DENIED",
    code,
    reason,
    definition
  };
}

function hasRequiredText(value: string | null | undefined): boolean {
  return typeof value === "string" && value.trim().length > 0;
}

function hasPositiveInteger(value: number | null | undefined): boolean {
  return Number.isInteger(value) && Number(value) > 0;
}
