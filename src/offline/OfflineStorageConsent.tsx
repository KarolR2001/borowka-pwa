import { HardDrive, ShieldCheck, X } from "lucide-react";

export function OfflineStorageConsentPrompt({
  error,
  isOnline,
  isSubmitting,
  onAccept,
  onDecline
}: {
  error: string | null;
  isOnline: boolean;
  isSubmitting: boolean;
  onAccept: () => void;
  onDecline: () => void;
}) {
  return (
    <div className="consent-overlay" role="presentation">
      <section
        aria-labelledby="offline-storage-consent-title"
        aria-modal="true"
        className="consent-dialog"
        role="dialog"
      >
        <div className="consent-dialog__icon">
          <HardDrive aria-hidden="true" size={24} strokeWidth={2.1} />
        </div>
        <div>
          <p className="eyebrow">To urządzenie</p>
          <h2 id="offline-storage-consent-title">Zezwolić na zapis danych?</h2>
        </div>
        <p>
          Dane zbiorów i rozliczeń mogą pozostać na tym urządzeniu po zamknięciu
          aplikacji. Włącz tę opcję tylko na prywatnym albo zaufanym urządzeniu.
        </p>
        <ul className="consent-dialog__details">
          <li>Aplikacja będzie mogła działać po utracie internetu.</li>
          <li>Dane oczekujące zostaną wysłane po odzyskaniu połączenia.</li>
          <li>Wyczyszczenie danych przeglądarki może usunąć niezapisane rekordy.</li>
        </ul>
        {error ? <p className="form-message form-message--error">{error}</p> : null}
        <div className="consent-dialog__actions">
          <button
            className="primary-action"
            disabled={isSubmitting || !isOnline}
            onClick={onAccept}
            type="button"
          >
            <ShieldCheck aria-hidden="true" size={18} strokeWidth={2.2} />
            <span>{isSubmitting ? "Zapisywanie..." : "Tak, włącz pracę offline"}</span>
          </button>
          <button
            className="secondary-action"
            disabled={isSubmitting}
            onClick={onDecline}
            type="button"
          >
            <X aria-hidden="true" size={18} strokeWidth={2.2} />
            <span>Nie, tylko ta sesja</span>
          </button>
        </div>
        {!isOnline ? (
          <p className="consent-dialog__note">
            Włączenie przechowywania wymaga połączenia z internetem.
          </p>
        ) : null}
      </section>
    </div>
  );
}

export function OfflineStorageSettings({
  isOnline,
  isSubmitting,
  onDisable
}: {
  isOnline: boolean;
  isSubmitting: boolean;
  onDisable: () => void;
}) {
  return (
    <section className="offline-storage-settings" aria-label="Dane na urządzeniu">
      <div>
        <p className="eyebrow">Dane na urządzeniu</p>
        <h3>Przechowywanie jest włączone</h3>
        <p className="panel-detail">
          To urządzenie może zachować dane potrzebne do pracy bez internetu.
        </p>
      </div>
      <button
        className="secondary-action"
        disabled={isSubmitting || !isOnline}
        onClick={onDisable}
        type="button"
      >
        Wyłącz przechowywanie
      </button>
    </section>
  );
}
