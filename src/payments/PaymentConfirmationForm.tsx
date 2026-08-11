import { Banknote, X } from "lucide-react";
import { useRef, useState, type SyntheticEvent } from "react";

import { formatBusinessDate, formatKilograms, formatMoney } from "../domain/format";
import type { PaymentEligibilityResult } from "./paymentEligibility";
import {
  createInitialPaymentConfirmationDraft,
  preparePaymentConfirmation,
  type PaymentConfirmationDraft
} from "./paymentConfirmation";
import type { PendingPaymentSession } from "./pendingPayments";
import type { PaymentWriteResult } from "./paymentWrite";

export function PaymentConfirmationForm({
  eligibility,
  onCancel,
  onConfirm,
  onConfirmed,
  session
}: {
  eligibility: PaymentEligibilityResult;
  onCancel: () => void;
  onConfirm: (
    confirmation: ReturnType<typeof preparePaymentConfirmation>
  ) => Promise<PaymentWriteResult>;
  onConfirmed?: (result: PaymentWriteResult) => void;
  session: PendingPaymentSession;
}) {
  const [draft, setDraft] = useState<PaymentConfirmationDraft>(() =>
    createInitialPaymentConfirmationDraft()
  );
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [confirmed, setConfirmed] = useState<PaymentWriteResult | null>(null);
  const submissionInProgress = useRef(false);

  async function handleSubmit(event: SyntheticEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();

    if (submissionInProgress.current) {
      return;
    }

    submissionInProgress.current = true;

    try {
      const confirmation = preparePaymentConfirmation({
        draft,
        eligibility,
        session
      });
      setError(null);
      setConfirmed(null);
      setIsSubmitting(true);
      const result = await onConfirm(confirmation);
      setConfirmed(result);
      onConfirmed?.(result);
    } catch (caughtError) {
      setConfirmed(null);
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "Nie udało się zapisać wypłaty."
      );
    } finally {
      submissionInProgress.current = false;
      setIsSubmitting(false);
    }
  }

  return (
    <form
      className="payment-confirmation-form"
      onSubmit={(event) => {
        void handleSubmit(event);
      }}
    >
      <header className="payment-confirmation-form__header">
        <div>
          <p className="eyebrow">Potwierdzenie wypłaty</p>
          <h3>{session.workerName}</h3>
        </div>
        <button
          className="secondary-button icon-button"
          disabled={isSubmitting}
          onClick={onCancel}
          title="Anuluj Potwierdzenie"
          type="button"
        >
          <X aria-hidden="true" size={18} />
          <span className="sr-only">Anuluj Potwierdzenie</span>
        </button>
      </header>

      <dl className="payment-confirmation-summary">
        <SummaryItem label="Sesja" value={formatBusinessDate(session.businessDate)} />
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
          label="Sposob obliczeńia"
          value={
            session.calculationBasis === "WEIGHT"
              ? "Waga aktywnych wpisów"
              : "Ilość aktywnych jednostek"
          }
        />
        <SummaryItem label="Cala naleznosc" value={formatMoney(session.amountDueGrosz)} />
      </dl>

      <div className="payment-confirmation-fields">
        <label className="field">
          <span>Data wypłaty</span>
          <input
            disabled={isSubmitting || confirmed !== null}
            onChange={(event) => {
              setDraft((current) => ({
                ...current,
                paidBusinessDate: event.target.value
              }));
              setConfirmed(null);
            }}
            required
            type="date"
            value={draft.paidBusinessDate}
          />
        </label>
        <label className="field">
          <span>Metoda</span>
          <select
            disabled={isSubmitting || confirmed !== null}
            onChange={(event) => {
              setDraft((current) => ({
                ...current,
                paymentMethod: event.target
                  .value as PaymentConfirmationDraft["paymentMethod"]
              }));
              setConfirmed(null);
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
            disabled={isSubmitting || confirmed !== null}
            maxLength={200}
            onChange={(event) => {
              setDraft((current) => ({ ...current, note: event.target.value }));
              setConfirmed(null);
            }}
            rows={3}
            value={draft.note}
          />
        </label>
      </div>

      <label className="checkbox-field payment-confirmation-form__confirmation">
        <input
          checked={draft.confirmed}
          disabled={isSubmitting || confirmed !== null}
          onChange={(event) => {
            setDraft((current) => ({
              ...current,
              confirmed: event.target.checked
            }));
            setConfirmed(null);
          }}
          type="checkbox"
        />
        <span>Potwierdzam wypłatę całej należności za tę sesję</span>
      </label>

      {error ? <p className="form-message form-message--error">{error}</p> : null}
      {confirmed ? (
        <p
          className={`form-message ${
            confirmed.status === "CONFIRMED"
              ? "form-message--ok"
              : "form-message--warning"
          }`}
        >
          {confirmed.message}
        </p>
      ) : null}

      <div className="payment-confirmation-form__actions">
        <button
          className="primary-button"
          disabled={isSubmitting || confirmed !== null}
          type="submit"
        >
          <Banknote aria-hidden="true" size={18} />
          {isSubmitting ? "Zapisywanie..." : "Zapisz wypłatę"}
        </button>
        <button
          className="secondary-button"
          disabled={isSubmitting}
          onClick={onCancel}
          type="button"
        >
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
