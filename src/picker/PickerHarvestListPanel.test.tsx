import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import type { AuthSessionState } from "../auth/authSession";
import {
  PickerHarvestListPanel,
  type PickerHarvestListApi
} from "./PickerHarvestListPanel";
import type { PickerHarvestListResult } from "./pickerHarvestList";

const pickerState: AuthSessionState = {
  access: { role: "PICKER", status: "READY" },
  message: "Profil aktywny.",
  profile: {
    active: true,
    displayName: "Anna Konto",
    email: "anna@example.test",
    offlineConsent: true,
    registrationStatus: "APPROVED",
    role: "PICKER",
    uid: "picker-anna",
    workerId: "worker-anna"
  },
  status: "READY",
  user: {
    displayName: "Anna Konto",
    email: "anna@example.test",
    uid: "picker-anna"
  }
};

describe("PickerHarvestListPanel", () => {
  it("shows all statuses, meaningful sync state and opens session details full-screen", async () => {
    const user = userEvent.setup();
    const load = vi.fn<PickerHarvestListApi["load"]>().mockResolvedValue(listResult());

    render(
      <PickerHarvestListPanel
        authState={pickerState}
        env={{}}
        isOnline={false}
        pickerHarvestListApi={{ load }}
        pickerSessionDetailsApi={{ load: vi.fn().mockResolvedValue(detailsResult()) }}
        syncDocuments={[]}
      />
    );

    expect(
      await screen.findByRole("button", { name: "Otwórz sesję 29.07.2026" })
    ).toBeInTheDocument();
    expect(screen.queryByText("Oczekuje synchronizacji")).not.toBeInTheDocument();
    expect(screen.getAllByText("Wymaga przeglądu")).toHaveLength(2);
    expect(screen.getAllByText("Anulowano")).toHaveLength(2);
    expect(screen.queryByRole("columnheader", { name: "Sezon" })).not.toBeInTheDocument();
    expect(screen.queryByRole("columnheader", { name: "Plan" })).not.toBeInTheDocument();
    expect(screen.queryByText("2 ubianki")).not.toBeInTheDocument();
    expect(screen.queryByText(/offline/i)).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Otwórz sesję 29.07.2026" }));

    expect(
      screen.getByRole("heading", { name: "Sesja z 29.07.2026" })
    ).toBeInTheDocument();
    expect(screen.getByRole("dialog", { name: "Szczegóły zbioru" })).toHaveClass(
      "record-dialog--fullscreen"
    );
    expect(screen.getAllByText("W toku").length).toBeGreaterThan(1);
    expect(load).toHaveBeenCalledWith(
      {},
      expect.objectContaining({
        actorProfile: pickerState.profile,
        isOnline: false
      })
    );
  });

  it("filters the visible rows by season and status", async () => {
    const user = userEvent.setup();

    render(
      <PickerHarvestListPanel
        authState={pickerState}
        env={{}}
        isOnline
        pickerHarvestListApi={{
          load: vi.fn().mockResolvedValue(listResult())
        }}
        syncDocuments={[]}
      />
    );

    expect(screen.queryByText("Oczekuje synchronizacji")).not.toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText("Status"), "PAID");

    expect(
      screen.getByRole("button", { name: "Otwórz sesję 28.07.2026" })
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Otwórz sesję 27.07.2026" })
    ).not.toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText("Sezon"), "season-2025");

    await waitFor(() => {
      expect(
        screen.getByText("Brak sesji spełniających wybrane filtry.")
      ).toBeInTheDocument();
    });
  });

  it("does not load for another role", () => {
    const load = vi.fn<PickerHarvestListApi["load"]>();

    render(
      <PickerHarvestListPanel
        authState={{
          ...pickerState,
          access: { role: "ADMIN", status: "READY" },
          profile: { ...pickerState.profile, role: "ADMIN", workerId: null }
        }}
        env={{}}
        isOnline
        pickerHarvestListApi={{ load }}
        syncDocuments={[]}
      />
    );

    expect(
      screen.getByText("Lista wymaga aktywnego konta powiązanego ze zbieraczem.")
    ).toBeInTheDocument();
    expect(load).not.toHaveBeenCalled();
  });
});

function listResult(): PickerHarvestListResult {
  return {
    dataSource: "CACHE",
    invalidSeasonCount: 0,
    invalidSessionCount: 0,
    items: [
      item("session-open", "2026-07-29", "OPEN", {
        syncIssue: "Oczekuje synchronizacji"
      }),
      item("session-paid", "2026-07-28", "PAID", {
        amountDueGrosz: 5000
      }),
      item("session-review", "2026-07-27", "REVIEW_REQUIRED"),
      item("session-cancelled", "2026-07-26", "CANCELLED")
    ],
    refreshedAtIso: "2026-07-29T08:00:00.000Z",
    seasons: [
      {
        endDate: "2026-09-30",
        id: "season-2026",
        isDefault: true,
        name: "Sezon 2026",
        startDate: "2026-07-01",
        status: "OPEN"
      },
      {
        endDate: "2025-09-30",
        id: "season-2025",
        isDefault: false,
        name: "Sezon 2025",
        startDate: "2025-07-01",
        status: "CLOSED"
      }
    ]
  };
}

function detailsResult() {
  return {
    activeEntryCount: 1,
    amountDueGrosz: null,
    businessDate: "2026-07-29",
    calculationBasis: "QUANTITY" as const,
    dataSource: "CACHE" as const,
    entries: [],
    invalidEntryCount: 0,
    invalidPayment: false,
    payment: null,
    planName: "Za ubianke",
    quantityPrecision: 1,
    rateGrosz: 1500,
    seasonId: "season-2026",
    sessionId: "session-open",
    status: "OPEN" as const,
    totalQuantityMilli: 2000,
    totalWeightG: 8000,
    unitLabel: "ubianka",
    unitLabelPlural: "ubianki"
  };
}

function item(
  sessionId: string,
  businessDate: string,
  status: PickerHarvestListResult["items"][number]["status"],
  overrides: Partial<PickerHarvestListResult["items"][number]> = {}
): PickerHarvestListResult["items"][number] {
  return {
    amountDueGrosz: null,
    businessDate,
    calculationBasis: "QUANTITY",
    planName: "Za ubianke",
    quantityPrecision: 1,
    seasonId: "season-2026",
    seasonName: "Sezon 2026",
    sessionId,
    status,
    syncIssue: null,
    totalEntryCount: 2,
    totalQuantityMilli: 2000,
    totalWeightG: 8000,
    unitLabelPlural: "ubianki",
    ...overrides
  };
}
