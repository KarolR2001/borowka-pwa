import { CalendarRange, Check } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { InfoHint } from "../ui/InfoHint";
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
  const [isOpen, setIsOpen] = useState(false);
  const detailsRef = useRef<HTMLDetailsElement>(null);

  useEffect(() => {
    if (!isOpen) {
      return undefined;
    }

    const closeOnOutsideInteraction = (event: PointerEvent) => {
      if (event.target instanceof Node && !detailsRef.current?.contains(event.target)) {
        setIsOpen(false);
      }
    };

    document.addEventListener("pointerdown", closeOnOutsideInteraction);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsideInteraction);
    };
  }, [isOpen]);

  const selectPreset = (preset: DashboardPeriodPreset) => {
    onChange(selectionForDashboardPeriodPreset(selection, preset, todayBusinessDate));
    setIsOpen(preset === "CUSTOM");
  };

  return (
    <details
      className="collapsible-filters dashboard-period-collapse"
      onToggle={(event) => {
        setIsOpen(event.currentTarget.open);
      }}
      open={isOpen}
      ref={detailsRef}
    >
      <summary>
        <CalendarRange aria-hidden="true" size={18} strokeWidth={2.2} />
        <span>Zakres dat</span>
      </summary>
      <div className="dashboard-period-filter" aria-label="Filtr okresu">
        <div className="dashboard-period-filter__heading">
          <span>
            Wybierz okres
            <InfoHint text="Wybierz okres, z którego dane mają być pokazane w podsumowaniu." />
          </span>
        </div>
        <div aria-label="Okres" className="dashboard-period-filter__presets">
          {DASHBOARD_PERIOD_PRESETS.map((preset) => {
            const isSelected = selection.preset === preset;

            return (
              <button
                aria-pressed={isSelected}
                className={
                  isSelected
                    ? "dashboard-period-filter__preset is-active"
                    : "dashboard-period-filter__preset"
                }
                disabled={disabled}
                key={preset}
                onClick={() => {
                  selectPreset(preset);
                }}
                type="button"
              >
                {isSelected ? <Check aria-hidden="true" size={16} /> : null}
                {dashboardPeriodPresetLabel(preset)}
              </button>
            );
          })}
        </div>

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

        <p className="dashboard-period-filter__basis">Dane są wybierane według daty.</p>
        {error ? (
          <p className="field-error" role="alert">
            {error}
          </p>
        ) : null}
      </div>
    </details>
  );
}
