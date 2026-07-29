import { AlertTriangle, Gauge, RefreshCw } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import type { AuthSessionState } from "../auth/authSession";
import { formatKilograms, formatMoney } from "../domain/format";
import type { SyncDocumentMetadataInput } from "../offline/pendingWriteMetadata";
import {
  loadAdminDashboard,
  type AdminDashboardResult,
  type LoadAdminDashboardInput
} from "./adminDashboard";

type FirebaseEnv = Record<string, string | boolean | undefined>;

export type AdminDashboardApi = {
  load: (
    env: FirebaseEnv,
    input: LoadAdminDashboardInput
  ) => Promise<AdminDashboardResult>;
};

export const defaultAdminDashboardApi: AdminDashboardApi = {
  load: loadAdminDashboard
};

type DashboardState =
  | { result: AdminDashboardResult | null; status: "IDLE" | "LOADING" }
  | { result: AdminDashboardResult; status: "READY" }
  | { result: AdminDashboardResult | null; status: "ERROR" };

const initialState: DashboardState = {
  result: null,
  status: "IDLE"
};

export function AdminDashboardPanel({
  api = defaultAdminDashboardApi,
  authState,
  env,
  isOnline,
  syncDocuments
}: {
  api?: AdminDashboardApi;
  authState: AuthSessionState;
  env: FirebaseEnv;
  isOnline: boolean;
  syncDocuments: readonly SyncDocumentMetadataInput[];
}) {
  const [state, setState] = useState<DashboardState>(initialState);
  const [selectedSeasonId, setSelectedSeasonId] = useState("");
  const [reloadKey, setReloadKey] = useState(0);
  const isAdmin = authState.status === "READY" && authState.profile.role === "ADMIN";

  useEffect(() => {
    let isMounted = true;

    if (!isAdmin) {
      setState(initialState);
      return undefined;
    }

    if (!isOnline) {
      setState((current) => ({ result: current.result, status: "ERROR" }));
      return undefined;
    }

    setState((current) => ({ result: current.result, status: "LOADING" }));
    void api
      .load(env, {
        actorProfile: authState.profile,
        isOnline,
        syncDocuments
      })
      .then((result) => {
        if (isMounted) {
          setState({ result, status: "READY" });
          setSelectedSeasonId((current) => {
            if (result.seasons.some((season) => season.id === current)) {
              return current;
            }

            const defaultSeason = result.seasons.find((season) => season.isDefault);
            if (defaultSeason) {
              return defaultSeason.id;
            }

            const openSeason = result.seasons.find((season) => season.status === "OPEN");
            if (openSeason) {
              return openSeason.id;
            }

            return result.seasons[0]?.id ?? "";
          });
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
  }, [api, authState, env, isAdmin, isOnline, reloadKey, syncDocuments]);

  const selectedSeason = useMemo(
    () => state.result?.seasons.find((season) => season.id === selectedSeasonId) ?? null,
    [selectedSeasonId, state.result]
  );
  const localPendingCount = state.result
    ? state.result.localSyncSummary.localSavedCount +
      state.result.localSyncSummary.pendingSyncCount
    : 0;

  if (!isAdmin) {
    return (
      <section className="access-notice" aria-label="Pulpit administratora">
        <Gauge aria-hidden="true" size={24} />
        <div>
          <p className="eyebrow">Pulpit administratora</p>
          <p>Metryki finansowe sa dostepne tylko dla administratora.</p>
        </div>
      </section>
    );
  }

  return (
    <section className="admin-dashboard" aria-labelledby="admin-dashboard-title">
      <header className="directory-header">
        <div>
          <p className="eyebrow">Biezacy obraz sezonu</p>
          <h2 id="admin-dashboard-title">Pulpit administratora</h2>
          <p className="panel-detail">
            {state.result
              ? `Dane z chmury odswiezono: ${formatTimestamp(
                  state.result.refreshedAtIso
                )}.`
              : "Metryki sa pobierane bezposrednio z serwera."}
          </p>
        </div>
        <button
          className="secondary-button icon-button"
          disabled={!isOnline || state.status === "LOADING"}
          onClick={() => {
            setReloadKey((current) => current + 1);
          }}
          title="Odswiez pulpit administratora"
          type="button"
        >
          <RefreshCw aria-hidden="true" size={18} />
          <span className="sr-only">Odswiez pulpit administratora</span>
        </button>
      </header>

      {state.result && state.result.seasons.length > 0 ? (
        <label className="field admin-dashboard__season">
          <span>Sezon</span>
          <select
            onChange={(event) => {
              setSelectedSeasonId(event.target.value);
            }}
            value={selectedSeasonId}
          >
            {state.result.seasons.map((season) => (
              <option key={season.id} value={season.id}>
                {season.name} · {seasonStatusLabel(season.status)}
              </option>
            ))}
          </select>
        </label>
      ) : null}

      {!isOnline ? (
        <p className="form-message form-message--warning">
          Odswiezenie pulpitu wymaga polaczenia z internetem.
        </p>
      ) : null}
      {state.status === "ERROR" && isOnline ? (
        <p className="form-message form-message--error">
          Nie udalo sie pobrac aktualnych metryk administratora.
        </p>
      ) : null}
      {state.status === "LOADING" && !state.result ? (
        <p className="empty-state">Pobieranie metryk z serwera.</p>
      ) : null}
      {state.status !== "LOADING" && state.result?.seasons.length === 0 ? (
        <p className="empty-state">Brak sezonu do podsumowania.</p>
      ) : null}

      {selectedSeason ? (
        <>
          <div className="admin-dashboard__metrics">
            <DashboardMetric
              label="Zebrano potwierdzone"
              value={formatKilograms(selectedSeason.metrics.confirmedHarvestWeightG)}
            />
            <DashboardMetric
              label="Zbiory w toku"
              value={formatKilograms(selectedSeason.metrics.inProgressHarvestWeightG)}
            />
            <DashboardMetric
              label="Sprzedano"
              value={formatKilograms(selectedSeason.metrics.soldWeightG)}
            />
            <DashboardMetric
              label="Dostepne"
              tone={selectedSeason.metrics.availableWeightG < 0 ? "WARNING" : "DEFAULT"}
              value={formatKilograms(selectedSeason.metrics.availableWeightG)}
            />
            <DashboardMetric
              label="Naliczone zbieraczom"
              value={formatMoney(selectedSeason.metrics.accruedGrosz)}
            />
            <DashboardMetric
              label="Wyplacone"
              value={formatMoney(selectedSeason.metrics.paidGrosz)}
            />
            <DashboardMetric
              label="Do wyplaty"
              tone={selectedSeason.metrics.dueGrosz < 0 ? "WARNING" : "DEFAULT"}
              value={formatMoney(selectedSeason.metrics.dueGrosz)}
            />
            <DashboardMetric
              label="Przychod"
              value={formatMoney(selectedSeason.metrics.revenueGrosz)}
            />
            <DashboardMetric
              detail="Przychod minus naliczenia zbieraczy; bez innych kosztow."
              label="Wynik po koszcie zbioru"
              value={formatMoney(selectedSeason.metrics.resultAfterHarvestCostGrosz)}
            />
            <DashboardMetric
              label="Aktywni zbieracze"
              value={String(selectedSeason.metrics.activeWorkerCount)}
            />
            <DashboardMetric
              label="Otwarte sesje"
              value={String(selectedSeason.metrics.openSessionCount)}
            />
            <DashboardMetric
              label="Wymagaja sprawdzenia"
              tone={
                selectedSeason.metrics.reviewRequiredSessionCount > 0
                  ? "WARNING"
                  : "DEFAULT"
              }
              value={String(selectedSeason.metrics.reviewRequiredSessionCount)}
            />
            <DashboardMetric
              label="Lokalnie oczekujace"
              tone={localPendingCount > 0 ? "WARNING" : "DEFAULT"}
              value={String(localPendingCount)}
            />
          </div>

          {selectedSeason.warnings.length > 0 ? (
            <div className="admin-dashboard__warnings" role="alert">
              <AlertTriangle aria-hidden="true" size={20} />
              <ul>
                {selectedSeason.warnings.map((warning) => (
                  <li key={warning}>{warning}</li>
                ))}
              </ul>
            </div>
          ) : null}
          <p className="admin-dashboard__cloud-note">
            Inne urzadzenia pracujace calkowicie offline moga miec sesje, ktorych chmura
            jeszcze nie zna.
          </p>
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
      className={`admin-dashboard__metric ${
        tone === "WARNING" ? "admin-dashboard__metric--warning" : ""
      }`}
    >
      <span>{label}</span>
      <strong>{value}</strong>
      {detail ? <small>{detail}</small> : null}
    </div>
  );
}

function seasonStatusLabel(status: AdminDashboardResult["seasons"][number]["status"]) {
  switch (status) {
    case "OPEN":
      return "otwarty";
    case "PLANNED":
      return "planowany";
    case "CLOSED":
      return "zamkniety";
    case "ARCHIVED":
      return "archiwalny";
  }
}

function formatTimestamp(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString("pl-PL");
}
