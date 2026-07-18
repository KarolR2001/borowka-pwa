import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { createInitialDomainSeed } from "../domain/domainConfiguration";
import type { UserProfile } from "../domain/identity";
import {
  ActiveHarvestSessionPanel,
  formatSessionQuantity,
  type ActiveHarvestSessionEntryItem,
  type ActiveHarvestSessionView
} from "./ActiveHarvestSessionPanel";
import { prepareOpenHarvestSession } from "./openHarvestSession";

const createdAt = "2026-07-17T10:00:00.000Z";
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

function createSessionView(
  overrides: Partial<ActiveHarvestSessionView> = {}
): ActiveHarvestSessionView {
  const prepared = prepareOpenHarvestSession({
    actorProfile: operatorProfile,
    id: "session-1",
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
    throw new Error("Expected created session.");
  }

  const entries: ActiveHarvestSessionEntryItem[] = [
    {
      id: "entry-1",
      sequenceNumber: 1,
      quantityMilli: 1000,
      weightG: 3000,
      amountPreviewGrosz: 3000,
      status: "ACTIVE",
      createdAtLabel: "10:01",
      pendingSync: false
    },
    {
      id: "entry-2",
      sequenceNumber: 2,
      quantityMilli: 2000,
      weightG: 3310,
      amountPreviewGrosz: 3310,
      status: "ACTIVE",
      createdAtLabel: "10:06",
      pendingSync: true
    }
  ];

  return {
    session: {
      ...prepared.session,
      totalEntryCount: 2,
      totalQuantityMilli: 3000,
      totalWeightG: 6310
    },
    seasonName: "Sezon testowy 2026",
    createdByName: "Operator Test",
    deviceName: "Telefon operatora",
    entries,
    estimatedAmountGrosz: 6310,
    pendingWriteCount: 1,
    isOnline: true,
    canAddEntry: true,
    canCloseSession: true,
    ...overrides
  };
}

describe("ActiveHarvestSessionPanel", () => {
  it("renders all required active session facts and actions", () => {
    render(<ActiveHarvestSessionPanel view={createSessionView()} />);

    expect(screen.getByRole("heading", { name: "Anna Test" })).toBeInTheDocument();
    expect(screen.getByText("Sezon testowy 2026 · 17.07.2026")).toBeInTheDocument();
    expect(screen.getByText("W toku")).toBeInTheDocument();
    expect(screen.getByText("Online")).toBeInTheDocument();
    expect(screen.getByText("Oczekujace zapisy: 1")).toBeInTheDocument();
    expect(screen.getByText("Za kilogram")).toBeInTheDocument();
    expect(screen.getByText("10,00 zł / kilogram")).toBeInTheDocument();
    expect(screen.getByText("3 kilogram")).toBeInTheDocument();
    expect(screen.getByText("6,310 kg")).toBeInTheDocument();
    expect(screen.getByText("63,10 zł")).toBeInTheDocument();
    expect(screen.getByText("Operator Test")).toBeInTheDocument();
    expect(screen.getByText("Telefon operatora")).toBeInTheDocument();
    expect(screen.getAllByText("#2").length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: "Dodaj wpis" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Zamknij sesje" })).toBeEnabled();
  });

  it("orders entries by newest sequence and shows pending sync state", () => {
    render(<ActiveHarvestSessionPanel view={createSessionView()} />);

    const entries = screen.getAllByRole("listitem");

    expect(within(entries[0]).getByText("#2")).toBeInTheDocument();
    expect(within(entries[0]).getByText("2 kilogram")).toBeInTheDocument();
    expect(within(entries[0]).getByText("3,310 kg")).toBeInTheDocument();
    expect(within(entries[0]).getByText("33,10 zł")).toBeInTheDocument();
    expect(within(entries[0]).getByText("Aktywny · oczekuje")).toBeInTheDocument();
    expect(within(entries[1]).getByText("#1")).toBeInTheDocument();
  });

  it("deduplicates local and server snapshots of the same entry id", () => {
    const view = createSessionView({
      entries: [
        {
          id: "entry-1",
          sequenceNumber: 1,
          quantityMilli: 1000,
          weightG: 3000,
          amountPreviewGrosz: 3000,
          status: "ACTIVE",
          createdAtLabel: "10:01",
          pendingSync: true
        },
        {
          id: "entry-1",
          sequenceNumber: 1,
          quantityMilli: 1000,
          weightG: 3000,
          amountPreviewGrosz: 3000,
          status: "ACTIVE",
          createdAtLabel: "10:01",
          pendingSync: false
        }
      ],
      pendingWriteCount: 0
    });

    render(<ActiveHarvestSessionPanel view={view} />);

    const entries = screen.getAllByRole("listitem");

    expect(entries).toHaveLength(1);
    expect(within(entries[0]).getByText("#1")).toBeInTheDocument();
    expect(within(entries[0]).getByText("Aktywny")).toBeInTheDocument();
    expect(within(entries[0]).queryByText("Aktywny · oczekuje")).not.toBeInTheDocument();
  });

  it("invokes add and close actions when enabled", async () => {
    const user = userEvent.setup();
    const onAddEntry = vi.fn();
    const onCloseSession = vi.fn();

    render(
      <ActiveHarvestSessionPanel
        onAddEntry={onAddEntry}
        onCloseSession={onCloseSession}
        view={createSessionView()}
      />
    );

    await user.click(screen.getByRole("button", { name: "Dodaj wpis" }));
    await user.click(screen.getByRole("button", { name: "Zamknij sesje" }));

    expect(onAddEntry).toHaveBeenCalledTimes(1);
    expect(onCloseSession).toHaveBeenCalledTimes(1);
  });

  it("disables actions when offline or when the session cannot be closed", () => {
    render(
      <ActiveHarvestSessionPanel
        view={createSessionView({
          isOnline: false,
          pendingWriteCount: 2,
          canCloseSession: false
        })}
      />
    );

    expect(screen.getByText("Offline")).toBeInTheDocument();
    expect(screen.getByText("Oczekujace zapisy: 2")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Dodaj wpis" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Zamknij sesje" })).toBeDisabled();
  });

  it("shows a status notice and empty entries state", () => {
    render(
      <ActiveHarvestSessionPanel
        view={createSessionView({
          session: {
            ...createSessionView().session,
            totalEntryCount: 0,
            totalQuantityMilli: 0,
            totalWeightG: 0
          },
          entries: [],
          estimatedAmountGrosz: 0,
          statusNotice: "Sesja zostala zmieniona na innym urzadzeniu."
        })}
      />
    );

    expect(
      screen.getByText("Sesja zostala zmieniona na innym urzadzeniu.")
    ).toBeInTheDocument();
    expect(screen.getByText("Sesja nie ma jeszcze wpisow.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Zamknij sesje" })).toBeDisabled();
  });

  it("renders empty active session placeholder before persistence is implemented", () => {
    render(<ActiveHarvestSessionPanel view={null} />);

    expect(screen.getByText("Brak aktywnej sesji")).toBeInTheDocument();
    expect(
      screen.getByText("Otwarte sesje zostana pokazane po wdrozeniu zapisu zbiorow.")
    ).toBeInTheDocument();
  });

  it("formats session quantity according to plan precision", () => {
    expect(formatSessionQuantity(1000, 0, "skrzynka")).toBe("1 skrzynka");
    expect(formatSessionQuantity(1500, 1, "ubianka")).toBe("1,5 ubianka");
    expect(formatSessionQuantity(3495, 3, "kilogram")).toBe("3,495 kilogram");
    expect(() => formatSessionQuantity(1000, 4, "jednostka")).toThrow(
      "Precyzja ilosci musi byc od 0 do 3."
    );
  });
});
