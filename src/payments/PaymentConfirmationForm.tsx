import { Banknote, X } from "lucide-react";
import { useState, type SyntheticEvent } from "react";

import { formatBusinessDate, formatKilograms, formatMoney } from "../domain/format";
import type { PaymentEligibilityResult } from "./paymentEligibility";
import {
  createInitialPaymentConfirmationDraft,
  preparePaymentConfirmation,
  type PaymentConfirmationDraft,
  type PreparedPaymentConfirmation
} from "./paymentConfirmation";
import type { PendingPaymentSession } from "./pendingPayments";

export function PaymentConfirmationForm({
  eligibility,
  onCancel,
  onPrepared,
  session
}: {
  eligibility: PaymentEligibilityResult;
  onCancel: () => void;
  onPrepared?: (confirmation: PreparedPaymentConfirmation) => void;
  session: PendingPaymentSession;
}) {
  const [draft, setDraft] = useState<PaymentConfirmationDraft>(() =>
    createInitialPaymentConfirmationDraft()
  );
  const [error, setError] = useState<string | null>(null);
  const [prepared, setPrepared] = useState<PreparedPaymentConfirmation | null>(null);

  function handleSubmit(event: SyntheticEvent<HTMLFormElement>): void {
    event.preventDefault();

    try {
      const confirmation = preparePaymentConfirmation({
        draft,
        eligibility,
        session
      });
      setError(null);
      setPrepared(confirmation);
      onPrepared?.(confirmation);
    } catch (caughtError) {
      setPrepared(null);
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "Nie udalo sie przygotowac wyplaty."
      );
    }
  }

  return (
    <form className="payment-confirmation-form" onSubmit={handleSubmit}>
      <header className="payment-confirmation-form__header">
        <div>
          <p className="eyebrow">Potwierdzenie wyplaty</p>
          <h3>{session.workerName}</h3>
        </div>
        <button
          className="secondary-button icon-button"
          onClick={onCancel}
          title="Anuluj potwierdzenie"
          type="button"
        >
          <X aria-hidden="true" size={18} />
          <span className="sr-only">Anuluj potwierdzenie</span>
        </button>
      </header>

      <dl className="payment-confirmation-summary">
        <SummaryItem
          label="Sesja"
          value={`${formatBusinessDate(session.businessDate)} / ${session.sessionId}`}
        />
        <SummaryItem label="Zbieracz" value={session.workerName} />
        <SummaryItem
          label="Plan i stawka"
          value={`${session.planName}, ${formatMoney(session.rateGrosz)} / ${session.unitLabel}`}
        />
        <SummaryItem
          label="Wynik"
          value={`${formatQuantity(session.totalQuantityMilli)} ${session.unitLabel}, ${formatKilograms(session.totalWeightG)}`}
        />
        <SummaryItem
          label="Sposob obliczenia"
          value={
            session.calculationBasis === "WEIGHT"
              ? "Waga aktywnych wpisow"
              : "Ilosc aktywnych jednostek"
          }
        />
        <SummaryItem label="Cala naleznosc" value={formatMoney(session.amountDueGrosz)} />
      </dl>

      <div className="payment-confirmation-fields">
        <label className="field">
          <span>Data biznesowa wyplaty</span>
          <input
            onChange={(event) => {
              setDraft((current) => ({
                ...current,
                paidBusinessDate: event.target.value
              }));
              setPrepared(null);
            }}
            required
            type="date"
            value={draft.paidBusinessDate}
          />
        </label>
        <label className="field">
          <span>Metoda</span>
          <select
            onChange={(event) => {
              setDraft((current) => ({
                ...current,
                paymentMethod: event.target
                  .value as PaymentConfirmationDraft["paymentMethod"]
              }));
              setPrepared(null);
            }}
            value={draft.paymentMethod}
          >
            <option value="CASH">Gotowka</option>
            <option value="BANK_TRANSFER">Przelew bankowy</option>
            <option value="OTHER">Inna</option>
          </select>
        </label>
        <label className="field payment-confirmation-form__note">
          <span>Notatka</span>
          <textarea
            maxLength={200}
            onChange={(event) => {
              setDraft((current) => ({ ...current, note: event.target.value }));
              setPrepared(null);
            }}
            rows={3}
            value={draft.note}
          />
        </label>
      </div>

      <label className="checkbox-field payment-confirmation-form__confirmation">
        <input
          checked={draft.confirmed}
          onChange={(event) => {
            setDraft((current) => ({
              ...current,
              confirmed: event.target.checked
            }));
            setPrepared(null);
          }}
          type="checkbox"
        />
        <span>Potwierdzam wyplate calej naleznosci za te sesje</span>
      </label>

      {error ? <p className="form-message form-message--error">{error}</p> : null}
      {prepared ? (
        <p className="form-message form-message--ok">Dane wyplaty sa gotowe do zapisu.</p>
      ) : null}

      <div className="payment-confirmation-form__actions">
        <button className="primary-button" type="submit">
          <Banknote aria-hidden="true" size={18} />
          Przygotuj wyplate
        </button>
        <button className="secondary-button" onClick={onCancel} type="button">
          Anuluj
        </button>
      </div>
    </form>
  );
}

function SummaryItem({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

function formatQuantity(quantityMilli: number): string {
  return new Intl.NumberFormat("pl-PL", {
    maximumFractionDigits: 3
  }).format(quantityMilli / 1000);
}
