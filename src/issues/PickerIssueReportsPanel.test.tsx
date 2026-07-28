import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import type { AuthSessionState } from "../auth/authSession";
import {
  PickerIssueReportsPanel,
  type PickerIssueReportsApi
} from "./PickerIssueReportsPanel";

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

describe("PickerIssueReportsPanel", () => {
  it("creates an entry report from selected own session", async () => {
    const user = userEvent.setup();
    const create = vi.fn<PickerIssueReportsApi["create"]>().mockResolvedValue({
      id: "report-1",
      message: "Zgloszenie zostalo przekazane administratorowi.",
      status: "CREATED"
    });
    const list = vi.fn<PickerIssueReportsApi["list"]>().mockResolvedValue({
      dataSource: "SERVER",
      invalidReportCount: 0,
      reports: []
    });
    const load = vi.fn().mockResolvedValue(sessionDetails());
    const onInitialSessionHandled = vi.fn();

    render(
      <PickerIssueReportsPanel
        authState={pickerState}
        deviceId="device-1"
        env={{}}
        initialSessionId="session-1"
        isOnline
        issueReportsApi={{ create, list }}
        onInitialSessionHandled={onInitialSessionHandled}
        sessionDetailsApi={{ load }}
      />
    );

    expect(await screen.findByText("Sesja z 29.07.2026")).toBeInTheDocument();
    expect(onInitialSessionHandled).toHaveBeenCalledTimes(1);

    await user.selectOptions(screen.getByLabelText("Problem dotyczy"), "ENTRY");
    await user.selectOptions(screen.getByLabelText("Wpis"), "entry-1");
    await user.type(
      screen.getByLabelText("Krotki opis"),
      "Waga wpisu wymaga sprawdzenia."
    );
    await user.click(screen.getByRole("button", { name: "Wyslij zgloszenie" }));

    await waitFor(() => {
      expect(create).toHaveBeenCalledWith(
        {},
        expect.objectContaining({
          entryId: "entry-1",
          message: "Waga wpisu wymaga sprawdzenia.",
          sessionId: "session-1",
          subject: "ENTRY"
        })
      );
    });
    expect(
      await screen.findByText("Zgloszenie zostalo przekazane administratorowi.")
    ).toBeInTheDocument();
  });

  it("queues a prepared report offline", async () => {
    const user = userEvent.setup();
    const onLocalDocumentsChanged = vi.fn().mockResolvedValue(undefined);
    const create = vi.fn<PickerIssueReportsApi["create"]>().mockResolvedValue({
      id: "report-offline",
      message: "Zgloszenie zapisano lokalnie. Zostanie wyslane po odzyskaniu polaczenia.",
      status: "QUEUED"
    });
    const list = vi
      .fn<PickerIssueReportsApi["list"]>()
      .mockResolvedValueOnce({
        dataSource: "CACHE",
        invalidReportCount: 0,
        reports: []
      })
      .mockResolvedValue({
        dataSource: "CACHE",
        invalidReportCount: 0,
        reports: [
          {
            createdAtIso: "2026-07-29T08:00:00.000Z",
            entryId: null,
            id: "report-offline",
            message: "Status wyplaty wymaga sprawdzenia.",
            pendingSync: true,
            resolutionNote: null,
            resolvedAtIso: null,
            seasonId: "season-2026",
            sessionId: "session-1",
            status: "OPEN",
            subject: "SESSION"
          }
        ]
      });

    render(
      <PickerIssueReportsPanel
        authState={pickerState}
        deviceId="device-1"
        env={{}}
        initialSessionId="session-1"
        isOnline={false}
        issueReportsApi={{
          create,
          list
        }}
        onInitialSessionHandled={() => undefined}
        onLocalDocumentsChanged={onLocalDocumentsChanged}
        sessionDetailsApi={{ load: vi.fn().mockResolvedValue(sessionDetails()) }}
      />
    );

    expect(
      await screen.findByText(
        "Zgloszenie zostanie zapisane lokalnie i wyslane po odzyskaniu polaczenia."
      )
    ).toBeInTheDocument();
    await user.type(
      screen.getByLabelText("Krotki opis"),
      "Status wyplaty wymaga sprawdzenia."
    );
    await user.click(screen.getByRole("button", { name: "Wyslij zgloszenie" }));

    expect(create).toHaveBeenCalledWith(
      {},
      expect.objectContaining({
        isOnline: false,
        sessionId: "session-1"
      })
    );
    expect(
      await screen.findByText(
        "Zgloszenie zapisano lokalnie. Zostanie wyslane po odzyskaniu polaczenia."
      )
    ).toBeInTheDocument();
    expect(await screen.findByText("Oczekuje na synchronizacje")).toBeInTheDocument();
    expect(onLocalDocumentsChanged).toHaveBeenCalledTimes(1);
  });
});

function sessionDetails() {
  return {
    activeEntryCount: 1,
    amountDueGrosz: 2250,
    businessDate: "2026-07-29",
    calculationBasis: "QUANTITY" as const,
    dataSource: "SERVER" as const,
    entries: [
      {
        cancellationReason: null,
        id: "entry-1",
        kind: "ORIGINAL" as const,
        quantityMilli: 1500,
        replacesEntryId: null,
        sequenceNumber: 1,
        status: "ACTIVE" as const,
        weightG: 6000
      }
    ],
    invalidEntryCount: 0,
    invalidPayment: false,
    payment: null,
    planName: "Za ubianke",
    quantityPrecision: 1,
    rateGrosz: 1500,
    seasonId: "season-2026",
    sessionId: "session-1",
    status: "CLOSED" as const,
    totalQuantityMilli: 1500,
    totalWeightG: 6000,
    unitLabel: "ubianka",
    unitLabelPlural: "ubianki"
  };
}
