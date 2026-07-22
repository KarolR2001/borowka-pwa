import type { AppProps, AuthSessionApi, DeviceRegistryApi } from "../app/App";
import type { AuthSessionListener, AuthSessionState } from "../auth/authSession";
import {
  createInitialDomainSeed,
  type WorkerRateVersionDocument
} from "../domain/domainConfiguration";
import type { UserProfile } from "../domain/identity";
import type { WorkerDirectoryApi } from "../workers/WorkerDirectoryPanel";
import {
  buildHarvestSessionDashboard,
  type HarvestEntryDocument
} from "../harvest/harvestSessionDashboard";
import type { OperatorHarvestSessionsApi } from "../harvest/OperatorHarvestSessionsPanel";
import {
  buildOpenHarvestSessionConfiguration,
  prepareRuntimeOpenHarvestSession
} from "../harvest/openHarvestSessionRuntime";
import type { HarvestSessionDocument } from "../harvest/openHarvestSession";
import {
  nextHarvestEntrySequenceNumber,
  prepareHarvestEntryDocument
} from "../harvest/harvestEntryRuntime";
import { prepareRuntimeCloseHarvestSession } from "../harvest/closeHarvestSessionRuntime";
import { prepareRuntimeReopenHarvestSession } from "../harvest/reopenHarvestSessionRuntime";
import { prepareRuntimeCancelHarvestSession } from "../harvest/cancelHarvestSessionRuntime";
import { prepareRuntimeCancelHarvestEntry } from "../harvest/cancelHarvestEntryRuntime";

type FirebaseEnv = Record<string, string | boolean | undefined>;

const CREATED_AT = "2026-07-17T08:00:00.000Z";
const SERVER_TIME = "2026-07-17T09:00:00.000Z";
const OPERATOR_EMAIL = "operator.e2e@example.test";
const ADMIN_EMAIL = "admin.e2e@example.test";
const E2E_PASSWORD = "test12345";

export function createHarvestE2eAppProps(): AppProps {
  const harness = createHarvestHarnessState();

  return {
    authSessionApi: harness.authSessionApi,
    deviceRegistryApi: harness.deviceRegistryApi,
    harvestSessionsApi: harness.harvestSessionsApi,
    workerDirectoryApi: harness.workerDirectoryApi
  };
}

function createHarvestHarnessState() {
  const seed = createInitialDomainSeed({ createdAt: CREATED_AT });
  const operatorProfile = createProfile({
    uid: "operator-e2e",
    email: OPERATOR_EMAIL,
    displayName: "Operator E2E",
    role: "OPERATOR"
  });
  const adminProfile = createProfile({
    uid: "admin-e2e",
    email: ADMIN_EMAIL,
    displayName: "Admin E2E",
    role: "ADMIN"
  });
  const profilesByEmail = new Map(
    [operatorProfile, adminProfile].map((profile) => [profile.email, profile])
  );
  const listeners = new Set<AuthSessionListener>();
  let authState: AuthSessionState = signedOutState();
  let sessionCounter = 1;
  let entryCounter = 1;
  let auditCounter = 1;
  let sessions: HarvestSessionDocument[] = [];
  let entries: HarvestEntryDocument[] = [];

  const emitAuthState = (nextState: AuthSessionState) => {
    authState = nextState;
    listeners.forEach((listener) => {
      listener(nextState);
    });
  };

  const sessionDocuments = (actorProfile: UserProfile) => {
    const visibleSessions =
      actorProfile.role === "ADMIN"
        ? sessions.filter(
            (session) => session.status === "OPEN" || session.status === "CLOSED"
          )
        : sessions.filter((session) => session.status === "OPEN");

    return visibleSessions.map(toDashboardDocument);
  };

  const entriesForSession = (sessionId: string) =>
    entries.filter((entry) => entry.sessionId === sessionId);

  const replaceSession = (nextSession: HarvestSessionDocument) => {
    sessions = sessions.map((session) =>
      session.id === nextSession.id ? nextSession : session
    );
  };

  const findSession = (sessionId: string) => {
    const session = sessions.find((candidate) => candidate.id === sessionId);

    if (!session) {
      throw new Error("E2E harness: missing harvest session.");
    }

    return session;
  };

  const findRateVersion = (
    session: HarvestSessionDocument
  ): WorkerRateVersionDocument => {
    const rateVersion = seed.workerRateVersions.find(
      (candidate) => candidate.id === session.rateVersionIdSnapshot
    );

    if (!rateVersion) {
      throw new Error("E2E harness: missing rate version.");
    }

    return rateVersion;
  };

  const authSessionApi: AuthSessionApi = {
    getInitialState: () => authState,
    subscribe: (_env: FirebaseEnv, listener: AuthSessionListener) => {
      listeners.add(listener);
      listener(authState);

      return Promise.resolve(() => {
        listeners.delete(listener);
      });
    },
    signIn: (_env: FirebaseEnv, credentials) => {
      const profile = profilesByEmail.get(credentials.email.trim().toLowerCase());

      if (!profile || credentials.password !== E2E_PASSWORD) {
        throw new Error("E2E harness: invalid credentials.");
      }

      emitAuthState(readyState(profile));
      return Promise.resolve();
    },
    requestPasswordReset: () => Promise.resolve(),
    register: () => Promise.resolve(),
    refresh: () => Promise.resolve(authState),
    updateOfflineConsent: (_env: FirebaseEnv, uid, offlineConsent) => {
      if (authState.status !== "READY" || authState.profile.uid !== uid) {
        return Promise.resolve();
      }

      emitAuthState(
        readyState({
          ...authState.profile,
          offlineConsent
        })
      );
      return Promise.resolve();
    },
    signOut: () => {
      emitAuthState(signedOutState());
      return Promise.resolve();
    }
  };

  const harvestSessionsApi: OperatorHarvestSessionsApi = {
    list: (_env, input) =>
      Promise.resolve(
        buildHarvestSessionDashboard({
          sessionDocuments: sessionDocuments(input.actorProfile),
          entryDocuments: entries.map(toDashboardDocument),
          seasonDocuments: seed.seasons.map(toDashboardDocument),
          selectedSessionId: input.selectedSessionId,
          actorProfile: input.actorProfile,
          isOnline: input.isOnline
        })
      ),
    listOpeningConfiguration: () =>
      Promise.resolve(
        buildOpenHarvestSessionConfiguration({
          seasonDocuments: seed.seasons.map(toDashboardDocument),
          workerDocuments: seed.workers.map(toDashboardDocument),
          planDocuments: seed.settlementPlans.map(toDashboardDocument),
          rateVersionDocuments: seed.workerRateVersions.map(toDashboardDocument),
          sessionDocuments: sessions.map(toDashboardDocument)
        })
      ),
    open: (_env, input) => {
      const prepared = prepareRuntimeOpenHarvestSession(
        buildOpenHarvestSessionConfiguration({
          seasonDocuments: seed.seasons.map(toDashboardDocument),
          workerDocuments: seed.workers.map(toDashboardDocument),
          planDocuments: seed.settlementPlans.map(toDashboardDocument),
          rateVersionDocuments: seed.workerRateVersions.map(toDashboardDocument),
          sessionDocuments: sessions.map(toDashboardDocument)
        }),
        {
          ...input,
          id: `e2e-session-${String(sessionCounter)}`,
          createdAtDevice: CREATED_AT
        }
      );

      if (prepared.status === "CONTINUE_EXISTING") {
        return Promise.resolve({
          status: "CONTINUE_EXISTING",
          selectedSessionId: prepared.existingOpenSessions.at(0)?.id ?? null,
          existingOpenSessions: prepared.existingOpenSessions,
          canCreateSecondSession: prepared.canCreateSecondSession,
          message: prepared.message
        });
      }

      sessionCounter += 1;

      const session: HarvestSessionDocument = {
        ...prepared.session,
        createdAtServer: SERVER_TIME
      };
      sessions = [...sessions, session];

      return Promise.resolve({
        status: "CREATED",
        session,
        selectedSessionId: session.id,
        message: `Otworzono sesje dla ${session.workerNameSnapshot}.`,
        duplicateMode: prepared.duplicateMode,
        calculationDescription: prepared.calculationDescription
      });
    },
    addEntry: (_env, input) => {
      const session = findSession(input.sessionId);
      const currentEntries = entriesForSession(session.id);
      const prepared = prepareHarvestEntryDocument({
        actorProfile: input.actorProfile,
        session,
        entries: currentEntries,
        quantityMilli: input.quantityMilli,
        weightG: input.weightG,
        isOnline: input.isOnline,
        createdDeviceId: input.createdDeviceId,
        createdAtDevice: CREATED_AT,
        createdAtServer: SERVER_TIME,
        identity: {
          id: `e2e-entry-${String(entryCounter)}`,
          sequenceNumber: nextHarvestEntrySequenceNumber(currentEntries)
        }
      });

      entryCounter += 1;
      entries = [...entries, prepared.entry];

      return Promise.resolve({
        entry: prepared.entry,
        selectedSessionId: prepared.entry.sessionId,
        message: `Dodano wpis #${String(prepared.entry.sequenceNumber)}.`,
        nextSessionTotals: prepared.validated.nextSessionTotals
      });
    },
    cancelEntry: (_env, input) => {
      const session = findSession(input.sessionId);
      const currentEntries = entriesForSession(session.id);
      const entry = currentEntries.find((candidate) => candidate.id === input.entryId);

      if (!entry) {
        throw new Error("E2E harness: missing harvest entry.");
      }

      const prepared = prepareRuntimeCancelHarvestEntry({
        actorProfile: input.actorProfile,
        session,
        entry,
        entries: currentEntries,
        reason: input.reason,
        isOnline: input.isOnline,
        cancelledAtDevice: CREATED_AT,
        cancelledAtServer: SERVER_TIME,
        auditId: nextAuditId(),
        deviceId: input.deviceId
      });

      entries = entries.map((candidate) =>
        candidate.id === prepared.entry.id ? prepared.entry : candidate
      );

      return Promise.resolve({
        entry: prepared.entry,
        selectedSessionId: prepared.entry.sessionId,
        message: `Anulowano wpis #${String(prepared.entry.sequenceNumber)}.`,
        confirmationSummary: prepared.confirmationSummary
      });
    },
    close: (_env, input) => {
      const session = findSession(input.sessionId);
      const prepared = prepareRuntimeCloseHarvestSession({
        actorProfile: input.actorProfile,
        session,
        entries: entriesForSession(session.id),
        season: seed.seasons[0],
        worker:
          seed.workers.find((worker) => worker.id === session.workerId) ??
          seed.workers[0],
        rateVersion: findRateVersion(session),
        confirmationAccepted: input.confirmationAccepted,
        isOnline: input.isOnline,
        closedAtDevice: CREATED_AT,
        closedAtServer: SERVER_TIME,
        auditId: nextAuditId(),
        deviceId: input.deviceId
      });

      replaceSession(prepared.session);

      return Promise.resolve({
        session: prepared.session,
        selectedSessionId: null,
        message: `Zamknieto sesje dla ${prepared.session.workerNameSnapshot}.`,
        confirmationSummary: prepared.confirmationSummary
      });
    },
    reopen: (_env, input) => {
      const session = findSession(input.sessionId);
      const prepared = prepareRuntimeReopenHarvestSession({
        actorProfile: input.actorProfile,
        session,
        entries: entriesForSession(session.id),
        reason: input.reason,
        hasActivePayment: input.hasActivePayment,
        isOnline: input.isOnline,
        reopenedAtDevice: CREATED_AT,
        reopenedAtServer: SERVER_TIME,
        auditId: nextAuditId(),
        deviceId: input.deviceId
      });

      replaceSession(prepared.session);

      return Promise.resolve({
        session: prepared.session,
        selectedSessionId: prepared.session.id,
        message: `Ponownie otwarto sesje dla ${prepared.session.workerNameSnapshot}.`,
        confirmationSummary: prepared.confirmationSummary
      });
    },
    cancel: (_env, input) => {
      const session = findSession(input.sessionId);
      const prepared = prepareRuntimeCancelHarvestSession({
        actorProfile: input.actorProfile,
        session,
        entries: entriesForSession(session.id),
        reason: input.reason,
        hasActivePayment: input.hasActivePayment,
        isOnline: input.isOnline,
        cancelledAtDevice: CREATED_AT,
        cancelledAtServer: SERVER_TIME,
        auditId: nextAuditId(),
        deviceId: input.deviceId
      });

      replaceSession(prepared.session);

      return Promise.resolve({
        session: prepared.session,
        selectedSessionId: null,
        message: `Anulowano sesje dla ${prepared.session.workerNameSnapshot}.`,
        confirmationSummary: prepared.confirmationSummary
      });
    }
  };

  const deviceRegistryApi: DeviceRegistryApi = {
    register: () => Promise.resolve()
  };

  const workerDirectoryApi: WorkerDirectoryApi = {
    list: () =>
      Promise.resolve({
        workers: [],
        plans: seed.settlementPlans,
        profiles: [operatorProfile, adminProfile],
        invalidWorkers: [],
        invalidPlans: [],
        invalidRateVersions: [],
        invalidProfiles: [],
        invalidAuditEvents: []
      })
  };

  function nextAuditId() {
    const id = `e2e-audit-${String(auditCounter)}`;
    auditCounter += 1;

    return id;
  }

  return {
    authSessionApi,
    deviceRegistryApi,
    harvestSessionsApi,
    workerDirectoryApi
  };
}

function createProfile(input: {
  uid: string;
  email: string;
  displayName: string;
  role: UserProfile["role"];
}): UserProfile {
  return {
    uid: input.uid,
    email: input.email,
    displayName: input.displayName,
    role: input.role,
    workerId: null,
    active: true,
    registrationStatus: "APPROVED",
    offlineConsent: true
  };
}

function readyState(profile: UserProfile): AuthSessionState {
  return {
    status: "READY",
    message: "Profil E2E aktywny.",
    user: {
      uid: profile.uid,
      email: profile.email,
      displayName: profile.displayName
    },
    profile,
    access: {
      status: "READY",
      role: profile.role
    }
  };
}

function signedOutState(): AuthSessionState {
  return {
    status: "SIGNED_OUT",
    message: "Uzytkownik nie jest zalogowany."
  };
}

function toDashboardDocument<T extends { id: string }>(document: T) {
  return {
    id: document.id,
    data: document
  };
}
