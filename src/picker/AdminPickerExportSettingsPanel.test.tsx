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
      "Picker moze pobrac wlasne zestawienie CSV"
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
      await screen.findByText("Zapisano dostepnosc eksportu pickera.")
    ).toBeInTheDocument();
    expect(screen.getByText("Status: wlaczony")).toBeInTheDocument();
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

    expect(
      await screen.findByText("Zmiana ustawienia wymaga polaczenia.")
    ).toBeInTheDocument();
    expect(
      screen.getByLabelText("Picker moze pobrac wlasne zestawienie CSV")
    ).toBeDisabled();
  });
});
