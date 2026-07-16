import { render, screen, waitFor } from "@testing-library/react";

import type { AuthSessionState } from "../auth/authSession";
import {
  AdminDeviceDirectoryPanel,
  type DeviceDirectoryApi
} from "./AdminDeviceDirectoryPanel";

const adminState: AuthSessionState = {
  status: "READY",
  message: "Profil aplikacji jest aktywny.",
  user: {
    uid: "admin-1",
    email: "admin@example.test",
    displayName: null
  },
  profile: {
    uid: "admin-1",
    email: "admin@example.test",
    displayName: "Admin Test",
    role: "ADMIN",
    workerId: null,
    active: true,
    registrationStatus: "APPROVED",
    offlineConsent: false
  },
  access: {
    status: "READY",
    role: "ADMIN"
  }
};

const pickerState: AuthSessionState = {
  ...adminState,
  profile: {
    ...adminState.profile,
    role: "PICKER",
    workerId: "worker-1"
  },
  access: {
    status: "READY",
    role: "PICKER"
  }
};

const signedOutState: AuthSessionState = {
  status: "SIGNED_OUT",
  message: "Uzytkownik nie jest zalogowany."
};

const env = {};

describe("AdminDeviceDirectoryPanel", () => {
  it("requires a signed-in administrator", () => {
    render(<AdminDeviceDirectoryPanel authState={signedOutState} env={env} />);

    expect(screen.getByText("Logowanie wymagane")).toBeInTheDocument();
  });

  it("blocks non-admin profiles", () => {
    render(<AdminDeviceDirectoryPanel authState={pickerState} env={env} />);

    expect(screen.getByText("Brak dostepu")).toBeInTheDocument();
  });

  it("loads device records for administrator", async () => {
    const list = vi.fn<DeviceDirectoryApi["list"]>().mockResolvedValue({
      devices: [
        {
          id: "device-1",
          userUid: "picker-1",
          deviceName: "Telefon Karola",
          platform: "Android",
          trustedOfflineStorage: true,
          firstSeenAt: "first",
          lastSeenAt: "last",
          lastSuccessfulSyncAt: null,
          active: true
        }
      ],
      invalidDevices: [
        {
          id: "broken-device",
          reason: "Urzadzenie ma nieprawidlowy format."
        }
      ]
    });

    render(
      <AdminDeviceDirectoryPanel
        authState={adminState}
        env={env}
        deviceDirectoryApi={{ list }}
      />
    );

    await waitFor(() => {
      expect(list).toHaveBeenCalled();
    });
    expect(screen.getByRole("heading", { name: "Lista urzadzen" })).toBeInTheDocument();
    expect(screen.getByText("Telefon Karola")).toBeInTheDocument();
    expect(screen.getByText("picker-1")).toBeInTheDocument();
    expect(screen.getByText("broken-device")).toBeInTheDocument();
  });
});
