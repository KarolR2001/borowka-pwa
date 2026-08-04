import { AlertTriangle, Gauge, RefreshCw } from "lucide-react";
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
  calculateLocalDashboardProjection,
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
  const [reloadKey, setReloadKey] = useState(0);
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
    reloadKey,
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
  const localPendingCount = visibleResult
    ? visibleResult.localSyncSummary.localSavedCount +
      visibleResult.localSyncSummary.pendingSyncCount
    : 0;
  const localProjection = useMemo(
    () =>
      calculateLocalDashboardProjection({
        officialAvailableWeightG: selectedSeason?.metrics.availableWeightG ?? null,
        period: selectedSeason?.period ?? null,
        seasonId: selectedSeason?.id ?? null,
        syncDocuments
      }),
    [selectedSeason, syncDocuments]
  );
  const isLocalSnapshot = visibleResult?.calculationSource === "LOCAL_SNAPSHOT";

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
            {visibleResult
              ? isLocalSnapshot
                ? `Ostatni stan serwera: ${formatTimestamp(visibleResult.refreshedAtIso)}.`
                : `Dane z chmury odswiezono: ${formatTimestamp(
                    visibleResult.refreshedAtIso
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

      {!isOnline ? (
        <p className="form-message form-message--warning">
          {visibleResult
            ? `Tryb offline. Widoczny jest ostatni stan serwera z ${formatTimestamp(
                visibleResult.refreshedAtIso
              )}; nie jest to stan aktualny.`
            : "Tryb offline. Brak zapisanego stanu pulpitu administratora."}
        </p>
      ) : null}
      {state.status === "ERROR" && isOnline ? (
        <p className="form-message form-message--error">
          Nie udalo sie pobrac aktualnych metryk administratora.
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
              detail={isLocalSnapshot ? "Ostatni oficjalny stan serwera" : undefined}
              label="Dostepne"
              tone={selectedSeason.metrics.availableWeightG < 0 ? "WARNING" : "DEFAULT"}
              value={formatKilograms(selectedSeason.metrics.availableWeightG)}
            />
            {isLocalSnapshot || localProjection.pendingSessionCount > 0 ? (
              <>
                <DashboardMetric
                  detail="Sesje biezacego urzadzenia, ktorych nie ma w oficjalnym stanie"
                  label="Lokalne sesje poza stanem"
                  tone={localProjection.pendingSessionCount > 0 ? "WARNING" : "DEFAULT"}
                  value={String(localProjection.pendingSessionCount)}
                />
                <DashboardMetric
                  detail={`Ostatni stan serwera + ${formatKilograms(
                    localProjection.pendingConfirmedWeightG
                  )} z ${String(
                    localProjection.pendingConfirmedSessionCount
                  )} zamknietych sesji`}
                  label="Przewidywane lokalnie"
                  tone="WARNING"
                  value={
                    localProjection.projectedAvailableWeightG === null
                      ? "Do sprawdzenia"
                      : formatKilograms(localProjection.projectedAvailableWeightG)
                  }
                />
              </>
            ) : null}
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
