import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import type { AuthSessionState } from "../auth/authSession";
import type { SeasonDocument } from "../domain/domainConfiguration";
import { AdminSeasonsPanel, type SeasonsApi } from "./AdminSeasonsPanel";

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

const operatorState: AuthSessionState = {
  ...adminState,
  profile: {
    ...adminState.profile,
    role: "OPERATOR"
  },
  access: {
    status: "READY",
    role: "OPERATOR"
  }
};

const signedOutState: AuthSessionState = {
  status: "SIGNED_OUT",
  message: "Uzytkownik nie jest zalogowany."
};

const season = ({
  id,
  ...overrides
}: Partial<SeasonDocument> & { id: string }): SeasonDocument => ({
  id,
  name: id,
  startDate: "2026-07-01",
  endDate: "2026-09-30",
  status: "OPEN",
  isDefault: false,
  createdAt: "created-at",
  createdBy: "admin-1",
  closedAt: null,
  closedBy: null,
  reopenedAt: null,
  ...overrides
});

const env = {};

describe("AdminSeasonsPanel", () => {
  it("requires a signed-in administrator", () => {
    render(<AdminSeasonsPanel authState={signedOutState} env={env} />);

    expect(screen.getByText("Logowanie wymagane")).toBeInTheDocument();
  });

  it("blocks non-admin profiles", () => {
    render(<AdminSeasonsPanel authState={operatorState} env={env} />);

    expect(screen.getByText("Brak dostepu")).toBeInTheDocument();
  });

  it("loads seasons for administrator and renders invalid documents", async () => {
    const list = vi.fn<SeasonsApi["list"]>().mockResolvedValue({
      seasons: [
        season({
          id: "season-2026",
          name: "Sezon 2026",
          status: "OPEN",
          isDefault: true
        }),
        season({
          id: "season-2027",
          name: "Sezon 2027",
          status: "PLANNED",
          isDefault: false
        })
      ],
      invalidSeasons: [
        {
          id: "broken-season",
          reason: "Sezon ma nieznany status."
        }
      ]
    });

    render(<AdminSeasonsPanel authState={adminState} env={env} seasonsApi={{ list }} />);

    await waitFor(() => {
      expect(list).toHaveBeenCalled();
    });
    expect(
      screen.getByRole("heading", { name: "Konfiguracja sezonow" })
    ).toBeInTheDocument();
    expect(screen.getAllByText("Sezon 2026").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Sezon 2027").length).toBeGreaterThan(0);
    expect(screen.getByText("broken-season")).toBeInTheDocument();
  });

  it("creates a season after explicit confirmation", async () => {
    const user = userEvent.setup();
    const list = vi.fn<SeasonsApi["list"]>().mockResolvedValue({
      seasons: [],
      invalidSeasons: []
    });
    const create = vi.fn<NonNullable<SeasonsApi["create"]>>().mockResolvedValue({});

    render(
      <AdminSeasonsPanel authState={adminState} env={env} seasonsApi={{ list, create }} />
    );

    await screen.findByLabelText("Tworzenie sezonu");
    await user.type(screen.getByLabelText("Nazwa sezonu"), "Sezon 2027");
    await user.type(screen.getByLabelText("Data od"), "2027-07-01");
    await user.type(screen.getByLabelText("Data do"), "2027-09-30");
    await user.selectOptions(screen.getByLabelText("Status startowy"), "OPEN");
    await user.click(screen.getByLabelText("Ustaw jako sezon domyslny"));
    await user.click(screen.getByLabelText("Potwierdzam utworzenie sezonu"));
    await user.click(screen.getByRole("button", { name: "Dodaj sezon" }));

    await waitFor(() => {
      expect(create).toHaveBeenCalled();
    });
    const createInput = create.mock.calls[0]?.[1];
    expect(createInput).toMatchObject({
      actorProfile: adminState.profile,
      name: "Sezon 2027",
      startDate: "2027-07-01",
      endDate: "2027-09-30",
      status: "OPEN",
      isDefault: true,
      allowDateOverlap: false
    });
    expect(createInput.deviceId).toEqual(expect.any(String));
    expect(screen.getByText("Utworzono sezon.")).toBeInTheDocument();
  });

  it("updates a season status with reason and confirmation", async () => {
    const user = userEvent.setup();
    const targetSeason = season({
      id: "season-2026",
      name: "Sezon 2026",
      status: "OPEN"
    });
    const list = vi.fn<SeasonsApi["list"]>().mockResolvedValue({
      seasons: [targetSeason],
      invalidSeasons: []
    });
    const updateStatus = vi
      .fn<NonNullable<SeasonsApi["updateStatus"]>>()
      .mockResolvedValue({});

    render(
      <AdminSeasonsPanel
        authState={adminState}
        env={env}
        seasonsApi={{ list, updateStatus }}
      />
    );

    await screen.findByLabelText("Zmiana sezonu");
    await waitFor(() => {
      expect(screen.getByLabelText("Sezon")).toHaveValue("season-2026");
    });
    await user.type(screen.getByLabelText("Powod"), "Koniec testowego sezonu");
    await user.click(screen.getByLabelText("Potwierdzam operacje na sezonie"));
    await user.click(screen.getByRole("button", { name: "Zapisz sezon" }));

    await waitFor(() => {
      expect(updateStatus).toHaveBeenCalled();
    });
    const updateInput = updateStatus.mock.calls[0]?.[1];
    expect(updateInput).toMatchObject({
      actorProfile: adminState.profile,
      targetSeason,
      action: "CLOSE",
      reason: "Koniec testowego sezonu"
    });
    expect(updateInput.deviceId).toEqual(expect.any(String));
    expect(screen.getByText("Zmieniono sezon.")).toBeInTheDocument();
  });
});
