import { ClipboardList, Plus, RefreshCw, ShieldAlert } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import type { AuthSessionState } from "../auth/authSession";
import { getOrCreateDeviceId } from "../domain/device";
import { formatBusinessDate } from "../domain/format";
import type { UserProfile } from "../domain/identity";
import { ActiveHarvestSessionPanel } from "./ActiveHarvestSessionPanel";
import {
  listOperatorHarvestSessionDashboard,
  type HarvestSessionDashboardResult,
  type OperatorHarvestSessionDashboardInput
} from "./harvestSessionDashboard";
import {
  listOpenHarvestSessionConfiguration,
  openHarvestSessionOnline,
  selectDefaultOpenHarvestSeason,
  type OpenHarvestSessionConfigurationResult,
  type OpenHarvestSessionOnlineInput,
  type OpenHarvestSessionOnlineResult
} from "./openHarvestSessionRuntime";

type FirebaseEnv = Record<string, string | boolean | undefined>;

export type OperatorHarvestSessionsApi = {
  list: (
    env: FirebaseEnv,
    input: OperatorHarvestSessionDashboardInput
  ) => Promise<HarvestSessionDashboardResult>;
  listOpeningConfiguration: (
    env: FirebaseEnv,
    input: { actorProfile: UserProfile }
  ) => Promise<OpenHarvestSessionConfigurationResult>;
  open: (
    env: FirebaseEnv,
    input: OpenHarvestSessionOnlineInput
  ) => Promise<OpenHarvestSessionOnlineResult>;
};

export const defaultOperatorHarvestSessionsApi: OperatorHarvestSessionsApi = {
  list: listOperatorHarvestSessionDashboard,
  listOpeningConfiguration: listOpenHarvestSessionConfiguration,
  open: openHarvestSessionOnline
};

type DashboardState =
  | {
      status: "IDLE" | "LOADING";
      result: HarvestSessionDashboardResult | null;
      message: string;
    }
  | {
      status: "READY";
      result: HarvestSessionDashboardResult;
      message: string;
    }
  | {
      status: "ERROR";
      result: HarvestSessionDashboardResult | null;
      message: string;
    };

type OpeningConfigurationState =
  | {
      status: "IDLE" | "LOADING";
      result: OpenHarvestSessionConfigurationResult | null;
      message: string;
    }
  | {
      status: "READY";
      result: OpenHarvestSessionConfigurationResult;
      message: string;
    }
  | {
      status: "ERROR";
      result: OpenHarvestSessionConfigurationResult | null;
      message: string;
    };

type OpenSessionDraft = {
  workerId: string;
  seasonId: string;
  businessDate: string;
  note: string;
  secondSessionReason: string;
};

type HarvestViewerProfile = UserProfile & {
  role: "ADMIN" | "OPERATOR";
};

const initialDashboardState: DashboardState = {
  status: "IDLE",
  result: null,
  message: "Sesje zbioru nie zostaly jeszcze pobrane."
};

const initialOpeningConfigurationState: OpeningConfigurationState = {
  status: "IDLE",
  result: null,
  message: "Konfiguracja otwarcia sesji nie zostala jeszcze pobrana."
};

export function OperatorHarvestSessionsPanel({
  authState,
  env,
  harvestSessionsApi = defaultOperatorHarvestSessionsApi,
  isOnline
}: {
  authState: AuthSessionState;
  env: FirebaseEnv;
  harvestSessionsApi?: OperatorHarvestSessionsApi;
  isOnline: boolean;
}) {
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [state, setState] = useState<DashboardState>(initialDashboardState);
  const [openingConfigurationState, setOpeningConfigurationState] =
    useState<OpeningConfigurationState>(initialOpeningConfigurationState);
  const [openDraft, setOpenDraft] = useState<OpenSessionDraft>(() =>
    createInitialOpenSessionDraft()
  );
  const [openFeedback, setOpenFeedback] = useState<string | null>(null);
  const [openError, setOpenError] = useState<string | null>(null);
  const [isOpeningSession, setIsOpeningSession] = useState(false);
  const viewerProfile = useMemo(() => getHarvestViewerProfile(authState), [authState]);

  useEffect(() => {
    let isMounted = true;

    if (!viewerProfile) {
      setState(initialDashboardState);
      setSelectedSessionId(null);
      return undefined;
    }

    setState((current) => ({
      status: "LOADING",
      result: current.result,
      message: "Pobieranie sesji zbioru."
    }));

    void harvestSessionsApi
      .list(env, {
        actorProfile: viewerProfile,
        selectedSessionId,
        isOnline
      })
      .then((result) => {
        if (isMounted) {
          setState({
            status: "READY",
            result,
            message: "Sesje zbioru sa aktualne."
          });
        }
      })
      .catch(() => {
        if (isMounted) {
          setState((current) => ({
            status: "ERROR",
            result: current.result,
            message: "Nie udalo sie pobrac sesji zbioru."
          }));
        }
      });

    return () => {
      isMounted = false;
    };
  }, [env, harvestSessionsApi, isOnline, selectedSessionId, viewerProfile]);

  useEffect(() => {
    let isMounted = true;

    if (!viewerProfile) {
      setOpeningConfigurationState(initialOpeningConfigurationState);
      setOpenDraft(createInitialOpenSessionDraft());
      return undefined;
    }

    setOpeningConfigurationState((current) => ({
      status: "LOADING",
      result: current.result,
      message: "Pobieranie konfiguracji otwarcia sesji."
    }));

    void harvestSessionsApi
      .listOpeningConfiguration(env, {
        actorProfile: viewerProfile
      })
      .then((result) => {
        if (isMounted) {
          setOpeningConfigurationState({
            status: "READY",
            result,
            message: "Konfiguracja otwarcia sesji jest aktualna."
          });
          setOpenDraft((current) => reconcileOpenSessionDraft(current, result));
        }
      })
      .catch(() => {
        if (isMounted) {
          setOpeningConfigurationState((current) => ({
            status: "ERROR",
            result: current.result,
            message: "Nie udalo sie pobrac konfiguracji otwarcia sesji."
          }));
        }
      });

    return () => {
      isMounted = false;
    };
  }, [env, harvestSessionsApi, viewerProfile]);

  const reload = async (overrideSelectedSessionId?: string | null) => {
    if (!viewerProfile) {
      return;
    }

    const nextSelectedSessionId =
      overrideSelectedSessionId !== undefined
        ? overrideSelectedSessionId
        : (selectedSessionId ?? state.result?.selectedSessionId ?? null);

    setState((current) => ({
      status: "LOADING",
      result: current.result,
      message: "Pobieranie sesji zbioru."
    }));

    try {
      const result = await harvestSessionsApi.list(env, {
        actorProfile: viewerProfile,
        selectedSessionId: nextSelectedSessionId,
        isOnline
      });

      setState({
        status: "READY",
        result,
        message: "Sesje zbioru sa aktualne."
      });
    } catch {
      setState((current) => ({
        status: "ERROR",
        result: current.result,
        message: "Nie udalo sie pobrac sesji zbioru."
      }));
    }
  };

  const reloadOpeningConfiguration = async () => {
    if (!viewerProfile) {
      return;
    }

    setOpeningConfigurationState((current) => ({
      status: "LOADING",
      result: current.result,
      message: "Pobieranie konfiguracji otwarcia sesji."
    }));

    try {
      const result = await harvestSessionsApi.listOpeningConfiguration(env, {
        actorProfile: viewerProfile
      });

      setOpeningConfigurationState({
        status: "READY",
        result,
        message: "Konfiguracja otwarcia sesji jest aktualna."
      });
      setOpenDraft((current) => reconcileOpenSessionDraft(current, result));
    } catch {
      setOpeningConfigurationState((current) => ({
        status: "ERROR",
        result: current.result,
        message: "Nie udalo sie pobrac konfiguracji otwarcia sesji."
      }));
    }
  };

  const handleOpenSession = async () => {
    if (!viewerProfile) {
      return;
    }

    setOpenFeedback(null);
    setOpenError(null);

    if (!isOnline) {
      setOpenError("Otwarcie sesji wymaga polaczenia online.");
      return;
    }

    setIsOpeningSession(true);

    try {
      const result = await harvestSessionsApi.open(env, {
        actorProfile: viewerProfile,
        seasonId: openDraft.seasonId,
        workerId: openDraft.workerId,
        businessDate: openDraft.businessDate,
        note: openDraft.note,
        secondSessionReason:
          viewerProfile.role === "ADMIN" ? openDraft.secondSessionReason : null,
        isOnline,
        createdDeviceId: getOrCreateDeviceId()
      });

      setOpenFeedback(result.message);
      setOpenDraft((current) => ({
        ...current,
        note: "",
        secondSessionReason: ""
      }));

      await reload(result.selectedSessionId);
      await reloadOpeningConfiguration();
    } catch (error: unknown) {
      setOpenError(getOpenSessionErrorMessage(error));
    } finally {
      setIsOpeningSession(false);
    }
  };

  if (!viewerProfile) {
    return (
      <section className="operator-sessions" aria-label="Sesje zbioru operatora">
        <div className="access-notice">
          <span className="access-notice__icon">
            <ShieldAlert aria-hidden="true" size={22} strokeWidth={2.2} />
          </span>
          <div>
            <h3>Brak dostepu do sesji zbioru</h3>
            <p>Zaloguj sie jako administrator albo operator.</p>
          </div>
        </div>
      </section>
    );
  }

  const result = state.result;
  const openingConfiguration = openingConfigurationState.result;
  const invalidDocumentsCount =
    (result?.invalidSessions.length ?? 0) +
    (result?.invalidEntries.length ?? 0) +
    (result?.invalidSeasons.length ?? 0);
  const invalidConfigurationCount =
    (openingConfiguration?.invalidSeasons.length ?? 0) +
    (openingConfiguration?.invalidWorkers.length ?? 0) +
    (openingConfiguration?.invalidPlans.length ?? 0) +
    (openingConfiguration?.invalidRateVersions.length ?? 0) +
    (openingConfiguration?.invalidSessions.length ?? 0);
  const existingOpenSessionsForDraft =
    result?.openSessions.filter(
      (session) =>
        session.workerId === openDraft.workerId &&
        session.businessDate === openDraft.businessDate
    ) ?? [];

  return (
    <section className="operator-sessions" aria-label="Sesje zbioru operatora">
      <div className="directory-header">
        <div>
          <p className="eyebrow">Sesje online</p>
          <h3>Otwarte sesje zbioru</h3>
          <p>{state.message}</p>
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
          Odswiez
        </button>
      </div>

      <OpenHarvestSessionForm
        actorRole={viewerProfile.role}
        configuration={openingConfiguration}
        configurationMessage={openingConfigurationState.message}
        draft={openDraft}
        error={openError}
        existingOpenSessionsCount={existingOpenSessionsForDraft.length}
        feedback={openFeedback}
        isOnline={isOnline}
        isSubmitting={isOpeningSession}
        onChange={setOpenDraft}
        onSubmit={() => {
          void handleOpenSession();
        }}
      />

      {invalidConfigurationCount > 0 ? (
        <p className="form-message form-message--error">
          Niepoprawne dokumenty konfiguracji otwarcia sesji: {invalidConfigurationCount}
        </p>
      ) : null}

      {invalidDocumentsCount > 0 ? (
        <p className="form-message form-message--error">
          Niepoprawne dokumenty sesji: {invalidDocumentsCount}
        </p>
      ) : null}

      {result && result.openSessions.length > 0 ? (
        <div className="operator-sessions__list" aria-label="Otwarte sesje">
          {result.openSessions.map((session) => (
            <button
              aria-pressed={session.id === result.selectedSessionId}
              className="operator-sessions__item"
              key={session.id}
              onClick={() => {
                setSelectedSessionId(session.id);
              }}
              type="button"
            >
              <ClipboardList aria-hidden="true" size={18} strokeWidth={2.2} />
              <span>
                <strong>{session.workerNameSnapshot}</strong>
                <small>{formatBusinessDate(session.businessDate)}</small>
              </span>
              <small>{session.planNameSnapshot}</small>
            </button>
          ))}
        </div>
      ) : null}

      {state.status === "READY" && result?.openSessions.length === 0 ? (
        <p className="empty-state">Brak otwartych sesji zbioru.</p>
      ) : null}

      <ActiveHarvestSessionPanel view={result?.selectedSessionView ?? null} />
    </section>
  );
}

function OpenHarvestSessionForm({
  actorRole,
  configuration,
  configurationMessage,
  draft,
  error,
  existingOpenSessionsCount,
  feedback,
  isOnline,
  isSubmitting,
  onChange,
  onSubmit
}: {
  actorRole: "ADMIN" | "OPERATOR";
  configuration: OpenHarvestSessionConfigurationResult | null;
  configurationMessage: string;
  draft: OpenSessionDraft;
  error: string | null;
  existingOpenSessionsCount: number;
  feedback: string | null;
  isOnline: boolean;
  isSubmitting: boolean;
  onChange: (draft: OpenSessionDraft) => void;
  onSubmit: () => void;
}) {
  const workers = configuration?.workers ?? [];
  const seasons = configuration?.seasons ?? [];
  const isDisabled = isSubmitting || !configuration || !isOnline;
  const canSubmit = Boolean(draft.workerId && draft.seasonId && draft.businessDate);

  return (
    <form
      aria-label="Otwieranie sesji zbioru"
      className="open-session-form"
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit();
      }}
    >
      <label className="field">
        <span>Zbieracz</span>
        <select
          disabled={isDisabled || workers.length === 0}
          onChange={(event) => {
            onChange({
              ...draft,
              workerId: event.target.value,
              secondSessionReason: ""
            });
          }}
          value={draft.workerId}
        >
          {workers.length === 0 ? (
            <option value="">Brak aktywnych zbieraczy</option>
          ) : null}
          {workers.map((worker) => (
            <option key={worker.id} value={worker.id}>
              {worker.displayName}
            </option>
          ))}
        </select>
      </label>

      <label className="field">
        <span>Sezon</span>
        <select
          disabled={isDisabled || seasons.length === 0}
          onChange={(event) => {
            onChange({
              ...draft,
              seasonId: event.target.value,
              secondSessionReason: ""
            });
          }}
          value={draft.seasonId}
        >
          {seasons.length === 0 ? <option value="">Brak otwartych sezonow</option> : null}
          {seasons.map((season) => (
            <option key={season.id} value={season.id}>
              {season.name}
            </option>
          ))}
        </select>
      </label>

      <label className="field">
        <span>Data</span>
        <input
          disabled={isDisabled}
          onChange={(event) => {
            onChange({
              ...draft,
              businessDate: event.target.value,
              secondSessionReason: ""
            });
          }}
          type="date"
          value={draft.businessDate}
        />
      </label>

      <label className="field open-session-form__note">
        <span>Notatka</span>
        <input
          disabled={isDisabled}
          onChange={(event) => {
            onChange({
              ...draft,
              note: event.target.value
            });
          }}
          type="text"
          value={draft.note}
        />
      </label>

      {actorRole === "ADMIN" ? (
        <label className="field open-session-form__second-reason">
          <span>Powod drugiej sesji</span>
          <input
            disabled={isDisabled || existingOpenSessionsCount === 0}
            onChange={(event) => {
              onChange({
                ...draft,
                secondSessionReason: event.target.value
              });
            }}
            type="text"
            value={draft.secondSessionReason}
          />
        </label>
      ) : null}

      {existingOpenSessionsCount > 0 ? (
        <p className="open-session-form__warning">
          Istnieje otwarta sesja tej osoby dla wybranej daty.
        </p>
      ) : null}

      {feedback ? <p className="form-message form-message--ok">{feedback}</p> : null}
      {error ? <p className="form-message form-message--error">{error}</p> : null}
      {!configuration ? <p className="panel-detail">{configurationMessage}</p> : null}

      <button
        className="primary-action open-session-form__submit"
        disabled={isDisabled || !canSubmit}
        type="submit"
      >
        <Plus aria-hidden="true" size={18} strokeWidth={2.2} />
        <span>Otworz sesje</span>
      </button>
    </form>
  );
}

function getHarvestViewerProfile(
  authState: AuthSessionState
): HarvestViewerProfile | null {
  if (
    authState.status !== "READY" ||
    (authState.profile.role !== "ADMIN" && authState.profile.role !== "OPERATOR")
  ) {
    return null;
  }

  return authState.profile as HarvestViewerProfile;
}

function createInitialOpenSessionDraft(): OpenSessionDraft {
  return {
    workerId: "",
    seasonId: "",
    businessDate: currentBusinessDate(),
    note: "",
    secondSessionReason: ""
  };
}

function reconcileOpenSessionDraft(
  draft: OpenSessionDraft,
  configuration: OpenHarvestSessionConfigurationResult
): OpenSessionDraft {
  return {
    ...draft,
    workerId: configuration.workers.some((worker) => worker.id === draft.workerId)
      ? draft.workerId
      : (configuration.workers[0]?.id ?? ""),
    seasonId: configuration.seasons.some((season) => season.id === draft.seasonId)
      ? draft.seasonId
      : (selectDefaultOpenHarvestSeason(configuration)?.id ?? "")
  };
}

function currentBusinessDate(): string {
  return new Date().toISOString().slice(0, 10);
}

function getOpenSessionErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  return "Nie udalo sie otworzyc sesji zbioru.";
}
