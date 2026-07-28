import { CloudOff, RefreshCw, UserRound } from "lucide-react";
import { useEffect, useState } from "react";

import type { AuthSessionState } from "../auth/authSession";
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
  const [reloadKey, setReloadKey] = useState(0);
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

    setState((current) => ({
      result: current.result,
      status: "LOADING"
    }));
    void pickerDashboardApi
      .load(env, {
        actorProfile: authState.profile,
        isOnline,
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
    pickerDashboardApi,
    reloadKey,
    selectedSeasonId
  ]);

  if (!isPicker) {
    return (
      <section className="access-notice" aria-label="Pulpit zbieracza">
        <UserRound aria-hidden="true" size={24} />
        <div>
          <p className="eyebrow">Pulpit zbieracza</p>
          <p>Widok wymaga aktywnego konta zbieracza powiazanego z workerId.</p>
        </div>
      </section>
    );
  }

  const result = state.result;

  return (
    <section className="picker-dashboard" aria-labelledby="picker-dashboard-title">
      <header className="directory-header">
        <div>
          <p className="eyebrow">Moje rozliczenie</p>
          <h2 id="picker-dashboard-title">Pulpit zbieracza</h2>
          <p className="panel-detail">
            {result
              ? `${result.userName} / ${result.workerName ?? result.workerId}`
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
              {!result?.seasons.length ? <option value="">Brak sezonow</option> : null}
              {result?.seasons.map((season) => (
                <option key={season.id} value={season.id}>
                  {season.name}
                </option>
              ))}
            </select>
          </label>
          <button
            aria-label="Odswiez pulpit zbieracza"
            className="secondary-button icon-button"
            disabled={state.status === "LOADING"}
            onClick={() => {
              setReloadKey((current) => current + 1);
            }}
            title="Odswiez pulpit zbieracza"
            type="button"
          >
            <RefreshCw aria-hidden="true" size={18} />
          </button>
        </div>
      </header>

      {result?.dataSource === "CACHE" ? (
        <p className="picker-dashboard__source form-message form-message--warning">
          <CloudOff aria-hidden="true" size={18} />
          Dane z pamieci offline
        </p>
      ) : null}
      {state.status === "LOADING" && !result ? (
        <p className="empty-state">Pobieranie podsumowania.</p>
      ) : null}
      {state.status === "ERROR" ? (
        <p className="form-message form-message--error">
          Nie udalo sie pobrac danych pulpitu zbieracza.
        </p>
      ) : null}
      {result ? (
        <>
          <div className="directory-summary" aria-label="Podsumowanie zbiorow">
            <DashboardStat
              label="Laczna masa"
              value={formatKilograms(result.totalWeightG)}
            />
            <DashboardStat
              label="Naliczono"
              value={formatMoney(result.accruedAmountGrosz)}
            />
            <DashboardStat
              label="Wyplacono"
              value={formatMoney(result.paidAmountGrosz)}
            />
            <DashboardStat
              label="Pozostalo"
              value={formatMoney(result.remainingAmountGrosz)}
            />
          </div>

          <div className="picker-dashboard__status-grid" aria-label="Statusy sesji">
            <DashboardStat label="Otwarte" value={String(result.sessionCounts.open)} />
            <DashboardStat
              label="Zamkniete"
              value={String(result.sessionCounts.closed)}
            />
            <DashboardStat label="Wyplacone" value={String(result.sessionCounts.paid)} />
          </div>

          {result.quantities.length > 0 ? (
            <section
              className="picker-dashboard__quantities"
              aria-labelledby="picker-quantity-title"
            >
              <h3 id="picker-quantity-title">Jednostki planow ilosciowych</h3>
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
              Dane wymagajace kontroli: profil pracownika{" "}
              {result.invalidWorker ? "1" : "0"}, sesje {result.invalidSessionCount},
              wyplaty {result.invalidPaymentCount}, sezony {result.invalidSeasonCount}.
            </p>
          ) : null}
          {result.remainingAmountGrosz < 0 ? (
            <p className="form-message form-message--warning">
              Kwota wyplacona przekracza naliczona. Zglos rozbieznosc administratorowi.
            </p>
          ) : null}
          <p className="picker-dashboard__refreshed">
            Ostatnie odswiezenie: {formatRefreshTime(result.refreshedAtIso)}
          </p>
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
    throw new Error("Nieprawidlowa ilosc do wyswietlenia.");
  }

  return new Intl.NumberFormat("pl-PL", {
    minimumFractionDigits: 0,
    maximumFractionDigits: precision
  }).format(quantityMilli / 1000);
}

function formatRefreshTime(isoTimestamp: string): string {
  return new Intl.DateTimeFormat("pl-PL", {
    dateStyle: "short",
    timeStyle: "medium",
    timeZone: "Europe/Warsaw"
  }).format(new Date(isoTimestamp));
}
