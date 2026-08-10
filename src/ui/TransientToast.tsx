import { CheckCircle2, Wifi, WifiOff, X } from "lucide-react";
import { useEffect } from "react";

export type TransientToastTone = "SUCCESS" | "WARNING";

export function TransientToast({
  message,
  onDismiss,
  timeoutMs = 4000,
  tone
}: {
  message: string;
  onDismiss: () => void;
  timeoutMs?: number;
  tone: TransientToastTone;
}) {
  useEffect(() => {
    const timeoutId = globalThis.setTimeout(onDismiss, timeoutMs);
    return () => {
      globalThis.clearTimeout(timeoutId);
    };
  }, [onDismiss, timeoutMs]);

  const Icon = tone === "SUCCESS" ? CheckCircle2 : WifiOff;

  return (
    <div
      className={`transient-toast transient-toast--${tone.toLowerCase()}`}
      role="status"
    >
      {tone === "SUCCESS" && message.includes("online") ? (
        <Wifi aria-hidden="true" size={20} strokeWidth={2.2} />
      ) : (
        <Icon aria-hidden="true" size={20} strokeWidth={2.2} />
      )}
      <span>{message}</span>
      <button
        aria-label="Zamknij powiadomienie"
        className="transient-toast__close"
        onClick={onDismiss}
        title="Zamknij"
        type="button"
      >
        <X aria-hidden="true" size={17} strokeWidth={2.2} />
      </button>
    </div>
  );
}
