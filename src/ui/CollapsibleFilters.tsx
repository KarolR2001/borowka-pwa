import { SlidersHorizontal } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";

export function CollapsibleFilters({
  activeCount = 0,
  children,
  label = "Filtry"
}: {
  activeCount?: number;
  children: ReactNode;
  label?: string;
}) {
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
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsOpen(false);
      }
    };

    document.addEventListener("pointerdown", closeOnOutsideInteraction);
    document.addEventListener("keydown", closeOnEscape);

    return () => {
      document.removeEventListener("pointerdown", closeOnOutsideInteraction);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [isOpen]);

  return (
    <details
      className="collapsible-filters"
      onToggle={(event) => {
        setIsOpen(event.currentTarget.open);
      }}
      open={isOpen}
      ref={detailsRef}
    >
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
