import type { AuthSessionState } from "../auth/authSession";
import type { OfflineLayerReadiness } from "./offlineReadiness";
import {
  authStateRequiresOfflineReconfirmation,
  evaluateOfflineReadinessIndicator
} from "./offlineReadinessIndicator";
import type { OfflineStorageHealth } from "./offlineStorageHealth";

const readyLayerReadiness: OfflineLayerReadiness = {
  overallStatus: "READY",
  applicationLayer: {
    status: "READY",
    label: "Pliki aplikacji gotowe",
    details: []
  },
  dataLayer: {
    status: "READY",
    label: "Dane gotowe offline",
    details: [],
    sources: {
      CACHE: true,
      PENDING_WRITE: false,
      SERVER_CONFIRMED: true,
      REJECTED: false,
      STALE: false
    }
  }
};

const missingDataLayerReadiness: OfflineLayerReadiness = {
  ...readyLayerReadiness,
  overallStatus: "NOT_READY",
  dataLayer: {
    ...readyLayerReadiness.dataLayer,
    status: "NOT_READY",
    label: "Dane nieprzygotowane",
    sources: {
      ...readyLayerReadiness.dataLayer.sources,
      CACHE: false,
      SERVER_CONFIRMED: false
    }
  }
};

const rejectedLayerReadiness: OfflineLayerReadiness = {
  ...readyLayerReadiness,
  overallStatus: "NOT_READY",
  dataLayer: {
    ...readyLayerReadiness.dataLayer,
    status: "NOT_READY",
    sources: {
      ...readyLayerReadiness.dataLayer.sources,
      REJECTED: true
    }
  }
};

const baseInput = {
  isOnline: true,
  accountReconfirmationRequired: false,
  syncError: false,
  pendingWriteCount: 0,
  lastFirestoreContactIso: "2026-07-17T10:00:00.000Z",
  layerReadiness: readyLayerReadiness
};

const unavailableStorageHealth: OfflineStorageHealth = {
  status: "NOT_READY",
  label: "Pamiec offline niedostepna",
  issues: [
    {
      code: "LOW_SPACE",
      message: "Na urzadzeniu jest za malo miejsca na bezpieczna prace offline."
    }
  ],
  persistenceStatus: "GRANTED",
  quota: null
};

describe("offlineReadinessIndicator", () => {
  it("reports online synced when data is ready and there are no pending writes", () => {
    expect(evaluateOfflineReadinessIndicator(baseInput)).toMatchObject({
      status: "ONLINE_SYNCED",
      label: "Online, zsynchronizowano",
      tone: "ok"
    });
  });

  it("reports online pending writes before synced", () => {
    expect(
      evaluateOfflineReadinessIndicator({
        ...baseInput,
        pendingWriteCount: 2
      })
    ).toMatchObject({
      status: "ONLINE_PENDING_WRITES",
      label: "Online, sa oczekujace zapisy",
      tone: "warn"
    });
  });

  it("reports offline ready only when application and data layers are ready", () => {
    expect(
      evaluateOfflineReadinessIndicator({
        ...baseInput,
        isOnline: false
      })
    ).toMatchObject({
      status: "OFFLINE_READY",
      label: "Offline, gotowe",
      tone: "ok"
    });
  });

  it("reports missing offline data even when browser connectivity exists", () => {
    expect(
      evaluateOfflineReadinessIndicator({
        ...baseInput,
        layerReadiness: missingDataLayerReadiness
      })
    ).toMatchObject({
      status: "OFFLINE_MISSING_DATA",
      label: "Offline, brak wymaganych danych",
      tone: "warn"
    });
  });

  it("reports synchronization errors from explicit errors or rejected writes", () => {
    expect(
      evaluateOfflineReadinessIndicator({
        ...baseInput,
        syncError: true
      }).status
    ).toBe("SYNC_ERROR");
    expect(
      evaluateOfflineReadinessIndicator({
        ...baseInput,
        layerReadiness: rejectedLayerReadiness
      }).status
    ).toBe("SYNC_ERROR");
  });

  it("prioritizes unavailable local storage over ready cache data", () => {
    const indicator = evaluateOfflineReadinessIndicator({
      ...baseInput,
      storageHealth: unavailableStorageHealth
    });

    expect(indicator).toMatchObject({
      status: "STORAGE_UNAVAILABLE",
      label: "Pamiec offline niedostepna",
      tone: "error"
    });
    expect(indicator.details).toContain(
      "Na urzadzeniu jest za malo miejsca na bezpieczna prace offline."
    );
  });

  it("prioritizes account reconfirmation above synchronization state", () => {
    expect(
      evaluateOfflineReadinessIndicator({
        ...baseInput,
        accountReconfirmationRequired: true,
        syncError: true,
        pendingWriteCount: 3
      })
    ).toMatchObject({
      status: "REAUTH_REQUIRED",
      label: "Wymagane ponowne potwierdzenie konta",
      tone: "warn"
    });
  });

  it("detects auth states that require offline reconfirmation", () => {
    const state = {
      status: "PROFILE_UNAVAILABLE",
      message: "Profil chwilowo niedostepny.",
      user: {
        uid: "user-1",
        email: "user@example.test",
        displayName: null
      }
    } satisfies AuthSessionState;

    expect(authStateRequiresOfflineReconfirmation(state)).toBe(true);
  });
});
