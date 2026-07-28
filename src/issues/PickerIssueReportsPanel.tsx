import { CloudOff, Flag, RefreshCw, Send, UserRound } from "lucide-react";
import { useEffect, useMemo, useState, type SyntheticEvent } from "react";

import type { AuthSessionState } from "../auth/authSession";
import { formatBusinessDate } from "../domain/format";
import {
  defaultPickerSessionDetailsApi,
  type PickerSessionDetailsApi
} from "../picker/PickerSessionDetailsPanel";
import type { PickerSessionDetailsResult } from "../picker/pickerSessionDetails";
import {
  createIssueReport,
  listPickerIssueReports,
  type CreateIssueReportInput,
  type CreateIssueReportResult,
  type IssueReportSubject,
  type PickerIssueReportListResult
} from "./issueReports";

type FirebaseEnv = Record<string, string | boolean | undefined>;

export type PickerIssueReportsApi = {
  create: (
    env: FirebaseEnv,
    input: CreateIssueReportInput
  ) => Promise<CreateIssueReportResult>;
  list: (
    env: FirebaseEnv,
    input: { actorProfile: CreateIssueReportInput["actorProfile"]; isOnline: boolean }
  ) => Promise<PickerIssueReportListResult>;
};

export const defaultPickerIssueReportsApi: PickerIssueReportsApi = {
  create: createIssueReport,
  list: listPickerIssueReports
};

type ListState =
  | { result: PickerIssueReportListResult | null; status: "LOADING" | "IDLE" }
  | { result: PickerIssueReportListResult; status: "READY" }
  | { result: PickerIssueReportListResult | null; status: "ERROR" };

type SourceState =
  | { result: null; sessionId: null; status: "IDLE" }
  | { result: null; sessionId: string; status: "LOADING" | "ERROR" }
  | { result: PickerSessionDetailsResult; sessionId: string; status: "READY" };

const initialListState: ListState = { result: null, status: "IDLE" };
const initialSourceState: SourceState = {
  result: null,
  sessionId: null,
  status: "IDLE"
};

export function PickerIssueReportsPanel({
  authState,
  deviceId,
  env,
  initialSessionId,
  isOnline,
  issueReportsApi = defaultPickerIssueReportsApi,
  onLocalDocumentsChanged,
  onInitialSessionHandled,
  sessionDetailsApi = defaultPickerSessionDetailsApi
}: {
  authState: AuthSessionState;
  deviceId: string;
  env: FirebaseEnv;
  initialSessionId: string | null;
  isOnline: boolean;
  issueReportsApi?: PickerIssueReportsApi;
  onLocalDocumentsChanged?: () => Promise<void> | void;
  onInitialSessionHandled: () => void;
  sessionDetailsApi?: PickerSessionDetailsApi;
}) {
  const [listState, setListState] = useState<ListState>(initialListState);
  const [sourceState, setSourceState] = useState<SourceState>(initialSourceState);
  const [reloadKey, setReloadKey] = useState(0);
  const [subject, setSubject] = useState<IssueReportSubject>("SESSION");
  const [entryId, setEntryId] = useState("");
  const [message, setMessage] = useState("");
  const [submitStatus, setSubmitStatus] = useState<
    "IDLE" | "SUBMITTING" | "SUCCESS" | "ERROR"
  >("IDLE");
  const [submitMessage, setSubmitMessage] = useState("");
  const isPicker =
    authState.status === "READY" &&
    authState.profile.role === "PICKER" &&
    authState.profile.workerId !== null;

  useEffect(() => {
    let isMounted = true;

    if (!isPicker) {
      setListState(initialListState);
      return undefined;
    }

    setListState((current) => ({ result: current.result, status: "LOADING" }));
    void issueReportsApi
      .list(env, { actorProfile: authState.profile, isOnline })
      .then((result) => {
        if (isMounted) {
          setListState({ result, status: "READY" });
        }
      })
      .catch(() => {
        if (isMounted) {
          setListState((current) => ({ result: current.result, status: "ERROR" }));
        }
      });

    return () => {
      isMounted = false;
    };
  }, [authState, env, isOnline, isPicker, issueReportsApi, reloadKey]);

  useEffect(() => {
    let isMounted = true;

    if (!isPicker || !initialSessionId) {
      return undefined;
    }

    setSourceState({
      result: null,
      sessionId: initialSessionId,
      status: "LOADING"
    });
    setSubmitStatus("IDLE");
    setSubmitMessage("");
    setSubject("SESSION");
    setEntryId("");
    setMessage("");
    void sessionDetailsApi
      .load(env, {
        actorProfile: authState.profile,
        isOnline,
        sessionId: initialSessionId
      })
      .then((result) => {
        if (isMounted) {
          setSourceState({
            result,
            sessionId: initialSessionId,
            status: "READY"
          });
          onInitialSessionHandled();
        }
      })
      .catch(() => {
        if (isMounted) {
          setSourceState({
            result: null,
            sessionId: initialSessionId,
            status: "ERROR"
          });
          onInitialSessionHandled();
        }
      });

    return () => {
      isMounted = false;
    };
  }, [
    authState,
    env,
    initialSessionId,
    isOnline,
    isPicker,
    onInitialSessionHandled,
    sessionDetailsApi
  ]);

  const reports = listState.result?.reports ?? [];
  const openCount = useMemo(
    () => reports.filter((report) => report.status === "OPEN").length,
    [reports]
  );

  if (
    authState.status !== "READY" ||
    authState.profile.role !== "PICKER" ||
    authState.profile.workerId === null
  ) {
    return (
      <section className="access-notice" aria-label="Moje zgloszenia">
        <UserRound aria-hidden="true" size={24} />
        <div>
          <p className="eyebrow">Niezgodnosci</p>
          <p>Zgloszenia wymagaja aktywnego konta pickera z workerId.</p>
        </div>
      </section>
    );
  }

  const actorProfile = authState.profile;

  async function handleSubmit(event: SyntheticEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();

    if (sourceState.status !== "READY") {
      return;
    }

    setSubmitStatus("SUBMITTING");
    setSubmitMessage("");

    try {
      const result = await issueReportsApi.create(env, {
        actorProfile,
        deviceId,
        entryId: subject === "ENTRY" ? entryId : null,
        isOnline,
        message,
        sessionId: sourceState.result.sessionId,
        subject
      });
      if (result.status === "QUEUED" && onLocalDocumentsChanged) {
        try {
          await onLocalDocumentsChanged();
        } catch {
          // The queued Firestore write remains recoverable through the sync journal.
        }
      }
      setSubmitStatus("SUCCESS");
      setSubmitMessage(result.message);
      setSourceState(initialSourceState);
      setMessage("");
      setEntryId("");
      setReloadKey((current) => current + 1);
    } catch (error) {
      setSubmitStatus("ERROR");
      setSubmitMessage(
        error instanceof Error ? error.message : "Nie udalo sie wyslac zgloszenia."
      );
    }
  }

  return (
    <section className="issue-report-directory" aria-labelledby="picker-issues-title">
      <header className="directory-header">
        <div>
          <p className="eyebrow">Niezgodnosci</p>
          <h2 id="picker-issues-title">Moje zgloszenia</h2>
          <p className="panel-detail">
            Otwarte: {String(openCount)}. Odpowiedz administratora nie zmienia danych
            sesji ani wyplaty.
          </p>
        </div>
        <button
          aria-label="Odswiez moje zgloszenia"
          className="secondary-button icon-button"
          disabled={listState.status === "LOADING"}
          onClick={() => {
            setReloadKey((current) => current + 1);
          }}
          title="Odswiez moje zgloszenia"
          type="button"
        >
          <RefreshCw aria-hidden="true" size={18} />
        </button>
      </header>

      {sourceState.status === "LOADING" ? (
        <p className="empty-state">Pobieranie danych sesji do zgloszenia.</p>
      ) : null}
      {sourceState.status === "ERROR" ? (
        <p className="form-message form-message--error">
          Nie udalo sie potwierdzic sesji zrodlowej.
        </p>
      ) : null}
      {sourceState.status === "READY" ? (
        <form
          className="issue-report-form"
          onSubmit={(event) => {
            void handleSubmit(event);
          }}
        >
          <div>
            <p className="eyebrow">Nowe zgloszenie</p>
            <h3>Sesja z {formatBusinessDate(sourceState.result.businessDate)}</h3>
          </div>
          <label className="field">
            <span>Problem dotyczy</span>
            <select
              onChange={(event) => {
                const value = event.target.value as IssueReportSubject;
                setSubject(value);
                if (value !== "ENTRY") {
                  setEntryId("");
                }
              }}
              value={subject}
            >
              <option value="SESSION">Calej sesji</option>
              <option value="ENTRY">Konkretnego wpisu</option>
              <option value="AMOUNT">Naliczonej kwoty</option>
              <option value="PAYMENT_STATUS">Statusu wyplaty</option>
            </select>
          </label>
          {subject === "ENTRY" ? (
            <label className="field">
              <span>Wpis</span>
              <select
                onChange={(event) => {
                  setEntryId(event.target.value);
                }}
                required
                value={entryId}
              >
                <option value="">Wybierz wpis</option>
                {sourceState.result.entries.map((entry) => (
                  <option key={entry.id} value={entry.id}>
                    Wpis {String(entry.sequenceNumber)} (
                    {entry.status === "ACTIVE" ? "aktywny" : "anulowany"})
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          <label className="field">
            <span>Krotki opis</span>
            <textarea
              maxLength={500}
              minLength={5}
              onChange={(event) => {
                setMessage(event.target.value);
              }}
              required
              rows={4}
              value={message}
            />
          </label>
          {!isOnline ? (
            <p className="form-message form-message--warning">
              <CloudOff aria-hidden="true" size={18} />
              Zgloszenie zostanie zapisane lokalnie i wyslane po odzyskaniu polaczenia.
            </p>
          ) : null}
          <div className="form-actions">
            <button
              className="primary-button"
              disabled={submitStatus === "SUBMITTING"}
              type="submit"
            >
              <Send aria-hidden="true" size={18} />
              {submitStatus === "SUBMITTING" ? "Wysylanie" : "Wyslij zgloszenie"}
            </button>
            <button
              className="secondary-button"
              onClick={() => {
                setSourceState(initialSourceState);
              }}
              type="button"
            >
              Anuluj
            </button>
          </div>
        </form>
      ) : null}

      {submitStatus === "SUCCESS" ? (
        <p className="form-message form-message--ok">{submitMessage}</p>
      ) : null}
      {submitStatus === "ERROR" ? (
        <p className="form-message form-message--error">{submitMessage}</p>
      ) : null}
      {listState.result?.dataSource === "CACHE" ? (
        <p className="form-message form-message--warning">
          <CloudOff aria-hidden="true" size={18} />
          Historia z pamieci offline moze nie zawierac najnowszych odpowiedzi.
        </p>
      ) : null}
      {listState.status === "ERROR" ? (
        <p className="form-message form-message--error">
          Nie udalo sie pobrac historii zgloszen.
        </p>
      ) : null}
      {listState.result && listState.result.invalidReportCount > 0 ? (
        <p className="form-message form-message--warning">
          Pominieto nieprawidlowe zgloszenia:{" "}
          {String(listState.result.invalidReportCount)}.
        </p>
      ) : null}
      {listState.status === "LOADING" && !listState.result ? (
        <p className="empty-state">Pobieranie historii zgloszen.</p>
      ) : null}
      {listState.result && reports.length === 0 ? (
        <p className="empty-state">Brak wyslanych zgloszen.</p>
      ) : null}
      {reports.length > 0 ? (
        <ol className="issue-report-list">
          {reports.map((report) => (
            <li key={report.id}>
              <div className="issue-report-list__heading">
                <strong>{subjectLabel(report.subject)}</strong>
                <span className={statusClass(report.status)}>
                  {report.pendingSync
                    ? "Oczekuje na synchronizacje"
                    : statusLabel(report.status)}
                </span>
              </div>
              <span>
                Sesja: {report.sessionId}
                {report.entryId ? `, wpis: ${report.entryId}` : ""}
              </span>
              <p>{report.message}</p>
              {report.resolutionNote ? (
                <p className="issue-report-list__response">
                  <strong>Odpowiedz administratora:</strong> {report.resolutionNote}
                </p>
              ) : null}
            </li>
          ))}
        </ol>
      ) : null}
      {!sourceState.sessionId ? (
        <p className="issue-report-directory__hint">
          <Flag aria-hidden="true" size={18} />
          Nowe zgloszenie rozpocznij ze szczegolow sesji w „Moje zbiory” lub „Moje
          wyplaty”.
        </p>
      ) : null}
    </section>
  );
}

function subjectLabel(subject: IssueReportSubject): string {
  switch (subject) {
    case "SESSION":
      return "Cala sesja";
    case "ENTRY":
      return "Wpis";
    case "AMOUNT":
      return "Naliczenie";
    case "PAYMENT_STATUS":
      return "Status wyplaty";
  }
}

function statusLabel(status: PickerIssueReportListResult["reports"][number]["status"]) {
  switch (status) {
    case "OPEN":
      return "Otwarte";
    case "RESOLVED":
      return "Rozwiazane";
    case "REJECTED":
      return "Odrzucone";
  }
}

function statusClass(
  status: PickerIssueReportListResult["reports"][number]["status"]
): string {
  return status === "OPEN"
    ? "status-badge"
    : status === "RESOLVED"
      ? "status-badge status-badge--active"
      : "status-badge status-badge--rejected";
}
