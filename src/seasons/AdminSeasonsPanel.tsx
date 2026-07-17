import {
  Archive,
  CalendarDays,
  DoorOpen,
  Lock,
  RefreshCw,
  RotateCcw,
  Search,
  Star
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import type { AuthSessionState } from "../auth/authSession";
import { getOrCreateDeviceId } from "../domain/device";
import type { SeasonDocument, SeasonStatus } from "../domain/domainConfiguration";
import {
  createSeason,
  defaultSeasonFilters,
  filterSeasons,
  isSeasonStatus,
  listSeasons,
  seasonStatusLabel,
  updateSeasonStatus,
  type CreateSeasonInput,
  type SeasonDirectoryResult,
  type SeasonFilters,
  type SeasonStatusAction,
  type SeasonStatusUpdateInput
} from "./seasons";

type FirebaseEnv = Record<string, string | boolean | undefined>;

export type SeasonsApi = {
  list: (env: FirebaseEnv) => Promise<SeasonDirectoryResult>;
  create?: (env: FirebaseEnv, input: CreateSeasonInput) => Promise<unknown>;
  updateStatus?: (env: FirebaseEnv, input: SeasonStatusUpdateInput) => Promise<unknown>;
};

export const defaultSeasonsApi: SeasonsApi = {
  list: listSeasons,
  create: createSeason,
  updateStatus: updateSeasonStatus
};

type SeasonsState =
  | {
      status: "IDLE" | "LOADING";
      result: SeasonDirectoryResult | null;
      message: string;
    }
  | {
      status: "READY";
      result: SeasonDirectoryResult;
      message: string;
    }
  | {
      status: "ERROR";
      result: SeasonDirectoryResult | null;
      message: string;
    };

type CreateSeasonDraft = {
  name: string;
  startDate: string;
  endDate: string;
  status: Extract<SeasonStatus, "PLANNED" | "OPEN">;
  isDefault: boolean;
  allowDateOverlap: boolean;
  confirmed: boolean;
};

type SeasonActionDraft = {
  targetSeasonId: string;
  action: SeasonStatusAction;
  reason: string;
  confirmed: boolean;
};

const initialSeasonsState: SeasonsState = {
  status: "IDLE",
  result: null,
  message: "Lista sezonow nie zostala jeszcze pobrana."
};

const initialCreateSeasonDraft: CreateSeasonDraft = {
  name: "",
  startDate: "",
  endDate: "",
  status: "PLANNED",
  isDefault: false,
  allowDateOverlap: false,
  confirmed: false
};

const initialSeasonActionDraft: SeasonActionDraft = {
  targetSeasonId: "",
  action: "OPEN",
  reason: "",
  confirmed: false
};

export function AdminSeasonsPanel({
  authState,
  env,
  seasonsApi = defaultSeasonsApi
}: {
  authState: AuthSessionState;
  env: FirebaseEnv;
  seasonsApi?: SeasonsApi;
}) {
  const [filters, setFilters] = useState<SeasonFilters>(defaultSeasonFilters);
  const [state, setState] = useState<SeasonsState>(initialSeasonsState);
  const [createDraft, setCreateDraft] = useState<CreateSeasonDraft>(
    initialCreateSeasonDraft
  );
  const [actionDraft, setActionDraft] = useState<SeasonActionDraft>(
    initialSeasonActionDraft
  );
  const [feedback, setFeedback] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const isAdmin = authState.status === "READY" && authState.profile.role === "ADMIN";

  useEffect(() => {
    let isMounted = true;

    if (!isAdmin) {
      setState(initialSeasonsState);
      return undefined;
    }

    setState((current) => ({
      status: "LOADING",
      result: current.result,
      message: "Pobieranie sezonow."
    }));

    void seasonsApi
      .list(env)
      .then((result) => {
        if (isMounted) {
          setState({
            status: "READY",
            result,
            message: "Lista sezonow jest aktualna."
          });
        }
      })
      .catch(() => {
        if (isMounted) {
          setState((current) => ({
            status: "ERROR",
            result: current.result,
            message: "Nie udalo sie pobrac sezonow."
          }));
        }
      });

    return () => {
      isMounted = false;
    };
  }, [env, isAdmin, seasonsApi]);

  const filteredSeasons = useMemo(
    () => (state.result ? filterSeasons(state.result.seasons, filters) : []),
    [filters, state.result]
  );
  const selectedSeason = useMemo(
    () =>
      state.result?.seasons.find((season) => season.id === actionDraft.targetSeasonId) ??
      null,
    [actionDraft.targetSeasonId, state.result]
  );
  const selectedSeasonActions = useMemo(
    () => (selectedSeason ? seasonActionsForSeason(selectedSeason) : []),
    [selectedSeason]
  );
  const selectedSeasonAction: SeasonStatusAction | undefined =
    selectedSeasonActions.includes(actionDraft.action)
      ? actionDraft.action
      : selectedSeasonActions.at(0);

  useEffect(() => {
    if (!state.result) {
      return;
    }

    const currentSelection = state.result.seasons.find(
      (season) => season.id === actionDraft.targetSeasonId
    );

    if (currentSelection) {
      return;
    }

    if (state.result.seasons.length === 0) {
      setActionDraft(initialSeasonActionDraft);
      return;
    }

    const firstSeason = state.result.seasons[0];

    setActionDraft((current) => ({
      ...current,
      targetSeasonId: firstSeason.id,
      action: defaultActionForSeason(firstSeason),
      confirmed: false
    }));
  }, [actionDraft.targetSeasonId, state.result]);

  const reload = async () => {
    setState((current) => ({
      status: "LOADING",
      result: current.result,
      message: "Pobieranie sezonow."
    }));

    try {
      const result = await seasonsApi.list(env);

      setState({
        status: "READY",
        result,
        message: "Lista sezonow jest aktualna."
      });
    } catch {
      setState((current) => ({
        status: "ERROR",
        result: current.result,
        message: "Nie udalo sie pobrac sezonow."
      }));
    }
  };

  const handleCreateSeason = async () => {
    if (authState.status !== "READY") {
      return;
    }

    setFeedback(null);
    setError(null);

    if (!createDraft.confirmed) {
      setError("Potwierdz utworzenie sezonu.");
      return;
    }

    if (!navigator.onLine) {
      setError("Tworzenie sezonu wymaga polaczenia online.");
      return;
    }

    const create = seasonsApi.create ?? defaultSeasonsApi.create;

    if (!create) {
      setError("Operacja tworzenia sezonu nie jest dostepna.");
      return;
    }

    setIsSubmitting(true);

    try {
      await create(env, {
        actorProfile: authState.profile,
        name: createDraft.name,
        startDate: createDraft.startDate,
        endDate: createDraft.endDate,
        status: createDraft.status,
        isDefault: createDraft.isDefault,
        allowDateOverlap: createDraft.allowDateOverlap,
        deviceId: getOrCreateDeviceId()
      });
      await reload();
      setFeedback("Utworzono sezon.");
      setCreateDraft(initialCreateSeasonDraft);
    } catch (createError: unknown) {
      setError(getSeasonsErrorMessage(createError));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSeasonAction = async () => {
    if (authState.status !== "READY") {
      return;
    }

    setFeedback(null);
    setError(null);

    if (!selectedSeason) {
      setError("Wybierz sezon.");
      return;
    }

    if (!selectedSeasonAction) {
      setError("Wybrany sezon nie ma dostepnej operacji.");
      return;
    }

    if (!actionDraft.confirmed) {
      setError("Potwierdz operacje na sezonie.");
      return;
    }

    if (!navigator.onLine) {
      setError("Zmiana sezonu wymaga polaczenia online.");
      return;
    }

    const updateStatus = seasonsApi.updateStatus ?? defaultSeasonsApi.updateStatus;

    if (!updateStatus) {
      setError("Operacja zmiany sezonu nie jest dostepna.");
      return;
    }

    setIsSubmitting(true);

    try {
      await updateStatus(env, {
        actorProfile: authState.profile,
        targetSeason: selectedSeason,
        action: selectedSeasonAction,
        reason: actionDraft.reason,
        deviceId: getOrCreateDeviceId()
      });
      await reload();
      setFeedback("Zmieniono sezon.");
      setActionDraft((current) => ({
        ...current,
        reason: "",
        confirmed: false
      }));
    } catch (actionError: unknown) {
      setError(getSeasonsErrorMessage(actionError));
    } finally {
      setIsSubmitting(false);
    }
  };

  if (authState.status !== "READY") {
    return (
      <section className="season-directory" aria-label="Sezony">
        <AccessNotice
          title="Logowanie wymagane"
          message="Zaloguj sie jako administrator."
        />
      </section>
    );
  }

  if (authState.profile.role !== "ADMIN") {
    return (
      <section className="season-directory" aria-label="Sezony">
        <AccessNotice
          title="Brak dostepu"
          message="Sezony sa zarzadzane tylko przez administratora."
        />
      </section>
    );
  }

  return (
    <section className="season-directory" aria-label="Sezony">
      <div className="directory-header">
        <div>
          <p className="eyebrow">Sezony</p>
          <h2>Konfiguracja sezonow</h2>
          <p className="panel-detail">{state.message}</p>
        </div>
        <button
          className="secondary-action"
          disabled={state.status === "LOADING"}
          onClick={() => {
            void reload();
          }}
          type="button"
        >
          <RefreshCw aria-hidden="true" size={18} strokeWidth={2.2} />
          <span>Odswiez</span>
        </button>
      </div>

      <SeasonFilterControls filters={filters} onChange={setFilters} />

      {state.result ? (
        <>
          <CreateSeasonForm
            draft={createDraft}
            isSubmitting={isSubmitting}
            onChange={setCreateDraft}
            onSubmit={() => {
              void handleCreateSeason();
            }}
          />
          <SeasonActionForm
            draft={actionDraft}
            effectiveAction={selectedSeasonAction}
            isSubmitting={isSubmitting}
            onChange={setActionDraft}
            onSubmit={() => {
              void handleSeasonAction();
            }}
            selectedSeason={selectedSeason}
            seasons={state.result.seasons}
          />
        </>
      ) : null}

      {feedback ? <p className="form-message form-message--ok">{feedback}</p> : null}
      {error ? <p className="form-message form-message--error">{error}</p> : null}

      <div className="directory-summary" aria-label="Podsumowanie sezonow">
        <DirectoryStat
          label="Wszystkie sezony"
          value={String(state.result?.seasons.length ?? 0)}
        />
        <DirectoryStat label="Po filtrach" value={String(filteredSeasons.length)} />
        <DirectoryStat
          label="Bledne dokumenty"
          value={String(state.result?.invalidSeasons.length ?? 0)}
        />
      </div>

      {state.status === "ERROR" ? (
        <p className="form-message form-message--error">{state.message}</p>
      ) : null}

      {state.status === "LOADING" && !state.result ? (
        <p className="empty-state">Pobieranie sezonow.</p>
      ) : null}

      {state.result && filteredSeasons.length === 0 ? (
        <p className="empty-state">Brak sezonow dla wybranych filtrow.</p>
      ) : null}

      {filteredSeasons.length > 0 ? (
        <div className="directory-table-wrap">
          <table className="directory-table">
            <thead>
              <tr>
                <th scope="col">Nazwa</th>
                <th scope="col">Status</th>
                <th scope="col">Od</th>
                <th scope="col">Do</th>
                <th scope="col">Domyslny</th>
              </tr>
            </thead>
            <tbody>
              {filteredSeasons.map((season) => (
                <tr key={season.id}>
                  <td>{season.name}</td>
                  <td>{seasonStatusLabel(season.status)}</td>
                  <td>{season.startDate}</td>
                  <td>{season.endDate ?? "bez daty"}</td>
                  <td>{season.isDefault ? "Tak" : "Nie"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      {state.result && state.result.invalidSeasons.length > 0 ? (
        <div className="invalid-profiles" aria-label="Bledne sezony">
          <div className="access-notice__icon">
            <CalendarDays aria-hidden="true" size={20} strokeWidth={2.2} />
          </div>
          <div>
            <p className="eyebrow">Bledne dokumenty sezonow</p>
            <ul>
              {state.result.invalidSeasons.map((invalidSeason) => (
                <li key={invalidSeason.id}>
                  <strong>{invalidSeason.id}</strong>: {invalidSeason.reason}
                </li>
              ))}
            </ul>
          </div>
        </div>
      ) : null}
    </section>
  );
}

function SeasonFilterControls({
  filters,
  onChange
}: {
  filters: SeasonFilters;
  onChange: (filters: SeasonFilters) => void;
}) {
  return (
    <div className="directory-filters season-filters" aria-label="Filtry sezonow">
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
            const nextStatus = event.target.value;

            if (nextStatus === "ALL" || isSeasonStatus(nextStatus)) {
              onChange({
                ...filters,
                status: nextStatus
              });
            }
          }}
          value={filters.status}
        >
          <option value="ALL">Wszystkie</option>
          <option value="PLANNED">Planowany</option>
          <option value="OPEN">Otwarty</option>
          <option value="CLOSED">Zamkniety</option>
          <option value="ARCHIVED">Archiwalny</option>
        </select>
      </label>
    </div>
  );
}

function CreateSeasonForm({
  draft,
  isSubmitting,
  onChange,
  onSubmit
}: {
  draft: CreateSeasonDraft;
  isSubmitting: boolean;
  onChange: (draft: CreateSeasonDraft) => void;
  onSubmit: () => void;
}) {
  return (
    <form
      aria-label="Tworzenie sezonu"
      className="season-form"
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit();
      }}
    >
      <label className="field">
        <span>Nazwa sezonu</span>
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
        <span>Data od</span>
        <input
          disabled={isSubmitting}
          onChange={(event) => {
            onChange({
              ...draft,
              startDate: event.target.value,
              confirmed: false
            });
          }}
          type="date"
          value={draft.startDate}
        />
      </label>

      <label className="field">
        <span>Data do</span>
        <input
          disabled={isSubmitting}
          onChange={(event) => {
            onChange({
              ...draft,
              endDate: event.target.value,
              confirmed: false
            });
          }}
          type="date"
          value={draft.endDate}
        />
      </label>

      <label className="field">
        <span>Status startowy</span>
        <select
          disabled={isSubmitting}
          onChange={(event) => {
            const nextStatus = event.target.value;

            if (nextStatus !== "PLANNED" && nextStatus !== "OPEN") {
              return;
            }

            onChange({
              ...draft,
              status: nextStatus,
              confirmed: false
            });
          }}
          value={draft.status}
        >
          <option value="PLANNED">Planowany</option>
          <option value="OPEN">Otwarty</option>
        </select>
      </label>

      <label className="checkbox-field season-form__confirmation">
        <input
          checked={draft.isDefault}
          disabled={isSubmitting}
          onChange={(event) => {
            onChange({
              ...draft,
              isDefault: event.target.checked,
              confirmed: false
            });
          }}
          type="checkbox"
        />
        <span>Ustaw jako sezon domyslny</span>
      </label>

      <label className="checkbox-field season-form__confirmation">
        <input
          checked={draft.allowDateOverlap}
          disabled={isSubmitting}
          onChange={(event) => {
            onChange({
              ...draft,
              allowDateOverlap: event.target.checked,
              confirmed: false
            });
          }}
          type="checkbox"
        />
        <span>Akceptuje nakladanie okresow</span>
      </label>

      <label className="checkbox-field season-form__confirmation">
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
        <span>Potwierdzam utworzenie sezonu</span>
      </label>

      <button
        className="primary-action season-form__submit"
        disabled={isSubmitting}
        type="submit"
      >
        <CalendarDays aria-hidden="true" size={18} strokeWidth={2.2} />
        <span>Dodaj sezon</span>
      </button>
    </form>
  );
}

function SeasonActionForm({
  draft,
  effectiveAction,
  isSubmitting,
  onChange,
  onSubmit,
  selectedSeason,
  seasons
}: {
  draft: SeasonActionDraft;
  effectiveAction: SeasonStatusAction | undefined;
  isSubmitting: boolean;
  onChange: (draft: SeasonActionDraft) => void;
  onSubmit: () => void;
  selectedSeason: SeasonDocument | null;
  seasons: SeasonDocument[];
}) {
  const availableActions = selectedSeason ? seasonActionsForSeason(selectedSeason) : [];
  const action = effectiveAction ?? draft.action;
  const ActionIcon = seasonActionIcon(action);
  const hasAvailableAction = availableActions.length > 0;

  return (
    <form
      aria-label="Zmiana sezonu"
      className="season-action-form"
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit();
      }}
    >
      <label className="field">
        <span>Sezon</span>
        <select
          disabled={isSubmitting || !hasAvailableAction}
          onChange={(event) => {
            const nextSeason = seasons.find((season) => season.id === event.target.value);

            onChange({
              ...draft,
              targetSeasonId: event.target.value,
              action: nextSeason ? defaultActionForSeason(nextSeason) : draft.action,
              confirmed: false
            });
          }}
          value={draft.targetSeasonId}
        >
          {seasons.length === 0 ? <option value="">Brak sezonow</option> : null}
          {seasons.map((season) => (
            <option key={season.id} value={season.id}>
              {season.name} ({seasonStatusLabel(season.status)})
            </option>
          ))}
        </select>
      </label>

      <label className="field">
        <span>Operacja</span>
        <select
          disabled={isSubmitting || !hasAvailableAction}
          onChange={(event) => {
            const nextAction = event.target.value as SeasonStatusAction;

            if (!isSeasonStatusAction(nextAction)) {
              return;
            }

            onChange({
              ...draft,
              action: nextAction,
              confirmed: false
            });
          }}
          value={action}
        >
          {hasAvailableAction ? null : (
            <option value={draft.action}>Brak operacji</option>
          )}
          {availableActions.map((availableAction) => (
            <option key={availableAction} value={availableAction}>
              {seasonActionLabel(availableAction)}
            </option>
          ))}
        </select>
      </label>

      <label className="field">
        <span>Powod</span>
        <input
          disabled={isSubmitting || seasons.length === 0}
          onChange={(event) => {
            onChange({
              ...draft,
              reason: event.target.value,
              confirmed: false
            });
          }}
          type="text"
          value={draft.reason}
        />
      </label>

      <label className="checkbox-field season-action-form__confirmation">
        <input
          checked={draft.confirmed}
          disabled={isSubmitting || !hasAvailableAction}
          onChange={(event) => {
            onChange({
              ...draft,
              confirmed: event.target.checked
            });
          }}
          type="checkbox"
        />
        <span>Potwierdzam operacje na sezonie</span>
      </label>

      <button
        className="primary-action season-action-form__submit"
        disabled={isSubmitting || !hasAvailableAction}
        type="submit"
      >
        <ActionIcon aria-hidden="true" size={18} strokeWidth={2.2} />
        <span>Zapisz sezon</span>
      </button>
    </form>
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
        <CalendarDays aria-hidden="true" size={20} strokeWidth={2.2} />
      </div>
      <div>
        <p className="eyebrow">{title}</p>
        <p className="panel-detail">{message}</p>
      </div>
    </div>
  );
}

function defaultActionForSeason(season: SeasonDocument): SeasonStatusAction {
  return seasonActionsForSeason(season)[0] ?? "OPEN";
}

function seasonActionsForSeason(season: SeasonDocument): SeasonStatusAction[] {
  const actions: SeasonStatusAction[] = [];

  switch (season.status) {
    case "PLANNED":
      actions.push("OPEN", "ARCHIVE");
      break;
    case "OPEN":
      actions.push("CLOSE");
      break;
    case "CLOSED":
      actions.push("REOPEN", "ARCHIVE");
      break;
    case "ARCHIVED":
      break;
  }

  if (!season.isDefault && season.status !== "ARCHIVED") {
    actions.push("SET_DEFAULT");
  }

  return actions;
}

function isSeasonStatusAction(value: string): value is SeasonStatusAction {
  return (
    value === "OPEN" ||
    value === "CLOSE" ||
    value === "REOPEN" ||
    value === "ARCHIVE" ||
    value === "SET_DEFAULT"
  );
}

function seasonActionIcon(action: SeasonStatusAction) {
  switch (action) {
    case "OPEN":
      return DoorOpen;
    case "CLOSE":
      return Lock;
    case "REOPEN":
      return RotateCcw;
    case "ARCHIVE":
      return Archive;
    case "SET_DEFAULT":
      return Star;
  }
}

function seasonActionLabel(action: SeasonStatusAction): string {
  switch (action) {
    case "OPEN":
      return "Otworz";
    case "CLOSE":
      return "Zamknij";
    case "REOPEN":
      return "Otworz ponownie";
    case "ARCHIVE":
      return "Archiwizuj";
    case "SET_DEFAULT":
      return "Ustaw domyslny";
  }
}

function getSeasonsErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  return "Nie udalo sie zapisac sezonu.";
}
