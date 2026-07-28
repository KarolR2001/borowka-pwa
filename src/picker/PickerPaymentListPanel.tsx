import { CloudOff, Eye, RefreshCw, UserRound } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import type { AuthSessionState } from "../auth/authSession";
import { formatBusinessDate, formatMoney } from "../domain/format";
import {
  defaultPickerPaymentFilters,
  filterPickerPaymentItems,
  loadPickerPaymentList,
  summarizePickerPaymentPeriod,
  type PickerPaymentFilters,
  type PickerPaymentListInput,
  type PickerPaymentListItem,
  type PickerPaymentListResult
} from "./pickerPaymentList";
import {
  PickerSessionDetailsPanel,
  type PickerSessionDetailsApi
} from "./PickerSessionDetailsPanel";

type FirebaseEnv = Record<string, string | boolean | undefined>;

export type PickerPaymentListApi = {
  load: (
    env: FirebaseEnv,
    input: PickerPaymentListInput
  ) => Promise<PickerPaymentListResult>;
};

export const defaultPickerPaymentListApi: PickerPaymentListApi = {
  load: loadPickerPaymentList
};

type PaymentListState =
  | { result: PickerPaymentListResult | null; status: "IDLE" | "LOADING" }
  | { result: PickerPaymentListResult; status: "READY" }
  | { result: PickerPaymentListResult | null; status: "ERROR" };

const initialState: PaymentListState = {
  result: null,
  status: "IDLE"
};

export function PickerPaymentListPanel({
  authState,
  env,
  isOnline,
  pickerPaymentListApi = defaultPickerPaymentListApi,
  pickerSessionDetailsApi
}: {
  authState: AuthSessionState;
  env: FirebaseEnv;
  isOnline: boolean;
  pickerPaymentListApi?: PickerPaymentListApi;
  pickerSessionDetailsApi?: PickerSessionDetailsApi;
}) {
  const [state, setState] = useState<PaymentListState>(initialState);
  const [filters, setFilters] = useState<PickerPaymentFilters>(
    defaultPickerPaymentFilters
  );
  const [reloadKey, setReloadKey] = useState(0);
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [reportSessionId, setReportSessionId] = useState<string | null>(null);
  const isPicker =
    authState.status === "READY" &&
    authState.profile.role === "PICKER" &&
    authState.profile.workerId !== null;

  useEffect(() => {
    let isMounted = true;

    if (!isPicker) {
      setState(initialState);
      return undefined;
    }

    setState((current) => ({ result: current.result, status: "LOADING" }));
    void pickerPaymentListApi
      .load(env, {
        actorProfile: authState.profile,
        isOnline
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
  }, [authState, env, isOnline, isPicker, pickerPaymentListApi, reloadKey]);

  const visiblePayments = useMemo(
    () => filterPickerPaymentItems(state.result?.payments ?? [], filters),
    [filters, state.result]
  );
  const summary = useMemo(
    () =>
      summarizePickerPaymentPeriod(
        state.result ?? { payments: [], sessions: [] },
        filters
      ),
    [filters, state.result]
  );

  if (!isPicker) {
    return (
      <section className="access-notice" aria-label="Moje wyplaty">
        <UserRound aria-hidden="true" size={24} />
        <div>
          <p className="eyebrow">Moje wyplaty</p>
          <p>Lista wymaga aktywnego konta zbieracza powiazanego z workerId.</p>
        </div>
      </section>
    );
  }

  return (
    <section className="picker-payment-list" aria-labelledby="picker-payment-title">
      <header className="directory-header">
        <div>
          <p className="eyebrow">Rozliczenia</p>
          <h2 id="picker-payment-title">Moje wyplaty</h2>
          <p className="panel-detail">
            Okres dotyczy dat sesji. Anulowane wyplaty pozostaja w historii.
          </p>
        </div>
        <button
          aria-label="Odswiez moje wyplaty"
          className="secondary-button icon-button"
          disabled={state.status === "LOADING"}
          onClick={() => {
            setReloadKey((current) => current + 1);
          }}
          title="Odswiez moje wyplaty"
          type="button"
        >
          <RefreshCw aria-hidden="true" size={18} />
        </button>
      </header>

      <PickerPaymentFilters
        filters={filters}
        onChange={setFilters}
        seasons={state.result?.seasons ?? []}
      />

      <div className="directory-summary" aria-label="Podsumowanie moich wyplat">
        <PaymentStat label="Naliczono" value={formatMoney(summary.accruedAmountGrosz)} />
        <PaymentStat
          label={`Wyplacono (${String(summary.activePaymentCount)})`}
          value={formatMoney(summary.paidAmountGrosz)}
        />
        <PaymentStat
          label="Pozostalo do wyplaty"
          value={formatMoney(summary.remainingAmountGrosz)}
        />
        <PaymentStat
          label={`Anulowane poza suma (${String(summary.cancelledPaymentCount)})`}
          value={formatMoney(summary.cancelledAmountGrosz)}
        />
      </div>

      {state.result?.dataSource === "CACHE" ? (
        <p className="picker-dashboard__source form-message form-message--warning">
          <CloudOff aria-hidden="true" size={18} />
          Wyplaty z pamieci offline moga nie byc aktualne
        </p>
      ) : null}
      {state.status === "ERROR" ? (
        <p className="form-message form-message--error">
          Nie udalo sie pobrac historii wlasnych wyplat.
        </p>
      ) : null}
      {state.result &&
      (state.result.invalidPaymentCount > 0 ||
        state.result.invalidSeasonCount > 0 ||
        state.result.invalidSessionCount > 0 ||
        state.result.missingSourceSessionCount > 0) ? (
        <p className="form-message form-message--warning">
          Dane wymagajace kontroli: wyplaty {state.result.invalidPaymentCount}, sesje{" "}
          {state.result.invalidSessionCount}, brak sesji zrodlowej{" "}
          {state.result.missingSourceSessionCount}, sezony{" "}
          {state.result.invalidSeasonCount}.
        </p>
      ) : null}
      {summary.remainingAmountGrosz < 0 ? (
        <p className="form-message form-message--warning">
          Wyplacona kwota przekracza naliczenie dla wybranego okresu.
        </p>
      ) : null}
      {selectedSessionId ? (
        <PickerSessionDetailsPanel
          authState={authState}
          detailsApi={pickerSessionDetailsApi}
          env={env}
          isOnline={isOnline}
          onClose={() => {
            setSelectedSessionId(null);
            setReportSessionId(null);
          }}
          onReportIssue={setReportSessionId}
          sessionId={selectedSessionId}
        />
      ) : null}
      {reportSessionId ? (
        <p className="form-message form-message--ok">
          Sesja zostala wybrana do zgloszenia niezgodnosci.
        </p>
      ) : null}
      {state.status === "LOADING" && !state.result ? (
        <p className="empty-state">Pobieranie historii wyplat.</p>
      ) : null}
      {state.result && visiblePayments.length === 0 ? (
        <p className="empty-state">Brak wyplat spelniajacych wybrane filtry.</p>
      ) : null}
      {visiblePayments.length > 0 ? (
        <PaymentTable
          onOpenSession={(sessionId) => {
            setReportSessionId(null);
            setSelectedSessionId(sessionId);
          }}
          payments={visiblePayments}
        />
      ) : null}
    </section>
  );
}

function PickerPaymentFilters({
  filters,
  onChange,
  seasons
}: {
  filters: PickerPaymentFilters;
  onChange: (filters: PickerPaymentFilters) => void;
  seasons: readonly { id: string; name: string }[];
}) {
  return (
    <div className="picker-payment-filters" aria-label="Filtry moich wyplat">
      <label className="field">
        <span>Sezon</span>
        <select
          onChange={(event) => {
            onChange({ ...filters, seasonId: event.target.value });
          }}
          value={filters.seasonId}
        >
          <option value="">Wszystkie sezony</option>
          {seasons.map((season) => (
            <option key={season.id} value={season.id}>
              {season.name}
            </option>
          ))}
        </select>
      </label>
      <label className="field">
        <span>Sesja od</span>
        <input
          onChange={(event) => {
            onChange({ ...filters, fromDate: event.target.value });
          }}
          type="date"
          value={filters.fromDate}
        />
      </label>
      <label className="field">
        <span>Sesja do</span>
        <input
          onChange={(event) => {
            onChange({ ...filters, toDate: event.target.value });
          }}
          type="date"
          value={filters.toDate}
        />
      </label>
      <label className="field">
        <span>Status</span>
        <select
          onChange={(event) => {
            onChange({
              ...filters,
              status: event.target.value as PickerPaymentFilters["status"]
            });
          }}
          value={filters.status}
        >
          <option value="ALL">Wszystkie statusy</option>
          <option value="ACTIVE">Aktywna</option>
          <option value="CANCELLED">Anulowana</option>
        </select>
      </label>
    </div>
  );
}

function PaymentTable({
  onOpenSession,
  payments
}: {
  onOpenSession: (sessionId: string) => void;
  payments: readonly PickerPaymentListItem[];
}) {
  return (
    <div className="directory-table-wrap">
      <table className="directory-table picker-payment-table">
        <thead>
          <tr>
            <th>Data wyplaty</th>
            <th>Data sesji</th>
            <th>Sezon</th>
            <th>Kwota</th>
            <th>Metoda</th>
            <th>Status</th>
            <th>
              <span className="sr-only">Sesja zrodlowa</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {payments.map((payment) => (
            <tr key={payment.id}>
              <td>{formatBusinessDate(payment.paidBusinessDate)}</td>
              <td>
                {payment.sessionBusinessDate
                  ? formatBusinessDate(payment.sessionBusinessDate)
                  : "Brak danych"}
              </td>
              <td>{payment.seasonName}</td>
              <td>{formatMoney(payment.amountGrosz)}</td>
              <td>{paymentMethodLabel(payment.paymentMethod)}</td>
              <td>
                <span
                  className={`picker-payment-status picker-payment-status--${payment.status}`}
                >
                  {payment.status === "ACTIVE" ? "Aktywna" : "Anulowana"}
                </span>
              </td>
              <td>
                <button
                  aria-label={`Otworz sesje wyplaty z ${formatBusinessDate(payment.paidBusinessDate)}`}
                  className="secondary-button icon-button"
                  disabled={payment.sessionBusinessDate === null}
                  onClick={() => {
                    onOpenSession(payment.sessionId);
                  }}
                  title="Otworz sesje zrodlowa"
                  type="button"
                >
                  <Eye aria-hidden="true" size={18} />
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function PaymentStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="directory-stat">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function paymentMethodLabel(method: PickerPaymentListItem["paymentMethod"]): string {
  switch (method) {
    case "BANK_TRANSFER":
      return "Przelew bankowy";
    case "CASH":
      return "Gotowka";
    case "OTHER":
      return "Inna";
  }
}
