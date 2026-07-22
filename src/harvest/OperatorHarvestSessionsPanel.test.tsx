import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import type { AuthSessionState } from "../auth/authSession";
import { createInitialDomainSeed } from "../domain/domainConfiguration";
import type { UserProfile } from "../domain/identity";
import {
  buildHarvestSessionDashboard,
  type HarvestSessionDashboardResult
} from "./harvestSessionDashboard";
import {
  OperatorHarvestSessionsPanel,
  type OperatorHarvestSessionsApi
} from "./OperatorHarvestSessionsPanel";
import {
  prepareOpenHarvestSession,
  type HarvestSessionDocument
} from "./openHarvestSession";

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
    const list = vi.fn<OperatorHarvestSessionsApi["list"]>().mockResolvedValue(result);

    render(
      <OperatorHarvestSessionsPanel
        authState={operatorState}
        env={env}
        harvestSessionsApi={{ list }}
        isOnline={true}
      />
    );

    await waitFor(() => {
      expect(list).toHaveBeenCalledWith(env, {
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
    expect(screen.getByRole("button", { name: "Dodaj wpis" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Zamknij sesje" })).toBeDisabled();
  });

  it("reloads the dashboard when another open session is selected", async () => {
    const user = userEvent.setup();
    const firstResult = createDashboardResult();
    const secondResult = createDashboardResult("session-2");
    const list = vi
      .fn<OperatorHarvestSessionsApi["list"]>()
      .mockResolvedValueOnce(firstResult)
      .mockResolvedValueOnce(secondResult);

    render(
      <OperatorHarvestSessionsPanel
        authState={operatorState}
        env={env}
        harvestSessionsApi={{ list }}
        isOnline={true}
      />
    );

    await screen.findByRole("heading", { name: "Anna Test" });
    await user.click(screen.getByRole("button", { name: /bartek test/i }));

    await waitFor(() => {
      expect(list).toHaveBeenLastCalledWith(env, {
        actorProfile: operatorState.profile,
        selectedSessionId: "session-2",
        isOnline: true
      });
    });
  });

  it("does not load sessions for picker role", () => {
    const list = vi.fn<OperatorHarvestSessionsApi["list"]>();

    render(
      <OperatorHarvestSessionsPanel
        authState={pickerState}
        env={env}
        harvestSessionsApi={{ list }}
        isOnline={true}
      />
    );

    expect(list).not.toHaveBeenCalled();
    expect(
      screen.getByRole("heading", { name: "Brak dostepu do sesji zbioru" })
    ).toBeInTheDocument();
  });
});

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
) {
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
