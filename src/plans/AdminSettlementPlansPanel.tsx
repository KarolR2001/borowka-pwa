import { RefreshCw, Scale, Search, ShieldAlert } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import type { AuthSessionState } from "../auth/authSession";
import {
  defaultSettlementPlanFilters,
  filterSettlementPlans,
  isSettlementCalculationBasis,
  listSettlementPlansDirectory,
  settlementCalculationBasisLabel,
  settlementPlanStatusLabel,
  type SettlementPlanFilters,
  type SettlementPlansDirectoryResult
} from "./settlementPlans";

type FirebaseEnv = Record<string, string | boolean | undefined>;

export type SettlementPlansApi = {
  list: (env: FirebaseEnv) => Promise<SettlementPlansDirectoryResult>;
};

export const defaultSettlementPlansApi: SettlementPlansApi = {
  list: listSettlementPlansDirectory
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

const initialState: SettlementPlansState = {
  status: "IDLE",
  result: null,
  message: "Lista planow nie zostala jeszcze pobrana."
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
