import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import type { AuthSessionState } from "../auth/authSession";
import type { CloseHarvestSessionOnlineResult } from "./closeHarvestSessionRuntime";
import { createInitialDomainSeed } from "../domain/domainConfiguration";
import type { UserProfile } from "../domain/identity";
import {
  buildHarvestSessionDashboard,
  type HarvestEntryDocument,
  type HarvestSessionDashboardResult
} from "./harvestSessionDashboard";
import type { AddHarvestEntryOnlineResult } from "./harvestEntryRuntime";
import {
  OperatorHarvestSessionsPanel,
  type OperatorHarvestSessionsApi
} from "./OperatorHarvestSessionsPanel";
import {
  prepareOpenHarvestSession,
  type HarvestSessionDocument
} from "./openHarvestSession";
import type {
  OpenHarvestSessionConfigurationResult,
  OpenHarvestSessionOnlineResult
} from "./openHarvestSessionRuntime";

const env = {
  VITE_APP_ENV: "test"
};
const createdAt = new Date("2026-07-17T08:00:00.000Z");
const seed = createInitialDomainSeed({ createdAt });
const operatorProfile: UserProfile = {
  uid: "operator-1",
  email: "operator@example.test",
  displayName: "Operator Test",
  role: "OPERATOR",
  workerId: null,
  active: true,
  registrationStatus: "APPROVED",
  offlineConsent: true
};
const operatorState: AuthSessionState = {
  status: "READY",
  message: "Profil aktywny.",
  user: {
    uid: "operator-1",
    email: "operator@example.test",
    displayName: "Operator Test"
  },
  profile: operatorProfile,
  access: {
    status: "READY",
    role: "OPERATOR"
  }
};
const pickerState: AuthSessionState = {
  ...operatorState,
  profile: {
    ...operatorState.profile,
    role: "PICKER",
    workerId: "worker-anna-test"
  },
  access: {
    status: "READY",
    role: "PICKER"
  }
};

describe("OperatorHarvestSessionsPanel", () => {
  it("loads open sessions and renders active session details", async () => {
    const result = createDashboardResult();
    const api = createHarvestSessionsApi({
      list: vi.fn<OperatorHarvestSessionsApi["list"]>().mockResolvedValue(result)
    });

    render(
      <OperatorHarvestSessionsPanel
        authState={operatorState}
        env={env}
        harvestSessionsApi={api}
        isOnline={true}
      />
    );

    await waitFor(() => {
      expect(api.list).toHaveBeenCalledWith(env, {
        actorProfile: operatorState.profile,
        selectedSessionId: null,
        isOnline: true
      });
    });
    expect(
      screen.getByRole("heading", { name: "Otwarte sesje zbioru" })
    ).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Anna Test" })).toBeInTheDocument();
    expect(screen.getByText("Sezon testowy 2026 · 17.07.2026")).toBeInTheDocument();
    expect(screen.getAllByText("1 kilogram").length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: "Dodaj wpis" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Zamknij sesje" })).toBeEnabled();
  });

  it("reloads the dashboard when another open session is selected", async () => {
    const user = userEvent.setup();
    const firstResult = createDashboardResult();
    const secondResult = createDashboardResult("session-2");
    const api = createHarvestSessionsApi({
      list: vi
        .fn<OperatorHarvestSessionsApi["list"]>()
        .mockResolvedValueOnce(firstResult)
        .mockResolvedValueOnce(secondResult)
    });

    render(
      <OperatorHarvestSessionsPanel
        authState={operatorState}
        env={env}
        harvestSessionsApi={api}
        isOnline={true}
      />
    );

    await screen.findByRole("heading", { name: "Anna Test" });
    await user.click(screen.getByRole("button", { name: /bartek test/i }));

    await waitFor(() => {
      expect(api.list).toHaveBeenLastCalledWith(env, {
        actorProfile: operatorState.profile,
        selectedSessionId: "session-2",
        isOnline: true
      });
    });
  });

  it("opens a new session from the runtime form and refreshes the dashboard", async () => {
    const user = userEvent.setup();
    const createdSession = createSession("session-new");
    const list = vi
      .fn<OperatorHarvestSessionsApi["list"]>()
      .mockResolvedValue(createDashboardResult());
    list.mockResolvedValueOnce(emptyDashboardResult());
    const api = createHarvestSessionsApi({
      list,
      open: vi.fn<OperatorHarvestSessionsApi["open"]>().mockResolvedValue({
        status: "CREATED",
        session: createdSession,
        selectedSessionId: createdSession.id,
        message: "Otworzono sesje dla Anna Test.",
        duplicateMode: "FIRST_SESSION",
        calculationDescription:
          "10,00 zl za kilogram; oficjalna kwota powstaje przy zamknieciu."
      } satisfies OpenHarvestSessionOnlineResult)
    });

    render(
      <OperatorHarvestSessionsPanel
        authState={operatorState}
        env={env}
        harvestSessionsApi={api}
        isOnline={true}
      />
    );

    await screen.findByRole("form", { name: "Otwieranie sesji zbioru" });
    await user.clear(screen.getByLabelText("Data"));
    await user.type(screen.getByLabelText("Data"), "2026-07-17");
    await user.type(screen.getByLabelText("Notatka"), "poranny zbior");
    await user.click(screen.getByRole("button", { name: "Otworz sesje" }));

    await waitFor(() => {
      expect(api.open).toHaveBeenCalledWith(
        env,
        expect.objectContaining({
          actorProfile: operatorState.profile,
          seasonId: seed.seasons[0].id,
          workerId: seed.workers[0].id,
          businessDate: "2026-07-17",
          note: "poranny zbior",
          secondSessionReason: null,
          isOnline: true
        })
      );
    });
    expect(typeof vi.mocked(api.open).mock.calls.at(-1)?.[1].createdDeviceId).toBe(
      "string"
    );
    expect(screen.getByText("Otworzono sesje dla Anna Test.")).toBeInTheDocument();
    expect(api.list).toHaveBeenLastCalledWith(env, {
      actorProfile: operatorState.profile,
      selectedSessionId: "session-new",
      isOnline: true
    });
  });

  it("shows duplicate same-day session warning before opening another session", async () => {
    const user = userEvent.setup();
    const api = createHarvestSessionsApi({
      list: vi
        .fn<OperatorHarvestSessionsApi["list"]>()
        .mockResolvedValue(createDashboardResult())
    });

    render(
      <OperatorHarvestSessionsPanel
        authState={operatorState}
        env={env}
        harvestSessionsApi={api}
        isOnline={true}
      />
    );

    await screen.findByRole("form", { name: "Otwieranie sesji zbioru" });
    await user.clear(screen.getByLabelText("Data"));
    await user.type(screen.getByLabelText("Data"), "2026-07-17");

    expect(
      screen.getByText("Istnieje otwarta sesja tej osoby dla wybranej daty.")
    ).toBeInTheDocument();
  });

  it("adds a weight entry to the selected session and refreshes the dashboard", async () => {
    const user = userEvent.setup();
    const session = createSession("session-1");
    const list = vi
      .fn<OperatorHarvestSessionsApi["list"]>()
      .mockResolvedValue(createDashboardResult());
    const api = createHarvestSessionsApi({
      list,
      addEntry: vi.fn<OperatorHarvestSessionsApi["addEntry"]>().mockResolvedValue({
        entry: createEntry(session, 2, "entry-02"),
        selectedSessionId: session.id,
        message: "Dodano wpis #2.",
        nextSessionTotals: {
          totalEntryCount: 2,
          totalQuantityMilli: 1750,
          totalWeightG: 1750,
          estimatedAmountGrosz: 1750
        }
      } satisfies AddHarvestEntryOnlineResult)
    });

    render(
      <OperatorHarvestSessionsPanel
        authState={operatorState}
        env={env}
        harvestSessionsApi={api}
        isOnline={true}
      />
    );

    await screen.findByRole("heading", { name: "Anna Test" });
    await user.click(screen.getByRole("button", { name: "Dodaj wpis" }));
    await screen.findByRole("form", { name: "Formularz wpisu za kilogram" });
    await user.type(screen.getByLabelText("Waga kg"), "0,750");
    await user.click(screen.getByRole("button", { name: "Zapisz wpis" }));

    await waitFor(() => {
      expect(api.addEntry).toHaveBeenCalledWith(
        env,
        expect.objectContaining({
          actorProfile: operatorState.profile,
          sessionId: "session-1",
          quantityMilli: 750,
          weightG: 750,
          isOnline: true
        })
      );
    });
    expect(typeof vi.mocked(api.addEntry).mock.calls.at(-1)?.[1].createdDeviceId).toBe(
      "string"
    );
    expect(list).toHaveBeenLastCalledWith(env, {
      actorProfile: operatorState.profile,
      selectedSessionId: "session-1",
      isOnline: true
    });
  });

  it("closes the selected session after confirmation and refreshes the dashboard", async () => {
    const user = userEvent.setup();
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
    const session = createSession("session-1");
    const list = vi
      .fn<OperatorHarvestSessionsApi["list"]>()
      .mockResolvedValue(createDashboardResult());
    const api = createHarvestSessionsApi({
      list,
      close: vi.fn<OperatorHarvestSessionsApi["close"]>().mockResolvedValue({
        session: {
          ...session,
          status: "CLOSED",
          totalEntryCount: 1,
          totalQuantityMilli: 1000,
          totalWeightG: 1000,
          amountDueGrosz: 1000,
          closedBy: operatorProfile.uid,
          revision: 2
        },
        selectedSessionId: null,
        message: "Zamknieto sesje dla Anna Test.",
        confirmationSummary: {
          workerName: "Anna Test",
          businessDate: "2026-07-17",
          planName: "Za kilogram",
          unitLabel: "kilogram",
          rateGrosz: 1000,
          calculationBasis: "WEIGHT",
          totalEntryCount: 1,
          totalQuantityMilli: 1000,
          totalWeightG: 1000,
          amountDueGrosz: 1000,
          skippedCancelledEntryCount: 0,
          pendingWriteCount: 0
        }
      } satisfies CloseHarvestSessionOnlineResult)
    });

    try {
      render(
        <OperatorHarvestSessionsPanel
          authState={operatorState}
          env={env}
          harvestSessionsApi={api}
          isOnline={true}
        />
      );

      await screen.findByRole("heading", { name: "Anna Test" });
      await user.click(screen.getByRole("button", { name: "Zamknij sesje" }));

      await waitFor(() => {
        expect(api.close).toHaveBeenCalledWith(
          env,
          expect.objectContaining({
            actorProfile: operatorState.profile,
            sessionId: "session-1",
            confirmationAccepted: true,
            isOnline: true
          })
        );
      });
      expect(typeof vi.mocked(api.close).mock.calls.at(-1)?.[1].deviceId).toBe("string");
      expect(confirmSpy).toHaveBeenCalledWith(
        "Zamknac sesje Anna Test z dnia 17.07.2026?"
      );
      expect(list).toHaveBeenLastCalledWith(env, {
        actorProfile: operatorState.profile,
        selectedSessionId: null,
        isOnline: true
      });
    } finally {
      confirmSpy.mockRestore();
    }
  });

  it("does not load sessions for picker role", () => {
    const api = createHarvestSessionsApi();

    render(
      <OperatorHarvestSessionsPanel
        authState={pickerState}
        env={env}
        harvestSessionsApi={api}
        isOnline={true}
      />
    );

    expect(api.list).not.toHaveBeenCalled();
    expect(api.listOpeningConfiguration).not.toHaveBeenCalled();
    expect(
      screen.getByRole("heading", { name: "Brak dostepu do sesji zbioru" })
    ).toBeInTheDocument();
  });
});

function createHarvestSessionsApi(
  overrides: Partial<OperatorHarvestSessionsApi> = {}
): OperatorHarvestSessionsApi {
  return {
    list: vi
      .fn<OperatorHarvestSessionsApi["list"]>()
      .mockResolvedValue(emptyDashboardResult()),
    listOpeningConfiguration: vi
      .fn<OperatorHarvestSessionsApi["listOpeningConfiguration"]>()
      .mockResolvedValue(createOpeningConfiguration()),
    open: vi
      .fn<OperatorHarvestSessionsApi["open"]>()
      .mockRejectedValue(new Error("unused")),
    addEntry: vi
      .fn<OperatorHarvestSessionsApi["addEntry"]>()
      .mockRejectedValue(new Error("unused")),
    close: vi
      .fn<OperatorHarvestSessionsApi["close"]>()
      .mockRejectedValue(new Error("unused")),
    ...overrides
  };
}

function emptyDashboardResult(): HarvestSessionDashboardResult {
  return {
    openSessions: [],
    selectedSessionId: null,
    selectedSessionView: null,
    invalidSessions: [],
    invalidEntries: [],
    invalidSeasons: []
  };
}

function createOpeningConfiguration(): OpenHarvestSessionConfigurationResult {
  return {
    seasons: [seed.seasons[0]],
    workers: seed.workers,
    plans: seed.settlementPlans,
    rateVersions: seed.workerRateVersions,
    openSessions: [],
    invalidSeasons: [],
    invalidWorkers: [],
    invalidPlans: [],
    invalidRateVersions: [],
    invalidSessions: []
  };
}

function createDashboardResult(
  selectedSessionId = "session-1"
): HarvestSessionDashboardResult {
  const firstSession = createSession("session-1");
  const secondSession = createSession("session-2", {
    workerId: "worker-bartek-test",
    workerNameSnapshot: "Bartek Test",
    planIdSnapshot: "plan-quantity-ubianka",
    planNameSnapshot: "Za ubianke",
    calculationBasisSnapshot: "QUANTITY",
    unitLabelSnapshot: "ubianka",
    rateVersionIdSnapshot: "rate-worker-bartek-test-2026-07-01",
    rateGroszSnapshot: 1500,
    weightRequiredSnapshot: false,
    quantityPrecisionSnapshot: 1
  });

  return buildHarvestSessionDashboard({
    sessionDocuments: [
      { id: firstSession.id, data: firstSession },
      { id: secondSession.id, data: secondSession }
    ],
    entryDocuments: [
      { id: "entry-01", data: createEntry(firstSession, 1) },
      { id: "entry-02", data: createEntry(secondSession, 1, "entry-02") }
    ],
    seasonDocuments: [{ id: seed.seasons[0].id, data: seed.seasons[0] }],
    selectedSessionId,
    actorProfile: operatorProfile,
    isOnline: true
  });
}

function createSession(
  id: string,
  overrides: Partial<HarvestSessionDocument> = {}
): HarvestSessionDocument {
  const prepared = prepareOpenHarvestSession({
    actorProfile: operatorProfile,
    id,
    season: seed.seasons[0],
    worker: seed.workers[0],
    plans: seed.settlementPlans,
    rateVersions: seed.workerRateVersions,
    businessDate: "2026-07-17",
    existingSessions: [],
    isOnline: true,
    createdDeviceId: "device-1",
    createdAtDevice: createdAt
  });

  if (prepared.status !== "CREATED") {
    throw new Error("Expected session creation.");
  }

  return {
    ...prepared.session,
    createdAtServer: createdAt,
    ...overrides
  };
}

function createEntry(
  session: HarvestSessionDocument,
  sequenceNumber: number,
  id = `entry-${String(sequenceNumber).padStart(2, "0")}`
): HarvestEntryDocument {
  return {
    id,
    sessionId: session.id,
    seasonId: session.seasonId,
    workerId: session.workerId,
    businessDate: session.businessDate,
    status: "ACTIVE",
    sequenceNumber,
    quantityMilli: 1000,
    weightG: 1000,
    amountPreviewGrosz: 1000,
    stockWeightG: 1000,
    pendingSync: false,
    createdBy: operatorProfile.uid,
    createdDeviceId: "device-1",
    createdAtDevice: "2026-07-17T08:01:00.000Z",
    createdAtServer: createdAt,
    replacesEntryId: null,
    cancellationReason: null,
    cancelledBy: null,
    cancelledAtServer: null,
    revision: 1
  };
}
