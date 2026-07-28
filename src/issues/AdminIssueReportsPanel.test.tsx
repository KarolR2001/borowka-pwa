import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import type { AuthSessionState } from "../auth/authSession";
import {
  AdminIssueReportsPanel,
  type AdminIssueReportsApi
} from "./AdminIssueReportsPanel";

const adminState: AuthSessionState = {
  access: { role: "ADMIN", status: "READY" },
  message: "Profil aktywny.",
  profile: {
    active: true,
    displayName: "Admin",
    email: "admin@example.test",
    offlineConsent: false,
    registrationStatus: "APPROVED",
    role: "ADMIN",
    uid: "admin-1",
    workerId: null
  },
  status: "READY",
  user: { displayName: "Admin", email: "admin@example.test", uid: "admin-1" }
};

describe("AdminIssueReportsPanel", () => {
  it("shows source data and resolves an open report with an answer", async () => {
    const user = userEvent.setup();
    const resolve = vi.fn<AdminIssueReportsApi["resolve"]>().mockResolvedValue();
    const api: AdminIssueReportsApi = {
      list: vi.fn().mockResolvedValue({
        invalidReportCount: 0,
        reports: [openReport()]
      }),
      loadSource: vi.fn().mockResolvedValue({
        entry: null,
        session: {
          amountDueGrosz: 2250,
          businessDate: "2026-07-29",
          id: "session-1",
          paymentId: null,
          seasonId: "season-2026",
          status: "CLOSED",
          workerId: "worker-1",
          workerName: "Anna Zbieracz"
        }
      }),
      resolve
    };

    render(
      <AdminIssueReportsPanel
        authState={adminState}
        env={{}}
        isOnline
        issueReportsApi={api}
      />
    );

    expect(await screen.findByText("Kwota jest nieprawidlowa.")).toBeInTheDocument();
    await user.click(
      screen.getByRole("button", { name: "Otworz dane zrodlowe report-1" })
    );
    expect(await screen.findByText("Anna Zbieracz")).toBeInTheDocument();
    expect(screen.getByText("22,50 zł")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Odpowiedz" }));
    await user.type(
      screen.getByLabelText("Wyjasnienie dla pickera"),
      "Sprawdzono naliczenie i wykonano korekte."
    );
    await user.click(screen.getByRole("button", { name: "Oznacz rozwiazane" }));

    await waitFor(() => {
      expect(resolve).toHaveBeenCalledWith(
        {},
        expect.objectContaining({
          reportId: "report-1",
          resolutionNote: "Sprawdzono naliczenie i wykonano korekte.",
          status: "RESOLVED"
        })
      );
    });
  });
});

function openReport() {
  return {
    createdAtIso: "2026-07-29T08:00:00.000Z",
    entryId: null,
    id: "report-1",
    message: "Kwota jest nieprawidlowa.",
    reporterUid: "picker-1",
    resolutionNote: null,
    resolvedAtIso: null,
    resolvedBy: null,
    seasonId: "season-2026",
    sessionId: "session-1",
    status: "OPEN" as const,
    subject: "AMOUNT" as const,
    workerId: "worker-1"
  };
}
