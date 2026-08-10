import { SlidersHorizontal } from "lucide-react";
import type { ReactNode } from "react";

export function CollapsibleFilters({
  activeCount = 0,
  children,
  label = "Filtry"
}: {
  activeCount?: number;
  children: ReactNode;
  label?: string;
}) {
  return (
    <details className="collapsible-filters">
      <summary>
        <SlidersHorizontal aria-hidden="true" size={18} strokeWidth={2.2} />
        <span>{label}</span>
        {activeCount > 0 ? (
          <span
            className="collapsible-filters__count"
            aria-label={`${String(activeCount)} aktywnych`}
          >
            {activeCount}
          </span>
        ) : null}
      </summary>
      <div className="collapsible-filters__content">{children}</div>
    </details>
  );
}
