import { useEffect, useRef, type ReactNode } from "react";

export function RecordDialog({
  children,
  label,
  onClose
}: {
  children: ReactNode;
  label: string;
  onClose: () => void;
}) {
  const surfaceRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const previouslyFocusedElement = document.activeElement;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };

    surfaceRef.current?.focus();
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      if (previouslyFocusedElement instanceof HTMLElement) {
        previouslyFocusedElement.focus();
      }
    };
  }, [onClose]);

  return (
    <div
      aria-label={label}
      aria-modal="true"
      className="record-dialog"
      onMouseDown={(event) => {
        if (event.currentTarget === event.target) onClose();
      }}
      role="dialog"
    >
      <div className="record-dialog__surface" ref={surfaceRef} tabIndex={-1}>
        {children}
      </div>
    </div>
  );
}
