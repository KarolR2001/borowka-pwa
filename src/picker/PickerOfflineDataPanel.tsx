import { CloudOff, Database, RefreshCw, ShieldCheck } from "lucide-react";
import { useEffect, useState } from "react";

import type { AuthSessionState } from "../auth/authSession";
import type { FirestoreCacheMode } from "../offline/firestorePersistencePreference";
import {
  enablePickerPersistentCache,
  preparePickerOfflineData,
  readPickerOfflineDataStatus,
  type PickerOfflineDataInput,
  type PickerOfflineDataStatus,
  type PickerOfflinePreparationResult
} from "./pickerOfflineData";

type FirebaseEnv = Record<string, string | boolean | undefined>;

export type PickerOfflineDataApi = {
  enablePersistence: (profile: PickerOfflineDataInput["actorProfile"]) => void;
  prepare: (
    env: FirebaseEnv,
    input: PickerOfflineDataInput
  ) => Promise<PickerOfflinePreparationResult>;
  read: (
    env: FirebaseEnv,
    input: PickerOfflineDataInput
  ) => Promise<PickerOfflineDataStatus>;
};

export const defaultPickerOfflineDataApi: PickerOfflineDataApi = {
  enablePersistence: enablePickerPersistentCache,
  prepare: preparePickerOfflineData,
  read: readPickerOfflineDataStatus
};

type PanelState =
  | { result: null; status: "LOADING" }
  | { result: PickerOfflineDataStatus; status: "READY" }
  | { result: null; status: "ERROR" };

export function PickerOfflineDataPanel({
  authState,
  cacheMode,
  deviceId,
  env,
  isOnline,
  offlineDataApi = defaultPickerOfflineDataApi
}: {
  authState: AuthSessionState;
  cacheMode: FirestoreCacheMode;
  deviceId: string;
  env: FirebaseEnv;
  isOnline: boolean;
  offlineDataApi?: PickerOfflineDataApi;
}) {
  const [state, setState] = useState<PanelState>({ result: null, status: "LOADING" });
  const [isPreparing, setIsPreparing] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const isPicker =
    authState.status === "READY" &&
    authState.profile.role === "PICKER" &&
    authState.profile.workerId !== null;

  useEffect(() => {
    let isMounted = true;

    if (!isPicker) {
      setState({ result: null, status: "ERROR" });
      return undefined;
    }

    setState({ result: null, status: "LOADING" });
    void offlineDataApi
      .read(env, {
        actorProfile: authState.profile,
        cacheMode,
        deviceId,
        isOnline
      })
      .then((result) => {
        if (isMounted) {
          setState({ result, status: "READY" });
        }
      })
      .catch(() => {
        if (isMounted) {
          setState({ result: null, status: "ERROR" });
        }
      });

    return () => {
      isMounted = false;
    };
  }, [authState, cacheMode, deviceId, env, isOnline, isPicker, offlineDataApi]);

  if (
    authState.status !== "READY" ||
    authState.profile.role !== "PICKER" ||
    authState.profile.workerId === null
  ) {
    return null;
  }

  const actorProfile = authState.profile;

  async function handlePrepare(): Promise<void> {
    setIsPreparing(true);
    setFeedback(null);

    try {
      if (result?.code === "PERSISTENT_CACHE_REQUIRED") {
        offlineDataApi.enablePersistence(actorProfile);
        setFeedback(
          "Trwaly cache zostal wlaczony. Uruchom ponownie PWA przed przygotowaniem danych."
        );
        return;
      }

      const prepared = await offlineDataApi.prepare(env, {
        actorProfile,
        cacheMode,
        deviceId,
        isOnline
      });
      setState({ result: prepared, status: "READY" });
      setFeedback(
        `Pobrano sesje: ${String(prepared.counts.sessions)}, wpisy: ${String(
          prepared.counts.entries
        )}, wyplaty: ${String(prepared.counts.payments)}.`
      );
    } catch (error: unknown) {
      setFeedback(
        error instanceof Error
          ? error.message
          : "Nie udalo sie przygotowac danych offline."
      );
    } finally {
      setIsPreparing(false);
    }
  }

  const result = state.result;
  const canPrepare =
    state.status === "READY" &&
    isOnline &&
    result?.code !== "CONSENT_REQUIRED" &&
    result?.code !== "UNTRUSTED_DEVICE" &&
    !isPreparing;

  return (
    <section
      aria-label="Gotowosc danych pickera offline"
      className="picker-offline-status"
    >
      <div className="picker-offline-status__main">
        {isOnline ? (
          <Database aria-hidden="true" size={20} />
        ) : (
          <CloudOff aria-hidden="true" size={20} />
        )}
        <div>
          <strong>{statusTitle(state, isOnline)}</strong>
          <span>{statusDetail(state)}</span>
        </div>
      </div>
      {isOnline ? (
        <button
          className="secondary-button"
          disabled={!canPrepare}
          onClick={() => {
            void handlePrepare();
          }}
          type="button"
        >
          {result?.code === "READY" ? (
            <RefreshCw aria-hidden="true" size={18} />
          ) : (
            <ShieldCheck aria-hidden="true" size={18} />
          )}
          {isPreparing
            ? "Przygotowywanie"
            : result?.code === "READY"
              ? "Odswiez dane offline"
              : result?.code === "PERSISTENT_CACHE_REQUIRED"
                ? "Wlacz trwaly cache"
                : "Przygotuj dane offline"}
        </button>
      ) : null}
      {!isOnline ? (
        <p className="picker-offline-status__warning">
          Dane sa kopia z ostatniej synchronizacji i nie gwarantuja aktualnosci. Najnowsze
          wyplaty i odpowiedzi mogly nie zostac pobrane.
        </p>
      ) : null}
      {feedback ? (
        <p aria-live="polite" className="picker-offline-status__feedback">
          {feedback}
        </p>
      ) : null}
    </section>
  );
}

function statusTitle(state: PanelState, isOnline: boolean): string {
  if (state.status === "LOADING") {
    return "Sprawdzanie danych offline";
  }

  if (state.status === "ERROR") {
    return "Stan danych offline jest niedostepny";
  }

  if (!isOnline) {
    return state.result.code === "READY"
      ? "Tryb offline"
      : "Brak potwierdzonego przygotowania offline";
  }

  switch (state.result.code) {
    case "READY":
      return "Dane offline przygotowane";
    case "NOT_PREPARED":
      return "Dane offline nieprzygotowane";
    case "CONSENT_REQUIRED":
      return "Brak zgody na dane offline";
    case "PERSISTENT_CACHE_REQUIRED":
      return "Trwaly cache wymaga ponownego uruchomienia";
    case "UNTRUSTED_DEVICE":
      return "Urzadzenie nie jest zaufane";
  }
}

function statusDetail(state: PanelState): string {
  if (state.status !== "READY") {
    return "Ostatnia synchronizacja: brak danych";
  }

  return state.result.lastSuccessfulSyncIso
    ? `Ostatnia synchronizacja: ${formatSyncTime(state.result.lastSuccessfulSyncIso)}`
    : "Ostatnia synchronizacja: brak";
}

function formatSyncTime(value: string): string {
  return new Intl.DateTimeFormat("pl-PL", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "Europe/Warsaw"
  }).format(new Date(value));
}
