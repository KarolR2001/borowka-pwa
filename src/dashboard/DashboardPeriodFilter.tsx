import {
  DASHBOARD_PERIOD_PRESETS,
  dashboardPeriodPresetLabel,
  dashboardPeriodSelectionError,
  selectionForDashboardPeriodPreset,
  type DashboardPeriodPreset,
  type DashboardPeriodSelection
} from "./dashboardPeriod";

export function DashboardPeriodFilter({
  disabled = false,
  idPrefix,
  onChange,
  selection,
  todayBusinessDate
}: {
  disabled?: boolean;
  idPrefix: string;
  onChange: (selection: DashboardPeriodSelection) => void;
  selection: DashboardPeriodSelection;
  todayBusinessDate: string;
}) {
  const error = dashboardPeriodSelectionError(selection);

  return (
    <div className="dashboard-period-filter" aria-label="Filtr okresu">
      <label className="field" htmlFor={`${idPrefix}-period`}>
        <span>Okres</span>
        <select
          aria-label="Okres"
          disabled={disabled}
          id={`${idPrefix}-period`}
          onChange={(event) => {
            onChange(
              selectionForDashboardPeriodPreset(
                selection,
                event.target.value as DashboardPeriodPreset,
                todayBusinessDate
              )
            );
          }}
          value={selection.preset}
        >
          {DASHBOARD_PERIOD_PRESETS.map((preset) => (
            <option key={preset} value={preset}>
              {dashboardPeriodPresetLabel(preset)}
            </option>
          ))}
        </select>
      </label>

      {selection.preset === "CUSTOM" ? (
        <div className="dashboard-period-filter__custom">
          <label className="field" htmlFor={`${idPrefix}-period-from`}>
            <span>Od</span>
            <input
              disabled={disabled}
              id={`${idPrefix}-period-from`}
              max="9999-12-31"
              onChange={(event) => {
                onChange({ ...selection, customFromDate: event.target.value });
              }}
              type="date"
              value={selection.customFromDate}
            />
          </label>
          <label className="field" htmlFor={`${idPrefix}-period-to`}>
            <span>Do</span>
            <input
              disabled={disabled}
              id={`${idPrefix}-period-to`}
              max="9999-12-31"
              onChange={(event) => {
                onChange({ ...selection, customToDate: event.target.value });
              }}
              type="date"
              value={selection.customToDate}
            />
          </label>
        </div>
      ) : null}

      <p className="dashboard-period-filter__basis">Wedlug daty biznesowej</p>
      {error ? (
        <p className="field-error" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
