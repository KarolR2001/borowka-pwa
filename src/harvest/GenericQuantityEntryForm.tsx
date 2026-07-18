import { CirclePlus } from "lucide-react";
import { useRef, useState, type SyntheticEvent } from "react";

import { formatMoney, parseDecimalToScaledInteger } from "../domain/format";
import { formatSessionQuantity } from "./ActiveHarvestSessionPanel";

export type GenericQuantityPlanConfig = {
  name: string;
  unitLabelSingular: string;
  unitLabelPlural: string;
  quantityPrecision: number;
  weightRequired: boolean;
  allowBatchQuantity: boolean;
  description?: string | null;
  rateGroszPerUnit: number;
};

export type GenericQuantityEntryDraft = {
  quantityMilli: number;
  weightG: number | null;
  amountPreviewGrosz: number;
};

export type GenericQuantityEntryFormProps = {
  disabled?: boolean;
  plan: GenericQuantityPlanConfig;
  onSubmit: (draft: GenericQuantityEntryDraft) => void | Promise<void>;
};

const DEFAULT_QUANTITY = "1";

export function GenericQuantityEntryForm({
  disabled = false,
  plan,
  onSubmit
}: GenericQuantityEntryFormProps) {
  const [quantity, setQuantity] = useState(DEFAULT_QUANTITY);
  const [weight, setWeight] = useState("");
  const [feedback, setFeedback] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const submittingRef = useRef(false);
  const quantityInputRef = useRef<HTMLInputElement | null>(null);
  const formDisabled = disabled || isSubmitting;
  const preview = previewGenericQuantityEntry({ quantity, weight, plan });

  const handleSubmit = async (event: SyntheticEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (disabled || submittingRef.current) {
      return;
    }

    setFeedback(null);
    setError(null);
    let focusAfterSubmit = false;

    try {
      const draft = createGenericQuantityEntryDraft({
        quantity,
        weight,
        plan
      });

      submittingRef.current = true;
      setIsSubmitting(true);
      await onSubmit(draft);
      setQuantity(DEFAULT_QUANTITY);
      setWeight("");
      setFeedback("Wpis ilosciowy dodany lokalnie.");
      focusAfterSubmit = true;
    } catch (submitError: unknown) {
      setError(getGenericQuantityEntryFormErrorMessage(submitError));
    } finally {
      submittingRef.current = false;
      setIsSubmitting(false);

      if (focusAfterSubmit) {
        window.setTimeout(() => {
          quantityInputRef.current?.focus();
        }, 0);
      }
    }
  };

  return (
    <form
      aria-label="Formularz wpisu ilosciowego"
      className="generic-quantity-form"
      onSubmit={(event) => {
        void handleSubmit(event);
      }}
    >
      <div className="generic-quantity-form__heading">
        <div>
          <h4>{plan.name}</h4>
          <p>{plan.description ?? "Plan ilosciowy generowany z konfiguracji."}</p>
        </div>
        <span>{plan.weightRequired ? "Waga wymagana" : "Waga opcjonalna"}</span>
      </div>

      <label className="field" htmlFor="generic-quantity">
        Ilosc {plan.unitLabelSingular}
        <input
          autoComplete="off"
          disabled={formDisabled}
          id="generic-quantity"
          inputMode="decimal"
          onChange={(event) => {
            setQuantity(event.target.value);
          }}
          ref={quantityInputRef}
          type="text"
          value={quantity}
        />
      </label>

      <label className="field" htmlFor="generic-quantity-weight">
        Waga kg
        <input
          autoComplete="off"
          disabled={formDisabled}
          id="generic-quantity-weight"
          inputMode="decimal"
          onChange={(event) => {
            setWeight(event.target.value);
          }}
          type="text"
          value={weight}
        />
      </label>

      <div className="generic-quantity-form__facts" aria-label="Konfiguracja planu">
        <span>Precyzja: {String(plan.quantityPrecision)}</span>
        <span>
          {plan.allowBatchQuantity ? "Wpis zbiorczy dozwolony" : "Tylko 1 jednostka"}
        </span>
        <span>
          {formatMoney(plan.rateGroszPerUnit)} / {plan.unitLabelSingular}
        </span>
      </div>

      {!plan.weightRequired ? (
        <p className="generic-quantity-form__notice">
          Wpis bez wagi nie zwiekszy stanu kilogramow.
        </p>
      ) : null}

      <div className="generic-quantity-form__preview" aria-label="Przyklad obliczenia">
        <span>{preview.quantityLabel}</span>
        <span>{preview.weightLabel}</span>
        <span>{preview.amountLabel}</span>
      </div>

      {feedback ? <p className="form-message form-message--ok">{feedback}</p> : null}
      {error ? <p className="form-message form-message--error">{error}</p> : null}

      <button
        className="primary-action generic-quantity-form__submit"
        disabled={formDisabled}
      >
        <CirclePlus aria-hidden="true" size={18} strokeWidth={2.2} />
        Zapisz wpis
      </button>
    </form>
  );
}

export function createGenericQuantityEntryDraft({
  quantity,
  weight,
  plan
}: {
  quantity: string;
  weight: string;
  plan: GenericQuantityPlanConfig;
}): GenericQuantityEntryDraft {
  assertQuantityPlanConfig(plan);

  const quantityMilli = parseDecimalToScaledInteger(quantity, 3);

  if (quantityMilli <= 0) {
    throw new Error("Ilosc musi byc wieksza od zera.");
  }

  if (!isQuantityAllowedByPrecision(quantityMilli, plan.quantityPrecision)) {
    throw new Error("Ilosc nie miesci sie w precyzji planu.");
  }

  if (!plan.allowBatchQuantity && quantityMilli > 1000) {
    throw new Error("Plan nie dopuszcza wpisu zbiorczego.");
  }

  const normalizedWeight = weight.trim();

  if (!normalizedWeight) {
    if (plan.weightRequired) {
      throw new Error("Podaj wage wpisu.");
    }

    return {
      quantityMilli,
      weightG: null,
      amountPreviewGrosz: calculateQuantityPreviewGrosz(
        quantityMilli,
        plan.rateGroszPerUnit
      )
    };
  }

  const weightG = parseDecimalToScaledInteger(normalizedWeight, 3);

  if (weightG <= 0) {
    throw new Error("Waga musi byc wieksza od zera.");
  }

  return {
    quantityMilli,
    weightG,
    amountPreviewGrosz: calculateQuantityPreviewGrosz(
      quantityMilli,
      plan.rateGroszPerUnit
    )
  };
}

export function calculateQuantityPreviewGrosz(
  quantityMilli: number,
  rateGroszPerUnit: number
): number {
  if (!Number.isSafeInteger(quantityMilli) || quantityMilli < 0) {
    throw new Error("Ilosc musi byc bezpieczna liczba calkowita.");
  }

  if (!Number.isSafeInteger(rateGroszPerUnit) || rateGroszPerUnit <= 0) {
    throw new Error("Stawka planu musi byc dodatnia liczba calkowita.");
  }

  return Math.round((quantityMilli * rateGroszPerUnit) / 1000);
}

export function isQuantityAllowedByPrecision(
  quantityMilli: number,
  precision: number
): boolean {
  if (!Number.isSafeInteger(quantityMilli)) {
    return false;
  }

  if (!Number.isInteger(precision) || precision < 0 || precision > 3) {
    return false;
  }

  const step = 10 ** (3 - precision);

  return quantityMilli % step === 0;
}

function previewGenericQuantityEntry({
  quantity,
  weight,
  plan
}: {
  quantity: string;
  weight: string;
  plan: GenericQuantityPlanConfig;
}): {
  quantityLabel: string;
  weightLabel: string;
  amountLabel: string;
} {
  let quantityMilli = 0;

  try {
    assertQuantityPlanConfig(plan);
    quantityMilli = parseDecimalToScaledInteger(quantity, 3);

    if (
      quantityMilli <= 0 ||
      !isQuantityAllowedByPrecision(quantityMilli, plan.quantityPrecision)
    ) {
      quantityMilli = 0;
    }
  } catch {
    quantityMilli = 0;
  }

  return {
    quantityLabel: formatSessionQuantity(
      quantityMilli,
      plan.quantityPrecision,
      chooseUnitLabelForMilli(quantityMilli, plan)
    ),
    weightLabel: previewWeightLabel(weight),
    amountLabel:
      quantityMilli > 0
        ? formatMoney(calculateQuantityPreviewGrosz(quantityMilli, plan.rateGroszPerUnit))
        : formatMoney(0)
  };
}

function assertQuantityPlanConfig(plan: GenericQuantityPlanConfig): void {
  if (!plan.name.trim()) {
    throw new Error("Plan wymaga nazwy.");
  }

  if (!plan.unitLabelSingular.trim() || !plan.unitLabelPlural.trim()) {
    throw new Error("Plan wymaga etykiet jednostki.");
  }

  if (
    !Number.isInteger(plan.quantityPrecision) ||
    plan.quantityPrecision < 0 ||
    plan.quantityPrecision > 3
  ) {
    throw new Error("Precyzja planu musi byc od 0 do 3.");
  }

  if (!Number.isSafeInteger(plan.rateGroszPerUnit) || plan.rateGroszPerUnit <= 0) {
    throw new Error("Stawka planu musi byc dodatnia liczba calkowita.");
  }
}

function chooseUnitLabelForMilli(
  quantityMilli: number,
  plan: GenericQuantityPlanConfig
): string {
  return quantityMilli === 1000 ? plan.unitLabelSingular : plan.unitLabelPlural;
}

function previewWeightLabel(weight: string): string {
  const normalizedWeight = weight.trim();

  if (!normalizedWeight) {
    return "waga: brak";
  }

  try {
    return `${formatWeight(parseDecimalToScaledInteger(normalizedWeight, 3))} kg`;
  } catch {
    return "waga: blad";
  }
}

function formatWeight(weightG: number): string {
  const whole = Math.floor(weightG / 1000);
  const fractional = String(weightG % 1000).padStart(3, "0");

  return `${String(whole)},${fractional}`;
}

function getGenericQuantityEntryFormErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Nie udalo sie przygotowac wpisu.";
}
