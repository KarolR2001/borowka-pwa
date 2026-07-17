import { getFirebaseServices } from "../config/firebaseServices";
import {
  SETTLEMENT_PLANS_COLLECTION,
  WORKERS_COLLECTION,
  WORKER_RATE_VERSIONS_COLLECTION,
  type SettlementPlanDocument,
  type WorkerDocument,
  type WorkerRateVersionDocument
} from "../domain/domainConfiguration";
import { formatKilograms, formatMoney } from "../domain/format";
import { decodeUserProfile, normalizeEmail, type UserProfile } from "../domain/identity";
import { decodeSettlementPlan, decodeWorkerRateVersion } from "../plans/settlementPlans";

type FirebaseEnv = Record<string, string | boolean | undefined>;

export type WorkerDirectoryScope = "ADMIN" | "OPERATOR";

export type WorkerDirectoryListInput = {
  viewerRole: WorkerDirectoryScope;
};

export type WorkerDocumentSnapshot = {
  id: string;
  data: unknown;
};

export type WorkerDirectoryUserSnapshot = {
  id: string;
  data: unknown;
};

export type InvalidWorker = {
  id: string;
  reason: string;
};

export type WorkerSeasonSummary = {
  totalKgGrams: number | null;
  earnedGrosz: number | null;
  paidGrosz: number | null;
  dueGrosz: number | null;
};

export type WorkerDirectoryListItem = WorkerDocument & {
  currentPlan: SettlementPlanDocument | null;
  currentRateVersion: WorkerRateVersionDocument | null;
  linkedUser: UserProfile | null;
  warnings: string[];
  seasonSummary: WorkerSeasonSummary;
};

export type InvalidWorkerDirectoryDocument = {
  id: string;
  reason: string;
};

export type WorkerDirectoryResult = {
  workers: WorkerDirectoryListItem[];
  plans: SettlementPlanDocument[];
  invalidWorkers: InvalidWorkerDirectoryDocument[];
  invalidPlans: InvalidWorkerDirectoryDocument[];
  invalidRateVersions: InvalidWorkerDirectoryDocument[];
  invalidProfiles: InvalidWorkerDirectoryDocument[];
};

export type WorkerActivityFilter = "ACTIVE" | "ARCHIVED" | "ALL";
export type WorkerSortKey = "NAME" | "TOTAL_KG" | "EARNED";

export type WorkerDirectoryFilters = {
  search: string;
  activity: WorkerActivityFilter;
  planId: string;
  sort: WorkerSortKey;
};

export type WorkerDecodeResult =
  | {
      status: "FOUND";
      worker: WorkerDocument;
    }
  | {
      status: "INVALID";
      reason: string;
    };

export const defaultWorkerDirectoryFilters: WorkerDirectoryFilters = {
  search: "",
  activity: "ALL",
  planId: "ALL",
  sort: "NAME"
};

export async function listWorkerDirectory(
  env: FirebaseEnv,
  input: WorkerDirectoryListInput
): Promise<WorkerDirectoryResult> {
  const { firestore } = await getFirebaseServices(env);
  const { collection, getDocs, query, where } = await import("firebase/firestore/lite");

  const workersQuery =
    input.viewerRole === "ADMIN"
      ? collection(firestore, WORKERS_COLLECTION)
      : query(collection(firestore, WORKERS_COLLECTION), where("active", "==", true));
  const plansQuery =
    input.viewerRole === "ADMIN"
      ? collection(firestore, SETTLEMENT_PLANS_COLLECTION)
      : query(
          collection(firestore, SETTLEMENT_PLANS_COLLECTION),
          where("active", "==", true)
        );
  const ratesQuery =
    input.viewerRole === "ADMIN"
      ? collection(firestore, WORKER_RATE_VERSIONS_COLLECTION)
      : query(
          collection(firestore, WORKER_RATE_VERSIONS_COLLECTION),
          where("active", "==", true)
        );

  const [workersSnapshot, plansSnapshot, rateVersionsSnapshot, usersSnapshot] =
    await Promise.all([
      getDocs(workersQuery),
      getDocs(plansQuery),
      getDocs(ratesQuery),
      input.viewerRole === "ADMIN"
        ? getDocs(collection(firestore, "users"))
        : Promise.resolve(null)
    ]);

  return buildWorkerDirectory({
    workerDocuments: workersSnapshot.docs.map((documentSnapshot) => ({
      id: documentSnapshot.id,
      data: documentSnapshot.data()
    })),
    planDocuments: plansSnapshot.docs.map((documentSnapshot) => ({
      id: documentSnapshot.id,
      data: documentSnapshot.data()
    })),
    rateVersionDocuments: rateVersionsSnapshot.docs.map((documentSnapshot) => ({
      id: documentSnapshot.id,
      data: documentSnapshot.data()
    })),
    userDocuments:
      usersSnapshot?.docs.map((documentSnapshot) => ({
        id: documentSnapshot.id,
        data: documentSnapshot.data()
      })) ?? []
  });
}

export function buildWorkerDirectory({
  workerDocuments,
  planDocuments,
  rateVersionDocuments,
  userDocuments
}: {
  workerDocuments: WorkerDocumentSnapshot[];
  planDocuments: WorkerDocumentSnapshot[];
  rateVersionDocuments: WorkerDocumentSnapshot[];
  userDocuments: WorkerDirectoryUserSnapshot[];
}): WorkerDirectoryResult {
  const workers: WorkerDocument[] = [];
  const invalidWorkers: InvalidWorkerDirectoryDocument[] = [];
  const plans: SettlementPlanDocument[] = [];
  const invalidPlans: InvalidWorkerDirectoryDocument[] = [];
  const rateVersions: WorkerRateVersionDocument[] = [];
  const invalidRateVersions: InvalidWorkerDirectoryDocument[] = [];
  const profiles: UserProfile[] = [];
  const invalidProfiles: InvalidWorkerDirectoryDocument[] = [];

  for (const document of workerDocuments) {
    const decoded = decodeWorker(document.id, document.data);

    if (decoded.status === "FOUND") {
      workers.push(decoded.worker);
    } else {
      invalidWorkers.push({
        id: document.id,
        reason: decoded.reason
      });
    }
  }

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

  for (const document of userDocuments) {
    const decoded = decodeUserProfile(document.id, document.data);

    if (decoded.status === "FOUND") {
      profiles.push(decoded.profile);
    } else {
      invalidProfiles.push({
        id: document.id,
        reason: decoded.reason
      });
    }
  }

  const planById = new Map(plans.map((plan) => [plan.id, plan]));
  const rateVersionById = new Map(
    rateVersions.map((rateVersion) => [rateVersion.id, rateVersion])
  );
  const profileByUid = new Map(profiles.map((profile) => [profile.uid, profile]));

  return {
    workers: sortWorkers(
      workers.map((worker) =>
        buildWorkerListItem(worker, {
          currentPlan: planById.get(worker.currentPlanId) ?? null,
          currentRateVersion: rateVersionById.get(worker.currentRateVersionId) ?? null,
          linkedUser: worker.linkedUserUid
            ? (profileByUid.get(worker.linkedUserUid) ?? null)
            : null
        })
      )
    ),
    plans: sortPlans(plans),
    invalidWorkers: sortInvalidDocuments(invalidWorkers),
    invalidPlans: sortInvalidDocuments(invalidPlans),
    invalidRateVersions: sortInvalidDocuments(invalidRateVersions),
    invalidProfiles: sortInvalidDocuments(invalidProfiles)
  };
}

export function decodeWorker(expectedId: string, data: unknown): WorkerDecodeResult {
  if (!isRecord(data)) {
    return invalidWorker("Zbieracz ma nieprawidlowy format.");
  }

  const id = readRequiredString(data, "id");
  const displayName = readRequiredString(data, "displayName");
  const normalizedName = readRequiredString(data, "normalizedName");
  const currentPlanId = readRequiredString(data, "currentPlanId");
  const currentRateVersionId = readRequiredString(data, "currentRateVersionId");
  const linkedUserUid = data.linkedUserUid ?? null;
  const phone = data.phone ?? null;
  const emailContact = data.emailContact ?? null;
  const notes = data.notes ?? null;
  const createdBy = readRequiredString(data, "createdBy");
  const legacyName = data.legacyName ?? null;

  if (!id || id !== expectedId) {
    return invalidWorker("Zbieracz ma niezgodny identyfikator.");
  }

  if (!displayName || !normalizedName || !currentPlanId || !currentRateVersionId) {
    return invalidWorker("Zbieracz nie ma wymaganych danych.");
  }

  if (typeof data.active !== "boolean") {
    return invalidWorker("Zbieracz ma nieprawidlowy status aktywnosci.");
  }

  if (!createdBy) {
    return invalidWorker("Zbieracz nie ma autora utworzenia.");
  }

  if (linkedUserUid !== null && typeof linkedUserUid !== "string") {
    return invalidWorker("Zbieracz ma nieprawidlowe powiazanie konta.");
  }

  if (phone !== null && typeof phone !== "string") {
    return invalidWorker("Zbieracz ma nieprawidlowy telefon.");
  }

  if (emailContact !== null && typeof emailContact !== "string") {
    return invalidWorker("Zbieracz ma nieprawidlowy e-mail kontaktowy.");
  }

  if (notes !== null && typeof notes !== "string") {
    return invalidWorker("Zbieracz ma nieprawidlowe notatki.");
  }

  if (legacyName !== null && typeof legacyName !== "string") {
    return invalidWorker("Zbieracz ma nieprawidlowa nazwe legacy.");
  }

  return {
    status: "FOUND",
    worker: {
      id,
      displayName,
      normalizedName,
      active: data.active,
      currentPlanId,
      currentRateVersionId,
      linkedUserUid,
      phone,
      emailContact,
      notes,
      createdAt: data.createdAt,
      createdBy,
      updatedAt: data.updatedAt,
      archivedAt: data.archivedAt ?? null,
      legacyName
    }
  };
}

export function filterWorkerDirectory(
  workers: WorkerDirectoryListItem[],
  filters: WorkerDirectoryFilters
): WorkerDirectoryListItem[] {
  const search = normalizeEmail(filters.search);

  return sortFilteredWorkers(
    workers.filter((worker) => {
      if (filters.activity === "ACTIVE" && !worker.active) {
        return false;
      }

      if (filters.activity === "ARCHIVED" && worker.active) {
        return false;
      }

      if (filters.planId !== "ALL" && worker.currentPlanId !== filters.planId) {
        return false;
      }

      if (!search) {
        return true;
      }

      return searchableWorkerText(worker).includes(search);
    }),
    filters.sort
  );
}

export function workerStatusLabel(worker: Pick<WorkerDirectoryListItem, "active">) {
  return worker.active ? "Aktywny" : "Archiwalny";
}

export function workerRateLabel(
  rateVersion: WorkerRateVersionDocument | null | undefined
): string {
  return rateVersion ? formatMoney(rateVersion.rateGroszPerUnit) : "brak";
}

export function workerUnitLabel(plan: SettlementPlanDocument | null | undefined): string {
  return plan ? plan.unitSymbol : "brak";
}

export function workerSummaryKgLabel(value: number | null): string {
  return value === null ? "brak danych" : formatKilograms(value);
}

export function workerSummaryMoneyLabel(value: number | null): string {
  return value === null ? "brak danych" : formatMoney(value);
}

export function isWorkerActivityFilter(
  value: string
): value is WorkerDirectoryFilters["activity"] {
  return value === "ALL" || value === "ACTIVE" || value === "ARCHIVED";
}

export function isWorkerSortKey(value: string): value is WorkerDirectoryFilters["sort"] {
  return value === "NAME" || value === "TOTAL_KG" || value === "EARNED";
}

function buildWorkerListItem(
  worker: WorkerDocument,
  relations: {
    currentPlan: SettlementPlanDocument | null;
    currentRateVersion: WorkerRateVersionDocument | null;
    linkedUser: UserProfile | null;
  }
): WorkerDirectoryListItem {
  return {
    ...worker,
    currentPlan: relations.currentPlan,
    currentRateVersion: relations.currentRateVersion,
    linkedUser: relations.linkedUser,
    warnings: workerWarnings(worker, relations),
    seasonSummary: {
      totalKgGrams: null,
      earnedGrosz: null,
      paidGrosz: null,
      dueGrosz: null
    }
  };
}

function workerWarnings(
  worker: WorkerDocument,
  relations: {
    currentPlan: SettlementPlanDocument | null;
    currentRateVersion: WorkerRateVersionDocument | null;
    linkedUser: UserProfile | null;
  }
): string[] {
  const warnings: string[] = [];

  if (!relations.currentPlan) {
    warnings.push("Brak aktualnego planu.");
  } else if (!relations.currentPlan.active) {
    warnings.push("Aktualny plan jest archiwalny.");
  }

  if (!relations.currentRateVersion) {
    warnings.push("Brak aktualnej stawki.");
  } else {
    if (relations.currentRateVersion.workerId !== worker.id) {
      warnings.push("Aktualna stawka wskazuje innego zbieracza.");
    }

    if (relations.currentRateVersion.planId !== worker.currentPlanId) {
      warnings.push("Aktualna stawka wskazuje inny plan.");
    }

    if (!relations.currentRateVersion.active) {
      warnings.push("Aktualna stawka jest nieaktywna.");
    }
  }

  if (worker.linkedUserUid && !relations.linkedUser) {
    warnings.push("Brak powiazanego profilu konta.");
  }

  if (
    worker.linkedUserUid &&
    relations.linkedUser &&
    relations.linkedUser.workerId !== worker.id
  ) {
    warnings.push("Powiazany profil ma inny workerId.");
  }

  if (worker.active && worker.archivedAt !== null) {
    warnings.push("Aktywny zbieracz ma date archiwizacji.");
  }

  return warnings;
}

function sortWorkers(workers: WorkerDirectoryListItem[]): WorkerDirectoryListItem[] {
  return sortFilteredWorkers(workers, "NAME");
}

function sortFilteredWorkers(
  workers: WorkerDirectoryListItem[],
  sort: WorkerSortKey
): WorkerDirectoryListItem[] {
  return [...workers].sort((left, right) => {
    if (sort === "TOTAL_KG") {
      const totalKgDiff = compareNullableDesc(
        left.seasonSummary.totalKgGrams,
        right.seasonSummary.totalKgGrams
      );

      if (totalKgDiff !== 0) {
        return totalKgDiff;
      }
    }

    if (sort === "EARNED") {
      const earnedDiff = compareNullableDesc(
        left.seasonSummary.earnedGrosz,
        right.seasonSummary.earnedGrosz
      );

      if (earnedDiff !== 0) {
        return earnedDiff;
      }
    }

    if (left.active !== right.active) {
      return left.active ? -1 : 1;
    }

    const nameDiff = left.displayName.localeCompare(right.displayName, "pl", {
      sensitivity: "base"
    });

    if (nameDiff !== 0) {
      return nameDiff;
    }

    return left.id.localeCompare(right.id, "pl");
  });
}

function compareNullableDesc(left: number | null, right: number | null): number {
  if (left === null && right === null) {
    return 0;
  }

  if (left === null) {
    return 1;
  }

  if (right === null) {
    return -1;
  }

  return right - left;
}

function searchableWorkerText(worker: WorkerDirectoryListItem): string {
  return normalizeEmail(
    [
      worker.id,
      worker.displayName,
      worker.normalizedName,
      worker.currentPlan?.name ?? "",
      worker.currentPlan?.code ?? "",
      worker.linkedUser?.email ?? "",
      worker.linkedUser?.displayName ?? "",
      worker.linkedUserUid ?? ""
    ].join(" ")
  );
}

function sortPlans(plans: SettlementPlanDocument[]): SettlementPlanDocument[] {
  return [...plans].sort((left, right) => {
    if (left.active !== right.active) {
      return left.active ? -1 : 1;
    }

    return left.name.localeCompare(right.name, "pl", {
      sensitivity: "base"
    });
  });
}

function sortInvalidDocuments(
  documents: InvalidWorkerDirectoryDocument[]
): InvalidWorkerDirectoryDocument[] {
  return [...documents].sort((left, right) => left.id.localeCompare(right.id, "pl"));
}

function invalidWorker(reason: string): WorkerDecodeResult {
  return {
    status: "INVALID",
    reason
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readRequiredString(data: Record<string, unknown>, key: string): string | null {
  const value = data[key];

  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}
