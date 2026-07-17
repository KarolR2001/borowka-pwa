import { CirclePlus, RotateCcw } from "lucide-react";
import { useRef, useState, type SyntheticEvent } from "react";

import { parseDecimalToScaledInteger } from "../domain/format";
import { formatSessionQuantity } from "./ActiveHarvestSessionPanel";

export type UbiankaEntryDraft = {
  quantityMilli: number;
  weightG: number | null;
};

export type UbiankaEntryFormProps = {
  disabled?: boolean;
  unitLabel?: string;
  weightRequired: boolean;
  allowBatchQuantity: boolean;
  lastQuantityMilli?: number | null;
  onSubmit: (draft: UbiankaEntryDraft) => void;
};

const DEFAULT_QUANTITY = "1";
const QUICK_QUANTITIES = [
  { label: "0,5", value: "0,5", milli: 500 },
  { label: "1", value: "1", milli: 1000 },
  { label: "2", value: "2", milli: 2000 }
] as const;

export function UbiankaEntryForm({
  disabled = false,
  unitLabel = "ubianka",
  weightRequired,
  allowBatchQuantity,
  lastQuantityMilli,
  onSubmit
}: UbiankaEntryFormProps) {
  const [quantity, setQuantity] = useState(DEFAULT_QUANTITY);
  const [weight, setWeight] = useState("");
  const [feedback, setFeedback] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const weightInputRef = useRef<HTMLInputElement | null>(null);
  const canRepeatQuantity =
    typeof lastQuantityMilli === "number" &&
    Number.isSafeInteger(lastQuantityMilli) &&
    lastQuantityMilli > 0 &&
    (allowBatchQuantity || lastQuantityMilli <= 1000);

  const handleSubmit = (event: SyntheticEvent<HTMLFormElement>) => {
    event.preventDefault();
    setFeedback(null);
    setError(null);

    try {
      const draft = createUbiankaEntryDraft({
        quantity,
        weight,
        weightRequired,
        allowBatchQuantity
      });

      onSubmit(draft);
      setQuantity(DEFAULT_QUANTITY);
      setWeight("");
      setFeedback("Wpis dodany lokalnie.");
      weightInputRef.current?.focus();
    } catch (submitError: unknown) {
      setError(getUbiankaEntryFormErrorMessage(submitError));
    }
  };

  return (
    <form
      aria-label="Formularz wpisu za ubianke"
      className="ubianka-entry-form"
      onSubmit={handleSubmit}
    >
      <div className="ubianka-entry-form__heading">
        <h4>Wpis za ubianke</h4>
        <span>{weightRequired ? "Waga wymagana" : "Waga opcjonalna"}</span>
      </div>

      <label className="field" htmlFor="ubianka-quantity">
        Ilosc
        <input
          id="ubianka-quantity"
          inputMode="decimal"
          onChange={(event) => {
            setQuantity(event.target.value);
          }}
          type="text"
          value={quantity}
          disabled={disabled}
        />
      </label>

      <div className="ubianka-entry-form__quick" aria-label="Szybkie ilosci">
        {QUICK_QUANTITIES.map((quickQuantity) => {
          const quickDisabled =
            disabled || (!allowBatchQuantity && quickQuantity.milli > 1000);

          return (
            <button
              aria-pressed={quantity === quickQuantity.value}
              disabled={quickDisabled}
              key={quickQuantity.value}
              onClick={() => {
                setQuantity(quickQuantity.value);
              }}
              type="button"
            >
              {quickQuantity.label}
            </button>
          );
        })}
        <button
          disabled={disabled || !canRepeatQuantity}
          onClick={() => {
            if (typeof lastQuantityMilli === "number") {
              setQuantity(formatMilliForInput(lastQuantityMilli));
            }
          }}
          type="button"
        >
          <RotateCcw aria-hidden="true" size={16} strokeWidth={2.2} />
          Powtorz ilosc
        </button>
      </div>

      <label className="field" htmlFor="ubianka-weight">
        Waga kg
        <input
          id="ubianka-weight"
          inputMode="decimal"
          onChange={(event) => {
            setWeight(event.target.value);
          }}
          ref={weightInputRef}
          type="text"
          value={weight}
          disabled={disabled}
        />
      </label>

      {!weightRequired ? (
        <p className="ubianka-entry-form__notice">
          Wpis bez wagi nie zwiekszy stanu kilogramow.
        </p>
      ) : null}

      <div className="ubianka-entry-form__preview" aria-label="Podglad wpisu">
        <span>{previewQuantityLabel(quantity, unitLabel)}</span>
        <span>{weight.trim() ? `${weight.trim()} kg` : "waga: brak"}</span>
      </div>

      {feedback ? <p className="form-message form-message--ok">{feedback}</p> : null}
      {error ? <p className="form-message form-message--error">{error}</p> : null}

      <button className="primary-action ubianka-entry-form__submit" disabled={disabled}>
        <CirclePlus aria-hidden="true" size={18} strokeWidth={2.2} />
        Zapisz wpis
      </button>
    </form>
  );
}

export function createUbiankaEntryDraft({
  quantity,
  weight,
  weightRequired,
  allowBatchQuantity
}: {
  quantity: string;
  weight: string;
  weightRequired: boolean;
  allowBatchQuantity: boolean;
}): UbiankaEntryDraft {
  const quantityMilli = parseDecimalToScaledInteger(quantity, 3);

  if (quantityMilli <= 0) {
    throw new Error("Ilosc musi byc wieksza od zera.");
  }

  if (!allowBatchQuantity && quantityMilli > 1000) {
    throw new Error("Plan nie dopuszcza wpisu zbiorczego.");
  }

  const normalizedWeight = weight.trim();

  if (!normalizedWeight) {
    if (weightRequired) {
      throw new Error("Podaj wage wpisu.");
    }

    return {
      quantityMilli,
      weightG: null
    };
  }

  const weightG = parseDecimalToScaledInteger(normalizedWeight, 3);

  if (weightG <= 0) {
    throw new Error("Waga musi byc wieksza od zera.");
  }

  return {
    quantityMilli,
    weightG
  };
}

function previewQuantityLabel(quantity: string, unitLabel: string): string {
  try {
    return formatSessionQuantity(parseDecimalToScaledInteger(quantity, 3), 3, unitLabel);
  } catch {
    return `0 ${unitLabel}`;
  }
}

function formatMilliForInput(quantityMilli: number): string {
  const normalized = String(quantityMilli / 1000).replace(".", ",");

  return normalized;
}

function getUbiankaEntryFormErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Nie udalo sie przygotowac wpisu.";
}
