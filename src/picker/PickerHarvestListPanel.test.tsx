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
  it("shows all statuses, meaningful sync state and opens a session preview", async () => {
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

    expect(await screen.findByText("Oczekuje synchronizacji")).toBeInTheDocument();
    expect(screen.getAllByText("Wymaga przegladu")).toHaveLength(2);
    expect(screen.getAllByText("Anulowano")).toHaveLength(2);
    expect(screen.getAllByText("2 ubianki")).toHaveLength(4);
    expect(screen.getByText("Dane z pamieci offline")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Otworz sesje 29.07.2026" }));

    expect(
      screen.getByRole("heading", { name: "Sesja z 29.07.2026" })
    ).toBeInTheDocument();
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

    await screen.findByText("Oczekuje synchronizacji");
    await user.selectOptions(screen.getByLabelText("Status"), "PAID");

    expect(
      screen.getByRole("button", { name: "Otworz sesje 28.07.2026" })
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Otworz sesje 27.07.2026" })
    ).not.toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText("Sezon"), "season-2025");

    await waitFor(() => {
      expect(
        screen.getByText("Brak sesji spelniajacych wybrane filtry.")
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
      screen.getByText("Lista wymaga aktywnego konta zbieracza powiazanego z workerId.")
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
      { id: "season-2026", name: "Sezon 2026" },
      { id: "season-2025", name: "Sezon 2025" }
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
