import { getFirebaseServices } from "../config/firebaseServices";
import {
  SETTLEMENT_PLANS_COLLECTION,
  WORKER_RATE_VERSIONS_COLLECTION,
  type SettlementCalculationBasis,
  type SettlementPlanDocument,
  type WorkerRateVersionDocument
} from "../domain/domainConfiguration";

type FirebaseEnv = Record<string, string | boolean | undefined>;

export type SettlementPlanDocumentSnapshot = {
  id: string;
  data: unknown;
};

export type WorkerRateVersionDocumentSnapshot = {
  id: string;
  data: unknown;
};

export type InvalidSettlementPlan = {
  id: string;
  reason: string;
};

export type InvalidWorkerRateVersion = {
  id: string;
  reason: string;
};

export type SettlementPlanListItem = SettlementPlanDocument & {
  activeRateCount: number;
  rateVersionCount: number;
  wasUsed: boolean;
};

export type SettlementPlansDirectoryResult = {
  plans: SettlementPlanListItem[];
  invalidPlans: InvalidSettlementPlan[];
  invalidRateVersions: InvalidWorkerRateVersion[];
};

export type SettlementPlanBasisFilter = SettlementCalculationBasis | "ALL";
export type SettlementPlanStatusFilter = "ACTIVE" | "ARCHIVED" | "ALL";

export type SettlementPlanFilters = {
  search: string;
  basis: SettlementPlanBasisFilter;
  status: SettlementPlanStatusFilter;
};

export type SettlementPlanDecodeResult =
  | {
      status: "FOUND";
      plan: SettlementPlanDocument;
    }
  | {
      status: "INVALID";
      reason: string;
    };

export type WorkerRateVersionDecodeResult =
  | {
      status: "FOUND";
      rateVersion: WorkerRateVersionDocument;
    }
  | {
      status: "INVALID";
      reason: string;
    };

export const defaultSettlementPlanFilters: SettlementPlanFilters = {
  search: "",
  basis: "ALL",
  status: "ALL"
};

export async function listSettlementPlansDirectory(
  env: FirebaseEnv
): Promise<SettlementPlansDirectoryResult> {
  const { firestore } = await getFirebaseServices(env);
  const { collection, getDocs } = await import("firebase/firestore/lite");
  const [plansSnapshot, rateVersionsSnapshot] = await Promise.all([
    getDocs(collection(firestore, SETTLEMENT_PLANS_COLLECTION)),
    getDocs(collection(firestore, WORKER_RATE_VERSIONS_COLLECTION))
  ]);

  return buildSettlementPlansDirectory(
    plansSnapshot.docs.map((documentSnapshot) => ({
      id: documentSnapshot.id,
      data: documentSnapshot.data()
    })),
    rateVersionsSnapshot.docs.map((documentSnapshot) => ({
      id: documentSnapshot.id,
      data: documentSnapshot.data()
    }))
  );
}

export function buildSettlementPlansDirectory(
  planDocuments: SettlementPlanDocumentSnapshot[],
  rateVersionDocuments: WorkerRateVersionDocumentSnapshot[]
): SettlementPlansDirectoryResult {
  const plans: SettlementPlanDocument[] = [];
  const invalidPlans: InvalidSettlementPlan[] = [];
  const rateVersions: WorkerRateVersionDocument[] = [];
  const invalidRateVersions: InvalidWorkerRateVersion[] = [];

  for (const document of planDocuments) {
    const decoded = decodeSettlementPlan(document.id, document.data);

    if (decoded.status === "FOUND") {
      plans.push(decoded.plan);
    } else {
      invalidPlans.push({
        id: document.id,
        reason: decoded.reason
      });
    }
  }

  for (const document of rateVersionDocuments) {
    const decoded = decodeWorkerRateVersion(document.id, document.data);

    if (decoded.status === "FOUND") {
      rateVersions.push(decoded.rateVersion);
    } else {
      invalidRateVersions.push({
        id: document.id,
        reason: decoded.reason
      });
    }
  }

  return {
    plans: sortSettlementPlans(plans.map((plan) => addPlanMetrics(plan, rateVersions))),
    invalidPlans: invalidPlans.sort((left, right) =>
      left.id.localeCompare(right.id, "pl")
    ),
    invalidRateVersions: invalidRateVersions.sort((left, right) =>
      left.id.localeCompare(right.id, "pl")
    )
  };
}

export function decodeSettlementPlan(
  expectedId: string,
  data: unknown
): SettlementPlanDecodeResult {
  if (!isRecord(data)) {
    return invalidSettlementPlan("Plan ma nieprawidlowy format.");
  }

  const id = readRequiredString(data, "id");
  const name = readRequiredString(data, "name");
  const code = readRequiredString(data, "code");
  const calculationBasis = data.calculationBasis;
  const unitLabelSingular = readRequiredString(data, "unitLabelSingular");
  const unitLabelPlural = readRequiredString(data, "unitLabelPlural");
  const unitSymbol = readRequiredString(data, "unitSymbol");
  const quantityPrecision = data.quantityPrecision;
  const weightRequired = data.weightRequired;
  const allowBatchQuantity = data.allowBatchQuantity;
  const description = data.description ?? null;
  const active = data.active;
  const systemDefault = data.systemDefault;
  const createdBy = readRequiredString(data, "createdBy");

  if (!id || id !== expectedId) {
    return invalidSettlementPlan("Plan ma niezgodny identyfikator.");
  }

  if (
    !name ||
    !code ||
    !unitLabelSingular ||
    !unitLabelPlural ||
    !unitSymbol ||
    !createdBy
  ) {
    return invalidSettlementPlan("Plan nie ma wymaganych danych.");
  }

  if (!isSettlementCalculationBasis(calculationBasis)) {
    return invalidSettlementPlan("Plan ma nieznana podstawe rozliczenia.");
  }

  if (!isQuantityPrecision(quantityPrecision)) {
    return invalidSettlementPlan("Plan ma nieobslugiwana precyzje ilosci.");
  }

  if (calculationBasis === "WEIGHT" && weightRequired !== true) {
    return invalidSettlementPlan("Plan wagowy musi wymagac wagi.");
  }

  if (typeof weightRequired !== "boolean") {
    return invalidSettlementPlan("Plan ma nieprawidlowe wymaganie wagi.");
  }

  if (typeof allowBatchQuantity !== "boolean") {
    return invalidSettlementPlan("Plan ma nieprawidlowe ustawienie wpisu zbiorczego.");
  }

  if (description !== null && typeof description !== "string") {
    return invalidSettlementPlan("Plan ma nieprawidlowy opis.");
  }

  if (typeof active !== "boolean") {
    return invalidSettlementPlan("Plan ma nieprawidlowy status aktywnosci.");
  }

  if (typeof systemDefault !== "boolean") {
    return invalidSettlementPlan("Plan ma nieprawidlowy status systemowy.");
  }

  return {
    status: "FOUND",
    plan: {
      id,
      name,
      code,
      calculationBasis,
      unitLabelSingular,
      unitLabelPlural,
      unitSymbol,
      quantityPrecision,
      weightRequired,
      allowBatchQuantity,
      description,
      active,
      systemDefault,
      createdAt: data.createdAt,
      createdBy,
      archivedAt: data.archivedAt ?? null
    }
  };
}

export function decodeWorkerRateVersion(
  expectedId: string,
  data: unknown
): WorkerRateVersionDecodeResult {
  if (!isRecord(data)) {
    return invalidWorkerRateVersion("Wersja stawki ma nieprawidlowy format.");
  }

  const id = readRequiredString(data, "id");
  const workerId = readRequiredString(data, "workerId");
  const planId = readRequiredString(data, "planId");
  const rateGroszPerUnit = data.rateGroszPerUnit;
  const validFrom = readRequiredString(data, "validFrom");
  const validTo = data.validTo ?? null;
  const active = data.active;
  const note = data.note ?? null;
  const createdBy = readRequiredString(data, "createdBy");
  const supersedesRateId = data.supersedesRateId ?? null;

  if (!id || id !== expectedId) {
    return invalidWorkerRateVersion("Wersja stawki ma niezgodny identyfikator.");
  }

  if (!workerId || !planId || !validFrom || !createdBy) {
    return invalidWorkerRateVersion("Wersja stawki nie ma wymaganych danych.");
  }

  if (
    typeof rateGroszPerUnit !== "number" ||
    !Number.isInteger(rateGroszPerUnit) ||
    rateGroszPerUnit < 0
  ) {
    return invalidWorkerRateVersion("Wersja stawki ma nieprawidlowa kwote.");
  }

  if (!isBusinessDate(validFrom)) {
    return invalidWorkerRateVersion("Wersja stawki ma nieprawidlowa date poczatku.");
  }

  if (validTo !== null && (typeof validTo !== "string" || !isBusinessDate(validTo))) {
    return invalidWorkerRateVersion("Wersja stawki ma nieprawidlowa date konca.");
  }

  if (validTo !== null && validTo < validFrom) {
    return invalidWorkerRateVersion("Wersja stawki ma odwrocony okres.");
  }

  if (typeof active !== "boolean") {
    return invalidWorkerRateVersion("Wersja stawki ma nieprawidlowy status aktywnosci.");
  }

  if (note !== null && typeof note !== "string") {
    return invalidWorkerRateVersion("Wersja stawki ma nieprawidlowa notatke.");
  }

  if (supersedesRateId !== null && typeof supersedesRateId !== "string") {
    return invalidWorkerRateVersion("Wersja stawki ma nieprawidlowego poprzednika.");
  }

  return {
    status: "FOUND",
    rateVersion: {
      id,
      workerId,
      planId,
      rateGroszPerUnit,
      validFrom,
      validTo,
      active,
      note,
      createdAt: data.createdAt,
      createdBy,
      supersedesRateId
    }
  };
}

export function filterSettlementPlans(
  plans: SettlementPlanListItem[],
  filters: SettlementPlanFilters
): SettlementPlanListItem[] {
  const search = filters.search.trim().toLocaleLowerCase("pl-PL");

  return plans.filter((plan) => {
    if (filters.basis !== "ALL" && plan.calculationBasis !== filters.basis) {
      return false;
    }

    if (filters.status === "ACTIVE" && !plan.active) {
      return false;
    }

    if (filters.status === "ARCHIVED" && plan.active) {
      return false;
    }

    if (!search) {
      return true;
    }

    return (
      plan.name.toLocaleLowerCase("pl-PL").includes(search) ||
      plan.code.toLocaleLowerCase("pl-PL").includes(search) ||
      plan.unitSymbol.toLocaleLowerCase("pl-PL").includes(search)
    );
  });
}

export function settlementCalculationBasisLabel(
  basis: SettlementCalculationBasis
): string {
  switch (basis) {
    case "WEIGHT":
      return "Waga";
    case "QUANTITY":
      return "Ilosc";
  }
}

export function settlementPlanStatusLabel(plan: Pick<SettlementPlanListItem, "active">) {
  return plan.active ? "Aktywny" : "Archiwalny";
}

export function isSettlementCalculationBasis(
  value: unknown
): value is SettlementCalculationBasis {
  return value === "WEIGHT" || value === "QUANTITY";
}

function addPlanMetrics(
  plan: SettlementPlanDocument,
  rateVersions: WorkerRateVersionDocument[]
): SettlementPlanListItem {
  const planRateVersions = rateVersions.filter(
    (rateVersion) => rateVersion.planId === plan.id
  );

  return {
    ...plan,
    activeRateCount: planRateVersions.filter((rateVersion) => rateVersion.active).length,
    rateVersionCount: planRateVersions.length,
    wasUsed: planRateVersions.length > 0
  };
}

function sortSettlementPlans(plans: SettlementPlanListItem[]): SettlementPlanListItem[] {
  return [...plans].sort((left, right) => {
    if (left.active !== right.active) {
      return left.active ? -1 : 1;
    }

    if (left.systemDefault !== right.systemDefault) {
      return left.systemDefault ? -1 : 1;
    }

    return left.name.localeCompare(right.name, "pl");
  });
}

function isQuantityPrecision(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= 3;
}

function isBusinessDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }

  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function readRequiredString(data: Record<string, unknown>, key: string): string | null {
  const value = data[key];

  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();

  return trimmed.length > 0 ? trimmed : null;
}

function invalidSettlementPlan(reason: string): SettlementPlanDecodeResult {
  return {
    status: "INVALID",
    reason
  };
}

function invalidWorkerRateVersion(reason: string): WorkerRateVersionDecodeResult {
  return {
    status: "INVALID",
    reason
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
