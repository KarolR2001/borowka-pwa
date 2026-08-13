import { Archive, Pencil, Plus, Scale, Search, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import type { AuthSessionState } from "../auth/authSession";
import { getOrCreateDeviceId } from "../domain/device";
import { CollapsibleFilters } from "../ui/CollapsibleFilters";
import { InfoHint } from "../ui/InfoHint";
import { RecordDialog } from "../ui/RecordDialog";
import {
  archiveSettlementPlan,
  createSettlementPlan,
  createSettlementPlanExample,
  defaultSettlementPlanFilters,
  filterSettlementPlans,
  isSettlementCalculationBasis,
  listSettlementPlansDirectory,
  settlementCalculationBasisLabel,
  settlementPlanStatusLabel,
  updateSettlementPlan,
  type ArchiveSettlementPlanInput,
  type CreateSettlementPlanInput,
  type SettlementPlanListItem,
  type SettlementPlanFilters,
  type SettlementPlansDirectoryResult,
  type UpdateSettlementPlanInput
} from "./settlementPlans";

type FirebaseEnv = Record<string, string | boolean | undefined>;

export type SettlementPlansApi = {
  list: (env: FirebaseEnv) => Promise<SettlementPlansDirectoryResult>;
  create?: (env: FirebaseEnv, input: CreateSettlementPlanInput) => Promise<unknown>;
  update?: (env: FirebaseEnv, input: UpdateSettlementPlanInput) => Promise<unknown>;
  archive?: (env: FirebaseEnv, input: ArchiveSettlementPlanInput) => Promise<unknown>;
};

export const defaultSettlementPlansApi: SettlementPlansApi = {
  list: listSettlementPlansDirectory,
  create: createSettlementPlan,
  update: updateSettlementPlan,
  archive: archiveSettlementPlan
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
  calculationBasis: "WEIGHT" | "QUANTITY";
  unitLabelSingular: string;
  unitLabelPlural: string;
  description: string;
};

type EditPlanDraft = {
  planId: string;
  planName: string;
  wasUsed: boolean;
  calculationBasis: "WEIGHT" | "QUANTITY";
  quantityPrecision: number;
  name: string;
  unitLabelSingular: string;
  unitLabelPlural: string;
  description: string;
  confirmHistoricalSnapshotsUnchanged: boolean;
};

type ArchivePlanDraft = {
  planId: string;
  planName: string;
  reason: string;
  confirmed: boolean;
};

const initialState: SettlementPlansState = {
  status: "IDLE",
  result: null,
  message: "Lista planów nie została jeszcze pobrana."
};

const initialCreatePlanDraft: CreatePlanDraft = {
  name: "",
  calculationBasis: "QUANTITY",
  unitLabelSingular: "",
  unitLabelPlural: "",
  description: ""
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
  const [editDraft, setEditDraft] = useState<EditPlanDraft | null>(null);
  const [archiveDraft, setArchiveDraft] = useState<ArchivePlanDraft | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
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
      message: "Pobieranie planów."
    }));

    void settlementPlansApi
      .list(env)
      .then((result) => {
        if (isMounted) {
          setState({
            status: "READY",
            result,
            message: "Lista planów jest aktualna."
          });
        }
      })
      .catch(() => {
        if (isMounted) {
          setState((current) => ({
            status: "ERROR",
            result: current.result,
            message: "Nie udało się pobrać planów."
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
  const handleCreatePlan = async () => {
    if (authState.status !== "READY") {
      return;
    }

    setFeedback(null);
    setError(null);

    if (!navigator.onLine) {
      setError("Tworzenie planu wymaga połączenia z internetem.");
      return;
    }

    const create = settlementPlansApi.create ?? defaultSettlementPlansApi.create;

    if (!create) {
      setError("Operacja tworzenia planu nie jest dostępna.");
      return;
    }

    setIsSubmitting(true);

    try {
      const result = await create(env, {
        actorProfile: authState.profile,
        name: createDraft.name,
        code: generatePlanCode(createDraft.name, state.result?.plans ?? []),
        calculationBasis: createDraft.calculationBasis,
        unitLabelSingular:
          createDraft.calculationBasis === "WEIGHT"
            ? "kilogram"
            : createDraft.unitLabelSingular,
        unitLabelPlural:
          createDraft.calculationBasis === "WEIGHT"
            ? "kilogramy"
            : createDraft.unitLabelPlural,
        unitSymbol:
          createDraft.calculationBasis === "WEIGHT"
            ? "kg"
            : createDraft.unitLabelSingular.trim(),
        quantityPrecision: createDraft.calculationBasis === "WEIGHT" ? 3 : 1,
        weightRequired: createDraft.calculationBasis === "WEIGHT",
        allowBatchQuantity: true,
        description: createDraft.description,
        deviceId: getOrCreateDeviceId()
      });
      await reloadAfterSubmit();
      setFeedback(createPlanFeedback(result));
      setCreateDraft(initialCreatePlanDraft);
      setIsCreateOpen(false);
    } catch (createError: unknown) {
      setError(getSettlementPlansErrorMessage(createError));
    } finally {
      setIsSubmitting(false);
    }
  };

  const startEditPlan = (plan: SettlementPlanListItem) => {
    setFeedback(null);
    setError(null);
    setArchiveDraft(null);
    setEditDraft({
      planId: plan.id,
      planName: plan.name,
      wasUsed: plan.wasUsed,
      calculationBasis: plan.calculationBasis,
      quantityPrecision: plan.quantityPrecision,
      name: plan.name,
      unitLabelSingular: plan.unitLabelSingular,
      unitLabelPlural: plan.unitLabelPlural,
      description: plan.description ?? "",
      confirmHistoricalSnapshotsUnchanged: false
    });
  };

  const startArchivePlan = (plan: SettlementPlanListItem) => {
    setFeedback(null);
    setError(null);
    setEditDraft(null);
    setArchiveDraft({
      planId: plan.id,
      planName: plan.name,
      reason: "",
      confirmed: false
    });
  };

  const handleUpdatePlan = async () => {
    if (authState.status !== "READY" || !editDraft) {
      return;
    }

    setFeedback(null);
    setError(null);

    if (!navigator.onLine) {
      setError("Edycja planu wymaga połączenia z internetem.");
      return;
    }

    const update = settlementPlansApi.update ?? defaultSettlementPlansApi.update;

    if (!update) {
      setError("Operacja edycji planu nie jest dostępna.");
      return;
    }

    setIsSubmitting(true);

    try {
      await update(env, {
        actorProfile: authState.profile,
        planId: editDraft.planId,
        name: editDraft.name,
        unitLabelSingular:
          editDraft.calculationBasis === "WEIGHT"
            ? "kilogram"
            : editDraft.unitLabelSingular,
        unitLabelPlural:
          editDraft.calculationBasis === "WEIGHT"
            ? "kilogramy"
            : editDraft.unitLabelPlural,
        unitSymbol:
          editDraft.calculationBasis === "WEIGHT"
            ? "kg"
            : editDraft.unitLabelSingular.trim(),
        description: editDraft.description,
        confirmHistoricalSnapshotsUnchanged:
          editDraft.confirmHistoricalSnapshotsUnchanged,
        deviceId: getOrCreateDeviceId()
      });
      await reloadAfterSubmit();
      setFeedback("Plan został zapisany.");
      setEditDraft(null);
    } catch (updateError: unknown) {
      setError(getSettlementPlansErrorMessage(updateError));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleArchivePlan = async () => {
    if (authState.status !== "READY" || !archiveDraft) {
      return;
    }

    setFeedback(null);
    setError(null);

    if (!archiveDraft.confirmed) {
      setError("Potwierdź archiwizację planu.");
      return;
    }

    if (!navigator.onLine) {
      setError("Archiwizacja planu wymaga połączenia z internetem.");
      return;
    }

    const archive = settlementPlansApi.archive ?? defaultSettlementPlansApi.archive;

    if (!archive) {
      setError("Operacja archiwizacji planu nie jest dostępna.");
      return;
    }

    setIsSubmitting(true);

    try {
      await archive(env, {
        actorProfile: authState.profile,
        planId: archiveDraft.planId,
        reason: archiveDraft.reason,
        deviceId: getOrCreateDeviceId()
      });
      await reloadAfterSubmit();
      setFeedback("Plan został zarchiwizowany.");
      setArchiveDraft(null);
    } catch (archiveError: unknown) {
      setError(getSettlementPlansErrorMessage(archiveError));
    } finally {
      setIsSubmitting(false);
    }
  };

  const reloadAfterSubmit = async () => {
    const result = await settlementPlansApi.list(env);

    setState({
      status: "READY",
      result,
      message: "Lista planów jest aktualna."
    });
  };

  if (authState.status !== "READY") {
    return (
      <section className="settlement-plan-directory" aria-label="Plany rozliczeń">
        <AccessNotice
          title="Logowanie wymagane"
          message="Zaloguj się jako administrator."
        />
      </section>
    );
  }

  if (authState.profile.role !== "ADMIN") {
    return (
      <section className="settlement-plan-directory" aria-label="Plany rozliczeń">
        <AccessNotice
          title="Brak dostępu"
          message="Planami rozliczeń zarządza administrator."
        />
      </section>
    );
  }

  return (
    <section className="settlement-plan-directory" aria-label="Plany rozliczeń">
      {state.result ? (
        <div className="screen-actions" aria-label="Akcje planów rozliczeń">
          <button
            className="primary-action"
            onClick={() => {
              setError(null);
              setIsCreateOpen(true);
            }}
            type="button"
          >
            <Plus aria-hidden="true" size={18} strokeWidth={2.2} />
            <span>Dodaj plan rozliczeń</span>
          </button>
        </div>
      ) : null}

      <CollapsibleFilters>
        <SettlementPlanFilterControls filters={filters} onChange={setFilters} />
      </CollapsibleFilters>

      {feedback ? <p className="form-message form-message--ok">{feedback}</p> : null}
      {error ? <p className="form-message form-message--error">{error}</p> : null}

      <div className="directory-summary" aria-label="Podsumowanie planów">
        <DirectoryStat
          label="Wszystkie plany"
          value={String(state.result?.plans.length ?? 0)}
        />
      </div>

      {state.status === "ERROR" ? (
        <p className="form-message form-message--error">{state.message}</p>
      ) : null}

      {state.status === "LOADING" && !state.result ? (
        <p className="empty-state">Pobieranie planów.</p>
      ) : null}

      {state.result && filteredPlans.length === 0 ? (
        <p className="empty-state">Brak planów dla wybranych filtrów.</p>
      ) : null}

      {filteredPlans.length > 0 ? (
        <div className="directory-table-wrap">
          <table className="directory-table mobile-card-table">
            <thead>
              <tr>
                <th scope="col">Nazwa</th>
                <th scope="col">Podstawa</th>
                <th scope="col">Jednostka</th>
                <th scope="col">Precyzja</th>
                <th scope="col">Waga</th>
                <th scope="col">Zbiorcze</th>
                <th scope="col">Aktywne stawki</th>
                <th scope="col">Użyty</th>
                <th scope="col">Status</th>
                <th scope="col">Akcje</th>
              </tr>
            </thead>
            <tbody>
              {filteredPlans.map((plan) => (
                <tr key={plan.id}>
                  <td data-label="Nazwa">
                    <strong>{plan.name}</strong>
                  </td>
                  <td data-label="Podstawa">
                    {settlementCalculationBasisLabel(plan.calculationBasis)}
                  </td>
                  <td data-label="Jednostka">
                    {plan.unitLabelSingular} ({plan.unitSymbol})
                  </td>
                  <td data-label="Precyzja">{plan.quantityPrecision}</td>
                  <td data-label="Waga">
                    {plan.weightRequired ? "Wymagana" : "Opcjonalna"}
                  </td>
                  <td data-label="Zbiorcze">{plan.allowBatchQuantity ? "Tak" : "Nie"}</td>
                  <td data-label="Aktywne stawki">{plan.activeRateCount}</td>
                  <td data-label="Użyty">{plan.wasUsed ? "Tak" : "Nie"}</td>
                  <td data-label="Status">{settlementPlanStatusLabel(plan)}</td>
                  <td data-label="Akcje">
                    <div className="directory-actions">
                      <button
                        className="secondary-action directory-action"
                        onClick={() => {
                          startEditPlan(plan);
                        }}
                        type="button"
                      >
                        <Pencil aria-hidden="true" size={16} strokeWidth={2.2} />
                        <span>Edytuj</span>
                      </button>
                      <button
                        className="secondary-action directory-action"
                        disabled={!plan.active}
                        onClick={() => {
                          startArchivePlan(plan);
                        }}
                        type="button"
                      >
                        <Archive aria-hidden="true" size={16} strokeWidth={2.2} />
                        <span>Archiwizuj</span>
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      {isCreateOpen ? (
        <RecordDialog
          fullScreen
          label="Dodaj plan rozliczeń"
          onClose={() => {
            setIsCreateOpen(false);
          }}
        >
          <div className="fullscreen-operation">
            <PlanDialogHeader
              onClose={() => {
                setIsCreateOpen(false);
              }}
              title="Dodaj plan rozliczeń"
            />
            <CreateSettlementPlanForm
              draft={createDraft}
              isSubmitting={isSubmitting}
              onCancel={() => {
                setIsCreateOpen(false);
              }}
              onChange={setCreateDraft}
              onSubmit={() => {
                void handleCreatePlan();
              }}
            />
          </div>
        </RecordDialog>
      ) : null}

      {editDraft ? (
        <RecordDialog
          fullScreen
          label="Edycja planu rozliczeń"
          onClose={() => {
            setEditDraft(null);
          }}
        >
          <div className="fullscreen-operation">
            <PlanDialogHeader
              onClose={() => {
                setEditDraft(null);
              }}
              title="Edytuj plan rozliczeń"
            />
            <EditSettlementPlanForm
              draft={editDraft}
              isSubmitting={isSubmitting}
              onCancel={() => {
                setEditDraft(null);
              }}
              onChange={setEditDraft}
              onSubmit={() => {
                void handleUpdatePlan();
              }}
            />
          </div>
        </RecordDialog>
      ) : null}

      {archiveDraft ? (
        <RecordDialog
          fullScreen
          label="Archiwizacja planu rozliczeń"
          onClose={() => {
            setArchiveDraft(null);
          }}
        >
          <div className="fullscreen-operation">
            <PlanDialogHeader
              onClose={() => {
                setArchiveDraft(null);
              }}
              title="Archiwizuj plan rozliczeń"
            />
            <ArchiveSettlementPlanForm
              draft={archiveDraft}
              isSubmitting={isSubmitting}
              onCancel={() => {
                setArchiveDraft(null);
              }}
              onChange={setArchiveDraft}
              onSubmit={() => {
                void handleArchivePlan();
              }}
            />
          </div>
        </RecordDialog>
      ) : null}
    </section>
  );
}

function PlanDialogHeader({ onClose, title }: { onClose: () => void; title: string }) {
  return (
    <header className="fullscreen-operation__header">
      <div>
        <p className="eyebrow">Konfiguracja</p>
        <h2>{title}</h2>
      </div>
      <button
        aria-label="Zamknij formularz planu"
        className="secondary-button icon-button"
        onClick={onClose}
        type="button"
      >
        <X aria-hidden="true" size={20} />
      </button>
    </header>
  );
}

function CreateSettlementPlanForm({
  draft,
  isSubmitting,
  onCancel,
  onChange,
  onSubmit
}: {
  draft: CreatePlanDraft;
  isSubmitting: boolean;
  onCancel: () => void;
  onChange: (draft: CreatePlanDraft) => void;
  onSubmit: () => void;
}) {
  const unitLabelSingular =
    draft.calculationBasis === "WEIGHT" ? "kilogram" : draft.unitLabelSingular;
  const unitLabelPlural =
    draft.calculationBasis === "WEIGHT" ? "kilogramy" : draft.unitLabelPlural;
  const example = createSettlementPlanExample({
    calculationBasis: draft.calculationBasis,
    quantityPrecision: draft.calculationBasis === "WEIGHT" ? 3 : 1,
    unitLabelSingular,
    unitLabelPlural,
    unitSymbol:
      draft.calculationBasis === "WEIGHT" ? "kg" : draft.unitLabelSingular.trim()
  });

  return (
    <form
      aria-label="Tworzenie planu rozliczeń"
      className="settlement-plan-form settlement-plan-form--simple"
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit();
      }}
    >
      <label className="field">
        <span className="field__label">
          Nazwa planu
          <InfoHint text="Nazwa będzie widoczna podczas przypisywania stawki, np. Zbiór na kilogramy." />
        </span>
        <input
          aria-label="Nazwa planu"
          disabled={isSubmitting}
          onChange={(event) => {
            onChange({ ...draft, name: event.target.value });
          }}
          placeholder="Np. Zbiór na kilogramy"
          type="text"
          value={draft.name}
        />
      </label>

      <label className="field">
        <span className="field__label">
          Sposób rozliczenia
          <InfoHint text="Wybierz wagę, gdy płacisz za kilogramy, albo liczbę opakowań, gdy płacisz za sztuki." />
        </span>
        <select
          aria-label="Sposób rozliczenia"
          disabled={isSubmitting}
          onChange={(event) => {
            const nextBasis = event.target.value;

            if (isSettlementCalculationBasis(nextBasis)) {
              onChange({ ...draft, calculationBasis: nextBasis });
            }
          }}
          value={draft.calculationBasis}
        >
          <option value="QUANTITY">Liczba opakowań lub sztuk</option>
          <option value="WEIGHT">Waga w kilogramach</option>
        </select>
      </label>

      {draft.calculationBasis === "QUANTITY" ? (
        <>
          <label className="field">
            <span className="field__label">
              Jedna jednostka
              <InfoHint text="Podaj nazwę jednej sztuki lub opakowania, np. łubianka albo skrzynka." />
            </span>
            <input
              aria-label="Jedna jednostka"
              disabled={isSubmitting}
              onChange={(event) => {
                onChange({ ...draft, unitLabelSingular: event.target.value });
              }}
              placeholder="Np. łubianka"
              type="text"
              value={draft.unitLabelSingular}
            />
          </label>
          <label className="field">
            <span className="field__label">
              Wiele jednostek
              <InfoHint text="Podaj nazwę używaną przy większej liczbie, np. łubianki albo skrzynki." />
            </span>
            <input
              aria-label="Wiele jednostek"
              disabled={isSubmitting}
              onChange={(event) => {
                onChange({ ...draft, unitLabelPlural: event.target.value });
              }}
              placeholder="Np. łubianki"
              type="text"
              value={draft.unitLabelPlural}
            />
          </label>
        </>
      ) : null}

      <label className="field settlement-plan-form__description">
        <span className="field__label">
          Opis (opcjonalnie)
          <InfoHint text="Dodaj krótką informację tylko wtedy, gdy pomaga odróżnić ten plan od pozostałych." />
        </span>
        <input
          aria-label="Opis"
          disabled={isSubmitting}
          onChange={(event) => {
            onChange({ ...draft, description: event.target.value });
          }}
          placeholder="Np. rozliczenie zbioru do chłodni"
          type="text"
          value={draft.description}
        />
      </label>

      <div className="settlement-plan-form__example" aria-label="Przykład planu">
        <span>Przykład rozliczenia</span>
        <strong>{example}</strong>
      </div>

      <div className="form-actions settlement-plan-form__actions">
        <button
          className="secondary-action"
          disabled={isSubmitting}
          onClick={onCancel}
          type="button"
        >
          <X aria-hidden="true" size={18} strokeWidth={2.2} />
          <span>Anuluj</span>
        </button>
        <button
          className="primary-action settlement-plan-form__submit"
          disabled={isSubmitting}
          type="submit"
        >
          <Plus aria-hidden="true" size={18} strokeWidth={2.2} />
          <span>Utwórz plan</span>
        </button>
      </div>
    </form>
  );
}

function EditSettlementPlanForm({
  draft,
  isSubmitting,
  onCancel,
  onChange,
  onSubmit
}: {
  draft: EditPlanDraft;
  isSubmitting: boolean;
  onCancel: () => void;
  onChange: (draft: EditPlanDraft) => void;
  onSubmit: () => void;
}) {
  const unitLabelSingular =
    draft.calculationBasis === "WEIGHT" ? "kilogram" : draft.unitLabelSingular;
  const unitLabelPlural =
    draft.calculationBasis === "WEIGHT" ? "kilogramy" : draft.unitLabelPlural;
  const example = createSettlementPlanExample({
    calculationBasis: draft.calculationBasis,
    quantityPrecision: draft.quantityPrecision,
    unitLabelSingular,
    unitLabelPlural,
    unitSymbol:
      draft.calculationBasis === "WEIGHT" ? "kg" : draft.unitLabelSingular.trim()
  });

  return (
    <form
      aria-label="Edycja planu rozliczeń"
      className="settlement-plan-form settlement-plan-form--edit"
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit();
      }}
    >
      <div className="settlement-plan-form__heading">
        <strong>{draft.planName}</strong>
      </div>

      <label className="field">
        <span className="field__label">
          Nazwa planu
          <InfoHint text="Nazwa jest widoczna podczas przypisywania planu i stawki zbieraczowi." />
        </span>
        <input
          aria-label="Nazwa planu"
          disabled={isSubmitting}
          onChange={(event) => {
            onChange({
              ...draft,
              name: event.target.value
            });
          }}
          type="text"
          value={draft.name}
        />
      </label>

      <label className="field">
        <span className="field__label">
          Sposób rozliczenia
          <InfoHint text="Sposobu rozliczenia nie można zmienić podczas edycji, ponieważ wcześniejsze zbiory zachowują ten sam sposób obliczeń." />
        </span>
        <select aria-label="Sposób rozliczenia" disabled value={draft.calculationBasis}>
          <option value="QUANTITY">Liczba opakowań lub sztuk</option>
          <option value="WEIGHT">Waga w kilogramach</option>
        </select>
      </label>

      {draft.calculationBasis === "QUANTITY" ? (
        <>
          <label className="field">
            <span className="field__label">
              Jedna jednostka
              <InfoHint text="Nazwa jednej sztuki lub opakowania, np. łubianka albo skrzynka." />
            </span>
            <input
              aria-label="Jedna jednostka"
              disabled={isSubmitting}
              onChange={(event) => {
                onChange({
                  ...draft,
                  unitLabelSingular: event.target.value
                });
              }}
              type="text"
              value={draft.unitLabelSingular}
            />
          </label>

          <label className="field">
            <span className="field__label">
              Wiele jednostek
              <InfoHint text="Nazwa używana przy większej liczbie, np. łubianki albo skrzynki." />
            </span>
            <input
              aria-label="Wiele jednostek"
              disabled={isSubmitting}
              onChange={(event) => {
                onChange({
                  ...draft,
                  unitLabelPlural: event.target.value
                });
              }}
              type="text"
              value={draft.unitLabelPlural}
            />
          </label>
        </>
      ) : null}

      <label className="field settlement-plan-form__description">
        <span className="field__label">
          Opis (opcjonalnie)
          <InfoHint text="Krótka informacja pomagająca odróżnić ten plan od pozostałych." />
        </span>
        <input
          aria-label="Opis"
          disabled={isSubmitting}
          onChange={(event) => {
            onChange({
              ...draft,
              description: event.target.value
            });
          }}
          type="text"
          value={draft.description}
        />
      </label>

      <div className="settlement-plan-form__example" aria-label="Przykład planu">
        <span>Przykład rozliczenia</span>
        <strong>{example}</strong>
      </div>

      {draft.wasUsed ? (
        <label className="checkbox-field settlement-plan-form__confirmation">
          <input
            checked={draft.confirmHistoricalSnapshotsUnchanged}
            disabled={isSubmitting}
            onChange={(event) => {
              onChange({
                ...draft,
                confirmHistoricalSnapshotsUnchanged: event.target.checked
              });
            }}
            type="checkbox"
          />
          <span>Potwierdzam, że snapshoty historyczne pozostają bez zmian</span>
        </label>
      ) : null}

      <div className="settlement-plan-form__actions">
        <button
          className="primary-action settlement-plan-form__submit"
          disabled={isSubmitting}
          type="submit"
        >
          <Pencil aria-hidden="true" size={18} strokeWidth={2.2} />
          <span>Zapisz plan</span>
        </button>
        <button
          className="secondary-action"
          disabled={isSubmitting}
          onClick={onCancel}
          type="button"
        >
          <span>Anuluj</span>
        </button>
      </div>
    </form>
  );
}

function ArchiveSettlementPlanForm({
  draft,
  isSubmitting,
  onCancel,
  onChange,
  onSubmit
}: {
  draft: ArchivePlanDraft;
  isSubmitting: boolean;
  onCancel: () => void;
  onChange: (draft: ArchivePlanDraft) => void;
  onSubmit: () => void;
}) {
  return (
    <form
      aria-label="Archiwizacja planu rozliczeń"
      className="settlement-plan-form settlement-plan-form--archive"
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit();
      }}
    >
      <div className="settlement-plan-form__heading">
        <strong>{draft.planName}</strong>
      </div>

      <label className="field settlement-plan-form__description">
        <span>Powód</span>
        <input
          disabled={isSubmitting}
          onChange={(event) => {
            onChange({
              ...draft,
              reason: event.target.value
            });
          }}
          type="text"
          value={draft.reason}
        />
      </label>

      <label className="checkbox-field settlement-plan-form__confirmation">
        <input
          checked={draft.confirmed}
          disabled={isSubmitting}
          onChange={(event) => {
            onChange({
              ...draft,
              confirmed: event.target.checked
            });
          }}
          type="checkbox"
        />
        <span>Potwierdzam archiwizację planu</span>
      </label>

      <div className="settlement-plan-form__actions">
        <button
          className="primary-action settlement-plan-form__submit"
          disabled={isSubmitting}
          type="submit"
        >
          <Archive aria-hidden="true" size={18} strokeWidth={2.2} />
          <span>Archiwizuj plan</span>
        </button>
        <button
          className="secondary-action"
          disabled={isSubmitting}
          onClick={onCancel}
          type="button"
        >
          <span>Anuluj</span>
        </button>
      </div>
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
    <div className="directory-filters settlement-plan-filters" aria-label="Filtry planów">
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
          <option value="QUANTITY">Ilość</option>
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

function generatePlanCode(
  name: string,
  existingPlans: readonly Pick<SettlementPlanListItem, "code">[]
): string {
  const normalizedBase = name
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 34);
  const base = normalizedBase.length >= 2 ? normalizedBase : "PLAN";
  const existingCodes = new Set(existingPlans.map((plan) => plan.code));

  if (!existingCodes.has(base)) {
    return base;
  }

  for (let suffix = 2; suffix < 100_000; suffix += 1) {
    const candidate = `${base.slice(0, 34)}_${String(suffix)}`;
    if (!existingCodes.has(candidate)) {
      return candidate;
    }
  }

  return `${base.slice(0, 24)}_${Date.now().toString(36).toUpperCase()}`;
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

  return "Nie udało się zapisać planu.";
}
