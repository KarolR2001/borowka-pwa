import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import type { AuthSessionState } from "../auth/authSession";
import { PickerWorkspacePanel } from "./PickerWorkspacePanel";

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
  user: { displayName: "Anna", email: "anna@example.test", uid: "picker-anna" }
};

describe("PickerWorkspacePanel", () => {
  it("loads only the selected picker tab", async () => {
    const user = userEvent.setup();
    const dashboardLoad = vi.fn().mockResolvedValue({
      accruedAmountGrosz: 0,
      dataSource: "SERVER",
      invalidPaymentCount: 0,
      invalidSeasonCount: 0,
      invalidSessionCount: 0,
      invalidWorker: false,
      paidAmountGrosz: 0,
      quantities: [],
      refreshedAtIso: "2026-07-29T08:00:00.000Z",
      remainingAmountGrosz: 0,
      seasons: [],
      selectedSeasonId: null,
      selectedSeasonName: null,
      sessionCounts: { closed: 0, open: 0, paid: 0 },
      totalWeightG: 0,
      userName: "Anna Konto",
      workerId: "worker-anna",
      workerName: "Anna Zbieracz"
    });
    const harvestLoad = vi.fn().mockResolvedValue({
      dataSource: "SERVER",
      invalidSeasonCount: 0,
      invalidSessionCount: 0,
      items: [],
      refreshedAtIso: "2026-07-29T08:00:00.000Z",
      seasons: []
    });
    const paymentLoad = vi.fn().mockResolvedValue({
      dataSource: "SERVER",
      invalidPaymentCount: 0,
      invalidSeasonCount: 0,
      invalidSessionCount: 0,
      missingSourceSessionCount: 0,
      payments: [],
      refreshedAtIso: "2026-07-29T08:00:00.000Z",
      seasons: [],
      sessions: []
    });
    const issueList = vi.fn().mockResolvedValue({
      dataSource: "SERVER",
      invalidReportCount: 0,
      reports: []
    });

    render(
      <PickerWorkspacePanel
        authState={pickerState}
        env={{}}
        isOnline
        pickerDashboardApi={{ load: dashboardLoad }}
        pickerHarvestListApi={{ load: harvestLoad }}
        pickerPaymentListApi={{ load: paymentLoad }}
        pickerIssueReportsApi={{
          create: vi.fn(),
          list: issueList
        }}
        syncDocuments={[]}
      />
    );

    expect(await screen.findByText("Anna Konto / Anna Zbieracz")).toBeInTheDocument();
    expect(harvestLoad).not.toHaveBeenCalled();
    expect(paymentLoad).not.toHaveBeenCalled();

    await user.click(screen.getByRole("tab", { name: "Moje zbiory" }));

    expect(
      await screen.findByText("Brak sesji spelniajacych wybrane filtry.")
    ).toBeInTheDocument();
    expect(harvestLoad).toHaveBeenCalledTimes(1);
    expect(paymentLoad).not.toHaveBeenCalled();

    await user.click(screen.getByRole("tab", { name: "Moje wyplaty" }));

    expect(
      await screen.findByText("Brak wyplat spelniajacych wybrane filtry.")
    ).toBeInTheDocument();
    expect(paymentLoad).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole("tab", { name: "Moje zgloszenia" }));

    expect(await screen.findByText("Brak wyslanych zgloszen.")).toBeInTheDocument();
    expect(issueList).toHaveBeenCalledTimes(1);
  });
});
