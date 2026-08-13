import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import type { AuthSessionState } from "../auth/authSession";
import {
  AdminPickerExportSettingsPanel,
  type PickerExportSettingsApi
} from "./AdminPickerExportSettingsPanel";

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

describe("AdminPickerExportSettingsPanel", () => {
  it("enables picker export and confirms the server value", async () => {
    const user = userEvent.setup();
    const read = vi
      .fn<PickerExportSettingsApi["read"]>()
      .mockResolvedValueOnce({
        dataSource: "SERVER",
        enabled: false,
        updatedAtIso: "2026-07-28T17:00:00.000Z"
      })
      .mockResolvedValue({
        dataSource: "SERVER",
        enabled: true,
        updatedAtIso: "2026-07-28T18:00:00.000Z"
      });
    const update = vi.fn<PickerExportSettingsApi["update"]>().mockResolvedValue();

    render(
      <AdminPickerExportSettingsPanel
        authState={adminState}
        env={{}}
        isOnline
        settingsApi={{ read, update }}
      />
    );

    const toggle = await screen.findByLabelText(
      "Zbieracz może pobrać własne zestawienie CSV"
    );
    await user.click(toggle);
    await user.click(screen.getByRole("button", { name: "Zapisz ustawienie" }));

    await waitFor(() => {
      expect(update).toHaveBeenCalledWith(
        {},
        {
          actorProfile: adminState.profile,
          enabled: true
        }
      );
    });
    expect(
      await screen.findByText("Zapisano dostępność eksportu zbieracza.")
    ).toBeInTheDocument();
    expect(screen.getByText("Status: włączony")).toBeInTheDocument();
  });

  it("blocks changing the setting offline", async () => {
    render(
      <AdminPickerExportSettingsPanel
        authState={adminState}
        env={{}}
        isOnline={false}
        settingsApi={{
          read: vi.fn().mockResolvedValue({
            dataSource: "CACHE",
            enabled: true,
            updatedAtIso: "2026-07-28T17:00:00.000Z"
          }),
          update: vi.fn()
        }}
      />
    );

    await screen.findByText("Status: włączony");
    expect(screen.queryByText(/wymaga połączenia/i)).not.toBeInTheDocument();
    expect(
      screen.getByLabelText("Zbieracz może pobrać własne zestawienie CSV")
    ).toBeDisabled();
  });
});
