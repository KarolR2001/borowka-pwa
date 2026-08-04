import { ArrowRight, CloudOff, TriangleAlert } from "lucide-react";
import { useEffect, useId, useMemo, useRef, useState, type SyntheticEvent } from "react";

import { formatKilograms, formatMoney } from "../domain/format";
import {
  ORDINARY_SALE_NOTE_MAX_LENGTH,
  createInitialOrdinarySaleDraft,
  createOrdinarySalePreview,
  prepareOrdinarySale,
  type OrdinarySaleFormDraft,
  type PreparedOrdinarySale,
  type SaleFormStockContext
} from "./ordinarySalePreparation";

export function OrdinarySaleForm({
  disabled = false,
  isOnline,
  onDraftChange,
  onPrepare,
  stockContexts
}: {
  disabled?: boolean;
  isOnline: boolean;
  onDraftChange?: () => void;
  onPrepare: (sale: PreparedOrdinarySale) => Promise<void> | void;
  stockContexts: readonly SaleFormStockContext[];
}) {
  const [draft, setDraft] = useState<OrdinarySaleFormDraft>(() =>
    createInitialOrdinarySaleDraft({ stockContexts })
  );
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const submittingRef = useRef(false);
  const priceInputId = useId();
  const selectedContext =
    stockContexts.find((context) => context.seasonId === draft.seasonId) ?? null;
  const preview = useMemo(() => {
    try {
      return createOrdinarySalePreview({ draft, stockContexts });
    } catch {
      return null;
    }
  }, [draft, stockContexts]);
  const formDisabled = disabled || isSubmitting || stockContexts.length === 0;
  const staleStock =
    selectedContext?.isFresh === false ||
    selectedContext?.dataSource === "CACHE" ||
    (selectedContext?.pendingDocumentCount ?? 0) > 0;
  const reconciliationBlocked =
    selectedContext?.reconciliation?.blocksOrdinarySale === true;

  useEffect(() => {
    if (stockContexts.some((context) => context.seasonId === draft.seasonId)) {
      return;
    }

    setDraft((current) => ({
      ...current,
      seasonId: stockContexts[0]?.seasonId ?? ""
    }));
  }, [draft.seasonId, stockContexts]);

  function updateDraft(update: Partial<OrdinarySaleFormDraft>): void {
    setDraft((current) => ({ ...current, ...update }));
    setError(null);
    setFeedback(null);
    onDraftChange?.();
  }

  async function handleSubmit(event: SyntheticEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();

    if (formDisabled || reconciliationBlocked || submittingRef.current) {
      return;
    }

    try {
      const prepared = prepareOrdinarySale({
        draft,
        isOnline,
        stockContexts
      });
      submittingRef.current = true;
      setIsSubmitting(true);
      setError(null);
      setFeedback(null);
      await onPrepare(prepared);
      setFeedback("Dane sprzedazy sa gotowe do ponownego sprawdzenia stanu.");
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "Nie udalo sie przygotowac sprzedazy."
      );
    } finally {
      submittingRef.current = false;
      setIsSubmitting(false);
    }
  }

  return (
    <form
      aria-label="Formularz zwyklej sprzedazy"
      className="ordinary-sale-form"
      onSubmit={(event) => {
        void handleSubmit(event);
      }}
    >
      <header className="ordinary-sale-form__header">
        <div>
          <p className="eyebrow">Sprzedaz online</p>
          <h2>Nowa sprzedaz</h2>
        </div>
        <span className={`status-pill ${isOnline ? "is-active" : "is-blocked"}`}>
          {isOnline ? "Online" : "Offline"}
        </span>
      </header>

      <div className="ordinary-sale-form__fields">
        <label className="field">
          <span>Sezon</span>
          <select
            disabled={formDisabled}
            onChange={(event) => {
              updateDraft({ seasonId: event.target.value });
            }}
            value={draft.seasonId}
          >
            {stockContexts.length === 0 ? (
              <option value="">Brak stanu sezonu</option>
            ) : null}
            {stockContexts.map((context) => (
              <option key={context.seasonId} value={context.seasonId}>
                {context.seasonName}
              </option>
            ))}
          </select>
        </label>

        <label className="field">
          <span>Data biznesowa</span>
          <input
            disabled={formDisabled}
            onChange={(event) => {
              updateDraft({ businessDate: event.target.value });
            }}
            required
            type="date"
            value={draft.businessDate}
          />
        </label>

        <label className="field">
          <span>Masa kg</span>
          <input
            autoComplete="off"
            disabled={formDisabled}
            inputMode="decimal"
            onChange={(event) => {
              updateDraft({ weightKg: event.target.value });
            }}
            placeholder="0,000"
            type="text"
            value={draft.weightKg}
          />
        </label>

        <div className="field">
          <label htmlFor={priceInputId}>Cena za kg</label>
          <div className="ordinary-sale-form__money-input">
            <input
              autoComplete="off"
              disabled={formDisabled}
              id={priceInputId}
              inputMode="decimal"
              onChange={(event) => {
                updateDraft({ pricePlnPerKg: event.target.value });
              }}
              placeholder="0,00"
              type="text"
              value={draft.pricePlnPerKg}
            />
            <span>zl</span>
          </div>
        </div>

        <label className="field ordinary-sale-form__note">
          <span>Notatka</span>
          <textarea
            disabled={formDisabled}
            maxLength={ORDINARY_SALE_NOTE_MAX_LENGTH}
            onChange={(event) => {
              updateDraft({ note: event.target.value });
            }}
            rows={3}
            value={draft.note}
          />
        </label>
      </div>

      <dl className="ordinary-sale-form__summary" aria-label="Podglad sprzedazy">
        <SummaryItem
          label="Dostepny stan"
          value={
            selectedContext
              ? formatKilograms(selectedContext.availableWeightG)
              : "brak danych"
          }
        />
        <SummaryItem
          label="Sprzedawana masa"
          value={preview ? formatKilograms(preview.weightG) : "0,000 kg"}
        />
        <SummaryItem
          label="Cena"
          value={
            preview ? `${formatMoney(preview.priceGroszPerKg)} / kg` : "0,00 zl / kg"
          }
        />
        <SummaryItem
          label="Przychod"
          value={preview ? formatMoney(preview.revenuePreviewGrosz) : "0,00 zl"}
        />
        <SummaryItem
          label="Stan po sprzedazy"
          tone={preview && preview.projectedAvailableWeightG < 0 ? "warning" : undefined}
          value={
            preview
              ? formatKilograms(preview.projectedAvailableWeightG)
              : selectedContext
                ? formatKilograms(selectedContext.availableWeightG)
                : "brak danych"
          }
        />
        <SummaryItem
          label="Odswiezenie stanu"
          value={
            selectedContext
              ? formatRefreshTime(selectedContext.refreshedAtIso)
              : "brak danych"
          }
        />
      </dl>

      {preview ? (
        <p className="ordinary-sale-form__calculation">
          Obliczenie przychodu: {formatKilograms(preview.weightG)} x{" "}
          {formatMoney(preview.priceGroszPerKg)} / kg ={" "}
          {formatMoney(preview.revenuePreviewGrosz)}. Pelne gramy, polowa grosza w gore
          (regula {preview.revenueCalculationVersion}).
        </p>
      ) : null}

      {!isOnline ? (
        <p className="ordinary-sale-form__warning" role="status">
          <CloudOff aria-hidden="true" size={18} />
          Sprzedaz wymaga polaczenia z internetem.
        </p>
      ) : null}
      {staleStock ? (
        <p className="ordinary-sale-form__warning" role="status">
          <TriangleAlert aria-hidden="true" size={18} />
          Stan moze byc nieaktualny. Odswiez dane przed zatwierdzeniem.
        </p>
      ) : null}
      {reconciliationBlocked ? (
        <p className="ordinary-sale-form__warning" role="alert">
          <TriangleAlert aria-hidden="true" size={18} />
          Zwykla sprzedaz jest zablokowana do czasu wyjasnienia alarmu stanu.
        </p>
      ) : null}
      {preview && preview.projectedAvailableWeightG < 0 ? (
        <p className="ordinary-sale-form__warning" role="alert">
          <TriangleAlert aria-hidden="true" size={18} />
          Sprzedaz przekracza widoczny stan o{" "}
          {formatKilograms(-preview.projectedAvailableWeightG)}.
        </p>
      ) : null}

      {feedback ? <p className="form-message form-message--ok">{feedback}</p> : null}
      {error ? <p className="form-message form-message--error">{error}</p> : null}

      <div className="ordinary-sale-form__actions">
        <button
          className="primary-button"
          disabled={formDisabled || !isOnline || reconciliationBlocked}
          type="submit"
        >
          <ArrowRight aria-hidden="true" size={18} />
          {isSubmitting ? "Sprawdzanie..." : "Sprawdz i przejdz dalej"}
        </button>
      </div>
    </form>
  );
}

function SummaryItem({
  label,
  tone,
  value
}: {
  label: string;
  tone?: "warning";
  value: string;
}) {
  return (
    <div className={tone ? `ordinary-sale-form__summary-item--${tone}` : undefined}>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

function formatRefreshTime(value: string): string {
  const timestamp = new Date(value);

  if (Number.isNaN(timestamp.getTime())) {
    return "nieprawidlowy czas";
  }

  return new Intl.DateTimeFormat("pl-PL", {
    dateStyle: "short",
    timeStyle: "short"
  }).format(timestamp);
}
