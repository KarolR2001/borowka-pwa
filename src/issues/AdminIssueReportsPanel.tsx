import { CheckCircle2, Eye, RefreshCw, ShieldX, UserRound, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import type { AuthSessionState } from "../auth/authSession";
import { formatBusinessDate, formatMoney } from "../domain/format";
import {
  listAdminIssueReports,
  loadIssueReportSource,
  resolveIssueReport,
  type AdminIssueReportItem,
  type AdminIssueReportListResult,
  type IssueReportSource,
  type ResolveIssueReportInput
} from "./issueReports";

type FirebaseEnv = Record<string, string | boolean | undefined>;

export type AdminIssueReportsApi = {
  list: (
    env: FirebaseEnv,
    input: { actorProfile: ResolveIssueReportInput["actorProfile"] }
  ) => Promise<AdminIssueReportListResult>;
  loadSource: (
    env: FirebaseEnv,
    input: { actorProfile: ResolveIssueReportInput["actorProfile"]; reportId: string }
  ) => Promise<IssueReportSource>;
  resolve: (env: FirebaseEnv, input: ResolveIssueReportInput) => Promise<void>;
};

export const defaultAdminIssueReportsApi: AdminIssueReportsApi = {
  list: listAdminIssueReports,
  loadSource: loadIssueReportSource,
  resolve: resolveIssueReport
};

type DirectoryState =
  | { result: AdminIssueReportListResult | null; status: "IDLE" | "LOADING" }
  | { result: AdminIssueReportListResult; status: "READY" }
  | { result: AdminIssueReportListResult | null; status: "ERROR" };

type SourceState =
  | { reportId: null; result: null; status: "IDLE" }
  | { reportId: string; result: null; status: "LOADING" | "ERROR" }
  | { reportId: string; result: IssueReportSource; status: "READY" };

const initialDirectoryState: DirectoryState = { result: null, status: "IDLE" };
const initialSourceState: SourceState = {
  reportId: null,
  result: null,
  status: "IDLE"
};

export function AdminIssueReportsPanel({
  authState,
  env,
  isOnline,
  issueReportsApi = defaultAdminIssueReportsApi
}: {
  authState: AuthSessionState;
  env: FirebaseEnv;
  isOnline: boolean;
  issueReportsApi?: AdminIssueReportsApi;
}) {
  const [state, setState] = useState<DirectoryState>(initialDirectoryState);
  const [sourceState, setSourceState] = useState<SourceState>(initialSourceState);
  const [statusFilter, setStatusFilter] = useState<"ALL" | "OPEN">("OPEN");
  const [selectedReportId, setSelectedReportId] = useState<string | null>(null);
  const [resolutionNote, setResolutionNote] = useState("");
  const [resolutionStatus, setResolutionStatus] = useState<
    "IDLE" | "SUBMITTING" | "SUCCESS" | "ERROR"
  >("IDLE");
  const [reloadKey, setReloadKey] = useState(0);
  const isAdmin = authState.status === "READY" && authState.profile.role === "ADMIN";

  useEffect(() => {
    let isMounted = true;

    if (!isAdmin || !isOnline) {
      setState(initialDirectoryState);
      return undefined;
    }

    setState((current) => ({ result: current.result, status: "LOADING" }));
    void issueReportsApi
      .list(env, { actorProfile: authState.profile })
      .then((result) => {
        if (isMounted) {
          setState({ result, status: "READY" });
        }
      })
      .catch(() => {
        if (isMounted) {
          setState((current) => ({ result: current.result, status: "ERROR" }));
        }
      });

    return () => {
      isMounted = false;
    };
  }, [authState, env, isAdmin, isOnline, issueReportsApi, reloadKey]);

  const reports = state.result?.reports ?? [];
  const visibleReports = useMemo(
    () =>
      statusFilter === "OPEN"
        ? reports.filter((report) => report.status === "OPEN")
        : reports,
    [reports, statusFilter]
  );
  const selectedReport = reports.find((report) => report.id === selectedReportId) ?? null;

  if (authState.status !== "READY" || authState.profile.role !== "ADMIN") {
    return (
      <section className="access-notice" aria-label="Zgloszenia niezgodnosci">
        <UserRound aria-hidden="true" size={24} />
        <div>
          <p className="eyebrow">Niezgodnosci</p>
          <p>Obsluga zgloszen wymaga aktywnego administratora.</p>
        </div>
      </section>
    );
  }

  const actorProfile = authState.profile;

  async function handleLoadSource(reportId: string): Promise<void> {
    setSourceState({ reportId, result: null, status: "LOADING" });

    try {
      const result = await issueReportsApi.loadSource(env, {
        actorProfile,
        reportId
      });
      setSourceState({ reportId, result, status: "READY" });
    } catch {
      setSourceState({ reportId, result: null, status: "ERROR" });
    }
  }

  async function handleResolve(status: ResolveIssueReportInput["status"]): Promise<void> {
    if (selectedReport?.status !== "OPEN" || !isOnline) {
      return;
    }

    setResolutionStatus("SUBMITTING");

    try {
      await issueReportsApi.resolve(env, {
        actorProfile,
        reportId: selectedReport.id,
        resolutionNote,
        status
      });
      setResolutionStatus("SUCCESS");
      setResolutionNote("");
      setSelectedReportId(null);
      setSourceState(initialSourceState);
      setReloadKey((current) => current + 1);
    } catch {
      setResolutionStatus("ERROR");
    }
  }

  return (
    <section className="issue-report-directory" aria-labelledby="admin-issues-title">
      <header className="directory-header">
        <div>
          <p className="eyebrow">Kontrola danych</p>
          <h2 id="admin-issues-title">Zgloszenia niezgodnosci</h2>
          <p className="panel-detail">
            Otwarte zgloszenia wymagaja odpowiedzi i osobnego procesu korekty danych.
          </p>
        </div>
        <button
          aria-label="Odswiez zgloszenia"
          className="secondary-button icon-button"
          disabled={!isOnline || state.status === "LOADING"}
          onClick={() => {
            setReloadKey((current) => current + 1);
          }}
          title="Odswiez zgloszenia"
          type="button"
        >
          <RefreshCw aria-hidden="true" size={18} />
        </button>
      </header>

      <div className="segmented-control" aria-label="Status zgloszen">
        <button
          aria-pressed={statusFilter === "OPEN"}
          className={statusFilter === "OPEN" ? "is-active" : ""}
          onClick={() => {
            setStatusFilter("OPEN");
          }}
          type="button"
        >
          Otwarte
        </button>
        <button
          aria-pressed={statusFilter === "ALL"}
          className={statusFilter === "ALL" ? "is-active" : ""}
          onClick={() => {
            setStatusFilter("ALL");
          }}
          type="button"
        >
          Wszystkie
        </button>
      </div>

      {!isOnline ? (
        <p className="form-message form-message--warning">
          Obsluga zgloszen administratora wymaga polaczenia.
        </p>
      ) : null}
      {state.status === "LOADING" && !state.result ? (
        <p className="empty-state">Pobieranie zgloszen.</p>
      ) : null}
      {state.status === "ERROR" ? (
        <p className="form-message form-message--error">Nie udalo sie pobrac zgloszen.</p>
      ) : null}
      {resolutionStatus === "SUCCESS" ? (
        <p className="form-message form-message--ok">Odpowiedz zostala zapisana.</p>
      ) : null}
      {resolutionStatus === "ERROR" ? (
        <p className="form-message form-message--error">
          Nie udalo sie rozstrzygnac zgloszenia. Odswiez liste i sprobuj ponownie.
        </p>
      ) : null}
      {state.result && state.result.invalidReportCount > 0 ? (
        <p className="form-message form-message--warning">
          Pominieto nieprawidlowe dokumenty: {String(state.result.invalidReportCount)}.
        </p>
      ) : null}
      {state.result && visibleReports.length === 0 ? (
        <p className="empty-state">Brak zgloszen dla wybranego statusu.</p>
      ) : null}
      {visibleReports.length > 0 ? (
        <div className="directory-table-wrap">
          <table className="directory-table issue-report-table">
            <thead>
              <tr>
                <th>Temat</th>
                <th>Picker</th>
                <th>Sesja / wpis</th>
                <th>Opis</th>
                <th>Status</th>
                <th>Akcje</th>
              </tr>
            </thead>
            <tbody>
              {visibleReports.map((report) => (
                <IssueReportRow
                  key={report.id}
                  onOpen={() => {
                    setSelectedReportId(report.id);
                    setResolutionNote("");
                    setResolutionStatus("IDLE");
                  }}
                  onSource={() => {
                    void handleLoadSource(report.id);
                  }}
                  report={report}
                />
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      {sourceState.status === "LOADING" ? (
        <p className="empty-state">Pobieranie danych zrodlowych.</p>
      ) : null}
      {sourceState.status === "ERROR" ? (
        <p className="form-message form-message--error">
          Powiazane dane zrodlowe sa niedostepne albo niespojne.
        </p>
      ) : null}
      {sourceState.status === "READY" ? (
        <section className="issue-report-source" aria-label="Dane zrodlowe zgloszenia">
          <header>
            <div>
              <p className="eyebrow">Dane zrodlowe</p>
              <h3>{sourceState.result.session.workerName}</h3>
            </div>
            <button
              aria-label="Zamknij dane zrodlowe"
              className="secondary-button icon-button"
              onClick={() => {
                setSourceState(initialSourceState);
              }}
              title="Zamknij dane zrodlowe"
              type="button"
            >
              <X aria-hidden="true" size={18} />
            </button>
          </header>
          <dl className="picker-session-details__facts">
            <Fact
              label="Data sesji"
              value={formatBusinessDate(sourceState.result.session.businessDate)}
            />
            <Fact label="Status sesji" value={sourceState.result.session.status} />
            <Fact
              label="Naliczenie"
              value={
                sourceState.result.session.amountDueGrosz === null
                  ? "Brak"
                  : formatMoney(sourceState.result.session.amountDueGrosz)
              }
            />
            <Fact
              label="Wyplata"
              value={sourceState.result.session.paymentId ?? "Brak"}
            />
            <Fact
              label="Wpis"
              value={
                sourceState.result.entry
                  ? `${String(sourceState.result.entry.sequenceNumber)} / ${sourceState.result.entry.status}`
                  : "Nie dotyczy"
              }
            />
          </dl>
        </section>
      ) : null}

      {selectedReport ? (
        <form
          className="issue-resolution-form"
          onSubmit={(event) => {
            event.preventDefault();
            void handleResolve("RESOLVED");
          }}
        >
          <div>
            <p className="eyebrow">Odpowiedz</p>
            <h3>{subjectLabel(selectedReport)}</h3>
            <p>{selectedReport.message}</p>
          </div>
          {selectedReport.status === "OPEN" ? (
            <>
              <label className="field">
                <span>Wyjasnienie dla pickera</span>
                <textarea
                  maxLength={1000}
                  minLength={3}
                  onChange={(event) => {
                    setResolutionNote(event.target.value);
                  }}
                  required
                  rows={4}
                  value={resolutionNote}
                />
              </label>
              <div className="form-actions">
                <button
                  className="primary-button"
                  disabled={!isOnline || resolutionStatus === "SUBMITTING"}
                  type="submit"
                >
                  <CheckCircle2 aria-hidden="true" size={18} />
                  Oznacz rozwiazane
                </button>
                <button
                  className="danger-button"
                  disabled={!isOnline || resolutionStatus === "SUBMITTING"}
                  onClick={() => {
                    void handleResolve("REJECTED");
                  }}
                  type="button"
                >
                  <ShieldX aria-hidden="true" size={18} />
                  Odrzuc
                </button>
                <button
                  className="secondary-button"
                  onClick={() => {
                    setSelectedReportId(null);
                  }}
                  type="button"
                >
                  Anuluj
                </button>
              </div>
            </>
          ) : (
            <p className="form-message form-message--ok">
              {selectedReport.resolutionNote}
            </p>
          )}
        </form>
      ) : null}
    </section>
  );
}

function IssueReportRow({
  onOpen,
  onSource,
  report
}: {
  onOpen: () => void;
  onSource: () => void;
  report: AdminIssueReportItem;
}) {
  return (
    <tr>
      <td>{subjectLabel(report)}</td>
      <td>
        {report.workerId}
        <span className="directory-cell-note">{report.reporterUid}</span>
      </td>
      <td>
        {report.sessionId}
        {report.entryId ? (
          <span className="directory-cell-note">Wpis: {report.entryId}</span>
        ) : null}
      </td>
      <td>{report.message}</td>
      <td>{statusLabel(report.status)}</td>
      <td>
        <div className="directory-actions">
          <button
            className="secondary-button directory-action"
            onClick={onOpen}
            type="button"
          >
            Odpowiedz
          </button>
          <button
            aria-label={`Otworz dane zrodlowe ${report.id}`}
            className="secondary-button icon-button"
            onClick={onSource}
            title="Otworz dane zrodlowe"
            type="button"
          >
            <Eye aria-hidden="true" size={18} />
          </button>
        </div>
      </td>
    </tr>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

function subjectLabel(report: Pick<AdminIssueReportItem, "subject">): string {
  switch (report.subject) {
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

function statusLabel(status: AdminIssueReportItem["status"]): string {
  switch (status) {
    case "OPEN":
      return "Otwarte";
    case "RESOLVED":
      return "Rozwiazane";
    case "REJECTED":
      return "Odrzucone";
  }
}
