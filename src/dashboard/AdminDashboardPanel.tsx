import { AlertTriangle, Gauge } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import type { AuthSessionState } from "../auth/authSession";
import { formatKilograms, formatMoney } from "../domain/format";
import type { SyncDocumentMetadataInput } from "../offline/pendingWriteMetadata";
import { DashboardPeriodFilter } from "./DashboardPeriodFilter";
import {
  hydrateAdminDashboardSnapshot,
  isAdminDashboardSnapshot,
  loadAdminDashboard,
  prepareAdminDashboardSnapshot,
  type AdminDashboardResult,
  type LoadAdminDashboardInput
} from "./adminDashboard";
import {
  loadDashboardSnapshot,
  saveDashboardSnapshot,
  type DashboardSnapshotStorage
} from "./dashboardOfflineState";
import {
  currentWarsawBusinessDate,
  dashboardPeriodSelectionError,
  DEFAULT_DASHBOARD_PERIOD,
  type DashboardPeriodSelection
} from "./dashboardPeriod";

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
  snapshotStorage,
  syncDocuments
}: {
  api?: AdminDashboardApi;
  authState: AuthSessionState;
  env: FirebaseEnv;
  isOnline: boolean;
  snapshotStorage?: DashboardSnapshotStorage | null;
  syncDocuments: readonly SyncDocumentMetadataInput[];
}) {
  const [state, setState] = useState<DashboardState>(initialState);
  const resultRef = useRef<{
    ownerUid: string;
    result: AdminDashboardResult;
  } | null>(null);
  const [selectedSeasonId, setSelectedSeasonId] = useState("");
  const [periodSelection, setPeriodSelection] = useState<DashboardPeriodSelection>(
    DEFAULT_DASHBOARD_PERIOD
  );
  const todayBusinessDate = useMemo(() => currentWarsawBusinessDate(), []);
  const periodError = dashboardPeriodSelectionError(periodSelection);
  const isAdmin = authState.status === "READY" && authState.profile.role === "ADMIN";

  useEffect(() => {
    let isMounted = true;

    if (!isAdmin) {
      resultRef.current = null;
      setState(initialState);
      return undefined;
    }

    if (periodError) {
      return undefined;
    }

    if (!isOnline) {
      const snapshot = loadDashboardSnapshot({
        isPayload: isAdminDashboardSnapshot,
        kind: "ADMIN",
        ownerUid: authState.profile.uid,
        storage: snapshotStorage
      });
      const currentResult =
        resultRef.current?.ownerUid === authState.profile.uid
          ? resultRef.current.result
          : null;
      const result = snapshot?.payload ?? currentResult;

      if (result) {
        const hydratedResult = hydrateAdminDashboardSnapshot(result, syncDocuments);
        resultRef.current = { ownerUid: authState.profile.uid, result: hydratedResult };
        setState({ result: hydratedResult, status: "READY" });
      } else {
        resultRef.current = null;
        setState({ result: null, status: "ERROR" });
      }
      return undefined;
    }

    setState((current) => ({
      result:
        resultRef.current?.ownerUid === authState.profile.uid ? current.result : null,
      status: "LOADING"
    }));
    void api
      .load(env, {
        actorProfile: authState.profile,
        businessDate: todayBusinessDate,
        isOnline,
        periodSelection,
        selectedSeasonId: selectedSeasonId || null,
        syncDocuments
      })
      .then((result) => {
        if (isMounted) {
          saveDashboardSnapshot({
            kind: "ADMIN",
            ownerUid: authState.profile.uid,
            payload: prepareAdminDashboardSnapshot(result),
            storage: snapshotStorage
          });
          resultRef.current = { ownerUid: authState.profile.uid, result };
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
    isAdmin,
    isOnline,
    periodError,
    periodSelection,
    selectedSeasonId,
    snapshotStorage,
    syncDocuments,
    todayBusinessDate
  ]);

  const visibleResult =
    isAdmin && resultRef.current?.ownerUid === authState.profile.uid
      ? state.result
      : null;

  const selectedSeason = useMemo(
    () =>
      periodError ||
      (selectedSeasonId !== "" && visibleResult?.selectedSeason?.id !== selectedSeasonId)
        ? null
        : (visibleResult?.selectedSeason ?? null),
    [periodError, selectedSeasonId, visibleResult]
  );
  if (!isAdmin) {
    return (
      <section className="access-notice" aria-label="Pulpit administratora">
        <Gauge aria-hidden="true" size={24} />
        <div>
          <p className="eyebrow">Pulpit administratora</p>
          <p>Metryki finansowe są dostępne tylko dla administratora.</p>
        </div>
      </section>
    );
  }

  return (
    <section className="admin-dashboard" aria-label="Pulpit administratora">
      <header className="directory-header">
        <div>
          <p className="eyebrow">Bieżący sezon</p>
          <p className="panel-detail">Najważniejsze informacje o bieżącym sezonie.</p>
        </div>
      </header>

      <div className="dashboard-filter-bar">
        {visibleResult && visibleResult.seasons.length > 0 ? (
          <label className="field admin-dashboard__season">
            <span>Sezon</span>
            <select
              disabled={!isOnline || state.status === "LOADING"}
              onChange={(event) => {
                setSelectedSeasonId(event.target.value);
              }}
              value={
                selectedSeasonId !== ""
                  ? selectedSeasonId
                  : (visibleResult.selectedSeason?.id ?? "")
              }
            >
              {visibleResult.seasons.map((season) => (
                <option key={season.id} value={season.id}>
                  {season.name} · {seasonStatusLabel(season.status)}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        <DashboardPeriodFilter
          disabled={!isOnline || state.status === "LOADING"}
          idPrefix="admin-dashboard"
          onChange={setPeriodSelection}
          selection={periodSelection}
          todayBusinessDate={todayBusinessDate}
        />
      </div>

      {state.status === "ERROR" && isOnline ? (
        <p className="form-message form-message--error">
          Nie udało się pobrać aktualnych metryk administratora.
        </p>
      ) : null}
      {state.status === "LOADING" && !visibleResult ? (
        <p className="empty-state">Pobieranie metryk z serwera.</p>
      ) : null}
      {state.status !== "LOADING" && visibleResult?.seasons.length === 0 ? (
        <p className="empty-state">Brak sezonu do podsumowania.</p>
      ) : null}

      {selectedSeason ? (
        <>
          <p className="dashboard-period-summary">{selectedSeason.period.label}</p>
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
              label="Dostępne"
              tone={selectedSeason.metrics.availableWeightG < 0 ? "WARNING" : "DEFAULT"}
              value={formatKilograms(selectedSeason.metrics.availableWeightG)}
            />
            <DashboardMetric
              label="Naliczone zbieraczom"
              value={formatMoney(selectedSeason.metrics.accruedGrosz)}
            />
            <DashboardMetric
              label="Wypłacone"
              value={formatMoney(selectedSeason.metrics.paidGrosz)}
            />
            <DashboardMetric
              label="Do wypłaty"
              tone={selectedSeason.metrics.dueGrosz < 0 ? "WARNING" : "DEFAULT"}
              value={formatMoney(selectedSeason.metrics.dueGrosz)}
            />
            <DashboardMetric
              label="Przychód"
              value={formatMoney(selectedSeason.metrics.revenueGrosz)}
            />
            <DashboardMetric
              detail="Przychód minus naliczenia zbieraczy, bez innych kosztów."
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
      return "zamknięty";
    case "ARCHIVED":
      return "archiwalny";
  }
}
