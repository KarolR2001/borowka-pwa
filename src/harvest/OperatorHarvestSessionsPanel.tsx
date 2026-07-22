import { ClipboardList, RefreshCw, ShieldAlert } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import type { AuthSessionState } from "../auth/authSession";
import { formatBusinessDate } from "../domain/format";
import type { UserProfile } from "../domain/identity";
import { ActiveHarvestSessionPanel } from "./ActiveHarvestSessionPanel";
import {
  listOperatorHarvestSessionDashboard,
  type HarvestSessionDashboardResult,
  type OperatorHarvestSessionDashboardInput
} from "./harvestSessionDashboard";

type FirebaseEnv = Record<string, string | boolean | undefined>;

export type OperatorHarvestSessionsApi = {
  list: (
    env: FirebaseEnv,
    input: OperatorHarvestSessionDashboardInput
  ) => Promise<HarvestSessionDashboardResult>;
};

export const defaultOperatorHarvestSessionsApi: OperatorHarvestSessionsApi = {
  list: listOperatorHarvestSessionDashboard
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

const initialState: DashboardState = {
  status: "IDLE",
  result: null,
  message: "Sesje zbioru nie zostaly jeszcze pobrane."
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
  const [state, setState] = useState<DashboardState>(initialState);
  const viewerProfile = useMemo(() => getHarvestViewerProfile(authState), [authState]);

  useEffect(() => {
    let isMounted = true;

    if (!viewerProfile) {
      setState(initialState);
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

  const reload = () => {
    if (!viewerProfile) {
      return;
    }

    setState((current) => ({
      status: "LOADING",
      result: current.result,
      message: "Pobieranie sesji zbioru."
    }));

    void harvestSessionsApi
      .list(env, {
        actorProfile: viewerProfile,
        selectedSessionId: selectedSessionId ?? state.result?.selectedSessionId ?? null,
        isOnline
      })
      .then((result) => {
        setState({
          status: "READY",
          result,
          message: "Sesje zbioru sa aktualne."
        });
      })
      .catch(() => {
        setState((current) => ({
          status: "ERROR",
          result: current.result,
          message: "Nie udalo sie pobrac sesji zbioru."
        }));
      });
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
  const invalidDocumentsCount =
    (result?.invalidSessions.length ?? 0) +
    (result?.invalidEntries.length ?? 0) +
    (result?.invalidSeasons.length ?? 0);

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
          onClick={reload}
          type="button"
        >
          <RefreshCw aria-hidden="true" size={18} strokeWidth={2.2} />
          Odswiez
        </button>
      </div>

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

function getHarvestViewerProfile(authState: AuthSessionState): UserProfile | null {
  if (
    authState.status !== "READY" ||
    (authState.profile.role !== "ADMIN" && authState.profile.role !== "OPERATOR")
  ) {
    return null;
  }

  return authState.profile;
}
