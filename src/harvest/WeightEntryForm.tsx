import { CirclePlus } from "lucide-react";
import { useRef, useState, type SyntheticEvent } from "react";

import {
  formatKilograms,
  formatMoney,
  parseDecimalToScaledInteger
} from "../domain/format";

export type WeightEntryDraft = {
  quantityMilli: number;
  weightG: number;
  amountPreviewGrosz: number;
};

export type WeightEntryFormProps = {
  disabled?: boolean;
  rateGroszPerKg: number;
  onSubmit: (draft: WeightEntryDraft) => void | Promise<void>;
};

export function WeightEntryForm({
  disabled = false,
  rateGroszPerKg,
  onSubmit
}: WeightEntryFormProps) {
  const [weight, setWeight] = useState("");
  const [feedback, setFeedback] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const submittingRef = useRef(false);
  const weightInputRef = useRef<HTMLInputElement | null>(null);
  const formDisabled = disabled || isSubmitting;
  const preview = previewWeightEntry(weight, rateGroszPerKg);

  const handleSubmit = async (event: SyntheticEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (disabled || submittingRef.current) {
      return;
    }

    setFeedback(null);
    setError(null);
    let focusAfterSubmit = false;

    try {
      const draft = createWeightEntryDraft({
        weight,
        rateGroszPerKg
      });

      submittingRef.current = true;
      setIsSubmitting(true);
      await onSubmit(draft);
      setWeight("");
      setFeedback("Wpis wagowy dodany lokalnie.");
      focusAfterSubmit = true;
    } catch (submitError: unknown) {
      setError(getWeightEntryFormErrorMessage(submitError));
    } finally {
      submittingRef.current = false;
      setIsSubmitting(false);

      if (focusAfterSubmit) {
        window.setTimeout(() => {
          weightInputRef.current?.focus();
        }, 0);
      }
    }
  };

  return (
    <form
      aria-label="Formularz wpisu za kilogram"
      className="weight-entry-form"
      onSubmit={(event) => {
        void handleSubmit(event);
      }}
    >
      <div className="weight-entry-form__heading">
        <h4>Wpis za kilogram</h4>
        <span>{formatMoney(rateGroszPerKg)} / kg</span>
      </div>

      <label className="field" htmlFor="weight-entry-weight">
        Waga kg
        <input
          autoComplete="off"
          disabled={formDisabled}
          id="weight-entry-weight"
          inputMode="decimal"
          onChange={(event) => {
            setWeight(event.target.value);
          }}
          ref={weightInputRef}
          type="text"
          value={weight}
        />
      </label>

      <div className="weight-entry-form__preview" aria-label="Podglad wpisu wagowego">
        <span>{preview.weightLabel}</span>
        <span>{preview.amountLabel}</span>
      </div>

      <p className="weight-entry-form__notice">
        Podglad wpisu jest informacyjny. Oficjalna kwota jest liczona raz przy zamknieciu
        sesji.
      </p>

      {feedback ? <p className="form-message form-message--ok">{feedback}</p> : null}
      {error ? <p className="form-message form-message--error">{error}</p> : null}

      <button
        className="primary-action weight-entry-form__submit"
        disabled={formDisabled}
      >
        <CirclePlus aria-hidden="true" size={18} strokeWidth={2.2} />
        Zapisz wpis
      </button>
    </form>
  );
}

export function createWeightEntryDraft({
  weight,
  rateGroszPerKg
}: {
  weight: string;
  rateGroszPerKg: number;
}): WeightEntryDraft {
  assertRate(rateGroszPerKg);

  const weightG = parseDecimalToScaledInteger(weight, 3);

  if (weightG <= 0) {
    throw new Error("Waga musi byc wieksza od zera.");
  }

  return {
    quantityMilli: weightG,
    weightG,
    amountPreviewGrosz: calculateWeightEntryPreviewGrosz(weightG, rateGroszPerKg)
  };
}

export function calculateWeightEntryPreviewGrosz(
  weightG: number,
  rateGroszPerKg: number
): number {
  if (!Number.isSafeInteger(weightG) || weightG < 0) {
    throw new Error("Waga musi byc bezpieczna liczba calkowita gramow.");
  }

  assertRate(rateGroszPerKg);

  return Math.round((weightG * rateGroszPerKg) / 1000);
}

function previewWeightEntry(
  weight: string,
  rateGroszPerKg: number
): {
  weightLabel: string;
  amountLabel: string;
} {
  try {
    const draft = createWeightEntryDraft({ weight, rateGroszPerKg });

    return {
      weightLabel: formatKilograms(draft.weightG),
      amountLabel: formatMoney(draft.amountPreviewGrosz)
    };
  } catch {
    return {
      weightLabel: "0,000 kg",
      amountLabel: formatMoney(0)
    };
  }
}

function assertRate(rateGroszPerKg: number): void {
  if (!Number.isSafeInteger(rateGroszPerKg) || rateGroszPerKg <= 0) {
    throw new Error("Stawka za kilogram musi byc dodatnia liczba calkowita.");
  }
}

function getWeightEntryFormErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Nie udalo sie przygotowac wpisu.";
}
