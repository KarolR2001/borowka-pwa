import {
  AUDIT_EVENTS_COLLECTION,
  createAuditEventDraft,
  createAuditEventId,
  type AuditAction,
  type AuditSummary
} from "../audit/auditEvents";
import { getFirebaseServices } from "../config/firebaseServices";
import {
  SETTLEMENT_PLANS_COLLECTION,
  WORKER_RATE_VERSIONS_COLLECTION,
  type SettlementCalculationBasis,
  type SettlementPlanDocument,
  type WorkerRateVersionDocument
} from "../domain/domainConfiguration";
import { formatMoney } from "../domain/format";
import type { UserProfile } from "../domain/identity";

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

export type CreateSettlementPlanInput = {
  actorProfile: UserProfile;
  name: string;
  code: string;
  calculationBasis: SettlementCalculationBasis;
  unitLabelSingular: string;
  unitLabelPlural: string;
  unitSymbol: string;
  quantityPrecision: number;
  weightRequired: boolean;
  allowBatchQuantity: boolean;
  description?: string | null;
  deviceId: string;
};

export type PreparedSettlementPlanCreate = {
  plan: SettlementPlanDocument;
  auditAction: AuditAction;
  beforeSummary: AuditSummary | null;
  afterSummary: AuditSummary;
  reason: string | null;
  deviceId: string;
  inventoryWarning: string | null;
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

export async function createSettlementPlan(
  env: FirebaseEnv,
  input: CreateSettlementPlanInput
): Promise<PreparedSettlementPlanCreate> {
  const { firestore } = await getFirebaseServices(env);
  const { Timestamp, doc, serverTimestamp, writeBatch } =
    await import("firebase/firestore/lite");
  const currentDirectory = await listSettlementPlansDirectory(env);
  const prepared = prepareSettlementPlanCreate(currentDirectory.plans, {
    ...input,
    createdAt: serverTimestamp()
  });
  const auditId = createAuditEventId();
  const batch = writeBatch(firestore);

  batch.set(doc(firestore, SETTLEMENT_PLANS_COLLECTION, prepared.plan.id), prepared.plan);
  batch.set(
    doc(firestore, AUDIT_EVENTS_COLLECTION, auditId),
    createAuditEventDraft({
      id: auditId,
      actorUid: input.actorProfile.uid,
      actorRoleSnapshot: input.actorProfile.role,
      action: prepared.auditAction,
      entityType: "SETTLEMENT_PLAN",
      entityId: prepared.plan.id,
      beforeSummary: prepared.beforeSummary,
      afterSummary: prepared.afterSummary,
      reason: prepared.reason,
      createdAtDevice: Timestamp.now(),
      createdAtServer: serverTimestamp(),
      deviceId: prepared.deviceId
    })
  );

  await batch.commit();

  return prepared;
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

export function prepareSettlementPlanCreate(
  existingPlans: SettlementPlanDocument[],
  input: CreateSettlementPlanInput & { createdAt: unknown }
): PreparedSettlementPlanCreate {
  assertAdmin(input.actorProfile);

  const name = normalizeRequiredText(input.name, "Podaj nazwe planu.");
  const code = normalizePlanCode(input.code);
  const id = createSettlementPlanId(code);
  const unitLabelSingular = normalizeRequiredText(
    input.unitLabelSingular,
    "Podaj etykiete jednostki w liczbie pojedynczej."
  );
  const unitLabelPlural = normalizeRequiredText(
    input.unitLabelPlural,
    "Podaj etykiete jednostki w liczbie mnogiej."
  );
  const unitSymbol = normalizeRequiredText(input.unitSymbol, "Podaj symbol jednostki.");
  const quantityPrecision = normalizeQuantityPrecision(input.quantityPrecision);
  const deviceId = normalizeRequiredText(
    input.deviceId,
    "Brak identyfikatora urzadzenia dla audytu."
  );

  if (
    existingPlans.some((plan) => plan.id === id || normalizePlanCode(plan.code) === code)
  ) {
    throw new Error("Kod planu musi byc unikalny.");
  }

  if (!isSettlementCalculationBasis(input.calculationBasis)) {
    throw new Error("Wybierz poprawna podstawe rozliczenia.");
  }

  if (input.calculationBasis === "WEIGHT" && !input.weightRequired) {
    throw new Error("Plan wagowy musi wymagac wagi.");
  }

  const description = normalizeOptionalText(input.description);
  const inventoryWarning =
    input.calculationBasis === "QUANTITY" && !input.weightRequired
      ? "Wpis bez wagi nie zwiekszy stanu kilogramow w magazynie."
      : null;
  const plan: SettlementPlanDocument = {
    id,
    name,
    code,
    calculationBasis: input.calculationBasis,
    unitLabelSingular,
    unitLabelPlural,
    unitSymbol,
    quantityPrecision,
    weightRequired: input.weightRequired,
    allowBatchQuantity: input.allowBatchQuantity,
    description,
    active: true,
    systemDefault: false,
    createdAt: input.createdAt,
    createdBy: input.actorProfile.uid,
    archivedAt: null
  };

  return {
    plan,
    auditAction: "SETTLEMENT_PLAN_CREATED",
    beforeSummary: null,
    afterSummary: settlementPlanAuditSummary(plan),
    reason: inventoryWarning,
    deviceId,
    inventoryWarning
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

export function createSettlementPlanExample(
  input: Pick<
    CreateSettlementPlanInput,
    | "calculationBasis"
    | "quantityPrecision"
    | "unitLabelSingular"
    | "unitLabelPlural"
    | "unitSymbol"
  >
): string {
  const quantity = input.calculationBasis === "WEIGHT" ? 8.425 : 3.5;
  const rateGrosz = input.calculationBasis === "WEIGHT" ? 1000 : 1500;
  const quantityPrecision =
    input.calculationBasis === "WEIGHT"
      ? 3
      : Math.min(Math.max(input.quantityPrecision, 0), 3);
  const unit =
    input.calculationBasis === "WEIGHT"
      ? input.unitSymbol || "kg"
      : input.unitLabelPlural || input.unitSymbol || "jednostki";
  const amountGrosz = Math.round(quantity * rateGrosz);

  return `${formatPlanQuantity(quantity, quantityPrecision)} ${unit} x ${formatMoney(
    rateGrosz
  )} = ${formatMoney(amountGrosz)}`;
}

export function createSettlementPlanId(code: string): string {
  return `plan-${normalizePlanCode(code).toLocaleLowerCase("pl-PL").replace(/_/g, "-")}`;
}

export function normalizePlanCode(code: string): string {
  const normalized = code
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleUpperCase("pl-PL")
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .replace(/_+/g, "_");

  if (!/^[A-Z0-9_]{2,40}$/.test(normalized)) {
    throw new Error("Kod planu musi miec od 2 do 40 znakow A-Z, 0-9 lub _.");
  }

  return normalized;
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

function normalizeQuantityPrecision(value: number): number {
  if (!isQuantityPrecision(value)) {
    throw new Error("Precyzja musi byc liczba calkowita od 0 do 3.");
  }

  return value;
}

function settlementPlanAuditSummary(plan: SettlementPlanDocument): AuditSummary {
  return {
    planId: plan.id,
    name: plan.name,
    code: plan.code,
    calculationBasis: plan.calculationBasis,
    unitSymbol: plan.unitSymbol,
    quantityPrecision: plan.quantityPrecision,
    weightRequired: plan.weightRequired,
    allowBatchQuantity: plan.allowBatchQuantity,
    active: plan.active
  };
}

function assertAdmin(profile: UserProfile): void {
  if (
    profile.role !== "ADMIN" ||
    !profile.active ||
    profile.registrationStatus !== "APPROVED"
  ) {
    throw new Error("Operacja planu wymaga aktywnego administratora.");
  }
}

function normalizeRequiredText(value: string, message: string): string {
  const trimmed = value.trim().replace(/\s+/g, " ");

  if (!trimmed) {
    throw new Error(message);
  }

  return trimmed;
}

function normalizeOptionalText(value: string | null | undefined): string | null {
  if (value === null || value === undefined || value.trim() === "") {
    return null;
  }

  return value.trim().replace(/\s+/g, " ");
}

function formatPlanQuantity(value: number, fractionDigits: number): string {
  return new Intl.NumberFormat("pl-PL", {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits
  }).format(value);
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
