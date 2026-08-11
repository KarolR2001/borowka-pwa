import { useEffect, useState, type ReactNode } from "react";

export function CollapsibleSection({
  children,
  icon,
  label,
  open = false
}: {
  children: ReactNode;
  icon?: ReactNode;
  label: string;
  open?: boolean;
}) {
  const [isOpen, setIsOpen] = useState(open);

  useEffect(() => {
    if (open) setIsOpen(true);
  }, [open]);

  return (
    <details
      className="collapsible-section"
      onToggle={(event) => {
        setIsOpen(event.currentTarget.open);
      }}
      open={isOpen}
    >
      <summary>
        {icon ?? null}
        <span>{label}</span>
      </summary>
      <div className="collapsible-section__content">{children}</div>
    </details>
  );
}
