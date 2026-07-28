import { getFirebaseServices } from "../config/firebaseServices";
import type { UserProfile } from "../domain/identity";
import {
  decodeHarvestEntry,
  decodeHarvestSession
} from "../harvest/harvestSessionDashboard";
import {
  HARVEST_ENTRIES_COLLECTION,
  HARVEST_SESSIONS_COLLECTION
} from "../harvest/harvestSessionState";
import {
  defaultFirestoreSyncJournal,
  type FirestoreSyncJournal
} from "../offline/firestoreSyncJournal";
import { queueOfflineFirestoreBatch } from "../offline/offlineFirestoreQueue";
import { paymentTimestampToIso } from "../payments/paymentWrite";

type FirebaseEnv = Record<string, string | boolean | undefined>;
type RawDocument = { data: unknown; id: string; pendingSync: boolean };

export const ISSUE_REPORTS_COLLECTION = "issueReports";
export const ISSUE_REPORT_SUBJECTS = [
  "SESSION",
  "ENTRY",
  "AMOUNT",
  "PAYMENT_STATUS"
] as const;
export const ISSUE_REPORT_STATUSES = ["OPEN", "RESOLVED", "REJECTED"] as const;

export type IssueReportSubject = (typeof ISSUE_REPORT_SUBJECTS)[number];
export type IssueReportStatus = (typeof ISSUE_REPORT_STATUSES)[number];

export type IssueReportDocument = {
  createdAt: unknown;
  entryId: string | null;
  id: string;
  message: string;
  reporterUid: string;
  resolutionNote: string | null;
  resolvedAt: unknown;
  resolvedBy: string | null;
  seasonId: string;
  sessionId: string;
  status: IssueReportStatus;
  subject: IssueReportSubject;
  workerId: string;
};

export type CreateIssueReportInput = {
  actorProfile: UserProfile;
  deviceId: string;
  entryId: string | null;
  isOnline: boolean;
  message: string;
  sessionId: string;
  subject: IssueReportSubject;
};

export type CreateIssueReportResult = {
  id: string;
  message: string;
  status: "CREATED" | "QUEUED";
};

export type IssueReportDependencies = {
  journal?: FirestoreSyncJournal;
};

export type PickerIssueReportItem = {
  createdAtIso: string | null;
  entryId: string | null;
  id: string;
  message: string;
  pendingSync: boolean;
  resolutionNote: string | null;
  resolvedAtIso: string | null;
  seasonId: string;
  sessionId: string;
  status: IssueReportStatus;
  subject: IssueReportSubject;
};

export type PickerIssueReportListResult = {
  dataSource: "SERVER" | "CACHE";
  invalidReportCount: number;
  reports: PickerIssueReportItem[];
};

export type AdminIssueReportItem = PickerIssueReportItem & {
  reporterUid: string;
  resolvedBy: string | null;
  workerId: string;
};

export type AdminIssueReportListResult = {
  invalidReportCount: number;
  reports: AdminIssueReportItem[];
};

export type ResolveIssueReportInput = {
  actorProfile: UserProfile;
  reportId: string;
  resolutionNote: string;
  status: Extract<IssueReportStatus, "RESOLVED" | "REJECTED">;
};

export type IssueReportSource = {
  entry: {
    id: string;
    quantityMilli: number;
    sequenceNumber: number;
    status: "ACTIVE" | "CANCELLED";
    weightG: number | null;
  } | null;
  session: {
    amountDueGrosz: number | null;
    businessDate: string;
    id: string;
    paymentId: string | null;
    seasonId: string;
    status: string;
    workerId: string;
    workerName: string;
  };
};

export async function createIssueReport(
  env: FirebaseEnv,
  input: CreateIssueReportInput,
  dependencies: IssueReportDependencies = {}
): Promise<CreateIssueReportResult> {
  const workerId = assertPicker(input.actorProfile);
  const deviceId = normalizeId(input.deviceId, "Urzadzenie");

  const sessionId = normalizeId(input.sessionId, "Sesja");
  const message = normalizeMessage(input.message, 5, 500, "Opis zgloszenia");
  const subject = normalizeSubject(input.subject);
  const entryId =
    subject === "ENTRY"
      ? normalizeId(input.entryId ?? "", "Wpis")
      : input.entryId === null
        ? null
        : fail("Identyfikator wpisu jest dozwolony tylko dla zgloszenia wpisu.");
  const { firestore } = await getFirebaseServices(env);
  const { doc, getDoc, getDocFromCache, serverTimestamp, setDoc, writeBatch } =
    await import("firebase/firestore");
  const readDocument = input.isOnline ? getDoc : getDocFromCache;
  const sessionSnapshot = await readDocument(
    doc(firestore, HARVEST_SESSIONS_COLLECTION, sessionId)
  );

  if (!sessionSnapshot.exists()) {
    throw new Error("Nie znaleziono sesji zrodlowej.");
  }

  const session = decodeHarvestSession(
    sessionSnapshot.id,
    sessionSnapshot.data({ serverTimestamps: "estimate" })
  );

  if (session.status !== "FOUND" || session.session.workerId !== workerId) {
    throw new Error("Sesja zrodlowa nie nalezy do aktywnego pickera.");
  }

  if (entryId) {
    const entrySnapshot = await readDocument(
      doc(firestore, HARVEST_ENTRIES_COLLECTION, entryId)
    );
    const entry = entrySnapshot.exists()
      ? decodeHarvestEntry(
          entrySnapshot.id,
          entrySnapshot.data({ serverTimestamps: "estimate" })
        )
      : null;

    if (
      entry?.status !== "FOUND" ||
      entry.entry.sessionId !== sessionId ||
      entry.entry.workerId !== workerId ||
      entry.entry.seasonId !== session.session.seasonId
    ) {
      throw new Error("Wpis zrodlowy nie nalezy do wybranej sesji.");
    }
  }

  const reportId = createReportId();
  const reportReference = doc(firestore, ISSUE_REPORTS_COLLECTION, reportId);
  const createdAt = serverTimestamp();
  const reportDocument = {
    createdAt,
    entryId,
    id: reportId,
    message,
    reporterUid: input.actorProfile.uid,
    resolutionNote: null,
    resolvedAt: null,
    resolvedBy: null,
    seasonId: session.session.seasonId,
    sessionId,
    status: "OPEN",
    subject,
    workerId
  } satisfies IssueReportDocument;

  if (!input.isOnline) {
    const batch = writeBatch(firestore);
    batch.set(reportReference, reportDocument);
    await queueOfflineFirestoreBatch({
      batch,
      journal: dependencies.journal ?? defaultFirestoreSyncJournal,
      records: [
        {
          businessStatus: "OPEN",
          deviceId,
          id: reportId,
          kind: "ISSUE_REPORT",
          localSnapshot: {
            ...reportDocument,
            createdAt: new Date().toISOString()
          },
          sessionId,
          userUid: input.actorProfile.uid
        }
      ],
      verifyLocalWrite: async () => (await getDocFromCache(reportReference)).exists()
    });

    return {
      id: reportId,
      message: "Zgloszenie zapisano lokalnie. Zostanie wyslane po odzyskaniu polaczenia.",
      status: "QUEUED"
    };
  }

  await setDoc(reportReference, reportDocument);

  return {
    id: reportId,
    message: "Zgloszenie zostalo przekazane administratorowi.",
    status: "CREATED"
  };
}

export async function listPickerIssueReports(
  env: FirebaseEnv,
  input: { actorProfile: UserProfile; isOnline: boolean }
): Promise<PickerIssueReportListResult> {
  const workerId = assertPicker(input.actorProfile);
  const { firestore } = await getFirebaseServices(env);
  const { collection, getDocs, getDocsFromCache, orderBy, query, where } =
    await import("firebase/firestore");
  const readDocuments = input.isOnline ? getDocs : getDocsFromCache;
  const snapshot = await readDocuments(
    query(
      collection(firestore, ISSUE_REPORTS_COLLECTION),
      where("workerId", "==", workerId),
      orderBy("createdAt", "desc")
    )
  );

  const built = buildIssueReportList(toRawDocuments(snapshot.docs), workerId);

  return {
    dataSource: snapshot.metadata.fromCache ? "CACHE" : "SERVER",
    invalidReportCount: built.invalidReportCount,
    reports: built.reports.map(({ pendingSync, report }) =>
      toPickerItem(report, pendingSync)
    )
  };
}

export async function listAdminIssueReports(
  env: FirebaseEnv,
  input: { actorProfile: UserProfile }
): Promise<AdminIssueReportListResult> {
  assertAdmin(input.actorProfile);
  const { firestore } = await getFirebaseServices(env);
  const { collection, getDocs, orderBy, query } = await import("firebase/firestore");
  const snapshot = await getDocs(
    query(collection(firestore, ISSUE_REPORTS_COLLECTION), orderBy("createdAt", "desc"))
  );
  const built = buildIssueReportList(toRawDocuments(snapshot.docs));

  return {
    invalidReportCount: built.invalidReportCount,
    reports: built.reports.map(({ pendingSync, report }) =>
      toAdminItem(report, pendingSync)
    )
  };
}

export async function resolveIssueReport(
  env: FirebaseEnv,
  input: ResolveIssueReportInput
): Promise<void> {
  assertAdmin(input.actorProfile);
  const reportId = normalizeId(input.reportId, "Zgloszenie");
  const resolutionNote = normalizeMessage(
    input.resolutionNote,
    3,
    1000,
    "Odpowiedz administratora"
  );

  const { firestore } = await getFirebaseServices(env);
  const { doc, runTransaction, serverTimestamp } = await import("firebase/firestore");

  await runTransaction(firestore, async (transaction) => {
    const reportReference = doc(firestore, ISSUE_REPORTS_COLLECTION, reportId);
    const snapshot = await transaction.get(reportReference);
    const report = snapshot.exists()
      ? decodeIssueReport(snapshot.id, snapshot.data())
      : null;

    if (report?.status !== "OPEN") {
      throw new Error("Zgloszenie nie jest juz otwarte.");
    }

    transaction.update(reportReference, {
      resolutionNote,
      resolvedAt: serverTimestamp(),
      resolvedBy: input.actorProfile.uid,
      status: input.status
    });
  });
}

export async function loadIssueReportSource(
  env: FirebaseEnv,
  input: { actorProfile: UserProfile; reportId: string }
): Promise<IssueReportSource> {
  assertAdmin(input.actorProfile);
  const reportId = normalizeId(input.reportId, "Zgloszenie");
  const { firestore } = await getFirebaseServices(env);
  const { doc, getDoc } = await import("firebase/firestore");
  const reportSnapshot = await getDoc(doc(firestore, ISSUE_REPORTS_COLLECTION, reportId));
  const report = reportSnapshot.exists()
    ? decodeIssueReport(
        reportSnapshot.id,
        reportSnapshot.data({ serverTimestamps: "estimate" })
      )
    : null;

  if (!report) {
    throw new Error("Nie znaleziono zgloszenia.");
  }

  const [sessionSnapshot, entrySnapshot] = await Promise.all([
    getDoc(doc(firestore, HARVEST_SESSIONS_COLLECTION, report.sessionId)),
    report.entryId
      ? getDoc(doc(firestore, HARVEST_ENTRIES_COLLECTION, report.entryId))
      : Promise.resolve(null)
  ]);
  const session = sessionSnapshot.exists()
    ? decodeHarvestSession(
        sessionSnapshot.id,
        sessionSnapshot.data({ serverTimestamps: "estimate" })
      )
    : null;

  if (
    session?.status !== "FOUND" ||
    session.session.workerId !== report.workerId ||
    session.session.seasonId !== report.seasonId
  ) {
    throw new Error("Nie znaleziono zgodnej sesji zrodlowej.");
  }

  const entry =
    entrySnapshot?.exists() === true
      ? decodeHarvestEntry(
          entrySnapshot.id,
          entrySnapshot.data({ serverTimestamps: "estimate" })
        )
      : null;

  if (
    report.entryId &&
    (entry?.status !== "FOUND" ||
      entry.entry.sessionId !== report.sessionId ||
      entry.entry.workerId !== report.workerId)
  ) {
    throw new Error("Nie znaleziono zgodnego wpisu zrodlowego.");
  }

  return {
    entry:
      entry?.status === "FOUND"
        ? {
            id: entry.entry.id,
            quantityMilli: entry.entry.quantityMilli,
            sequenceNumber: entry.entry.sequenceNumber,
            status: entry.entry.status,
            weightG: entry.entry.weightG
          }
        : null,
    session: {
      amountDueGrosz: session.session.amountDueGrosz,
      businessDate: session.session.businessDate,
      id: session.session.id,
      paymentId: session.session.paymentId,
      seasonId: session.session.seasonId,
      status: session.session.status,
      workerId: session.session.workerId,
      workerName: session.session.workerNameSnapshot
    }
  };
}

export function decodeIssueReport(
  expectedId: string,
  data: unknown
): IssueReportDocument | null {
  if (!isRecord(data)) {
    return null;
  }

  const report: IssueReportDocument = {
    createdAt: data.createdAt,
    entryId: readNullableString(data.entryId),
    id: readString(data.id),
    message: readString(data.message),
    reporterUid: readString(data.reporterUid),
    resolutionNote: readNullableString(data.resolutionNote),
    resolvedAt: data.resolvedAt,
    resolvedBy: readNullableString(data.resolvedBy),
    seasonId: readString(data.seasonId),
    sessionId: readString(data.sessionId),
    status: data.status as IssueReportStatus,
    subject: data.subject as IssueReportSubject,
    workerId: readString(data.workerId)
  };

  if (
    report.id !== expectedId ||
    !report.reporterUid ||
    !report.workerId ||
    !report.seasonId ||
    !report.sessionId ||
    !report.message ||
    !ISSUE_REPORT_SUBJECTS.includes(report.subject) ||
    !ISSUE_REPORT_STATUSES.includes(report.status) ||
    (report.subject === "ENTRY" ? !report.entryId : report.entryId !== null) ||
    (report.status === "OPEN"
      ? report.resolvedAt !== null ||
        report.resolvedBy !== null ||
        report.resolutionNote !== null
      : report.resolvedAt === null || !report.resolvedBy || !report.resolutionNote) ||
    paymentTimestampToIso(report.createdAt) === null
  ) {
    return null;
  }

  return report;
}

function buildIssueReportList(
  documents: readonly RawDocument[],
  expectedWorkerId?: string
): {
  invalidReportCount: number;
  reports: { pendingSync: boolean; report: IssueReportDocument }[];
} {
  const reports: { pendingSync: boolean; report: IssueReportDocument }[] = [];
  let invalidReportCount = 0;

  for (const document of documents) {
    const report = decodeIssueReport(document.id, document.data);

    if (!report || (expectedWorkerId && report.workerId !== expectedWorkerId)) {
      invalidReportCount += 1;
    } else {
      reports.push({ pendingSync: document.pendingSync, report });
    }
  }

  return {
    invalidReportCount,
    reports: reports.sort(
      (left, right) =>
        (paymentTimestampToIso(right.report.createdAt) ?? "").localeCompare(
          paymentTimestampToIso(left.report.createdAt) ?? ""
        ) || right.report.id.localeCompare(left.report.id)
    )
  };
}

function toPickerItem(
  report: IssueReportDocument,
  pendingSync: boolean
): PickerIssueReportItem {
  return {
    createdAtIso: paymentTimestampToIso(report.createdAt),
    entryId: report.entryId,
    id: report.id,
    message: report.message,
    pendingSync,
    resolutionNote: report.resolutionNote,
    resolvedAtIso: paymentTimestampToIso(report.resolvedAt),
    seasonId: report.seasonId,
    sessionId: report.sessionId,
    status: report.status,
    subject: report.subject
  };
}

function toAdminItem(
  report: IssueReportDocument,
  pendingSync: boolean
): AdminIssueReportItem {
  return {
    ...toPickerItem(report, pendingSync),
    reporterUid: report.reporterUid,
    resolvedBy: report.resolvedBy,
    workerId: report.workerId
  };
}

function toRawDocuments(
  documents: readonly {
    data(options?: { serverTimestamps?: "estimate" }): unknown;
    id: string;
    metadata: { hasPendingWrites: boolean };
  }[]
): RawDocument[] {
  return documents.map((document) => ({
    data: document.data({ serverTimestamps: "estimate" }),
    id: document.id,
    pendingSync: document.metadata.hasPendingWrites
  }));
}

function assertPicker(profile: UserProfile): string {
  if (
    profile.role !== "PICKER" ||
    !profile.active ||
    profile.registrationStatus !== "APPROVED" ||
    !profile.workerId
  ) {
    throw new Error("Zgloszenie wymaga aktywnego profilu pickera z workerId.");
  }

  return profile.workerId;
}

function assertAdmin(profile: UserProfile): void {
  if (
    profile.role !== "ADMIN" ||
    !profile.active ||
    profile.registrationStatus !== "APPROVED"
  ) {
    throw new Error("Obsluga zgloszen wymaga aktywnego administratora.");
  }
}

function normalizeSubject(value: IssueReportSubject): IssueReportSubject {
  if (!ISSUE_REPORT_SUBJECTS.includes(value)) {
    throw new Error("Wybierz prawidlowy rodzaj niezgodnosci.");
  }

  return value;
}

function normalizeId(value: string, label: string): string {
  const normalized = value.trim();

  if (!normalized || normalized.length > 200 || normalized.includes("/")) {
    throw new Error(`${label} ma nieprawidlowy identyfikator.`);
  }

  return normalized;
}

function normalizeMessage(
  value: string,
  minimumLength: number,
  maximumLength: number,
  label: string
): string {
  const normalized = value.trim();

  if (normalized.length < minimumLength || normalized.length > maximumLength) {
    throw new Error(
      `${label} musi miec od ${String(minimumLength)} do ${String(maximumLength)} znakow.`
    );
  }

  return normalized;
}

function createReportId(): string {
  const cryptoApi = globalThis.crypto as { randomUUID?: () => string } | undefined;

  if (typeof cryptoApi?.randomUUID !== "function") {
    throw new Error("Nie mozna utworzyc bezpiecznego identyfikatora zgloszenia.");
  }

  return cryptoApi.randomUUID();
}

function readString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function readNullableString(value: unknown): string | null {
  return value === null ? null : typeof value === "string" ? value : "";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function fail(message: string): never {
  throw new Error(message);
}
