import { UserRound } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import type { AuthSessionState } from "../auth/authSession";
import { DashboardPeriodFilter } from "../dashboard/DashboardPeriodFilter";
import {
  currentWarsawBusinessDate,
  dashboardPeriodSelectionError,
  DEFAULT_DASHBOARD_PERIOD,
  type DashboardPeriodSelection
} from "../dashboard/dashboardPeriod";
import { formatKilograms, formatMoney } from "../domain/format";
import {
  loadPickerDashboard,
  type PickerDashboardInput,
  type PickerDashboardResult
} from "./pickerDashboard";

type FirebaseEnv = Record<string, string | boolean | undefined>;

export type PickerDashboardApi = {
  load: (env: FirebaseEnv, input: PickerDashboardInput) => Promise<PickerDashboardResult>;
};

export const defaultPickerDashboardApi: PickerDashboardApi = {
  load: loadPickerDashboard
};

type DashboardState =
  | {
      result: PickerDashboardResult | null;
      status: "IDLE" | "LOADING";
    }
  | {
      result: PickerDashboardResult;
      status: "READY";
    }
  | {
      result: PickerDashboardResult | null;
      status: "ERROR";
    };

const initialState: DashboardState = {
  result: null,
  status: "IDLE"
};

export function PickerDashboardPanel({
  authState,
  env,
  isOnline,
  pickerDashboardApi = defaultPickerDashboardApi
}: {
  authState: AuthSessionState;
  env: FirebaseEnv;
  isOnline: boolean;
  pickerDashboardApi?: PickerDashboardApi;
}) {
  const [state, setState] = useState<DashboardState>(initialState);
  const [selectedSeasonId, setSelectedSeasonId] = useState<string | null>(null);
  const [periodSelection, setPeriodSelection] = useState<DashboardPeriodSelection>(
    DEFAULT_DASHBOARD_PERIOD
  );
  const todayBusinessDate = useMemo(() => currentWarsawBusinessDate(), []);
  const periodError = dashboardPeriodSelectionError(periodSelection);
  const isPicker =
    authState.status === "READY" &&
    authState.profile.role === "PICKER" &&
    authState.profile.workerId !== null;

  useEffect(() => {
    let isMounted = true;

    if (!isPicker) {
      setState(initialState);
      setSelectedSeasonId(null);
      return undefined;
    }

    if (periodError) {
      return undefined;
    }

    setState((current) => ({
      result: current.result,
      status: "LOADING"
    }));
    void pickerDashboardApi
      .load(env, {
        actorProfile: authState.profile,
        businessDate: todayBusinessDate,
        isOnline,
        periodSelection,
        selectedSeasonId
      })
      .then((result) => {
        if (isMounted) {
          setState({ result, status: "READY" });
        }
      })
      .catch(() => {
        if (isMounted) {
          setState((current) => ({
            result: current.result,
            status: "ERROR"
          }));
        }
      });

    return () => {
      isMounted = false;
    };
  }, [
    authState,
    env,
    isOnline,
    isPicker,
    periodError,
    periodSelection,
    pickerDashboardApi,
    selectedSeasonId,
    todayBusinessDate
  ]);

  if (!isPicker) {
    return (
      <section className="access-notice" aria-label="Pulpit zbieracza">
        <UserRound aria-hidden="true" size={24} />
        <div>
          <p className="eyebrow">Pulpit zbieracza</p>
          <p>Widok wymaga aktywnego konta powiązanego ze zbieraczem.</p>
        </div>
      </section>
    );
  }

  const result = periodError ? null : state.result;

  return (
    <section className="picker-dashboard" aria-label="Pulpit zbieracza">
      <header className="directory-header">
        <div>
          <p className="panel-detail">
            {result
              ? result.workerName
                ? `${result.userName} / ${result.workerName}`
                : result.userName
              : authState.profile.displayName}
          </p>
        </div>
        <div className="picker-dashboard__controls">
          <label className="field">
            <span>Sezon</span>
            <select
              disabled={!result || state.status === "LOADING"}
              onChange={(event) => {
                setSelectedSeasonId(event.target.value || null);
              }}
              value={selectedSeasonId ?? result?.selectedSeasonId ?? ""}
            >
              {!result?.seasons.length ? <option value="">Brak sezonów</option> : null}
              {result?.seasons.map((season) => (
                <option key={season.id} value={season.id}>
                  {season.name}
                </option>
              ))}
            </select>
          </label>
        </div>
      </header>

      <div className="dashboard-filter-bar">
        <DashboardPeriodFilter
          disabled={state.status === "LOADING"}
          idPrefix="picker-dashboard"
          onChange={setPeriodSelection}
          selection={periodSelection}
          todayBusinessDate={todayBusinessDate}
        />
      </div>

      {state.status === "LOADING" && !result ? (
        <p className="empty-state">Pobieranie podsumowania.</p>
      ) : null}
      {state.status === "ERROR" ? (
        <p className="form-message form-message--error">
          Nie udało się pobrać danych pulpitu zbieracza.
        </p>
      ) : null}
      {result ? (
        <>
          {result.period ? (
            <p className="dashboard-period-summary">{result.period.label}</p>
          ) : null}
          <div className="directory-summary" aria-label="Podsumowanie zbiorów">
            <DashboardStat
              label="Łączna masa"
              value={formatKilograms(result.totalWeightG)}
            />
            <DashboardStat
              label="Naliczono"
              value={formatMoney(result.accruedAmountGrosz)}
            />
            <DashboardStat
              label="Wypłacono"
              value={formatMoney(result.paidAmountGrosz)}
            />
            <DashboardStat
              label="Pozostało"
              value={formatMoney(result.remainingAmountGrosz)}
            />
          </div>

          <div className="picker-dashboard__status-grid" aria-label="Statusy sesji">
            <DashboardStat label="Otwarte" value={String(result.sessionCounts.open)} />
            <DashboardStat
              label="Zamknięte"
              value={String(result.sessionCounts.closed)}
            />
            <DashboardStat label="Wypłacone" value={String(result.sessionCounts.paid)} />
          </div>

          {result.quantities.length > 0 ? (
            <section
              className="picker-dashboard__quantities"
              aria-labelledby="picker-quantity-title"
            >
              <h3 id="picker-quantity-title">Jednostki planów ilościowych</h3>
              <dl>
                {result.quantities.map((quantity) => (
                  <div
                    key={`${quantity.planId}-${quantity.unitLabelPlural}-${String(quantity.quantityPrecision)}`}
                  >
                    <dt>{quantity.planName}</dt>
                    <dd>
                      {formatQuantity(
                        quantity.totalQuantityMilli,
                        quantity.quantityPrecision
                      )}{" "}
                      {quantity.unitLabelPlural}
                    </dd>
                  </div>
                ))}
              </dl>
            </section>
          ) : null}

          {result.invalidWorker ||
          result.invalidPaymentCount > 0 ||
          result.invalidSeasonCount > 0 ||
          result.invalidSessionCount > 0 ? (
            <p className="form-message form-message--warning">
              Dane wymagające kontroli: profil pracownika{" "}
              {result.invalidWorker ? "1" : "0"}, sesje {result.invalidSessionCount},
              wypłaty {result.invalidPaymentCount}, sezony {result.invalidSeasonCount}.
            </p>
          ) : null}
          {result.remainingAmountGrosz < 0 ? (
            <p className="form-message form-message--warning">
              Kwota wypłacona przekracza naliczoną. Zgłoś rozbieżność administratorowi.
            </p>
          ) : null}
        </>
      ) : null}
    </section>
  );
}

function DashboardStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="directory-stat">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function formatQuantity(quantityMilli: number, precision: number): string {
  if (
    !Number.isSafeInteger(quantityMilli) ||
    !Number.isInteger(precision) ||
    precision < 0 ||
    precision > 3
  ) {
    throw new Error("Nieprawidlowa ilość do wyświetlenia.");
  }

  return new Intl.NumberFormat("pl-PL", {
    minimumFractionDigits: 0,
    maximumFractionDigits: precision
  }).format(quantityMilli / 1000);
}
