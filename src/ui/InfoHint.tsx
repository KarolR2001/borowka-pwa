import { Info } from "lucide-react";

export function InfoHint({ text }: { text: string }) {
  return (
    <details className="info-hint">
      <summary
        aria-label="Pokaż wyjaśnienie"
        className="info-hint__button"
        title="Wyjaśnienie"
      >
        <Info aria-hidden="true" size={16} strokeWidth={2.2} />
      </summary>
      <span className="info-hint__text" role="note">
        {text}
      </span>
    </details>
  );
}
