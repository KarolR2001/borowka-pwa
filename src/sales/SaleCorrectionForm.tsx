import { ArrowRight, CloudOff, Minus, Plus, TriangleAlert } from "lucide-react";
import { useEffect, useId, useMemo, useRef, useState, type SyntheticEvent } from "react";

import { formatKilograms, formatMoney } from "../domain/format";
import {
  SALE_CORRECTION_REASON_MAX_LENGTH,
  correctionDirectionLabel,
  createInitialSaleCorrectionDraft,
  createSaleCorrectionPreview,
  prepareSaleCorrection,
  type PreparedSaleCorrection,
  type SaleCorrectionFormDraft
} from "./saleCorrectionPreparation";
import type { SaleFormStockContext } from "./ordinarySalePreparation";

export function SaleCorrectionForm({
  disabled = false,
  isOnline,
  onDraftChange,
  onPrepare,
  stockContexts
}: {
  disabled?: boolean;
  isOnline: boolean;
  onDraftChange?: () => void;
  onPrepare: (correction: PreparedSaleCorrection) => Promise<void> | void;
  stockContexts: readonly SaleFormStockContext[];
}) {
  const [draft, setDraft] = useState<SaleCorrectionFormDraft>(() =>
    createInitialSaleCorrectionDraft({ stockContexts })
  );
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const submittingRef = useRef(false);
  const priceInputId = useId();
  const selectedContext =
    stockContexts.find((context) => context.seasonId === draft.seasonId) ?? null;
  const preview = useMemo(() => {
    try {
      return createSaleCorrectionPreview({ draft, stockContexts });
    } catch {
      return null;
    }
  }, [draft, stockContexts]);
  const formDisabled = disabled || isSubmitting || stockContexts.length === 0;
  const staleStock =
    selectedContext?.isFresh === false ||
    selectedContext?.dataSource === "CACHE" ||
    (selectedContext?.pendingDocumentCount ?? 0) > 0;

  useEffect(() => {
    if (stockContexts.some((context) => context.seasonId === draft.seasonId)) {
      return;
    }

    setDraft((current) => ({
      ...current,
      seasonId: stockContexts[0]?.seasonId ?? ""
    }));
  }, [draft.seasonId, stockContexts]);

  function updateDraft(update: Partial<SaleCorrectionFormDraft>): void {
    setDraft((current) => ({ ...current, ...update }));
    setError(null);
    onDraftChange?.();
  }

  async function handleSubmit(event: SyntheticEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();

    if (formDisabled || submittingRef.current) {
      return;
    }

    try {
      const prepared = prepareSaleCorrection({
        draft,
        isOnline,
        stockContexts
      });
      submittingRef.current = true;
      setIsSubmitting(true);
      setError(null);
      await onPrepare(prepared);
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "Nie udalo sie przygotowac korekty."
      );
    } finally {
      submittingRef.current = false;
      setIsSubmitting(false);
    }
  }

  return (
    <form
      aria-label="Formularz korekty sprzedazy"
      className="sale-correction-form"
      onSubmit={(event) => {
        void handleSubmit(event);
      }}
    >
      <header className="ordinary-sale-form__header">
        <div>
          <p className="eyebrow">Operacja administracyjna</p>
          <h3>Korekta sprzedazy</h3>
        </div>
        <span className={`status-pill ${isOnline ? "is-active" : "is-blocked"}`}>
          {isOnline ? "Online" : "Offline"}
        </span>
      </header>

      <fieldset className="sale-correction-form__direction" disabled={formDisabled}>
        <legend>Kierunek korekty</legend>
        <div className="sale-correction-form__segments">
          <label>
            <input
              checked={draft.correctionDirection === "INCREASE_STOCK"}
              name="correctionDirection"
              onChange={() => {
                updateDraft({ correctionDirection: "INCREASE_STOCK" });
              }}
              type="radio"
              value="INCREASE_STOCK"
            />
            <Plus aria-hidden="true" size={18} />
            <span>Zwrot do stanu</span>
          </label>
          <label>
            <input
              checked={draft.correctionDirection === "DECREASE_STOCK"}
              name="correctionDirection"
              onChange={() => {
                updateDraft({ correctionDirection: "DECREASE_STOCK" });
              }}
              type="radio"
              value="DECREASE_STOCK"
            />
            <Minus aria-hidden="true" size={18} />
            <span>Dodatkowy rozchod</span>
          </label>
        </div>
        <p>{correctionDirectionLabel(draft.correctionDirection)}</p>
      </fieldset>

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
          <span>Powod korekty</span>
          <textarea
            disabled={formDisabled}
            maxLength={SALE_CORRECTION_REASON_MAX_LENGTH}
            onChange={(event) => {
              updateDraft({ reason: event.target.value });
            }}
            required
            rows={3}
            value={draft.reason}
          />
        </label>
      </div>

      <dl className="ordinary-sale-form__summary" aria-label="Podglad korekty">
        <SummaryItem
          label="Stan przed"
          value={
            selectedContext
              ? formatKilograms(selectedContext.availableWeightG)
              : "brak danych"
          }
        />
        <SummaryItem
          label="Wplyw na stan"
          tone={preview?.stockImpactG && preview.stockImpactG < 0 ? "warning" : undefined}
          value={preview ? formatSignedKilograms(preview.stockImpactG) : "0,000 kg"}
        />
        <SummaryItem
          label="Stan po"
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
          label="Cena"
          value={
            preview ? `${formatMoney(preview.priceGroszPerKg)} / kg` : "0,00 zl / kg"
          }
        />
        <SummaryItem
          label="Wplyw na przychod"
          tone={
            preview?.revenueImpactGrosz && preview.revenueImpactGrosz < 0
              ? "warning"
              : undefined
          }
          value={preview ? formatSignedMoney(preview.revenueImpactGrosz) : "0,00 zl"}
        />
      </dl>

      {preview ? (
        <p className="ordinary-sale-form__calculation">
          Kwota korekty: {formatKilograms(preview.weightG)} x{" "}
          {formatMoney(preview.priceGroszPerKg)} / kg ={" "}
          {formatMoney(preview.revenueMagnitudeGrosz)}. Wplyw na przychod:{" "}
          {formatSignedMoney(preview.revenueImpactGrosz)}.
        </p>
      ) : null}

      {!isOnline ? (
        <p className="ordinary-sale-form__warning" role="status">
          <CloudOff aria-hidden="true" size={18} />
          Korekta sprzedazy wymaga polaczenia z internetem.
        </p>
      ) : null}
      {staleStock ? (
        <p className="ordinary-sale-form__warning" role="status">
          <TriangleAlert aria-hidden="true" size={18} />
          Stan moze byc nieaktualny. Zostanie pobrany z serwera przed zapisem.
        </p>
      ) : null}
      {preview && preview.projectedAvailableWeightG < 0 ? (
        <p className="ordinary-sale-form__warning" role="alert">
          <TriangleAlert aria-hidden="true" size={18} />
          Korekta spowoduje ujemny stan{" "}
          {formatKilograms(preview.projectedAvailableWeightG)}.
        </p>
      ) : null}
      {error ? <p className="form-message form-message--error">{error}</p> : null}

      <div className="ordinary-sale-form__actions">
        <button
          className="primary-button"
          disabled={formDisabled || !isOnline}
          type="submit"
        >
          <ArrowRight aria-hidden="true" size={18} />
          {isSubmitting ? "Sprawdzanie..." : "Sprawdz korekte"}
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

function formatSignedKilograms(value: number): string {
  return `${value > 0 ? "+" : ""}${formatKilograms(value)}`;
}

function formatSignedMoney(value: number): string {
  return `${value > 0 ? "+" : ""}${formatMoney(value)}`;
}
