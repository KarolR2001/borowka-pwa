import { RefreshCw, Scale, Search, ShieldAlert } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import type { AuthSessionState } from "../auth/authSession";
import {
  defaultWorkerDirectoryFilters,
  filterWorkerDirectory,
  isWorkerActivityFilter,
  isWorkerSortKey,
  listWorkerDirectory,
  workerRateLabel,
  workerStatusLabel,
  workerSummaryKgLabel,
  workerSummaryMoneyLabel,
  workerUnitLabel,
  type WorkerDirectoryFilters,
  type WorkerDirectoryListInput,
  type WorkerDirectoryResult
} from "./workerDirectory";

type FirebaseEnv = Record<string, string | boolean | undefined>;

export type WorkerDirectoryApi = {
  list: (
    env: FirebaseEnv,
    input: WorkerDirectoryListInput
  ) => Promise<WorkerDirectoryResult>;
};

export const defaultWorkerDirectoryApi: WorkerDirectoryApi = {
  list: listWorkerDirectory
};

type DirectoryState =
  | {
      status: "IDLE" | "LOADING";
      result: WorkerDirectoryResult | null;
      message: string;
    }
  | {
      status: "READY";
      result: WorkerDirectoryResult;
      message: string;
    }
  | {
      status: "ERROR";
      result: WorkerDirectoryResult | null;
      message: string;
    };

const initialState: DirectoryState = {
  status: "IDLE",
  result: null,
  message: "Lista zbieraczy nie zostala jeszcze pobrana."
};

export function WorkerDirectoryPanel({
  authState,
  env,
  workerDirectoryApi = defaultWorkerDirectoryApi
}: {
  authState: AuthSessionState;
  env: FirebaseEnv;
  workerDirectoryApi?: WorkerDirectoryApi;
}) {
  const [filters, setFilters] = useState<WorkerDirectoryFilters>(
    defaultWorkerDirectoryFilters
  );
  const [state, setState] = useState<DirectoryState>(initialState);
  const viewerRole =
    authState.status === "READY" &&
    (authState.profile.role === "ADMIN" || authState.profile.role === "OPERATOR")
      ? authState.profile.role
      : null;
  const isAdmin = viewerRole === "ADMIN";

  useEffect(() => {
    let isMounted = true;

    if (!viewerRole) {
      setState(initialState);
      return undefined;
    }

    setState((current) => ({
      status: "LOADING",
      result: current.result,
      message: "Pobieranie zbieraczy."
    }));

    void workerDirectoryApi
      .list(env, {
        viewerRole
      })
      .then((result) => {
        if (isMounted) {
          setState({
            status: "READY",
            result,
            message: "Lista zbieraczy jest aktualna."
          });
        }
      })
      .catch(() => {
        if (isMounted) {
          setState((current) => ({
            status: "ERROR",
            result: current.result,
            message: "Nie udalo sie pobrac zbieraczy."
          }));
        }
      });

    return () => {
      isMounted = false;
    };
  }, [env, viewerRole, workerDirectoryApi]);

  const filteredWorkers = useMemo(
    () => (state.result ? filterWorkerDirectory(state.result.workers, filters) : []),
    [filters, state.result]
  );
  const activeWorkersCount =
    state.result?.workers.filter((worker) => worker.active).length ?? 0;
  const archivedWorkersCount =
    state.result?.workers.filter((worker) => !worker.active).length ?? 0;
  const warningsCount =
    state.result?.workers.reduce((total, worker) => total + worker.warnings.length, 0) ??
    0;
  const invalidDocumentsCount =
    (state.result?.invalidWorkers.length ?? 0) +
    (state.result?.invalidPlans.length ?? 0) +
    (state.result?.invalidRateVersions.length ?? 0) +
    (state.result?.invalidProfiles.length ?? 0);

  const reload = () => {
    if (!viewerRole) {
      return;
    }

    setState((current) => ({
      status: "LOADING",
      result: current.result,
      message: "Pobieranie zbieraczy."
    }));

    void workerDirectoryApi
      .list(env, {
        viewerRole
      })
      .then((result) => {
        setState({
          status: "READY",
          result,
          message: "Lista zbieraczy jest aktualna."
        });
      })
      .catch(() => {
        setState((current) => ({
          status: "ERROR",
          result: current.result,
          message: "Nie udalo sie pobrac zbieraczy."
        }));
      });
  };

  if (authState.status !== "READY") {
    return (
      <section className="worker-directory" aria-label="Lista zbieraczy">
        <AccessNotice
          title="Logowanie wymagane"
          message="Zaloguj sie jako administrator albo operator."
        />
      </section>
    );
  }

  if (!viewerRole) {
    return (
      <section className="worker-directory" aria-label="Lista zbieraczy">
        <AccessNotice
          title="Brak dostepu"
          message="Lista zbieraczy jest dostepna dla administratora i operatora."
        />
      </section>
    );
  }

  return (
    <section className="worker-directory" aria-label="Lista zbieraczy">
      <div className="directory-header">
        <div>
          <p className="eyebrow">Zbieracze</p>
          <h2>Lista zbieraczy</h2>
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

      <WorkerFilterControls
        filters={filters}
        onChange={setFilters}
        plans={state.result?.plans ?? []}
      />

      <div className="directory-summary" aria-label="Podsumowanie zbieraczy">
        <DirectoryStat
          label="Wszyscy zbieracze"
          value={String(state.result?.workers.length ?? 0)}
        />
        <DirectoryStat label="Aktywni" value={String(activeWorkersCount)} />
        <DirectoryStat label="Archiwalni" value={String(archivedWorkersCount)} />
        <DirectoryStat label="Ostrzezenia" value={String(warningsCount)} />
        <DirectoryStat label="Bledne dokumenty" value={String(invalidDocumentsCount)} />
      </div>

      {state.status === "ERROR" ? (
        <p className="form-message form-message--error">{state.message}</p>
      ) : null}

      {state.status === "LOADING" && !state.result ? (
        <p className="empty-state">Pobieranie zbieraczy.</p>
      ) : null}

      {state.result && filteredWorkers.length === 0 ? (
        <p className="empty-state">Brak zbieraczy dla wybranych filtrow.</p>
      ) : null}

      {filteredWorkers.length > 0 ? (
        <div className="directory-table-wrap">
          <table className="directory-table worker-table">
            <thead>
              <tr>
                <th scope="col">Nazwa</th>
                <th scope="col">Status</th>
                <th scope="col">Plan</th>
                {isAdmin ? <th scope="col">Stawka</th> : null}
                <th scope="col">Jednostka</th>
                {isAdmin ? <th scope="col">Konto</th> : null}
                {isAdmin ? <th scope="col">Kg</th> : null}
                {isAdmin ? <th scope="col">Naliczone</th> : null}
                {isAdmin ? <th scope="col">Wyplacone</th> : null}
                {isAdmin ? <th scope="col">Do wyplaty</th> : null}
                {isAdmin ? <th scope="col">Ostrzezenia</th> : null}
              </tr>
            </thead>
            <tbody>
              {filteredWorkers.map((worker) => (
                <tr key={worker.id}>
                  <td>
                    <strong>{worker.displayName}</strong>
                    <span className="directory-cell-note">{worker.id}</span>
                  </td>
                  <td>{workerStatusLabel(worker)}</td>
                  <td>
                    {worker.currentPlan?.name ?? "brak"}
                    <span className="directory-cell-note">{worker.currentPlanId}</span>
                  </td>
                  {isAdmin ? <td>{workerRateLabel(worker.currentRateVersion)}</td> : null}
                  <td>{workerUnitLabel(worker.currentPlan)}</td>
                  {isAdmin ? (
                    <td>{worker.linkedUser?.email ?? worker.linkedUserUid ?? "brak"}</td>
                  ) : null}
                  {isAdmin ? (
                    <td>{workerSummaryKgLabel(worker.seasonSummary.totalKgGrams)}</td>
                  ) : null}
                  {isAdmin ? (
                    <td>{workerSummaryMoneyLabel(worker.seasonSummary.earnedGrosz)}</td>
                  ) : null}
                  {isAdmin ? (
                    <td>{workerSummaryMoneyLabel(worker.seasonSummary.paidGrosz)}</td>
                  ) : null}
                  {isAdmin ? (
                    <td>{workerSummaryMoneyLabel(worker.seasonSummary.dueGrosz)}</td>
                  ) : null}
                  {isAdmin ? (
                    <td>
                      {worker.warnings.length > 0 ? worker.warnings.join("; ") : "brak"}
                    </td>
                  ) : null}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      {state.result && state.result.invalidWorkers.length > 0 ? (
        <InvalidDocuments
          documents={state.result.invalidWorkers}
          title="Bledne dokumenty zbieraczy"
        />
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

      {state.result && state.result.invalidProfiles.length > 0 ? (
        <InvalidDocuments
          documents={state.result.invalidProfiles}
          title="Bledne dokumenty profili"
        />
      ) : null}
    </section>
  );
}

function WorkerFilterControls({
  filters,
  onChange,
  plans
}: {
  filters: WorkerDirectoryFilters;
  onChange: (filters: WorkerDirectoryFilters) => void;
  plans: WorkerDirectoryResult["plans"];
}) {
  return (
    <div className="directory-filters worker-filters" aria-label="Filtry zbieraczy">
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
        <span>Status</span>
        <select
          onChange={(event) => {
            const nextActivity = event.target.value;

            if (isWorkerActivityFilter(nextActivity)) {
              onChange({
                ...filters,
                activity: nextActivity
              });
            }
          }}
          value={filters.activity}
        >
          <option value="ALL">Wszyscy</option>
          <option value="ACTIVE">Aktywni</option>
          <option value="ARCHIVED">Archiwalni</option>
        </select>
      </label>

      <label className="field">
        <span>Plan</span>
        <select
          onChange={(event) => {
            onChange({
              ...filters,
              planId: event.target.value
            });
          }}
          value={filters.planId}
        >
          <option value="ALL">Wszystkie</option>
          {plans.map((plan) => (
            <option key={plan.id} value={plan.id}>
              {plan.name}
            </option>
          ))}
        </select>
      </label>

      <label className="field">
        <span>Sortowanie</span>
        <select
          onChange={(event) => {
            const nextSort = event.target.value;

            if (isWorkerSortKey(nextSort)) {
              onChange({
                ...filters,
                sort: nextSort
              });
            }
          }}
          value={filters.sort}
        >
          <option value="NAME">Alfabetycznie</option>
          <option value="TOTAL_KG">Kg</option>
          <option value="EARNED">Kwota</option>
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
