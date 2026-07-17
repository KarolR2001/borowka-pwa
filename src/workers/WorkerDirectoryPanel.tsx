import { Plus, RefreshCw, Scale, Search, ShieldAlert, UserRound, X } from "lucide-react";
import { type ReactNode, useEffect, useMemo, useState } from "react";

import type { AuthSessionState } from "../auth/authSession";
import { getOrCreateDeviceId } from "../domain/device";
import { parseDecimalToScaledInteger } from "../domain/format";
import {
  createWorkerWithInitialRate,
  defaultWorkerDirectoryFilters,
  analyzeWorkerRateHistory,
  findSimilarWorkerNames,
  filterWorkerDirectory,
  isWorkerActivityFilter,
  isWorkerSortKey,
  listWorkerDirectory,
  workerRateLabel,
  workerRateHistoryStatusLabel,
  workerStatusLabel,
  workerSummaryKgLabel,
  workerSummaryMoneyLabel,
  workerUnitLabel,
  type CreateWorkerInput,
  type WorkerDirectoryFilters,
  type WorkerDirectoryListItem,
  type WorkerDirectoryListInput,
  type WorkerDirectoryResult
} from "./workerDirectory";

type FirebaseEnv = Record<string, string | boolean | undefined>;

export type WorkerDirectoryApi = {
  list: (
    env: FirebaseEnv,
    input: WorkerDirectoryListInput
  ) => Promise<WorkerDirectoryResult>;
  create?: (env: FirebaseEnv, input: CreateWorkerInput) => Promise<unknown>;
};

export const defaultWorkerDirectoryApi: WorkerDirectoryApi = {
  list: listWorkerDirectory,
  create: createWorkerWithInitialRate
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

type CreateWorkerDraft = {
  displayName: string;
  planId: string;
  rate: string;
  validFrom: string;
  phone: string;
  emailContact: string;
  notes: string;
  confirmed: boolean;
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
  const [createDraft, setCreateDraft] = useState<CreateWorkerDraft>(() =>
    createInitialWorkerDraft()
  );
  const [selectedWorkerId, setSelectedWorkerId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
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
    (state.result?.invalidProfiles.length ?? 0) +
    (state.result?.invalidAuditEvents.length ?? 0);
  const activePlans = useMemo(
    () => state.result?.plans.filter((plan) => plan.active) ?? [],
    [state.result]
  );
  const similarWorkerNames = useMemo(
    () =>
      state.result
        ? findSimilarWorkerNames(state.result.workers, createDraft.displayName)
        : [],
    [createDraft.displayName, state.result]
  );
  const selectedWorker = useMemo(
    () =>
      selectedWorkerId && state.result
        ? (state.result.workers.find((worker) => worker.id === selectedWorkerId) ?? null)
        : null,
    [selectedWorkerId, state.result]
  );

  useEffect(() => {
    if (state.result && selectedWorkerId && !selectedWorker) {
      setSelectedWorkerId(null);
    }
  }, [selectedWorker, selectedWorkerId, state.result]);

  useEffect(() => {
    if (!isAdmin || activePlans.length === 0) {
      return;
    }

    if (activePlans.some((plan) => plan.id === createDraft.planId)) {
      return;
    }

    setCreateDraft((current) => ({
      ...current,
      planId: activePlans[0]?.id ?? "",
      confirmed: false
    }));
  }, [activePlans, createDraft.planId, isAdmin]);

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

  const handleCreateWorker = async () => {
    if (authState.status !== "READY" || authState.profile.role !== "ADMIN") {
      return;
    }

    setFeedback(null);
    setError(null);

    if (!createDraft.confirmed) {
      setError("Potwierdz utworzenie zbieracza.");
      return;
    }

    if (!navigator.onLine) {
      setError("Tworzenie zbieracza wymaga polaczenia online.");
      return;
    }

    const create = workerDirectoryApi.create ?? defaultWorkerDirectoryApi.create;

    if (!create) {
      setError("Operacja tworzenia zbieracza nie jest dostepna.");
      return;
    }

    setIsSubmitting(true);

    try {
      const result = await create(env, {
        actorProfile: authState.profile,
        displayName: createDraft.displayName,
        planId: createDraft.planId,
        rateGroszPerUnit: parseWorkerRate(createDraft.rate),
        validFrom: createDraft.validFrom,
        phone: createDraft.phone,
        emailContact: createDraft.emailContact,
        notes: createDraft.notes,
        confirmSimilarName: createDraft.confirmed,
        deviceId: getOrCreateDeviceId()
      });
      await reloadAfterSubmit(authState.profile.role);
      setFeedback(createWorkerFeedback(result));
      setCreateDraft(createInitialWorkerDraft());
    } catch (createError: unknown) {
      setError(getWorkerDirectoryErrorMessage(createError));
    } finally {
      setIsSubmitting(false);
    }
  };

  const reloadAfterSubmit = async (role: "ADMIN" | "OPERATOR") => {
    const result = await workerDirectoryApi.list(env, {
      viewerRole: role
    });

    setState({
      status: "READY",
      result,
      message: "Lista zbieraczy jest aktualna."
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

      {isAdmin && state.result ? (
        <CreateWorkerForm
          activePlans={activePlans}
          draft={createDraft}
          isSubmitting={isSubmitting}
          onChange={setCreateDraft}
          onSubmit={() => {
            void handleCreateWorker();
          }}
          similarWorkerNames={similarWorkerNames}
        />
      ) : null}

      {feedback ? <p className="form-message form-message--ok">{feedback}</p> : null}
      {error ? <p className="form-message form-message--error">{error}</p> : null}

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

      {isAdmin && selectedWorker && state.result ? (
        <WorkerProfilePanel
          onClose={() => {
            setSelectedWorkerId(null);
          }}
          plans={state.result.plans}
          worker={selectedWorker}
        />
      ) : null}

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
                {isAdmin ? <th scope="col">Profil</th> : null}
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
                  {isAdmin ? (
                    <td>
                      <button
                        aria-pressed={selectedWorkerId === worker.id}
                        className="secondary-action directory-action"
                        onClick={() => {
                          setSelectedWorkerId(worker.id);
                        }}
                        type="button"
                      >
                        <UserRound aria-hidden="true" size={17} strokeWidth={2.2} />
                        <span>Profil</span>
                      </button>
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

      {state.result && state.result.invalidAuditEvents.length > 0 ? (
        <InvalidDocuments
          documents={state.result.invalidAuditEvents}
          title="Bledne dokumenty audytu"
        />
      ) : null}
    </section>
  );
}

function WorkerProfilePanel({
  onClose,
  plans,
  worker
}: {
  onClose: () => void;
  plans: WorkerDirectoryResult["plans"];
  worker: WorkerDirectoryListItem;
}) {
  return (
    <section
      aria-label={`Profil zbieracza ${worker.displayName}`}
      className="worker-profile"
    >
      <div className="worker-profile__header">
        <div>
          <p className="eyebrow">Profil zbieracza</p>
          <h3>{worker.displayName}</h3>
          <p className="panel-detail">{worker.id}</p>
        </div>
        <button
          className="secondary-action directory-action"
          onClick={onClose}
          type="button"
        >
          <X aria-hidden="true" size={17} strokeWidth={2.2} />
          <span>Zamknij</span>
        </button>
      </div>

      <div className="worker-profile__grid">
        <WorkerProfileSection title="Dane podstawowe">
          <dl className="worker-profile__facts">
            <WorkerProfileFact label="Status" value={workerStatusLabel(worker)} />
            <WorkerProfileFact
              label="Telefon"
              value={optionalProfileValue(worker.phone)}
            />
            <WorkerProfileFact
              label="E-mail"
              value={optionalProfileValue(worker.emailContact)}
            />
            <WorkerProfileFact
              label="Notatka"
              value={optionalProfileValue(worker.notes)}
            />
          </dl>
        </WorkerProfileSection>

        <WorkerProfileSection title="Aktualny plan i stawka">
          <dl className="worker-profile__facts">
            <WorkerProfileFact
              label="Plan"
              value={worker.currentPlan?.name ?? worker.currentPlanId}
            />
            <WorkerProfileFact
              label="Stawka"
              value={workerRateLabel(worker.currentRateVersion)}
            />
            <WorkerProfileFact
              label="Jednostka"
              value={workerUnitLabel(worker.currentPlan)}
            />
            <WorkerProfileFact
              label="Od dnia"
              value={worker.currentRateVersion?.validFrom ?? "brak"}
            />
          </dl>
        </WorkerProfileSection>

        <WorkerProfileSection title="Konto użytkownika">
          <dl className="worker-profile__facts">
            <WorkerProfileFact
              label="Konto"
              value={worker.linkedUser?.email ?? worker.linkedUserUid ?? "brak"}
            />
            <WorkerProfileFact
              label="Status konta"
              value={worker.linkedUser ? accountProfileStatus(worker.linkedUser) : "brak"}
            />
          </dl>
        </WorkerProfileSection>

        <WorkerProfileSection title="Podsumowanie sezonu">
          <dl className="worker-profile__facts">
            <WorkerProfileFact
              label="Kg"
              value={workerSummaryKgLabel(worker.seasonSummary.totalKgGrams)}
            />
            <WorkerProfileFact
              label="Naliczone"
              value={workerSummaryMoneyLabel(worker.seasonSummary.earnedGrosz)}
            />
            <WorkerProfileFact
              label="Wyplacone"
              value={workerSummaryMoneyLabel(worker.seasonSummary.paidGrosz)}
            />
            <WorkerProfileFact
              label="Do wyplaty"
              value={workerSummaryMoneyLabel(worker.seasonSummary.dueGrosz)}
            />
          </dl>
        </WorkerProfileSection>
      </div>

      <WorkerProfileSection title="Ostrzezenia">
        {worker.warnings.length > 0 ? (
          <ul className="worker-profile__list">
            {worker.warnings.map((warning) => (
              <li key={warning}>{warning}</li>
            ))}
          </ul>
        ) : (
          <p className="worker-profile__empty">brak</p>
        )}
      </WorkerProfileSection>

      <WorkerRateHistoryTable
        currentRateVersionId={worker.currentRateVersionId}
        plans={plans}
        rateVersions={worker.rateVersions}
      />

      <WorkerAuditEvents auditEvents={worker.auditEvents} />

      <div className="worker-profile__grid">
        <WorkerProfileSection title="Sesje">
          <p className="worker-profile__empty">Brak sesji do wyswietlenia.</p>
        </WorkerProfileSection>
        <WorkerProfileSection title="Wyplaty">
          <p className="worker-profile__empty">Brak wyplat do wyswietlenia.</p>
        </WorkerProfileSection>
      </div>
    </section>
  );
}

function WorkerProfileSection({
  children,
  title
}: {
  children: ReactNode;
  title: string;
}) {
  return (
    <section className="worker-profile__section">
      <h4>{title}</h4>
      {children}
    </section>
  );
}

function WorkerProfileFact({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

function WorkerRateHistoryTable({
  currentRateVersionId,
  plans,
  rateVersions
}: {
  currentRateVersionId: string;
  plans: WorkerDirectoryResult["plans"];
  rateVersions: WorkerDirectoryListItem["rateVersions"];
}) {
  const historyItems = analyzeWorkerRateHistory(rateVersions, currentBusinessDate());

  if (rateVersions.length === 0) {
    return (
      <WorkerProfileSection title="Historia stawek">
        <p className="worker-profile__empty">Brak stawek do wyswietlenia.</p>
      </WorkerProfileSection>
    );
  }

  return (
    <WorkerProfileSection title="Historia stawek">
      <div className="worker-profile__table-wrap">
        <table className="worker-profile__table">
          <thead>
            <tr>
              <th scope="col">Status</th>
              <th scope="col">Plan</th>
              <th scope="col">Stawka</th>
              <th scope="col">Od</th>
              <th scope="col">Do</th>
              <th scope="col">Autor</th>
              <th scope="col">Notatka</th>
              <th scope="col">Ostrzezenia</th>
            </tr>
          </thead>
          <tbody>
            {historyItems.map((historyItem) => {
              const { rateVersion } = historyItem;

              return (
                <tr key={rateVersion.id}>
                  <td>
                    {rateVersion.id === currentRateVersionId
                      ? "Biezaca"
                      : workerRateHistoryStatusLabel(historyItem.status)}
                  </td>
                  <td>{ratePlanLabel(rateVersion.planId, plans)}</td>
                  <td>{workerRateLabel(rateVersion)}</td>
                  <td>{rateVersion.validFrom}</td>
                  <td>{rateVersion.validTo ?? "bez terminu"}</td>
                  <td>{rateVersion.createdBy}</td>
                  <td>{optionalProfileValue(rateVersion.note)}</td>
                  <td>{rateWarningsLabel(historyItem.warnings)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </WorkerProfileSection>
  );
}

function WorkerAuditEvents({
  auditEvents
}: {
  auditEvents: WorkerDirectoryListItem["auditEvents"];
}) {
  if (auditEvents.length === 0) {
    return (
      <WorkerProfileSection title="Historia zmian">
        <p className="worker-profile__empty">Brak zdarzen audytu dla tego zbieracza.</p>
      </WorkerProfileSection>
    );
  }

  return (
    <WorkerProfileSection title="Historia zmian">
      <ul className="worker-profile__audit-list">
        {auditEvents.slice(0, 8).map((auditEvent) => (
          <li key={auditEvent.id}>
            <strong>{auditActionLabel(auditEvent.action)}</strong>
            <span>{auditEvent.actorUid}</span>
            <span>{auditEvent.reason ?? auditEvent.id}</span>
          </li>
        ))}
      </ul>
    </WorkerProfileSection>
  );
}

function CreateWorkerForm({
  activePlans,
  draft,
  isSubmitting,
  onChange,
  onSubmit,
  similarWorkerNames
}: {
  activePlans: WorkerDirectoryResult["plans"];
  draft: CreateWorkerDraft;
  isSubmitting: boolean;
  onChange: (draft: CreateWorkerDraft) => void;
  onSubmit: () => void;
  similarWorkerNames: string[];
}) {
  return (
    <form
      aria-label="Tworzenie zbieracza"
      className="worker-form"
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit();
      }}
    >
      <label className="field">
        <span>Nazwa zbieracza</span>
        <input
          disabled={isSubmitting}
          onChange={(event) => {
            onChange({
              ...draft,
              displayName: event.target.value,
              confirmed: false
            });
          }}
          type="text"
          value={draft.displayName}
        />
      </label>

      <label className="field">
        <span>Plan</span>
        <select
          disabled={isSubmitting || activePlans.length === 0}
          onChange={(event) => {
            onChange({
              ...draft,
              planId: event.target.value,
              confirmed: false
            });
          }}
          value={draft.planId}
        >
          {activePlans.length === 0 ? (
            <option value="">Brak aktywnych planow</option>
          ) : null}
          {activePlans.map((plan) => (
            <option key={plan.id} value={plan.id}>
              {plan.name}
            </option>
          ))}
        </select>
      </label>

      <label className="field">
        <span>Stawka</span>
        <input
          disabled={isSubmitting}
          inputMode="decimal"
          onChange={(event) => {
            onChange({
              ...draft,
              rate: event.target.value,
              confirmed: false
            });
          }}
          type="text"
          value={draft.rate}
        />
      </label>

      <label className="field">
        <span>Od dnia</span>
        <input
          disabled={isSubmitting}
          onChange={(event) => {
            onChange({
              ...draft,
              validFrom: event.target.value,
              confirmed: false
            });
          }}
          type="date"
          value={draft.validFrom}
        />
      </label>

      <label className="field">
        <span>Telefon</span>
        <input
          disabled={isSubmitting}
          onChange={(event) => {
            onChange({
              ...draft,
              phone: event.target.value,
              confirmed: false
            });
          }}
          type="text"
          value={draft.phone}
        />
      </label>

      <label className="field">
        <span>E-mail kontaktowy</span>
        <input
          disabled={isSubmitting}
          inputMode="email"
          onChange={(event) => {
            onChange({
              ...draft,
              emailContact: event.target.value,
              confirmed: false
            });
          }}
          type="email"
          value={draft.emailContact}
        />
      </label>

      <label className="field worker-form__notes">
        <span>Notatka</span>
        <input
          disabled={isSubmitting}
          onChange={(event) => {
            onChange({
              ...draft,
              notes: event.target.value,
              confirmed: false
            });
          }}
          type="text"
          value={draft.notes}
        />
      </label>

      {similarWorkerNames.length > 0 ? (
        <p className="worker-form__warning">
          Podobna nazwa: {similarWorkerNames.slice(0, 3).join(", ")}.
        </p>
      ) : null}

      <label className="checkbox-field worker-form__confirmation">
        <input
          checked={draft.confirmed}
          disabled={isSubmitting || activePlans.length === 0}
          onChange={(event) => {
            onChange({
              ...draft,
              confirmed: event.target.checked
            });
          }}
          type="checkbox"
        />
        <span>Potwierdzam utworzenie zbieracza i pierwszej stawki</span>
      </label>

      <button
        className="primary-action worker-form__submit"
        disabled={isSubmitting || activePlans.length === 0}
        type="submit"
      >
        <Plus aria-hidden="true" size={18} strokeWidth={2.2} />
        <span>Dodaj zbieracza</span>
      </button>
    </form>
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
    <div
      aria-label="Filtry zbieraczy"
      className="directory-filters worker-filters"
      role="group"
    >
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

function optionalProfileValue(value: string | null | undefined): string {
  return value?.trim() ? value : "brak";
}

function accountProfileStatus(
  profile: NonNullable<WorkerDirectoryListItem["linkedUser"]>
) {
  if (!profile.active || profile.registrationStatus === "BLOCKED") {
    return "Zablokowane";
  }

  return profile.registrationStatus === "APPROVED"
    ? "Aktywne"
    : profile.registrationStatus;
}

function ratePlanLabel(planId: string, plans: WorkerDirectoryResult["plans"]): string {
  return plans.find((plan) => plan.id === planId)?.name ?? planId;
}

function rateWarningsLabel(warnings: string[]): string {
  return warnings.length > 0 ? warnings.join("; ") : "brak";
}

function currentBusinessDate(): string {
  return new Date().toISOString().slice(0, 10);
}

function auditActionLabel(
  action: WorkerDirectoryListItem["auditEvents"][number]["action"]
): string {
  switch (action) {
    case "WORKER_CREATED":
      return "Utworzenie zbieracza";
    case "USER_WORKER_LINK_CHANGED":
      return "Zmiana powiazania konta";
    case "USER_ROLE_CHANGED":
      return "Zmiana roli konta";
    case "USER_BLOCKED":
      return "Blokada konta";
    case "USER_REACTIVATED":
      return "Reaktywacja konta";
    default:
      return action;
  }
}

function createInitialWorkerDraft(): CreateWorkerDraft {
  return {
    displayName: "",
    planId: "",
    rate: "",
    validFrom: new Date().toISOString().slice(0, 10),
    phone: "",
    emailContact: "",
    notes: "",
    confirmed: false
  };
}

function parseWorkerRate(value: string): number {
  try {
    const parsed = parseDecimalToScaledInteger(value, 2);

    if (parsed <= 0) {
      throw new Error("Stawka musi byc dodatnia.");
    }

    return parsed;
  } catch {
    throw new Error("Podaj dodatnia stawke, np. 12,50.");
  }
}

function createWorkerFeedback(result: unknown): string {
  if (
    typeof result === "object" &&
    result !== null &&
    "similarNameWarning" in result &&
    typeof result.similarNameWarning === "string"
  ) {
    return `Utworzono zbieracza. ${result.similarNameWarning}`;
  }

  return "Utworzono zbieracza.";
}

function getWorkerDirectoryErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  return "Nie udalo sie zapisac zbieracza.";
}
