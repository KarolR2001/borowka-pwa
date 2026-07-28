import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import type { AuthSessionState } from "../auth/authSession";
import { PickerDataExportPanel } from "./PickerDataExportPanel";
import type { PickerDataExportResult } from "./pickerDataExport";

const pickerState: AuthSessionState = {
  access: { role: "PICKER", status: "READY" },
  message: "Profil aktywny.",
  profile: {
    active: true,
    displayName: "Anna",
    email: "anna@example.test",
    offlineConsent: true,
    registrationStatus: "APPROVED",
    role: "PICKER",
    uid: "picker-1",
    workerId: "worker-1"
  },
  status: "READY",
  user: { displayName: "Anna", email: "anna@example.test", uid: "picker-1" }
};

describe("PickerDataExportPanel", () => {
  it("downloads a filtered server CSV", async () => {
    const user = userEvent.setup();
    const downloadCsv = vi.fn();

    render(
      <PickerDataExportPanel
        authState={pickerState}
        env={{}}
        exportApi={{
          downloadCsv,
          load: vi.fn().mockResolvedValue(exportResult())
        }}
        isOnline
      />
    );

    await user.selectOptions(await screen.findByLabelText("Sezon"), "season-2026");
    await user.click(screen.getByRole("button", { name: "Pobierz CSV" }));

    expect(downloadCsv).toHaveBeenCalledTimes(1);
    expect(downloadCsv.mock.calls[0]?.[0]).toContain('"Typ rekordu"');
    expect(downloadCsv.mock.calls[0]?.[0]).toContain('"NALICZENIE"');
    expect(downloadCsv.mock.calls[0]?.[1]).toMatch(/^borowka-moje-dane-.*\.csv$/);
    expect(screen.getByText("Wyeksportowano sesje: 1, wyplaty: 1.")).toBeInTheDocument();
  });

  it("requires an explicit incomplete cache export", async () => {
    const user = userEvent.setup();
    const downloadCsv = vi.fn();

    render(
      <PickerDataExportPanel
        authState={pickerState}
        env={{}}
        exportApi={{
          downloadCsv,
          load: vi.fn().mockResolvedValue(exportResult({ dataSource: "CACHE" }))
        }}
        isOnline={false}
      />
    );

    expect(
      await screen.findByText("Eksport z cache bedzie wyraznie oznaczony jako niepelny.")
    ).toBeInTheDocument();
    await user.click(
      screen.getByRole("button", { name: "Eksportuj niepelny CSV z cache" })
    );

    expect(downloadCsv.mock.calls[0]?.[0]).toContain(
      '"Kompletnosc";"NIEPELNY - DANE Z CACHE"'
    );
  });

  it("does not expose download while the administrator setting is disabled", async () => {
    render(
      <PickerDataExportPanel
        authState={pickerState}
        env={{}}
        exportApi={{
          downloadCsv: vi.fn(),
          load: vi.fn().mockResolvedValue(
            exportResult({
              enabled: false,
              payments: [],
              sessions: [],
              sessionSummaries: []
            })
          )
        }}
        isOnline
      />
    );

    expect(
      await screen.findByText("Administrator nie wlaczyl eksportu wlasnego zestawienia.")
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Pobierz CSV" })).not.toBeInTheDocument();
  });
});

function exportResult(
  overrides: Partial<PickerDataExportResult> = {}
): PickerDataExportResult {
  return {
    dataSource: "SERVER",
    enabled: true,
    invalidPaymentCount: 0,
    invalidSeasonCount: 0,
    invalidSessionCount: 0,
    missingSourceSessionCount: 0,
    payments: [
      {
        amountGrosz: 5000,
        id: "payment-1",
        paidBusinessDate: "2026-07-11",
        paymentMethod: "CASH",
        seasonId: "season-2026",
        seasonName: "Sezon 2026",
        sessionBusinessDate: "2026-07-10",
        sessionId: "session-1",
        status: "ACTIVE"
      }
    ],
    refreshedAtIso: "2026-07-28T18:00:00.000Z",
    seasons: [{ id: "season-2026", name: "Sezon 2026" }],
    sessions: [
      {
        amountDueGrosz: 5000,
        businessDate: "2026-07-10",
        calculationBasis: "WEIGHT",
        planName: "Za kilogram",
        quantityPrecision: 3,
        seasonId: "season-2026",
        seasonName: "Sezon 2026",
        sessionId: "session-1",
        status: "PAID",
        syncIssue: null,
        totalEntryCount: 1,
        totalQuantityMilli: 5000,
        totalWeightG: 5000,
        unitLabelPlural: "kilogramy"
      }
    ],
    sessionSummaries: [
      {
        amountDueGrosz: 5000,
        businessDate: "2026-07-10",
        seasonId: "season-2026",
        sessionId: "session-1",
        status: "PAID"
      }
    ],
    settingUpdatedAtIso: "2026-07-28T17:00:00.000Z",
    workerId: "worker-1",
    ...overrides
  };
}
