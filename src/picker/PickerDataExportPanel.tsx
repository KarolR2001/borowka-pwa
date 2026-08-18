import { AlertTriangle, Download, FileSpreadsheet, UserRound } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import type { AuthSessionState } from "../auth/authSession";
import { DashboardPeriodFilter } from "../dashboard/DashboardPeriodFilter";
import {
  currentWarsawBusinessDate,
  dashboardPeriodSelectionError,
  DEFAULT_DASHBOARD_PERIOD,
  resolveDashboardPeriod,
  type DashboardPeriodSelection
} from "../dashboard/dashboardPeriod";
import { formatMoney } from "../domain/format";
import { POLISH_EXCEL_CSV_MIME_TYPE } from "../reports/polishExcelCsv";
import { CollapsibleFilters } from "../ui/CollapsibleFilters";
import {
  createPickerDataExportCsv,
  createPickerDataExportFilename,
  defaultPickerDataExportFilters,
  filterPickerDataExport,
  loadPickerDataExport,
  type PickerDataExportFilters,
  type PickerDataExportResult
} from "./pickerDataExport";

type FirebaseEnv = Record<string, string | boolean | undefined>;

type PickerDataExportLoad = (
  env: FirebaseEnv,
  input: Parameters<typeof loadPickerDataExport>[1]
) => Promise<PickerDataExportResult>;

export type PickerDataExportApi = {
  downloadCsv: (content: string, filename: string) => void;
  load: PickerDataExportLoad;
};

export const defaultPickerDataExportApi: PickerDataExportApi = {
  downloadCsv: downloadPickerDataCsv,
  load: loadPickerDataExport
};

type ExportState =
  | { result: PickerDataExportResult | null; status: "IDLE" | "LOADING" }
  | { result: PickerDataExportResult; status: "READY" }
  | { result: PickerDataExportResult | null; status: "ERROR" };

const initialState: ExportState = { result: null, status: "IDLE" };

export function PickerDataExportPanel({
  authState,
  env,
  exportApi = defaultPickerDataExportApi,
  isOnline
}: {
  authState: AuthSessionState;
  env: FirebaseEnv;
  exportApi?: PickerDataExportApi;
  isOnline: boolean;
}) {
  const [state, setState] = useState<ExportState>(initialState);
  const [filters, setFilters] = useState<PickerDataExportFilters>(
    defaultPickerDataExportFilters
  );
  const [periodSelection, setPeriodSelection] = useState<DashboardPeriodSelection>(
    DEFAULT_DASHBOARD_PERIOD
  );
  const [feedback, setFeedback] = useState<string | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);
  const todayBusinessDate = useMemo(() => currentWarsawBusinessDate(), []);
  const periodError = dashboardPeriodSelectionError(periodSelection);
  const resolvedPeriod = useMemo(
    () =>
      periodError
        ? null
        : resolveDashboardPeriod(periodSelection, {
            todayBusinessDate
          }),
    [periodError, periodSelection, todayBusinessDate]
  );
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
    setFeedback(null);
    setExportError(null);
    void exportApi
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
  }, [authState, env, exportApi, isOnline, isPicker]);

  const filtered = useMemo(() => {
    if (!state.result?.enabled || periodError) {
      return null;
    }

    try {
      return filterPickerDataExport(state.result, filters);
    } catch {
      return null;
    }
  }, [filters, periodError, state.result]);

  if (!isPicker) {
    return (
      <section className="access-notice" aria-label="Eksport moich danych">
        <UserRound aria-hidden="true" size={24} />
        <div>
          <p className="eyebrow">Eksport</p>
          <p>Eksport wymaga aktywnego konta powiązanego ze zbieraczem.</p>
        </div>
      </section>
    );
  }

  function handleExport(): void {
    if (!state.result?.enabled || !filtered) {
      setFeedback(null);
      setExportError("Nie można przygotowac eksportu dla wybranego zakresu.");
      return;
    }

    try {
      const exportedAtIso = new Date().toISOString();
      exportApi.downloadCsv(
        createPickerDataExportCsv({
          exportedAtIso,
          filtered,
          result: state.result
        }),
        createPickerDataExportFilename(exportedAtIso)
      );
      setExportError(null);
      setFeedback(
        `Wyeksportowano sesje: ${String(filtered.sessions.length)}, wypłaty: ${String(filtered.payments.length)}.`
      );
    } catch {
      setFeedback(null);
      setExportError("Nie udało się zapisać pliku CSV.");
    }
  }

  function handlePeriodChange(selection: DashboardPeriodSelection): void {
    setPeriodSelection(selection);
    if (dashboardPeriodSelectionError(selection)) {
      return;
    }

    const period = resolveDashboardPeriod(selection, {
      todayBusinessDate
    });
    setFilters((current) => ({
      ...current,
      fromDate: period.fromDate ?? "",
      toDate: period.toDate ?? ""
    }));
  }

  return (
    <section className="picker-data-export" aria-labelledby="picker-export-title">
      <header className="directory-header">
        <div>
          <p className="eyebrow">Własne dane</p>
          <h2 id="picker-export-title">Eksport CSV</h2>
          <p className="panel-detail">
            {state.result?.enabled
              ? `Sesje: ${String(filtered?.sessions.length ?? 0)}, wypłaty: ${String(filtered?.payments.length ?? 0)}`
              : "Dostępność eksportu jest kontrolowana przez administratora."}
          </p>
        </div>
      </header>

      {state.status === "LOADING" && !state.result ? (
        <p className="empty-state">Pobieranie danych do eksportu.</p>
      ) : null}
      {state.status === "ERROR" ? (
        <p className="form-message form-message--error">
          Nie udało się pobrać danych do eksportu.
        </p>
      ) : null}
      {state.result && !state.result.enabled ? (
        <p className="form-message form-message--warning">
          Administrator nie włączył eksportu własnego zestawienia.
        </p>
      ) : null}
      {state.result?.enabled ? (
        <>
          <p className="form-message form-message--warning">
            Plik zawiera Twoje dane osobowe i finansowe. Przechowuj go w zabezpieczonej
            lokalizacji.
          </p>
          <CollapsibleFilters label="Zakres eksportu">
            <div className="picker-data-export__filters" aria-label="Zakres eksportu">
              <ExportSeasonFilter
                filters={filters}
                onChange={setFilters}
                seasons={state.result.seasons}
              />
              <DashboardPeriodFilter
                idPrefix="picker-data-export"
                onChange={handlePeriodChange}
                selection={periodSelection}
                todayBusinessDate={todayBusinessDate}
              />
            </div>
          </CollapsibleFilters>
          {resolvedPeriod ? (
            <p className="dashboard-period-summary">{resolvedPeriod.label}</p>
          ) : null}
          <div className="directory-summary" aria-label="Podsumowanie eksportu">
            <ExportStat
              label="Naliczono"
              value={formatMoney(filtered?.summary.accruedAmountGrosz ?? 0)}
            />
            <ExportStat
              label="Wypłacono"
              value={formatMoney(filtered?.summary.paidAmountGrosz ?? 0)}
            />
            <ExportStat
              label="Pozostało"
              value={formatMoney(filtered?.summary.remainingAmountGrosz ?? 0)}
            />
          </div>
          {state.result.dataSource === "CACHE" ? (
            <p className="form-message form-message--warning">
              <AlertTriangle aria-hidden="true" size={18} />
              Dostępne dane są niepełne. Pobrany plik będzie wyraźnie oznaczony.
            </p>
          ) : null}
          {state.result.invalidPaymentCount > 0 ||
          state.result.invalidSessionCount > 0 ||
          state.result.invalidSeasonCount > 0 ||
          state.result.missingSourceSessionCount > 0 ? (
            <p className="form-message form-message--warning">
              Pominięte lub niepełne dane: sesje {state.result.invalidSessionCount},
              wypłaty {state.result.invalidPaymentCount}, sezony{" "}
              {state.result.invalidSeasonCount}, brak sesji źródłowej{" "}
              {state.result.missingSourceSessionCount}.
            </p>
          ) : null}
          <div className="form-actions">
            <button
              className="primary-button"
              disabled={!filtered}
              onClick={handleExport}
              type="button"
            >
              {state.result.dataSource === "CACHE" ? (
                <AlertTriangle aria-hidden="true" size={18} />
              ) : (
                <Download aria-hidden="true" size={18} />
              )}
              {state.result.dataSource === "CACHE"
                ? "Pobierz niepełny CSV"
                : "Pobierz CSV"}
            </button>
          </div>
        </>
      ) : null}
      {feedback ? (
        <p aria-live="polite" className="form-message form-message--ok">
          <FileSpreadsheet aria-hidden="true" size={18} />
          {feedback}
        </p>
      ) : null}
      {exportError ? (
        <p aria-live="assertive" className="form-message form-message--error">
          {exportError}
        </p>
      ) : null}
    </section>
  );
}

function ExportSeasonFilter({
  filters,
  onChange,
  seasons
}: {
  filters: PickerDataExportFilters;
  onChange: (filters: PickerDataExportFilters) => void;
  seasons: readonly { id: string; name: string }[];
}) {
  return (
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
  );
}

function ExportStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="directory-stat">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function downloadPickerDataCsv(content: string, filename: string): void {
  if (
    typeof window === "undefined" ||
    typeof document === "undefined" ||
    typeof window.URL.createObjectURL !== "function"
  ) {
    throw new Error("Eksport danych wymaga przegladarki z obsluga plikow.");
  }

  const blob = new Blob([content], { type: POLISH_EXCEL_CSV_MIME_TYPE });
  const url = window.URL.createObjectURL(blob);
  const anchor = document.createElement("a");

  anchor.download = filename;
  anchor.href = url;
  anchor.click();
  window.URL.revokeObjectURL(url);
}
