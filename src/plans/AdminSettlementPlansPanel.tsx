import { Plus, RefreshCw, Scale, Search, ShieldAlert } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import type { AuthSessionState } from "../auth/authSession";
import { getOrCreateDeviceId } from "../domain/device";
import {
  createSettlementPlan,
  createSettlementPlanExample,
  defaultSettlementPlanFilters,
  filterSettlementPlans,
  isSettlementCalculationBasis,
  listSettlementPlansDirectory,
  settlementCalculationBasisLabel,
  settlementPlanStatusLabel,
  type CreateSettlementPlanInput,
  type SettlementPlanFilters,
  type SettlementPlansDirectoryResult
} from "./settlementPlans";

type FirebaseEnv = Record<string, string | boolean | undefined>;

export type SettlementPlansApi = {
  list: (env: FirebaseEnv) => Promise<SettlementPlansDirectoryResult>;
  create?: (env: FirebaseEnv, input: CreateSettlementPlanInput) => Promise<unknown>;
};

export const defaultSettlementPlansApi: SettlementPlansApi = {
  list: listSettlementPlansDirectory,
  create: createSettlementPlan
};

type SettlementPlansState =
  | {
      status: "IDLE" | "LOADING";
      result: SettlementPlansDirectoryResult | null;
      message: string;
    }
  | {
      status: "READY";
      result: SettlementPlansDirectoryResult;
      message: string;
    }
  | {
      status: "ERROR";
      result: SettlementPlansDirectoryResult | null;
      message: string;
    };

type CreatePlanDraft = {
  name: string;
  code: string;
  calculationBasis: "WEIGHT" | "QUANTITY";
  unitLabelSingular: string;
  unitLabelPlural: string;
  unitSymbol: string;
  quantityPrecision: number;
  weightRequired: boolean;
  allowBatchQuantity: boolean;
  description: string;
  confirmed: boolean;
};

const initialState: SettlementPlansState = {
  status: "IDLE",
  result: null,
  message: "Lista planow nie zostala jeszcze pobrana."
};

const initialCreatePlanDraft: CreatePlanDraft = {
  name: "",
  code: "",
  calculationBasis: "QUANTITY",
  unitLabelSingular: "",
  unitLabelPlural: "",
  unitSymbol: "",
  quantityPrecision: 1,
  weightRequired: false,
  allowBatchQuantity: true,
  description: "",
  confirmed: false
};

export function AdminSettlementPlansPanel({
  authState,
  env,
  settlementPlansApi = defaultSettlementPlansApi
}: {
  authState: AuthSessionState;
  env: FirebaseEnv;
  settlementPlansApi?: SettlementPlansApi;
}) {
  const [filters, setFilters] = useState<SettlementPlanFilters>(
    defaultSettlementPlanFilters
  );
  const [state, setState] = useState<SettlementPlansState>(initialState);
  const [createDraft, setCreateDraft] = useState<CreatePlanDraft>(initialCreatePlanDraft);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const isAdmin = authState.status === "READY" && authState.profile.role === "ADMIN";

  useEffect(() => {
    let isMounted = true;

    if (!isAdmin) {
      setState(initialState);
      return undefined;
    }

    setState((current) => ({
      status: "LOADING",
      result: current.result,
      message: "Pobieranie planow."
    }));

    void settlementPlansApi
      .list(env)
      .then((result) => {
        if (isMounted) {
          setState({
            status: "READY",
            result,
            message: "Lista planow jest aktualna."
          });
        }
      })
      .catch(() => {
        if (isMounted) {
          setState((current) => ({
            status: "ERROR",
            result: current.result,
            message: "Nie udalo sie pobrac planow."
          }));
        }
      });

    return () => {
      isMounted = false;
    };
  }, [env, isAdmin, settlementPlansApi]);

  const filteredPlans = useMemo(
    () => (state.result ? filterSettlementPlans(state.result.plans, filters) : []),
    [filters, state.result]
  );
  const activePlansCount = state.result?.plans.filter((plan) => plan.active).length ?? 0;
  const usedPlansCount = state.result?.plans.filter((plan) => plan.wasUsed).length ?? 0;
  const invalidDocumentsCount =
    (state.result?.invalidPlans.length ?? 0) +
    (state.result?.invalidRateVersions.length ?? 0);

  const reload = () => {
    setState((current) => ({
      status: "LOADING",
      result: current.result,
      message: "Pobieranie planow."
    }));

    void settlementPlansApi
      .list(env)
      .then((result) => {
        setState({
          status: "READY",
          result,
          message: "Lista planow jest aktualna."
        });
      })
      .catch(() => {
        setState((current) => ({
          status: "ERROR",
          result: current.result,
          message: "Nie udalo sie pobrac planow."
        }));
      });
  };

  const handleCreatePlan = async () => {
    if (authState.status !== "READY") {
      return;
    }

    setFeedback(null);
    setError(null);

    if (!createDraft.confirmed) {
      setError("Potwierdz utworzenie planu.");
      return;
    }

    if (!navigator.onLine) {
      setError("Tworzenie planu wymaga polaczenia online.");
      return;
    }

    const create = settlementPlansApi.create ?? defaultSettlementPlansApi.create;

    if (!create) {
      setError("Operacja tworzenia planu nie jest dostepna.");
      return;
    }

    setIsSubmitting(true);

    try {
      const result = await create(env, {
        actorProfile: authState.profile,
        name: createDraft.name,
        code: createDraft.code,
        calculationBasis: createDraft.calculationBasis,
        unitLabelSingular: createDraft.unitLabelSingular,
        unitLabelPlural: createDraft.unitLabelPlural,
        unitSymbol: createDraft.unitSymbol,
        quantityPrecision: createDraft.quantityPrecision,
        weightRequired: createDraft.weightRequired,
        allowBatchQuantity: createDraft.allowBatchQuantity,
        description: createDraft.description,
        deviceId: getOrCreateDeviceId()
      });
      await reloadAfterSubmit();
      setFeedback(createPlanFeedback(result));
      setCreateDraft(initialCreatePlanDraft);
    } catch (createError: unknown) {
      setError(getSettlementPlansErrorMessage(createError));
    } finally {
      setIsSubmitting(false);
    }
  };

  const reloadAfterSubmit = async () => {
    const result = await settlementPlansApi.list(env);

    setState({
      status: "READY",
      result,
      message: "Lista planow jest aktualna."
    });
  };

  if (authState.status !== "READY") {
    return (
      <section className="settlement-plan-directory" aria-label="Plany rozliczen">
        <AccessNotice
          title="Logowanie wymagane"
          message="Zaloguj sie jako administrator."
        />
      </section>
    );
  }

  if (authState.profile.role !== "ADMIN") {
    return (
      <section className="settlement-plan-directory" aria-label="Plany rozliczen">
        <AccessNotice
          title="Brak dostepu"
          message="Plany rozliczen sa zarzadzane tylko przez administratora."
        />
      </section>
    );
  }

  return (
    <section className="settlement-plan-directory" aria-label="Plany rozliczen">
      <div className="directory-header">
        <div>
          <p className="eyebrow">Plany</p>
          <h2>Lista planow rozliczen</h2>
          <p className="panel-detail">{state.message}</p>
        </div>
        <button
          className="secondary-action"
          disabled={state.status === "LOADING"}
          onClick={reload}
          type="button"
        >
          <RefreshCw aria-hidden="true" size={18} strokeWidth={2.2} />
          <span>Odswiez</span>
        </button>
      </div>

      <SettlementPlanFilterControls filters={filters} onChange={setFilters} />

      {state.result ? (
        <CreateSettlementPlanForm
          draft={createDraft}
          isSubmitting={isSubmitting}
          onChange={setCreateDraft}
          onSubmit={() => {
            void handleCreatePlan();
          }}
        />
      ) : null}

      {feedback ? <p className="form-message form-message--ok">{feedback}</p> : null}
      {error ? <p className="form-message form-message--error">{error}</p> : null}

      <div className="directory-summary" aria-label="Podsumowanie planow">
        <DirectoryStat
          label="Wszystkie plany"
          value={String(state.result?.plans.length ?? 0)}
        />
        <DirectoryStat label="Aktywne" value={String(activePlansCount)} />
        <DirectoryStat label="Uzyte w stawkach" value={String(usedPlansCount)} />
        <DirectoryStat label="Bledne dokumenty" value={String(invalidDocumentsCount)} />
      </div>

      {state.status === "ERROR" ? (
        <p className="form-message form-message--error">{state.message}</p>
      ) : null}

      {state.status === "LOADING" && !state.result ? (
        <p className="empty-state">Pobieranie planow.</p>
      ) : null}

      {state.result && filteredPlans.length === 0 ? (
        <p className="empty-state">Brak planow dla wybranych filtrow.</p>
      ) : null}

      {filteredPlans.length > 0 ? (
        <div className="directory-table-wrap">
          <table className="directory-table">
            <thead>
              <tr>
                <th scope="col">Nazwa</th>
                <th scope="col">Podstawa</th>
                <th scope="col">Jednostka</th>
                <th scope="col">Precyzja</th>
                <th scope="col">Waga</th>
                <th scope="col">Zbiorcze</th>
                <th scope="col">Aktywne stawki</th>
                <th scope="col">Uzyty</th>
                <th scope="col">Status</th>
              </tr>
            </thead>
            <tbody>
              {filteredPlans.map((plan) => (
                <tr key={plan.id}>
                  <td>
                    <strong>{plan.name}</strong>
                    <span className="directory-cell-note">{plan.code}</span>
                  </td>
                  <td>{settlementCalculationBasisLabel(plan.calculationBasis)}</td>
                  <td>
                    {plan.unitLabelSingular} ({plan.unitSymbol})
                  </td>
                  <td>{plan.quantityPrecision}</td>
                  <td>{plan.weightRequired ? "Wymagana" : "Opcjonalna"}</td>
                  <td>{plan.allowBatchQuantity ? "Tak" : "Nie"}</td>
                  <td>{plan.activeRateCount}</td>
                  <td>{plan.wasUsed ? "Tak" : "Nie"}</td>
                  <td>{settlementPlanStatusLabel(plan)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      {state.result && state.result.invalidPlans.length > 0 ? (
        <InvalidDocuments
          documents={state.result.invalidPlans}
          title="Bledne dokumenty planow"
        />
      ) : null}

      {state.result && state.result.invalidRateVersions.length > 0 ? (
        <InvalidDocuments
          documents={state.result.invalidRateVersions}
          title="Bledne dokumenty stawek"
        />
      ) : null}
    </section>
  );
}

function CreateSettlementPlanForm({
  draft,
  isSubmitting,
  onChange,
  onSubmit
}: {
  draft: CreatePlanDraft;
  isSubmitting: boolean;
  onChange: (draft: CreatePlanDraft) => void;
  onSubmit: () => void;
}) {
  const effectiveDraft =
    draft.calculationBasis === "WEIGHT" && !draft.weightRequired
      ? {
          ...draft,
          weightRequired: true
        }
      : draft;
  const example = createSettlementPlanExample(effectiveDraft);
  const inventoryWarning =
    effectiveDraft.calculationBasis === "QUANTITY" && !effectiveDraft.weightRequired
      ? "Wpis bez wagi nie zwiekszy stanu kilogramow w magazynie."
      : null;

  return (
    <form
      aria-label="Tworzenie planu rozliczen"
      className="settlement-plan-form"
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit();
      }}
    >
      <label className="field">
        <span>Nazwa planu</span>
        <input
          disabled={isSubmitting}
          onChange={(event) => {
            onChange({
              ...draft,
              name: event.target.value,
              confirmed: false
            });
          }}
          type="text"
          value={draft.name}
        />
      </label>

      <label className="field">
        <span>Kod</span>
        <input
          disabled={isSubmitting}
          onChange={(event) => {
            onChange({
              ...draft,
              code: event.target.value,
              confirmed: false
            });
          }}
          type="text"
          value={draft.code}
        />
      </label>

      <label className="field">
        <span>Podstawa</span>
        <select
          disabled={isSubmitting}
          onChange={(event) => {
            const nextBasis = event.target.value;

            if (!isSettlementCalculationBasis(nextBasis)) {
              return;
            }

            onChange({
              ...draft,
              calculationBasis: nextBasis,
              weightRequired: nextBasis === "WEIGHT" ? true : draft.weightRequired,
              quantityPrecision: nextBasis === "WEIGHT" ? 3 : draft.quantityPrecision,
              confirmed: false
            });
          }}
          value={draft.calculationBasis}
        >
          <option value="QUANTITY">Ilosc</option>
          <option value="WEIGHT">Waga</option>
        </select>
      </label>

      <label className="field">
        <span>Jednostka</span>
        <input
          disabled={isSubmitting}
          onChange={(event) => {
            onChange({
              ...draft,
              unitLabelSingular: event.target.value,
              confirmed: false
            });
          }}
          type="text"
          value={draft.unitLabelSingular}
        />
      </label>

      <label className="field">
        <span>Jednostki</span>
        <input
          disabled={isSubmitting}
          onChange={(event) => {
            onChange({
              ...draft,
              unitLabelPlural: event.target.value,
              confirmed: false
            });
          }}
          type="text"
          value={draft.unitLabelPlural}
        />
      </label>

      <label className="field">
        <span>Symbol</span>
        <input
          disabled={isSubmitting}
          onChange={(event) => {
            onChange({
              ...draft,
              unitSymbol: event.target.value,
              confirmed: false
            });
          }}
          type="text"
          value={draft.unitSymbol}
        />
      </label>

      <label className="field">
        <span>Precyzja</span>
        <select
          disabled={isSubmitting || draft.calculationBasis === "WEIGHT"}
          onChange={(event) => {
            onChange({
              ...draft,
              quantityPrecision: Number(event.target.value),
              confirmed: false
            });
          }}
          value={effectiveDraft.quantityPrecision}
        >
          <option value="0">0</option>
          <option value="1">1</option>
          <option value="2">2</option>
          <option value="3">3</option>
        </select>
      </label>

      <label className="field settlement-plan-form__description">
        <span>Opis</span>
        <input
          disabled={isSubmitting}
          onChange={(event) => {
            onChange({
              ...draft,
              description: event.target.value,
              confirmed: false
            });
          }}
          type="text"
          value={draft.description}
        />
      </label>

      <label className="checkbox-field settlement-plan-form__confirmation">
        <input
          checked={effectiveDraft.weightRequired}
          disabled={isSubmitting || draft.calculationBasis === "WEIGHT"}
          onChange={(event) => {
            onChange({
              ...draft,
              weightRequired: event.target.checked,
              confirmed: false
            });
          }}
          type="checkbox"
        />
        <span>Waga wymagana</span>
      </label>

      <label className="checkbox-field settlement-plan-form__confirmation">
        <input
          checked={draft.allowBatchQuantity}
          disabled={isSubmitting}
          onChange={(event) => {
            onChange({
              ...draft,
              allowBatchQuantity: event.target.checked,
              confirmed: false
            });
          }}
          type="checkbox"
        />
        <span>Wpis zbiorczy</span>
      </label>

      <label className="checkbox-field settlement-plan-form__confirmation">
        <input
          checked={draft.confirmed}
          disabled={isSubmitting}
          onChange={(event) => {
            onChange({
              ...effectiveDraft,
              confirmed: event.target.checked
            });
          }}
          type="checkbox"
        />
        <span>Potwierdzam utworzenie planu</span>
      </label>

      <div className="settlement-plan-form__example" aria-label="Przyklad planu">
        <strong>{example}</strong>
        {inventoryWarning ? <span>{inventoryWarning}</span> : null}
      </div>

      <button
        className="primary-action settlement-plan-form__submit"
        disabled={isSubmitting}
        type="submit"
      >
        <Plus aria-hidden="true" size={18} strokeWidth={2.2} />
        <span>Dodaj plan</span>
      </button>
    </form>
  );
}

function SettlementPlanFilterControls({
  filters,
  onChange
}: {
  filters: SettlementPlanFilters;
  onChange: (filters: SettlementPlanFilters) => void;
}) {
  return (
    <div className="directory-filters settlement-plan-filters" aria-label="Filtry planow">
      <label className="field">
        <span>Szukaj</span>
        <span className="search-field">
          <Search aria-hidden="true" size={18} strokeWidth={2.2} />
          <input
            onChange={(event) => {
              onChange({
                ...filters,
                search: event.target.value
              });
            }}
            type="search"
            value={filters.search}
          />
        </span>
      </label>

      <label className="field">
        <span>Podstawa</span>
        <select
          onChange={(event) => {
            const nextBasis = event.target.value;

            if (nextBasis === "ALL" || isSettlementCalculationBasis(nextBasis)) {
              onChange({
                ...filters,
                basis: nextBasis
              });
            }
          }}
          value={filters.basis}
        >
          <option value="ALL">Wszystkie</option>
          <option value="WEIGHT">Waga</option>
          <option value="QUANTITY">Ilosc</option>
        </select>
      </label>

      <label className="field">
        <span>Status</span>
        <select
          onChange={(event) => {
            const nextStatus = event.target.value;

            if (
              nextStatus === "ALL" ||
              nextStatus === "ACTIVE" ||
              nextStatus === "ARCHIVED"
            ) {
              onChange({
                ...filters,
                status: nextStatus
              });
            }
          }}
          value={filters.status}
        >
          <option value="ALL">Wszystkie</option>
          <option value="ACTIVE">Aktywne</option>
          <option value="ARCHIVED">Archiwalne</option>
        </select>
      </label>
    </div>
  );
}

function DirectoryStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="directory-stat">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function InvalidDocuments({
  documents,
  title
}: {
  documents: { id: string; reason: string }[];
  title: string;
}) {
  return (
    <div className="invalid-profiles" aria-label={title}>
      <div className="access-notice__icon">
        <ShieldAlert aria-hidden="true" size={20} strokeWidth={2.2} />
      </div>
      <div>
        <p className="eyebrow">{title}</p>
        <ul>
          {documents.map((document) => (
            <li key={document.id}>
              <strong>{document.id}</strong>: {document.reason}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function AccessNotice({ title, message }: { title: string; message: string }) {
  return (
    <div className="access-notice">
      <div className="access-notice__icon">
        <Scale aria-hidden="true" size={20} strokeWidth={2.2} />
      </div>
      <div>
        <p className="eyebrow">{title}</p>
        <p className="panel-detail">{message}</p>
      </div>
    </div>
  );
}

function createPlanFeedback(result: unknown): string {
  if (
    typeof result === "object" &&
    result !== null &&
    "inventoryWarning" in result &&
    typeof result.inventoryWarning === "string"
  ) {
    return `Utworzono plan. ${result.inventoryWarning}`;
  }

  return "Utworzono plan.";
}

function getSettlementPlansErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  return "Nie udalo sie zapisac planu.";
}
