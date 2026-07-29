import {
  AlertTriangle,
  ClipboardList,
  Gauge,
  Plus,
  RefreshCw,
  Wifi,
  WifiOff
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import type { AuthSessionState } from "../auth/authSession";
import { formatBusinessDate, formatKilograms } from "../domain/format";
import type { SyncDocumentMetadataInput } from "../offline/pendingWriteMetadata";
import { DashboardPeriodFilter } from "./DashboardPeriodFilter";
import {
  loadOperatorDashboard,
  DEFAULT_OPERATOR_DASHBOARD_PERIOD,
  type LoadOperatorDashboardInput,
  type OperatorDashboardResult,
  type OperatorDashboardSession
} from "./operatorDashboard";
import {
  currentWarsawBusinessDate,
  dashboardPeriodSelectionError,
  type DashboardPeriodSelection
} from "./dashboardPeriod";

type FirebaseEnv = Record<string, string | boolean | undefined>;

export type OperatorDashboardApi = {
  load: (
    env: FirebaseEnv,
    input: LoadOperatorDashboardInput
  ) => Promise<OperatorDashboardResult>;
};

export const defaultOperatorDashboardApi: OperatorDashboardApi = {
  load: loadOperatorDashboard
};

type DashboardState =
  | { result: OperatorDashboardResult | null; status: "IDLE" | "LOADING" }
  | { result: OperatorDashboardResult; status: "READY" }
  | { result: OperatorDashboardResult | null; status: "ERROR" };

const initialState: DashboardState = {
  result: null,
  status: "IDLE"
};

export function OperatorDashboardPanel({
  api = defaultOperatorDashboardApi,
  authState,
  env,
  isOnline,
  syncDocuments
}: {
  api?: OperatorDashboardApi;
  authState: AuthSessionState;
  env: FirebaseEnv;
  isOnline: boolean;
  syncDocuments: readonly SyncDocumentMetadataInput[];
}) {
  const [state, setState] = useState<DashboardState>(initialState);
  const [periodSelection, setPeriodSelection] = useState<DashboardPeriodSelection>(
    DEFAULT_OPERATOR_DASHBOARD_PERIOD
  );
  const [reloadKey, setReloadKey] = useState(0);
  const todayBusinessDate = useMemo(() => currentWarsawBusinessDate(), []);
  const periodError = dashboardPeriodSelectionError(periodSelection);
  const isOperator =
    authState.status === "READY" && authState.profile.role === "OPERATOR";

  useEffect(() => {
    let isMounted = true;

    if (!isOperator) {
      setState(initialState);
      return undefined;
    }

    if (periodError) {
      return undefined;
    }

    setState((current) => ({ result: current.result, status: "LOADING" }));
    void api
      .load(env, {
        actorProfile: authState.profile,
        businessDate: todayBusinessDate,
        isOnline,
        periodSelection,
        syncDocuments
      })
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
  }, [
    api,
    authState,
    env,
    isOnline,
    isOperator,
    periodError,
    periodSelection,
    reloadKey,
    syncDocuments,
    todayBusinessDate
  ]);

  if (!isOperator) {
    return (
      <section className="access-notice" aria-label="Pulpit operatora">
        <Gauge aria-hidden="true" size={24} />
        <div>
          <p className="eyebrow">Pulpit operatora</p>
          <p>Widok jest dostepny tylko dla aktywnego operatora.</p>
        </div>
      </section>
    );
  }

  const result = periodError ? null : state.result;
  const warnings = result ? dashboardWarnings(result) : [];

  return (
    <section className="operator-dashboard" aria-labelledby="operator-dashboard-title">
      <header className="directory-header">
        <div>
          <p className="eyebrow">
            {isOnline ? (
              <Wifi aria-hidden="true" size={15} />
            ) : (
              <WifiOff aria-hidden="true" size={15} />
            )}
            {isOnline ? "Online" : "Offline"}
          </p>
          <h2 id="operator-dashboard-title">Pulpit operatora</h2>
          <p className="panel-detail">
            {result
              ? `Ostatnie odswiezenie: ${formatTimestamp(result.refreshedAtIso)}.`
              : "Pobieranie biezacego obrazu pracy."}
          </p>
        </div>
        <div className="operator-dashboard__actions">
          <button
            className="primary-action"
            onClick={focusNewHarvestSession}
            type="button"
          >
            <Plus aria-hidden="true" size={18} />
            Nowy zbior
          </button>
          <button
            className="secondary-action icon-button"
            disabled={state.status === "LOADING"}
            onClick={() => {
              setReloadKey((current) => current + 1);
            }}
            title="Odswiez pulpit operatora"
            type="button"
          >
            <RefreshCw aria-hidden="true" size={18} />
            <span className="sr-only">Odswiez pulpit operatora</span>
          </button>
        </div>
      </header>

      <div className="dashboard-filter-bar">
        <DashboardPeriodFilter
          disabled={state.status === "LOADING"}
          idPrefix="operator-dashboard"
          onChange={setPeriodSelection}
          selection={periodSelection}
          todayBusinessDate={todayBusinessDate}
        />
      </div>

      {state.status === "ERROR" ? (
        <p className="form-message form-message--error">
          Nie udalo sie pobrac pulpitu operatora
          {result ? ". Widoczne sa ostatnie dostepne dane." : "."}
        </p>
      ) : null}
      {state.status === "LOADING" && !result ? (
        <p className="empty-state">Pobieranie danych operacyjnych.</p>
      ) : null}

      {result ? (
        <>
          <p className="dashboard-period-summary">{result.period.label}</p>
          <div className="operator-dashboard__metrics">
            <DashboardMetric
              label="Aktywny sezon"
              value={result.activeSeason?.name ?? "Brak"}
            />
            <DashboardMetric
              detail={stockSourceLabel(result.stock.dataSource)}
              label="Dostepne operacyjnie"
              tone={
                result.metrics.availableWeightG === null ||
                result.metrics.availableWeightG < 0
                  ? "WARNING"
                  : "DEFAULT"
              }
              value={
                result.metrics.availableWeightG === null
                  ? "Do sprawdzenia"
                  : formatKilograms(result.metrics.availableWeightG)
              }
            />
            <DashboardMetric
              label="Otwarte sesje"
              value={String(result.metrics.openSessionCount)}
            />
            <DashboardMetric
              label="Moje otwarte"
              value={String(result.metrics.ownOpenSessionCount)}
            />
            <DashboardMetric
              label={
                result.period.preset === "TODAY"
                  ? "Moje zamkniete dzis"
                  : "Moje zamkniete w okresie"
              }
              value={String(result.metrics.ownClosedSessionCount)}
            />
            <DashboardMetric
              label="Lokalnie oczekujace"
              tone={result.metrics.localPendingCount > 0 ? "WARNING" : "DEFAULT"}
              value={String(result.metrics.localPendingCount)}
            />
            <DashboardMetric
              label="Moje konflikty"
              tone={result.metrics.conflictCount > 0 ? "WARNING" : "DEFAULT"}
              value={String(result.metrics.conflictCount)}
            />
          </div>

          {warnings.length > 0 ? (
            <div className="operator-dashboard__warnings" role="alert">
              <AlertTriangle aria-hidden="true" size={20} />
              <ul>
                {warnings.map((warning) => (
                  <li key={warning}>{warning}</li>
                ))}
              </ul>
            </div>
          ) : null}

          <DashboardSessionList
            emptyMessage="Brak otwartych sesji."
            label="Otwarte sesje"
            sessions={result.openSessions}
          />
          <DashboardSessionList
            emptyMessage="Brak wlasnych sesji w wybranym okresie."
            label="Moje sesje w okresie"
            sessions={result.ownRecentSessions}
          />

          {result.conflicts.length > 0 ? (
            <section
              className="operator-dashboard__conflicts"
              aria-labelledby="operator-dashboard-conflicts"
            >
              <h3 id="operator-dashboard-conflicts">Moje konflikty synchronizacji</h3>
              <ul>
                {result.conflicts.map((conflict) => (
                  <li key={conflict.id}>
                    <strong>{conflict.label}</strong>
                    <span>{conflict.detail}</span>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </>
      ) : null}
    </section>
  );
}

function DashboardMetric({
  detail,
  label,
  tone = "DEFAULT",
  value
}: {
  detail?: string;
  label: string;
  tone?: "DEFAULT" | "WARNING";
  value: string;
}) {
  return (
    <div
      className={`operator-dashboard__metric ${
        tone === "WARNING" ? "operator-dashboard__metric--warning" : ""
      }`}
    >
      <span>{label}</span>
      <strong>{value}</strong>
      {detail ? <small>{detail}</small> : null}
    </div>
  );
}

function DashboardSessionList({
  emptyMessage,
  label,
  sessions
}: {
  emptyMessage: string;
  label: string;
  sessions: readonly OperatorDashboardSession[];
}) {
  const headingId = `operator-dashboard-${label
    .toLocaleLowerCase("pl")
    .replaceAll(" ", "-")}`;

  return (
    <section className="operator-dashboard__sessions" aria-labelledby={headingId}>
      <h3 id={headingId}>{label}</h3>
      {sessions.length > 0 ? (
        <ul>
          {sessions.map((session) => (
            <li key={session.id}>
              <ClipboardList aria-hidden="true" size={18} />
              <strong>{session.workerName}</strong>
              <span>{formatBusinessDate(session.businessDate)}</span>
              <small>{sessionStatusLabel(session.status)}</small>
            </li>
          ))}
        </ul>
      ) : (
        <p className="empty-state">{emptyMessage}</p>
      )}
    </section>
  );
}

function dashboardWarnings(result: OperatorDashboardResult): string[] {
  const warnings: string[] = [];

  if (result.connection === "OFFLINE") {
    warnings.push("Pracujesz offline. Stan kilogramow pochodzi z kopii lokalnej.");
  } else if (result.stock.dataSource === "CACHE") {
    warnings.push("Stan kilogramow pochodzi z kopii lokalnej, nie z serwera.");
  }

  if (result.stock.invalidMovementCount > 0) {
    warnings.push("Stan kilogramow jest niespojny i wymaga sprawdzenia.");
  }

  if (result.stock.pendingMovementCount > 0) {
    warnings.push("Czesc zmian stanu kilogramow oczekuje na potwierdzenie.");
  }

  if (result.metrics.availableWeightG !== null && result.metrics.availableWeightG < 0) {
    warnings.push("Dostepny stan kilogramow jest ujemny.");
  }

  return warnings;
}

function stockSourceLabel(
  source: OperatorDashboardResult["stock"]["dataSource"]
): string {
  switch (source) {
    case "SERVER":
      return "Potwierdzony przez serwer";
    case "CACHE":
      return "Kopia lokalna";
    case "UNAVAILABLE":
      return "Brak aktywnego sezonu";
  }
}

function sessionStatusLabel(status: OperatorDashboardSession["status"]): string {
  switch (status) {
    case "OPEN":
      return "otwarta";
    case "CLOSED":
      return "zamknieta";
    case "PAID":
      return "wyplacona";
    case "CANCELLED":
      return "anulowana";
    default:
      return "do sprawdzenia";
  }
}

function focusNewHarvestSession(): void {
  const target = document.getElementById("new-harvest-session");
  target?.scrollIntoView({ behavior: "smooth", block: "start" });
  const control = target?.querySelector<HTMLElement>(
    "select:not(:disabled), input:not(:disabled), button:not(:disabled)"
  );
  (control ?? target)?.focus();
}

function formatTimestamp(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString("pl-PL");
}
