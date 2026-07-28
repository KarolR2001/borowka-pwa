import { Banknote, RefreshCw } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import type { AuthSessionState } from "../auth/authSession";
import {
  formatBusinessDate,
  formatKilograms,
  formatMoney,
  parseDecimalToScaledInteger
} from "../domain/format";
import type { SyncDocumentMetadataInput } from "../offline/pendingWriteMetadata";
import {
  defaultPendingPaymentFilters,
  filterPendingPaymentSessions,
  listPendingPaymentSessions,
  type PendingPaymentDirectoryInput,
  type PendingPaymentDirectoryResult,
  type PendingPaymentFilters,
  type PendingPaymentSession
} from "./pendingPayments";

type FirebaseEnv = Record<string, string | boolean | undefined>;

export type PendingPaymentsApi = {
  list: (
    env: FirebaseEnv,
    input: PendingPaymentDirectoryInput
  ) => Promise<PendingPaymentDirectoryResult>;
};

export const defaultPendingPaymentsApi: PendingPaymentsApi = {
  list: listPendingPaymentSessions
};

type DirectoryState =
  | { status: "IDLE" | "LOADING"; result: PendingPaymentDirectoryResult | null }
  | { status: "READY"; result: PendingPaymentDirectoryResult }
  | { status: "ERROR"; result: PendingPaymentDirectoryResult | null };

const initialState: DirectoryState = { status: "IDLE", result: null };

export function AdminPendingPaymentsPanel({
  authState,
  env,
  isOnline,
  pendingPaymentsApi = defaultPendingPaymentsApi,
  syncDocuments
}: {
  authState: AuthSessionState;
  env: FirebaseEnv;
  isOnline: boolean;
  pendingPaymentsApi?: PendingPaymentsApi;
  syncDocuments: readonly SyncDocumentMetadataInput[];
}) {
  const [state, setState] = useState<DirectoryState>(initialState);
  const [filters, setFilters] = useState<PendingPaymentFilters>(
    defaultPendingPaymentFilters
  );
  const [reloadKey, setReloadKey] = useState(0);
  const isAdmin = authState.status === "READY" && authState.profile.role === "ADMIN";

  useEffect(() => {
    let isMounted = true;

    if (!isAdmin) {
      setState(initialState);
      return undefined;
    }

    setState((current) => ({ status: "LOADING", result: current.result }));
    void pendingPaymentsApi
      .list(env, {
        actorProfile: authState.profile,
        isOnline,
        syncDocuments
      })
      .then((result) => {
        if (isMounted) {
          setState({ status: "READY", result });
        }
      })
      .catch(() => {
        if (isMounted) {
          setState((current) => ({ status: "ERROR", result: current.result }));
        }
      });

    return () => {
      isMounted = false;
    };
  }, [authState, env, isAdmin, isOnline, pendingPaymentsApi, reloadKey, syncDocuments]);

  const sessions = state.result?.sessions ?? [];
  const filteredSessions = useMemo(
    () => filterPendingPaymentSessions(sessions, filters),
    [filters, sessions]
  );

  if (authState.status !== "READY") {
    return <AccessNotice message="Zaloguj sie jako administrator." />;
  }

  if (!isAdmin) {
    return <AccessNotice message="Lista sesji do wyplaty wymaga administratora." />;
  }

  return (
    <section className="pending-payment-directory" aria-labelledby="payments-title">
      <header className="directory-header">
        <div>
          <p className="eyebrow">Rozliczenia</p>
          <h2 id="payments-title">Sesje oczekujace na wyplate</h2>
          <p className="panel-detail">
            Najstarsze potwierdzone zobowiazania sa wyswietlane jako pierwsze.
          </p>
        </div>
        <button
          className="secondary-button icon-button"
          onClick={() => {
            setReloadKey((current) => current + 1);
          }}
          title="Odswiez liste"
          type="button"
        >
          <RefreshCw aria-hidden="true" size={18} />
          <span className="sr-only">Odswiez liste</span>
        </button>
      </header>

      <PaymentFilters filters={filters} onChange={setFilters} sessions={sessions} />

      <div className="directory-summary" aria-label="Podsumowanie sesji do wyplaty">
        <DirectoryStat label="Do wyplaty" value={String(sessions.length)} />
        <DirectoryStat
          label="Widoczne po filtrach"
          value={String(filteredSessions.length)}
        />
        <DirectoryStat
          label="Suma"
          value={formatMoney(
            filteredSessions.reduce((total, session) => total + session.amountDueGrosz, 0)
          )}
        />
        <DirectoryStat
          label="Wykluczone pending"
          value={String(state.result?.excluded.pendingSynchronizationCount ?? 0)}
        />
      </div>

      {state.status === "LOADING" && !state.result ? (
        <p className="empty-state">Pobieranie sesji.</p>
      ) : null}
      {state.status === "ERROR" ? (
        <p className="form-message form-message--error">
          Nie udalo sie pobrac listy sesji do wyplaty.
        </p>
      ) : null}
      {state.result && state.result.invalidDocumentCount > 0 ? (
        <p className="form-message form-message--error">
          Pominieto nieprawidlowe dokumenty: {state.result.invalidDocumentCount}.
        </p>
      ) : null}
      {filteredSessions.length === 0 && state.status !== "LOADING" ? (
        <p className="empty-state">Brak sesji spelniajacych filtry.</p>
      ) : null}
      {filteredSessions.length > 0 ? (
        <PendingPaymentTable sessions={filteredSessions} />
      ) : null}
    </section>
  );
}

function PaymentFilters({
  filters,
  onChange,
  sessions
}: {
  filters: PendingPaymentFilters;
  onChange: (filters: PendingPaymentFilters) => void;
  sessions: readonly PendingPaymentSession[];
}) {
  return (
    <div className="directory-filters pending-payment-filters">
      <SelectFilter
        label="Sezon"
        onChange={(seasonId) => {
          onChange({ ...filters, seasonId });
        }}
        options={uniqueOptions(sessions, "seasonId", "seasonName")}
        value={filters.seasonId}
      />
      <SelectFilter
        label="Zbieracz"
        onChange={(workerId) => {
          onChange({ ...filters, workerId });
        }}
        options={uniqueOptions(sessions, "workerId", "workerName")}
        value={filters.workerId}
      />
      <SelectFilter
        label="Plan"
        onChange={(planId) => {
          onChange({ ...filters, planId });
        }}
        options={uniqueOptions(sessions, "planId", "planName")}
        value={filters.planId}
      />
      <label className="field">
        <span>Data od</span>
        <input
          onChange={(event) => {
            onChange({ ...filters, fromDate: event.target.value });
          }}
          type="date"
          value={filters.fromDate}
        />
      </label>
      <label className="field">
        <span>Data do</span>
        <input
          onChange={(event) => {
            onChange({ ...filters, toDate: event.target.value });
          }}
          type="date"
          value={filters.toDate}
        />
      </label>
      <MoneyFilter
        label="Kwota od"
        onChange={(minAmountGrosz) => {
          onChange({ ...filters, minAmountGrosz });
        }}
        value={filters.minAmountGrosz}
      />
      <MoneyFilter
        label="Kwota do"
        onChange={(maxAmountGrosz) => {
          onChange({ ...filters, maxAmountGrosz });
        }}
        value={filters.maxAmountGrosz}
      />
    </div>
  );
}

function PendingPaymentTable({
  sessions
}: {
  sessions: readonly PendingPaymentSession[];
}) {
  return (
    <div className="directory-table-wrap">
      <table className="directory-table pending-payment-table">
        <thead>
          <tr>
            <th scope="col">Zbieracz</th>
            <th scope="col">Sesja</th>
            <th scope="col">Plan</th>
            <th scope="col">Wynik</th>
            <th scope="col">Naliczono</th>
            <th scope="col">Zamkniecie</th>
            <th scope="col">Synchronizacja</th>
            <th scope="col">Historia wyplaty</th>
          </tr>
        </thead>
        <tbody>
          {sessions.map((session) => (
            <tr key={session.sessionId}>
              <td>
                {session.workerName}
                <span className="directory-cell-note">{session.seasonName}</span>
              </td>
              <td>
                {formatBusinessDate(session.businessDate)}
                <span className="directory-cell-note">{session.sessionId}</span>
              </td>
              <td>
                {session.planName}
                <span className="directory-cell-note">{session.unitLabel}</span>
              </td>
              <td>
                {session.totalEntryCount} wpisow
                <span className="directory-cell-note">
                  {formatQuantity(session.totalQuantityMilli)} /{" "}
                  {formatKilograms(session.totalWeightG)}
                </span>
              </td>
              <td>{formatMoney(session.amountDueGrosz)}</td>
              <td>
                {formatTimestamp(session.closedAt)}
                <span className="directory-cell-note">{session.closedBy}</span>
              </td>
              <td>
                {session.syncStatus === "SYNCED" ? "Potwierdzona" : "Snapshot offline"}
              </td>
              <td>
                {session.paymentHistory === "CANCELLED"
                  ? "Anulowana wyplata"
                  : "Brak wyplaty"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function SelectFilter({
  label,
  onChange,
  options,
  value
}: {
  label: string;
  onChange: (value: string) => void;
  options: readonly { label: string; value: string }[];
  value: string;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      <select
        onChange={(event) => {
          onChange(event.target.value);
        }}
        value={value}
      >
        <option value="">Wszystkie</option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function MoneyFilter({
  label,
  onChange,
  value
}: {
  label: string;
  onChange: (value: number | null) => void;
  value: number | null;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      <input
        inputMode="decimal"
        min="0"
        onChange={(event) => {
          onChange(parseMoney(event.target.value));
        }}
        step="0.01"
        type="number"
        value={value === null ? "" : String(value / 100)}
      />
    </label>
  );
}

function DirectoryStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="directory-stat">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function AccessNotice({ message }: { message: string }) {
  return (
    <section className="access-notice">
      <Banknote aria-hidden="true" size={24} />
      <div>
        <p className="eyebrow">Rozliczenia</p>
        <p>{message}</p>
      </div>
    </section>
  );
}

function uniqueOptions(
  sessions: readonly PendingPaymentSession[],
  valueKey: "seasonId" | "workerId" | "planId",
  labelKey: "seasonName" | "workerName" | "planName"
): { label: string; value: string }[] {
  return Array.from(
    new Map(
      sessions.map((session) => [
        session[valueKey],
        { label: session[labelKey], value: session[valueKey] }
      ])
    ).values()
  ).sort((left, right) => left.label.localeCompare(right.label, "pl"));
}

function parseMoney(value: string): number | null {
  if (!value.trim()) {
    return null;
  }

  try {
    return Math.max(0, parseDecimalToScaledInteger(value, 2));
  } catch {
    return null;
  }
}

function formatQuantity(quantityMilli: number): string {
  return new Intl.NumberFormat("pl-PL", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 3
  }).format(quantityMilli / 1000);
}

function formatTimestamp(value: unknown): string {
  const date =
    value instanceof Date
      ? value
      : isTimestampLike(value)
        ? value.toDate()
        : typeof value === "string"
          ? new Date(value)
          : null;

  if (!date || Number.isNaN(date.getTime())) {
    return "brak czasu";
  }

  return new Intl.DateTimeFormat("pl-PL", {
    dateStyle: "short",
    timeStyle: "short"
  }).format(date);
}

function isTimestampLike(value: unknown): value is { toDate: () => Date } {
  return (
    typeof value === "object" &&
    value !== null &&
    "toDate" in value &&
    typeof value.toDate === "function"
  );
}
