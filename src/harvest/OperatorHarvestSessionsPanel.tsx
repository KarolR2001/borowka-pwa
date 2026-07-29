import {
  Ban,
  ClipboardList,
  Plus,
  RefreshCw,
  RotateCcw,
  ShieldAlert,
  X
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import type { AuthSessionState } from "../auth/authSession";
import { getOrCreateDeviceId } from "../domain/device";
import { formatBusinessDate, formatMoney } from "../domain/format";
import type { UserProfile } from "../domain/identity";
import type { FirestoreCacheMode } from "../offline/firestorePersistencePreference";
import {
  addHarvestEntryOffline,
  closeHarvestSessionOffline,
  openHarvestSessionOffline
} from "../offline/offlineHarvestFirestoreRuntime";
import {
  ActiveHarvestSessionPanel,
  type ActiveHarvestSessionEntryItem
} from "./ActiveHarvestSessionPanel";
import {
  cancelHarvestSessionOnline,
  type CancelHarvestSessionOnlineInput,
  type CancelHarvestSessionOnlineResult
} from "./cancelHarvestSessionRuntime";
import {
  cancelHarvestEntryOnline,
  type CancelHarvestEntryOnlineInput,
  type CancelHarvestEntryOnlineResult
} from "./cancelHarvestEntryRuntime";
import {
  closeHarvestSessionOnline,
  type CloseHarvestSessionOnlineInput,
  type CloseHarvestSessionOnlineResult
} from "./closeHarvestSessionRuntime";
import { GenericQuantityEntryForm } from "./GenericQuantityEntryForm";
import {
  addHarvestEntryOnline,
  nextHarvestEntrySequenceNumber,
  type AddHarvestEntryOnlineInput,
  type AddHarvestEntryOnlineResult
} from "./harvestEntryRuntime";
import {
  reserveHarvestEntryIdentity,
  type HarvestEntryIdentity
} from "./harvestEntryIdempotency";
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
import type { HarvestSessionDocument } from "./openHarvestSession";
import {
  reopenHarvestSessionOnline,
  type ReopenHarvestSessionOnlineInput,
  type ReopenHarvestSessionOnlineResult
} from "./reopenHarvestSessionRuntime";
import { UbiankaEntryForm } from "./UbiankaEntryForm";
import { WeightEntryForm } from "./WeightEntryForm";

type FirebaseEnv = Record<string, string | boolean | undefined>;

export type OperatorHarvestSessionsApi = {
  list: (
    env: FirebaseEnv,
    input: OperatorHarvestSessionDashboardInput
  ) => Promise<HarvestSessionDashboardResult>;
  listOpeningConfiguration: (
    env: FirebaseEnv,
    input: { actorProfile: UserProfile; isOnline?: boolean }
  ) => Promise<OpenHarvestSessionConfigurationResult>;
  open: (
    env: FirebaseEnv,
    input: OpenHarvestSessionOnlineInput
  ) => Promise<OpenHarvestSessionOnlineResult>;
  addEntry: (
    env: FirebaseEnv,
    input: AddHarvestEntryOnlineInput
  ) => Promise<AddHarvestEntryOnlineResult>;
  cancelEntry: (
    env: FirebaseEnv,
    input: CancelHarvestEntryOnlineInput
  ) => Promise<CancelHarvestEntryOnlineResult>;
  close: (
    env: FirebaseEnv,
    input: CloseHarvestSessionOnlineInput
  ) => Promise<CloseHarvestSessionOnlineResult>;
  reopen: (
    env: FirebaseEnv,
    input: ReopenHarvestSessionOnlineInput
  ) => Promise<ReopenHarvestSessionOnlineResult>;
  cancel: (
    env: FirebaseEnv,
    input: CancelHarvestSessionOnlineInput
  ) => Promise<CancelHarvestSessionOnlineResult>;
};

export const defaultOperatorHarvestSessionsApi: OperatorHarvestSessionsApi = {
  list: listOperatorHarvestSessionDashboard,
  listOpeningConfiguration: listOpenHarvestSessionConfiguration,
  open: (env, input) =>
    input.isOnline
      ? openHarvestSessionOnline(env, input)
      : openHarvestSessionOffline(env, input),
  addEntry: (env, input) =>
    input.isOnline
      ? addHarvestEntryOnline(env, input)
      : addHarvestEntryOffline(env, input),
  cancelEntry: cancelHarvestEntryOnline,
  close: (env, input) =>
    input.isOnline
      ? closeHarvestSessionOnline(env, input)
      : closeHarvestSessionOffline(env, input),
  reopen: reopenHarvestSessionOnline,
  cancel: cancelHarvestSessionOnline
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

type AddEntryDraft = {
  quantityMilli: number;
  weightG: number | null;
};

type PendingEntryAttempt = AddEntryDraft & {
  identity: HarvestEntryIdentity;
  sessionId: string;
};

type CancelEntryDraft = {
  entryId: string;
  reason: string;
};

type ReopenSessionDraft = {
  sessionId: string;
  reason: string;
};

type CancelSessionDraft = {
  sessionId: string;
  reason: string;
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
  firestoreCacheMode = "PERSISTENT",
  isOnline,
  onActiveFormChange,
  onActiveHarvestSessionChange,
  onLocalDocumentsChanged,
  serviceWorkerReady = true
}: {
  authState: AuthSessionState;
  env: FirebaseEnv;
  harvestSessionsApi?: OperatorHarvestSessionsApi;
  firestoreCacheMode?: FirestoreCacheMode;
  isOnline: boolean;
  serviceWorkerReady?: boolean;
  onActiveFormChange?: (isActive: boolean) => void;
  onActiveHarvestSessionChange?: (isActive: boolean) => void;
  onLocalDocumentsChanged?: () => Promise<void>;
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
  const [reopenDraft, setReopenDraft] = useState<ReopenSessionDraft>({
    sessionId: "",
    reason: ""
  });
  const [cancelDraft, setCancelDraft] = useState<CancelSessionDraft>({
    sessionId: "",
    reason: ""
  });
  const [cancelEntryDraft, setCancelEntryDraft] = useState<CancelEntryDraft>({
    entryId: "",
    reason: ""
  });
  const [sessionFeedback, setSessionFeedback] = useState<string | null>(null);
  const [sessionError, setSessionError] = useState<string | null>(null);
  const [isOpeningSession, setIsOpeningSession] = useState(false);
  const [isEntryFormOpen, setIsEntryFormOpen] = useState(false);
  const [isClosingSession, setIsClosingSession] = useState(false);
  const [isCancellingEntry, setIsCancellingEntry] = useState(false);
  const [isReopeningSession, setIsReopeningSession] = useState(false);
  const [isCancellingSession, setIsCancellingSession] = useState(false);
  const [hasUnsavedFormInteraction, setHasUnsavedFormInteraction] = useState(false);
  const pendingEntryAttemptRef = useRef<PendingEntryAttempt | null>(null);
  const viewerProfile = useMemo(() => getHarvestViewerProfile(authState), [authState]);
  const hasActiveForm =
    hasUnsavedFormInteraction ||
    isEntryFormOpen ||
    isOpeningSession ||
    isClosingSession ||
    isCancellingEntry ||
    isReopeningSession ||
    isCancellingSession;
  const hasActiveHarvestSession = (state.result?.openSessions.length ?? 0) > 0;

  useEffect(() => {
    onActiveHarvestSessionChange?.(hasActiveHarvestSession);
  }, [hasActiveHarvestSession, onActiveHarvestSessionChange]);

  useEffect(() => {
    onActiveFormChange?.(hasActiveForm);

    return () => {
      onActiveFormChange?.(false);
    };
  }, [hasActiveForm, onActiveFormChange]);

  useEffect(() => {
    let isMounted = true;

    if (!viewerProfile) {
      setState(initialDashboardState);
      setSelectedSessionId(null);
      setReopenDraft({ sessionId: "", reason: "" });
      setCancelDraft({ sessionId: "", reason: "" });
      setCancelEntryDraft({ entryId: "", reason: "" });
      setSessionFeedback(null);
      setSessionError(null);
      setHasUnsavedFormInteraction(false);
      pendingEntryAttemptRef.current = null;
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
      setIsEntryFormOpen(false);
      return undefined;
    }

    setOpeningConfigurationState((current) => ({
      status: "LOADING",
      result: current.result,
      message: "Pobieranie konfiguracji otwarcia sesji."
    }));

    void harvestSessionsApi
      .listOpeningConfiguration(env, {
        actorProfile: viewerProfile,
        isOnline
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
  }, [env, harvestSessionsApi, isOnline, viewerProfile]);

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
        actorProfile: viewerProfile,
        isOnline
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
        createdDeviceId: getOrCreateDeviceId(),
        persistentDataCacheReady: firestoreCacheMode === "PERSISTENT",
        serviceWorkerReady
      });

      setOpenFeedback(result.message);
      setHasUnsavedFormInteraction(false);
      setOpenDraft((current) => ({
        ...current,
        note: "",
        secondSessionReason: ""
      }));

      await onLocalDocumentsChanged?.();
      await reload(result.selectedSessionId);
      await reloadOpeningConfiguration();
    } catch (error: unknown) {
      setOpenError(getOpenSessionErrorMessage(error));
    } finally {
      setIsOpeningSession(false);
    }
  };

  const handleAddEntry = async (draft: AddEntryDraft) => {
    if (!viewerProfile) {
      throw new Error("Dodanie wpisu wymaga zalogowanego operatora.");
    }

    const selectedSessionId = state.result?.selectedSessionId;

    if (!selectedSessionId) {
      throw new Error("Wybierz otwarta sesje przed dodaniem wpisu.");
    }

    const currentAttempt = pendingEntryAttemptRef.current;
    const currentAttemptMatches =
      currentAttempt?.sessionId === selectedSessionId &&
      currentAttempt.quantityMilli === draft.quantityMilli &&
      currentAttempt.weightG === draft.weightG;
    const attempt = currentAttemptMatches
      ? currentAttempt
      : {
          ...draft,
          sessionId: selectedSessionId,
          identity: reserveHarvestEntryIdentity({
            nextSequenceNumber: nextHarvestEntrySequenceNumber(
              state.result?.selectedSessionView?.entries ?? []
            )
          })
        };

    pendingEntryAttemptRef.current = attempt;

    const result = await harvestSessionsApi.addEntry(env, {
      actorProfile: viewerProfile,
      sessionId: selectedSessionId,
      quantityMilli: draft.quantityMilli,
      weightG: draft.weightG,
      isOnline,
      createdDeviceId: getOrCreateDeviceId(),
      identity: attempt.identity
    });

    await onLocalDocumentsChanged?.();
    await reload(result.selectedSessionId);
    pendingEntryAttemptRef.current = null;
  };

  const handleCancelEntry = async () => {
    if (viewerProfile?.role !== "ADMIN") {
      return;
    }

    if (isCancellingEntry) {
      return;
    }

    const selectedSession = state.result?.selectedSessionView?.session ?? null;
    const selectedEntry =
      state.result?.selectedSessionView?.entries.find(
        (entry) => entry.id === cancelEntryDraft.entryId
      ) ?? null;

    setSessionFeedback(null);
    setSessionError(null);

    if (!selectedSession || !selectedEntry) {
      setSessionError("Wybierz wpis przed anulowaniem.");
      return;
    }

    if (!isOnline) {
      setSessionError("Anulowanie wpisu wymaga polaczenia online.");
      return;
    }

    const confirmed = window.confirm(
      `Anulowac wpis #${String(selectedEntry.sequenceNumber)} w sesji ${
        selectedSession.workerNameSnapshot
      }?`
    );

    if (!confirmed) {
      return;
    }

    setIsCancellingEntry(true);

    try {
      const result = await harvestSessionsApi.cancelEntry(env, {
        actorProfile: viewerProfile,
        sessionId: selectedSession.id,
        entryId: selectedEntry.id,
        reason: cancelEntryDraft.reason,
        isOnline,
        deviceId: getOrCreateDeviceId()
      });

      setSessionFeedback(result.message);
      setHasUnsavedFormInteraction(false);
      setCancelEntryDraft({
        entryId: "",
        reason: ""
      });
      await reload(result.selectedSessionId);
    } catch (error: unknown) {
      setSessionError(getSessionOperationErrorMessage(error));
    } finally {
      setIsCancellingEntry(false);
    }
  };

  const handleCloseSession = async () => {
    if (!viewerProfile) {
      return;
    }

    if (isClosingSession) {
      return;
    }

    const selectedSession = state.result?.selectedSessionView?.session ?? null;

    setSessionFeedback(null);
    setSessionError(null);

    if (!selectedSession) {
      setSessionError("Wybierz otwarta sesje przed zamknieciem.");
      return;
    }

    const confirmed = window.confirm(
      `Zamknac sesje ${selectedSession.workerNameSnapshot} z dnia ${formatBusinessDate(
        selectedSession.businessDate
      )}?`
    );

    if (!confirmed) {
      return;
    }

    setIsClosingSession(true);

    try {
      const result = await harvestSessionsApi.close(env, {
        actorProfile: viewerProfile,
        sessionId: selectedSession.id,
        confirmationAccepted: true,
        isOnline,
        deviceId: getOrCreateDeviceId()
      });

      setSessionFeedback(result.message);
      setHasUnsavedFormInteraction(false);
      setIsEntryFormOpen(false);
      setSelectedSessionId(result.selectedSessionId);
      await onLocalDocumentsChanged?.();
      await reload(result.selectedSessionId);
      await reloadOpeningConfiguration();
    } catch (error: unknown) {
      setSessionError(getSessionOperationErrorMessage(error));
    } finally {
      setIsClosingSession(false);
    }
  };

  const handleReopenSession = async () => {
    if (viewerProfile?.role !== "ADMIN") {
      return;
    }

    if (isReopeningSession) {
      return;
    }

    const closedSessions = state.result?.closedSessions ?? [];
    const selectedClosedSession =
      closedSessions.find((session) => session.id === reopenDraft.sessionId) ??
      closedSessions.at(0) ??
      null;

    setSessionFeedback(null);
    setSessionError(null);

    if (!selectedClosedSession) {
      setSessionError("Wybierz zamknieta sesje przed ponownym otwarciem.");
      return;
    }

    if (!isOnline) {
      setSessionError("Ponowne otwarcie sesji wymaga polaczenia online.");
      return;
    }

    const confirmed = window.confirm(
      `Ponownie otworzyc sesje ${selectedClosedSession.workerNameSnapshot} z dnia ${formatBusinessDate(
        selectedClosedSession.businessDate
      )}?`
    );

    if (!confirmed) {
      return;
    }

    setIsReopeningSession(true);

    try {
      const result = await harvestSessionsApi.reopen(env, {
        actorProfile: viewerProfile,
        sessionId: selectedClosedSession.id,
        reason: reopenDraft.reason,
        hasActivePayment: selectedClosedSession.paymentId !== null,
        isOnline,
        deviceId: getOrCreateDeviceId()
      });

      setSessionFeedback(result.message);
      setReopenDraft({
        sessionId: "",
        reason: ""
      });
      setSelectedSessionId(result.selectedSessionId);
      await reload(result.selectedSessionId);
      await reloadOpeningConfiguration();
    } catch (error: unknown) {
      setSessionError(getSessionOperationErrorMessage(error));
    } finally {
      setIsReopeningSession(false);
    }
  };

  const handleCancelSession = async () => {
    if (viewerProfile?.role !== "ADMIN") {
      return;
    }

    if (isCancellingSession) {
      return;
    }

    const cancellableSessions = [
      ...(state.result?.openSessions ?? []),
      ...(state.result?.closedSessions ?? [])
    ];
    const selectedCancelSession =
      cancellableSessions.find((session) => session.id === cancelDraft.sessionId) ??
      cancellableSessions.at(0) ??
      null;

    setSessionFeedback(null);
    setSessionError(null);

    if (!selectedCancelSession) {
      setSessionError("Wybierz sesje przed anulowaniem.");
      return;
    }

    if (!isOnline) {
      setSessionError("Anulowanie sesji wymaga polaczenia online.");
      return;
    }

    const confirmed = window.confirm(
      `Anulowac sesje ${selectedCancelSession.workerNameSnapshot} z dnia ${formatBusinessDate(
        selectedCancelSession.businessDate
      )}?`
    );

    if (!confirmed) {
      return;
    }

    setIsCancellingSession(true);

    try {
      const result = await harvestSessionsApi.cancel(env, {
        actorProfile: viewerProfile,
        sessionId: selectedCancelSession.id,
        reason: cancelDraft.reason,
        hasActivePayment: selectedCancelSession.paymentId !== null,
        isOnline,
        deviceId: getOrCreateDeviceId()
      });

      setSessionFeedback(result.message);
      setCancelDraft({
        sessionId: "",
        reason: ""
      });
      setIsEntryFormOpen(false);
      setSelectedSessionId(result.selectedSessionId);
      await reload(result.selectedSessionId);
      await reloadOpeningConfiguration();
    } catch (error: unknown) {
      setSessionError(getSessionOperationErrorMessage(error));
    } finally {
      setIsCancellingSession(false);
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
  const selectedSessionView = result?.selectedSessionView ?? null;
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
  const reopenSession =
    result?.closedSessions.find((session) => session.id === reopenDraft.sessionId) ??
    result?.closedSessions.at(0) ??
    null;
  const cancellableSessions = [
    ...(result?.openSessions ?? []),
    ...(result?.closedSessions ?? [])
  ];
  const cancelSession =
    cancellableSessions.find((session) => session.id === cancelDraft.sessionId) ??
    cancellableSessions.at(0) ??
    null;

  return (
    <section
      className="operator-sessions"
      aria-label="Sesje zbioru operatora"
      onChange={() => {
        setHasUnsavedFormInteraction(true);
      }}
    >
      <div className="directory-header">
        <div>
          <p className="eyebrow">{isOnline ? "Sesje online" : "Sesje offline"}</p>
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
                setIsEntryFormOpen(false);
                setCancelEntryDraft({ entryId: "", reason: "" });
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

      <div
        className="operator-sessions__new-session"
        id="new-harvest-session"
        tabIndex={-1}
      >
        <OpenHarvestSessionForm
          actorRole={viewerProfile.role}
          configuration={openingConfiguration}
          configurationMessage={openingConfigurationState.message}
          draft={openDraft}
          error={openError}
          existingOpenSessionsCount={existingOpenSessionsForDraft.length}
          feedback={openFeedback}
          isSubmitting={isOpeningSession}
          onChange={setOpenDraft}
          onSubmit={() => {
            void handleOpenSession();
          }}
        />
      </div>

      <ActiveHarvestSessionPanel
        onAddEntry={() => {
          setIsEntryFormOpen((current) => !current);
        }}
        onCancelEntry={(entryId) => {
          setCancelEntryDraft((current) => ({
            entryId,
            reason: current.entryId === entryId ? current.reason : ""
          }));
          setSessionFeedback(null);
          setSessionError(null);
        }}
        onCloseSession={() => {
          void handleCloseSession();
        }}
        view={selectedSessionView}
      />

      {sessionFeedback ? (
        <p className="form-message form-message--ok">{sessionFeedback}</p>
      ) : null}
      {sessionError ? (
        <p className="form-message form-message--error">{sessionError}</p>
      ) : null}
      {isClosingSession ? <p className="panel-detail">Zamykanie sesji.</p> : null}
      {isCancellingEntry ? <p className="panel-detail">Anulowanie wpisu.</p> : null}
      {isReopeningSession ? (
        <p className="panel-detail">Ponowne otwieranie sesji.</p>
      ) : null}
      {isCancellingSession ? <p className="panel-detail">Anulowanie sesji.</p> : null}

      {viewerProfile.role === "ADMIN" &&
      selectedSessionView &&
      cancelEntryDraft.entryId ? (
        <AdminCancelHarvestEntryForm
          draft={cancelEntryDraft}
          entries={selectedSessionView.entries}
          isOnline={isOnline}
          isSubmitting={isCancellingEntry}
          onChange={setCancelEntryDraft}
          onDismiss={() => {
            setCancelEntryDraft({ entryId: "", reason: "" });
          }}
          onSubmit={() => {
            void handleCancelEntry();
          }}
        />
      ) : null}

      {isEntryFormOpen && selectedSessionView?.canAddEntry ? (
        <section
          aria-label="Dodawanie wpisu zbioru"
          className="operator-sessions__entry-form"
        >
          <HarvestEntryForm
            disabled={false}
            onSubmit={handleAddEntry}
            session={selectedSessionView.session}
            lastQuantityMilli={findLastActiveQuantity(selectedSessionView.entries)}
          />
        </section>
      ) : null}

      {viewerProfile.role === "ADMIN" ? (
        <>
          <AdminReopenHarvestSessionForm
            draft={{
              sessionId: reopenSession?.id ?? "",
              reason: reopenDraft.reason
            }}
            isOnline={isOnline}
            isSubmitting={isReopeningSession}
            onChange={setReopenDraft}
            onSubmit={() => {
              void handleReopenSession();
            }}
            session={reopenSession}
            sessions={result?.closedSessions ?? []}
          />
          <AdminCancelHarvestSessionForm
            draft={{
              sessionId: cancelSession?.id ?? "",
              reason: cancelDraft.reason
            }}
            isOnline={isOnline}
            isSubmitting={isCancellingSession}
            onChange={setCancelDraft}
            onSubmit={() => {
              void handleCancelSession();
            }}
            session={cancelSession}
            sessions={cancellableSessions}
          />
        </>
      ) : null}
    </section>
  );
}

function AdminReopenHarvestSessionForm({
  draft,
  isOnline,
  isSubmitting,
  onChange,
  onSubmit,
  session,
  sessions
}: {
  draft: ReopenSessionDraft;
  isOnline: boolean;
  isSubmitting: boolean;
  onChange: (draft: ReopenSessionDraft) => void;
  onSubmit: () => void;
  session: HarvestSessionDocument | null;
  sessions: readonly HarvestSessionDocument[];
}) {
  const isDisabled = isSubmitting || !isOnline || sessions.length === 0;
  const canSubmit = Boolean(session && draft.reason.trim().length >= 3);

  return (
    <form
      aria-label="Ponowne otwarcie sesji zbioru"
      className="open-session-form"
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit();
      }}
    >
      <label className="field">
        <span>Zamknieta sesja</span>
        <select
          disabled={isDisabled}
          onChange={(event) => {
            onChange({
              ...draft,
              sessionId: event.target.value
            });
          }}
          value={draft.sessionId}
        >
          {sessions.length === 0 ? (
            <option value="">Brak zamknietych sesji do korekty</option>
          ) : null}
          {sessions.map((candidate) => (
            <option key={candidate.id} value={candidate.id}>
              {candidate.workerNameSnapshot} ·{" "}
              {formatBusinessDate(candidate.businessDate)}
            </option>
          ))}
        </select>
      </label>

      <label className="field open-session-form__note">
        <span>Powod ponownego otwarcia</span>
        <input
          disabled={isDisabled}
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

      {session ? (
        <p className="open-session-form__warning">
          Dotychczasowa kwota: {formatMoney(session.amountDueGrosz ?? 0)}. Raporty moga
          sie zmienic po kolejnych wpisach i zamknieciu.
        </p>
      ) : null}

      <button
        className="secondary-action open-session-form__submit"
        disabled={isDisabled || !canSubmit}
        type="submit"
      >
        <RotateCcw aria-hidden="true" size={18} strokeWidth={2.2} />
        <span>Otworz ponownie</span>
      </button>
    </form>
  );
}

function AdminCancelHarvestSessionForm({
  draft,
  isOnline,
  isSubmitting,
  onChange,
  onSubmit,
  session,
  sessions
}: {
  draft: CancelSessionDraft;
  isOnline: boolean;
  isSubmitting: boolean;
  onChange: (draft: CancelSessionDraft) => void;
  onSubmit: () => void;
  session: HarvestSessionDocument | null;
  sessions: readonly HarvestSessionDocument[];
}) {
  const isDisabled = isSubmitting || !isOnline || sessions.length === 0;
  const canSubmit = Boolean(session && draft.reason.trim().length >= 3);

  return (
    <form
      aria-label="Anulowanie sesji zbioru"
      className="open-session-form"
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit();
      }}
    >
      <label className="field">
        <span>Sesja do anulowania</span>
        <select
          disabled={isDisabled}
          onChange={(event) => {
            onChange({
              ...draft,
              sessionId: event.target.value
            });
          }}
          value={draft.sessionId}
        >
          {sessions.length === 0 ? (
            <option value="">Brak sesji do anulowania</option>
          ) : null}
          {sessions.map((candidate) => (
            <option key={candidate.id} value={candidate.id}>
              {candidate.workerNameSnapshot} ·{" "}
              {formatBusinessDate(candidate.businessDate)} ·{" "}
              {candidate.status === "OPEN" ? "otwarta" : "zamknieta"}
            </option>
          ))}
        </select>
      </label>

      <label className="field open-session-form__note">
        <span>Powod anulowania</span>
        <input
          disabled={isDisabled}
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

      {session ? (
        <p className="open-session-form__warning">
          Wpisy pozostana historyczne. Sesja zostanie usunieta z sum rozliczen.
        </p>
      ) : null}

      <button
        className="secondary-action open-session-form__submit"
        disabled={isDisabled || !canSubmit}
        type="submit"
      >
        <Ban aria-hidden="true" size={18} strokeWidth={2.2} />
        <span>Anuluj sesje</span>
      </button>
    </form>
  );
}

function AdminCancelHarvestEntryForm({
  draft,
  entries,
  isOnline,
  isSubmitting,
  onChange,
  onDismiss,
  onSubmit
}: {
  draft: CancelEntryDraft;
  entries: readonly ActiveHarvestSessionEntryItem[];
  isOnline: boolean;
  isSubmitting: boolean;
  onChange: (draft: CancelEntryDraft) => void;
  onDismiss: () => void;
  onSubmit: () => void;
}) {
  const entry = entries.find((candidate) => candidate.id === draft.entryId) ?? null;
  const isDisabled = isSubmitting || !isOnline || !entry;
  const canSubmit = Boolean(entry && draft.reason.trim().length >= 3);

  return (
    <form
      aria-label="Anulowanie wpisu zbioru"
      className="open-session-form"
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit();
      }}
    >
      <div>
        <p className="eyebrow">Korekta wpisu</p>
        <h4>{entry ? `Wpis #${String(entry.sequenceNumber)}` : "Wpis"}</h4>
        <p className="panel-detail">
          Anulowany wpis zostanie w historii i nie bedzie liczony w sumach.
        </p>
      </div>

      <label className="field open-session-form__note">
        <span>Powod anulowania wpisu</span>
        <input
          disabled={isDisabled}
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

      <div className="open-session-form__actions">
        <button
          className="secondary-action open-session-form__submit"
          disabled={isSubmitting}
          onClick={onDismiss}
          type="button"
        >
          <X aria-hidden="true" size={18} strokeWidth={2.2} />
          <span>Zamknij</span>
        </button>
        <button
          className="secondary-action open-session-form__submit"
          disabled={isDisabled || !canSubmit}
          type="submit"
        >
          <Ban aria-hidden="true" size={18} strokeWidth={2.2} />
          <span>Anuluj wpis</span>
        </button>
      </div>
    </form>
  );
}

function HarvestEntryForm({
  disabled,
  lastQuantityMilli,
  onSubmit,
  session
}: {
  disabled: boolean;
  lastQuantityMilli: number | null;
  onSubmit: (draft: AddEntryDraft) => void | Promise<void>;
  session: HarvestSessionDocument;
}) {
  if (session.calculationBasisSnapshot === "WEIGHT") {
    return (
      <WeightEntryForm
        disabled={disabled}
        onSubmit={onSubmit}
        rateGroszPerKg={session.rateGroszSnapshot}
      />
    );
  }

  if (isUbiankaSession(session)) {
    return (
      <UbiankaEntryForm
        allowBatchQuantity={session.allowBatchQuantitySnapshot}
        disabled={disabled}
        lastQuantityMilli={lastQuantityMilli}
        onSubmit={onSubmit}
        unitLabel={session.unitLabelSnapshot}
        weightRequired={session.weightRequiredSnapshot}
      />
    );
  }

  return (
    <GenericQuantityEntryForm
      disabled={disabled}
      onSubmit={onSubmit}
      plan={{
        name: session.planNameSnapshot,
        unitLabelSingular: session.unitLabelSnapshot,
        unitLabelPlural: session.unitLabelPluralSnapshot,
        quantityPrecision: session.quantityPrecisionSnapshot,
        weightRequired: session.weightRequiredSnapshot,
        allowBatchQuantity: session.allowBatchQuantitySnapshot,
        description: null,
        rateGroszPerUnit: session.rateGroszSnapshot
      }}
    />
  );
}

function isUbiankaSession(session: HarvestSessionDocument): boolean {
  return session.unitLabelSnapshot.toLocaleLowerCase("pl").includes("ubiank");
}

function findLastActiveQuantity(
  entries: readonly {
    status: "ACTIVE" | "CANCELLED";
    sequenceNumber: number;
    quantityMilli: number;
  }[]
): number | null {
  const latest = entries
    .filter((entry) => entry.status === "ACTIVE")
    .sort((left, right) => right.sequenceNumber - left.sequenceNumber)
    .at(0);

  return latest?.quantityMilli ?? null;
}

function OpenHarvestSessionForm({
  actorRole,
  configuration,
  configurationMessage,
  draft,
  error,
  existingOpenSessionsCount,
  feedback,
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
  isSubmitting: boolean;
  onChange: (draft: OpenSessionDraft) => void;
  onSubmit: () => void;
}) {
  const workers = configuration?.workers ?? [];
  const seasons = configuration?.seasons ?? [];
  const isDisabled = isSubmitting || !configuration;
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

function getSessionOperationErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  return "Nie udalo sie wykonac operacji na sesji zbioru.";
}
