import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import type { AuthSessionState } from "../auth/authSession";
import {
  PickerOfflineDataPanel,
  type PickerOfflineDataApi
} from "./PickerOfflineDataPanel";

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

describe("PickerOfflineDataPanel", () => {
  it("shows server-confirmed synchronization time and refreshes prepared data", async () => {
    const user = userEvent.setup();
    const prepare = vi.fn<PickerOfflineDataApi["prepare"]>().mockResolvedValue({
      code: "READY",
      counts: {
        entries: 4,
        issueReports: 1,
        payments: 2,
        seasons: 1,
        sessions: 3
      },
      dataSource: "SERVER",
      lastSuccessfulSyncIso: "2026-07-29T09:30:00.000Z"
    });

    render(
      <PickerOfflineDataPanel
        authState={pickerState}
        cacheMode="PERSISTENT"
        deviceId="device-1"
        env={{}}
        isOnline
        offlineDataApi={{
          enablePersistence: vi.fn(),
          prepare,
          read: vi.fn().mockResolvedValue({
            code: "READY",
            dataSource: "SERVER",
            lastSuccessfulSyncIso: "2026-07-29T08:00:00.000Z"
          })
        }}
      />
    );

    expect(await screen.findByText("Dane offline przygotowane")).toBeInTheDocument();
    expect(screen.getByText(/Ostatnia synchronizacja:/)).toHaveTextContent("29.07.2026");

    await user.click(screen.getByRole("button", { name: "Odswiez dane offline" }));

    await waitFor(() => {
      expect(prepare).toHaveBeenCalledWith(
        {},
        expect.objectContaining({
          deviceId: "device-1",
          isOnline: true
        })
      );
    });
    expect(
      await screen.findByText("Pobrano sesje: 3, wpisy: 4, wyplaty: 2.")
    ).toBeInTheDocument();
  });

  it("marks cached data as potentially stale and hides preparation offline", async () => {
    render(
      <PickerOfflineDataPanel
        authState={pickerState}
        cacheMode="PERSISTENT"
        deviceId="device-1"
        env={{}}
        isOnline={false}
        offlineDataApi={{
          enablePersistence: vi.fn(),
          prepare: vi.fn(),
          read: vi.fn().mockResolvedValue({
            code: "READY",
            dataSource: "CACHE",
            lastSuccessfulSyncIso: "2026-07-29T08:00:00.000Z"
          })
        }}
      />
    );

    expect(await screen.findByText("Tryb offline")).toBeInTheDocument();
    expect(
      screen.getByText(
        /Dane sa kopia z ostatniej synchronizacji i nie gwarantuja aktualnosci/
      )
    ).toHaveTextContent("Najnowsze wyplaty i odpowiedzi mogly nie zostac pobrane.");
    expect(
      screen.queryByRole("button", { name: /dane offline/i })
    ).not.toBeInTheDocument();
  });

  it("blocks preparation when privacy consent is missing", async () => {
    render(
      <PickerOfflineDataPanel
        authState={{
          ...pickerState,
          profile: { ...pickerState.profile, offlineConsent: false }
        }}
        cacheMode="MEMORY"
        deviceId="device-1"
        env={{}}
        isOnline
        offlineDataApi={{
          enablePersistence: vi.fn(),
          prepare: vi.fn(),
          read: vi.fn().mockResolvedValue({
            code: "CONSENT_REQUIRED",
            dataSource: "LOCAL_POLICY",
            lastSuccessfulSyncIso: null
          })
        }}
      />
    );

    expect(await screen.findByText("Brak zgody na dane offline")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Przygotuj dane offline" })).toBeDisabled();
  });

  it("enables persistent cache for the next PWA start when consent already exists", async () => {
    const user = userEvent.setup();
    const enablePersistence = vi.fn();

    render(
      <PickerOfflineDataPanel
        authState={pickerState}
        cacheMode="MEMORY"
        deviceId="device-1"
        env={{}}
        isOnline
        offlineDataApi={{
          enablePersistence,
          prepare: vi.fn(),
          read: vi.fn().mockResolvedValue({
            code: "PERSISTENT_CACHE_REQUIRED",
            dataSource: "LOCAL_POLICY",
            lastSuccessfulSyncIso: null
          })
        }}
      />
    );

    await user.click(await screen.findByRole("button", { name: "Wlacz trwaly cache" }));

    expect(enablePersistence).toHaveBeenCalledWith(pickerState.profile);
    expect(
      screen.getByText(
        "Trwaly cache zostal wlaczony. Uruchom ponownie PWA przed przygotowaniem danych."
      )
    ).toBeInTheDocument();
  });
});
