import type {
  SettlementPlanDocument,
  WorkerDocument
} from "../domain/domainConfiguration";
import type { HarvestSessionDocument } from "../harvest/openHarvestSession";

export const ARCHIVED_CONFIGURATION_RESOLUTION_OPTIONS = [
  "ACCEPT_HISTORICALLY",
  "REACTIVATE_WORKER",
  "REACTIVATE_PLAN",
  "CANCEL_SESSION"
] as const;

export type ArchivedConfigurationResolutionOption =
  (typeof ARCHIVED_CONFIGURATION_RESOLUTION_OPTIONS)[number];

export type ArchivedConfigurationCheckMode =
  "EXISTING_OFFLINE_SESSION" | "NEW_SESSION_ATTEMPT";

export type ArchivedConfigurationSessionSnapshot = Pick<
  HarvestSessionDocument,
  | "amountDueGrosz"
  | "businessDate"
  | "id"
  | "planIdSnapshot"
  | "planNameSnapshot"
  | "status"
  | "totalEntryCount"
  | "workerId"
  | "workerNameSnapshot"
>;

export type ArchivedConfigurationReferenceView = {
  active: boolean | null;
  id: string;
  label: string;
  missing: boolean;
};

export type ArchivedConfigurationConflictCode =
  "WORKER_ARCHIVED" | "WORKER_MISSING" | "PLAN_ARCHIVED" | "PLAN_MISSING";

export type ArchivedConfigurationConflict = {
  code: ArchivedConfigurationConflictCode;
  message: string;
};

export type ArchivedConfigurationEvaluation =
  | {
      adminResolutionOptions: [];
      auditRequired: false;
      conflicts: [];
      entriesPreserved: true;
      localSessionPreserved: true;
      message: string;
      newSessionAllowed: true;
      paymentBlocked: false;
      plan: ArchivedConfigurationReferenceView;
      recommendedSessionStatus: ArchivedConfigurationSessionSnapshot["status"];
      reviewRequired: false;
      status: "CONFIGURATION_ACCEPTS_SESSION";
      worker: ArchivedConfigurationReferenceView;
    }
  | {
      adminResolutionOptions: readonly ArchivedConfigurationResolutionOption[];
      auditRequired: true;
      conflicts: ArchivedConfigurationConflict[];
      entriesPreserved: true;
      localSessionPreserved: true;
      message: string;
      newSessionAllowed: false;
      paymentBlocked: true;
      plan: ArchivedConfigurationReferenceView;
      recommendedSessionStatus: "REVIEW_REQUIRED";
      reviewRequired: true;
      status: "ARCHIVED_CONFIGURATION_REVIEW_REQUIRED";
      worker: ArchivedConfigurationReferenceView;
    }
  | {
      adminResolutionOptions: readonly ["ACCEPT_HISTORICALLY"];
      auditRequired: true;
      conflicts: ArchivedConfigurationConflict[];
      entriesPreserved: true;
      localSessionPreserved: true;
      message: string;
      newSessionAllowed: false;
      paymentBlocked: false;
      plan: ArchivedConfigurationReferenceView;
      recommendedSessionStatus: ArchivedConfigurationSessionSnapshot["status"];
      reviewRequired: false;
      status: "HISTORICAL_CONFIGURATION_ACCEPTED";
      worker: ArchivedConfigurationReferenceView;
    }
  | {
      adminResolutionOptions: [];
      auditRequired: false;
      conflicts: ArchivedConfigurationConflict[];
      entriesPreserved: false;
      localSessionPreserved: false;
      message: string;
      newSessionAllowed: false;
      paymentBlocked: true;
      plan: ArchivedConfigurationReferenceView;
      recommendedSessionStatus: null;
      reviewRequired: false;
      status: "NEW_SESSION_BLOCKED";
      worker: ArchivedConfigurationReferenceView;
    };

export function evaluateArchivedConfigurationConflict({
  currentPlan,
  currentWorker,
  historicalAcceptanceApproved = false,
  mode,
  session
}: {
  currentPlan: SettlementPlanDocument | null;
  currentWorker: WorkerDocument | null;
  historicalAcceptanceApproved?: boolean;
  mode: ArchivedConfigurationCheckMode;
  session: ArchivedConfigurationSessionSnapshot;
}): ArchivedConfigurationEvaluation {
  assertSessionSnapshot(session);

  const worker = createWorkerView(session, currentWorker);
  const plan = createPlanView(session, currentPlan);
  const conflicts = createConfigurationConflicts(worker, plan);

  if (conflicts.length === 0) {
    return {
      adminResolutionOptions: [],
      auditRequired: false,
      conflicts: [],
      entriesPreserved: true,
      localSessionPreserved: true,
      message: "Konfiguracja nadal przyjmuje sesje.",
      newSessionAllowed: true,
      paymentBlocked: false,
      plan,
      recommendedSessionStatus: session.status,
      reviewRequired: false,
      status: "CONFIGURATION_ACCEPTS_SESSION",
      worker
    };
  }

  if (mode === "NEW_SESSION_ATTEMPT") {
    return {
      adminResolutionOptions: [],
      auditRequired: false,
      conflicts,
      entriesPreserved: false,
      localSessionPreserved: false,
      message: "Nie mozna otworzyc nowej sesji z archiwalna konfiguracja.",
      newSessionAllowed: false,
      paymentBlocked: true,
      plan,
      recommendedSessionStatus: null,
      reviewRequired: false,
      status: "NEW_SESSION_BLOCKED",
      worker
    };
  }

  if (historicalAcceptanceApproved) {
    return {
      adminResolutionOptions: ["ACCEPT_HISTORICALLY"],
      auditRequired: true,
      conflicts,
      entriesPreserved: true,
      localSessionPreserved: true,
      message:
        "Sesja zostaje przyjeta historycznie ze snapshotem zapisanym przed archiwizacja konfiguracji.",
      newSessionAllowed: false,
      paymentBlocked: false,
      plan,
      recommendedSessionStatus: session.status,
      reviewRequired: false,
      status: "HISTORICAL_CONFIGURATION_ACCEPTED",
      worker
    };
  }

  return {
    adminResolutionOptions: createResolutionOptions(conflicts),
    auditRequired: true,
    conflicts,
    entriesPreserved: true,
    localSessionPreserved: true,
    message:
      "Sesja pozostaje zapisana, ale konfiguracja zostala zarchiwizowana po rozpoczeciu pracy. Wymagana jest decyzja administratora.",
    newSessionAllowed: false,
    paymentBlocked: true,
    plan,
    recommendedSessionStatus: "REVIEW_REQUIRED",
    reviewRequired: true,
    status: "ARCHIVED_CONFIGURATION_REVIEW_REQUIRED",
    worker
  };
}

function createResolutionOptions(
  conflicts: readonly ArchivedConfigurationConflict[]
): ArchivedConfigurationResolutionOption[] {
  const options: ArchivedConfigurationResolutionOption[] = ["ACCEPT_HISTORICALLY"];

  if (conflicts.some((conflict) => conflict.code === "WORKER_ARCHIVED")) {
    options.push("REACTIVATE_WORKER");
  }

  if (conflicts.some((conflict) => conflict.code === "PLAN_ARCHIVED")) {
    options.push("REACTIVATE_PLAN");
  }

  options.push("CANCEL_SESSION");

  return options;
}

function createConfigurationConflicts(
  worker: ArchivedConfigurationReferenceView,
  plan: ArchivedConfigurationReferenceView
): ArchivedConfigurationConflict[] {
  const conflicts: ArchivedConfigurationConflict[] = [];

  if (worker.missing) {
    conflicts.push({
      code: "WORKER_MISSING",
      message: "Zbieracz ze snapshotu sesji nie istnieje w aktualnej konfiguracji."
    });
  } else if (worker.active === false) {
    conflicts.push({
      code: "WORKER_ARCHIVED",
      message: "Zbieracz ze snapshotu sesji jest archiwalny."
    });
  }

  if (plan.missing) {
    conflicts.push({
      code: "PLAN_MISSING",
      message: "Plan ze snapshotu sesji nie istnieje w aktualnej konfiguracji."
    });
  } else if (plan.active === false) {
    conflicts.push({
      code: "PLAN_ARCHIVED",
      message: "Plan ze snapshotu sesji jest archiwalny."
    });
  }

  return conflicts;
}

function createWorkerView(
  session: ArchivedConfigurationSessionSnapshot,
  worker: WorkerDocument | null
): ArchivedConfigurationReferenceView {
  if (!worker) {
    return {
      active: null,
      id: session.workerId,
      label: session.workerNameSnapshot,
      missing: true
    };
  }

  if (worker.id !== session.workerId) {
    throw new Error("Zbieracz konfliktu konfiguracji nie pasuje do snapshotu sesji.");
  }

  return {
    active: worker.active,
    id: worker.id,
    label: worker.displayName,
    missing: false
  };
}

function createPlanView(
  session: ArchivedConfigurationSessionSnapshot,
  plan: SettlementPlanDocument | null
): ArchivedConfigurationReferenceView {
  if (!plan) {
    return {
      active: null,
      id: session.planIdSnapshot,
      label: session.planNameSnapshot,
      missing: true
    };
  }

  if (plan.id !== session.planIdSnapshot) {
    throw new Error("Plan konfliktu konfiguracji nie pasuje do snapshotu sesji.");
  }

  return {
    active: plan.active,
    id: plan.id,
    label: plan.name,
    missing: false
  };
}

function assertSessionSnapshot(session: ArchivedConfigurationSessionSnapshot): void {
  normalizeRequiredText(session.id, "Sesja konfliktu konfiguracji wymaga ID.");
  normalizeRequiredText(
    session.workerId,
    "Sesja konfliktu konfiguracji wymaga zbieracza."
  );
  normalizeRequiredText(
    session.planIdSnapshot,
    "Sesja konfliktu konfiguracji wymaga planu."
  );
  normalizeBusinessDate(session.businessDate);
  normalizeEntryCount(session.totalEntryCount);
  normalizeOptionalAmount(session.amountDueGrosz);
}

function normalizeRequiredText(value: string, message: string): string {
  const trimmed = value.trim();

  if (!trimmed) {
    throw new Error(message);
  }

  return trimmed;
}

function normalizeBusinessDate(value: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(Date.parse(value))) {
    throw new Error("Data biznesowa konfliktu konfiguracji musi miec format YYYY-MM-DD.");
  }

  return value;
}

function normalizeEntryCount(value: number): number {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error("Liczba wpisow sesji musi byc nieujemna.");
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
