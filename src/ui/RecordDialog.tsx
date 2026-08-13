import { useEffect, useRef, type ReactNode } from "react";

export function RecordDialog({
  children,
  fullScreen = false,
  label,
  onClose
}: {
  children: ReactNode;
  fullScreen?: boolean;
  label: string;
  onClose: () => void;
}) {
  const surfaceRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    const previouslyFocusedElement = document.activeElement;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onCloseRef.current();
    };

    surfaceRef.current?.focus();
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      if (previouslyFocusedElement instanceof HTMLElement) {
        previouslyFocusedElement.focus();
      }
    };
  }, []);

  return (
    <div
      aria-label={label}
      aria-modal="true"
      className={`record-dialog ${fullScreen ? "record-dialog--fullscreen" : ""}`}
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
