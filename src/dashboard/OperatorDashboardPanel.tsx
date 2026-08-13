import { AlertTriangle, Gauge, Plus } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import type { AuthSessionState } from "../auth/authSession";
import { formatKilograms } from "../domain/format";
import type { SyncDocumentMetadataInput } from "../offline/pendingWriteMetadata";
import { DashboardPeriodFilter } from "./DashboardPeriodFilter";
import {
  hydrateOperatorDashboardSnapshot,
  isOperatorDashboardSnapshot,
  loadOperatorDashboard,
  DEFAULT_OPERATOR_DASHBOARD_PERIOD,
  prepareOperatorDashboardSnapshot,
  type LoadOperatorDashboardInput,
  type OperatorDashboardResult
} from "./operatorDashboard";
import {
  loadDashboardSnapshot,
  saveDashboardSnapshot,
  type DashboardSnapshotStorage
} from "./dashboardOfflineState";
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
  onNewHarvest,
  snapshotStorage,
  syncDocuments
}: {
  api?: OperatorDashboardApi;
  authState: AuthSessionState;
  env: FirebaseEnv;
  isOnline: boolean;
  onNewHarvest?: () => void;
  snapshotStorage?: DashboardSnapshotStorage | null;
  syncDocuments: readonly SyncDocumentMetadataInput[];
}) {
  const [state, setState] = useState<DashboardState>(initialState);
  const resultRef = useRef<{
    ownerUid: string;
    result: OperatorDashboardResult;
  } | null>(null);
  const [periodSelection, setPeriodSelection] = useState<DashboardPeriodSelection>(
    DEFAULT_OPERATOR_DASHBOARD_PERIOD
  );
  const todayBusinessDate = useMemo(() => currentWarsawBusinessDate(), []);
  const periodError = dashboardPeriodSelectionError(periodSelection);
  const isOperator =
    authState.status === "READY" && authState.profile.role === "OPERATOR";

  useEffect(() => {
    let isMounted = true;

    if (!isOperator) {
      resultRef.current = null;
      setState(initialState);
      return undefined;
    }

    if (periodError) {
      return undefined;
    }

    if (!isOnline) {
      const snapshot = loadDashboardSnapshot({
        isPayload: isOperatorDashboardSnapshot,
        kind: "OPERATOR",
        ownerUid: authState.profile.uid,
        storage: snapshotStorage
      });
      const savedResult =
        snapshot?.payload ??
        (resultRef.current?.ownerUid === authState.profile.uid
          ? resultRef.current.result
          : null);

      if (savedResult) {
        const result = hydrateOperatorDashboardSnapshot(savedResult, syncDocuments);
        resultRef.current = { ownerUid: authState.profile.uid, result };
        setState({ result, status: "READY" });
        return undefined;
      }
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
          if (isOnline) {
            saveDashboardSnapshot({
              kind: "OPERATOR",
              ownerUid: authState.profile.uid,
              payload: prepareOperatorDashboardSnapshot(result),
              storage: snapshotStorage
            });
          }
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
    isOnline,
    isOperator,
    periodError,
    periodSelection,
    snapshotStorage,
    syncDocuments,
    todayBusinessDate
  ]);

  const result =
    periodError || !isOperator || resultRef.current?.ownerUid !== authState.profile.uid
      ? null
      : state.result;
  const warnings = result ? dashboardWarnings(result) : [];
  if (!isOperator) {
    return (
      <section className="access-notice" aria-label="Pulpit operatora">
        <Gauge aria-hidden="true" size={24} />
        <div>
          <p className="eyebrow">Pulpit operatora</p>
          <p>Widok jest dostępny tylko dla aktywnego operatora.</p>
        </div>
      </section>
    );
  }

  return (
    <section className="operator-dashboard" aria-label="Pulpit operatora">
      <header className="directory-header">
        <div className="operator-dashboard__actions">
          <button
            className="primary-action"
            onClick={() => {
              if (onNewHarvest) {
                onNewHarvest();
                requestAnimationFrame(focusNewHarvestSession);
              } else {
                focusNewHarvestSession();
              }
            }}
            type="button"
          >
            <Plus aria-hidden="true" size={18} />
            Nowy zbiór
          </button>
        </div>
      </header>

      <div className="dashboard-filter-bar">
        <DashboardPeriodFilter
          disabled={!isOnline || state.status === "LOADING"}
          idPrefix="operator-dashboard"
          onChange={setPeriodSelection}
          selection={periodSelection}
          todayBusinessDate={todayBusinessDate}
        />
      </div>

      {state.status === "ERROR" ? (
        <p className="form-message form-message--error">
          Nie udało się pobrać pulpitu operatora
          {result ? ". Widoczne są ostatnie dostępne dane." : "."}
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
              label="Dostępne kilogramy"
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

function dashboardWarnings(result: OperatorDashboardResult): string[] {
  const warnings: string[] = [];

  if (result.stock.invalidMovementCount > 0) {
    warnings.push("Stan kilogramów jest niespójny i wymaga sprawdzenia.");
  }

  if (result.stock.pendingMovementCount > 0) {
    warnings.push("Część zmian stanu kilogramów oczekuje na potwierdzenie.");
  }

  if (result.metrics.availableWeightG !== null && result.metrics.availableWeightG < 0) {
    warnings.push("Dostępny stan kilogramów jest ujemny.");
  }

  return warnings;
}

function focusNewHarvestSession(): void {
  const target = document.getElementById("new-harvest-session");
  target?.scrollIntoView({ behavior: "smooth", block: "start" });
  if (target instanceof HTMLButtonElement) {
    target.click();
    target.focus();
    return;
  }
  const control = target?.querySelector<HTMLElement>(
    "select:not(:disabled), input:not(:disabled), button:not(:disabled)"
  );
  (control ?? target)?.focus();
}
