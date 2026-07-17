import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import type { AuthSessionState } from "../auth/authSession";
import type { SettlementPlanListItem } from "./settlementPlans";
import {
  AdminSettlementPlansPanel,
  type SettlementPlansApi
} from "./AdminSettlementPlansPanel";

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

const settlementPlan = ({
  id,
  ...overrides
}: Partial<SettlementPlanListItem> & { id: string }): SettlementPlanListItem => ({
  id,
  name: id,
  code: id.toLocaleUpperCase("pl-PL"),
  calculationBasis: "QUANTITY",
  unitLabelSingular: "ubianka",
  unitLabelPlural: "ubianki",
  unitSymbol: "ubianka",
  quantityPrecision: 1,
  weightRequired: false,
  allowBatchQuantity: true,
  description: null,
  active: true,
  systemDefault: false,
  createdAt: "created-at",
  createdBy: "admin-1",
  archivedAt: null,
  activeRateCount: 0,
  rateVersionCount: 0,
  wasUsed: false,
  ...overrides
});

const env = {};

describe("AdminSettlementPlansPanel", () => {
  it("requires a signed-in administrator", () => {
    render(<AdminSettlementPlansPanel authState={signedOutState} env={env} />);

    expect(screen.getByText("Logowanie wymagane")).toBeInTheDocument();
  });

  it("blocks non-admin profiles", () => {
    render(<AdminSettlementPlansPanel authState={operatorState} env={env} />);

    expect(screen.getByText("Brak dostepu")).toBeInTheDocument();
  });

  it("loads settlement plans for administrator", async () => {
    const list = vi.fn<SettlementPlansApi["list"]>().mockResolvedValue({
      plans: [
        settlementPlan({
          id: "plan-weight-kg",
          name: "Za kilogram",
          code: "WEIGHT_KG",
          calculationBasis: "WEIGHT",
          unitLabelSingular: "kilogram",
          unitLabelPlural: "kilogramy",
          unitSymbol: "kg",
          quantityPrecision: 3,
          weightRequired: true,
          systemDefault: true,
          activeRateCount: 1,
          rateVersionCount: 1,
          wasUsed: true
        }),
        settlementPlan({
          id: "plan-quantity-ubianka",
          name: "Za ubianke",
          code: "QUANTITY_UBIANKA",
          systemDefault: true,
          activeRateCount: 2,
          rateVersionCount: 2,
          wasUsed: true
        })
      ],
      invalidPlans: [
        {
          id: "broken-plan",
          reason: "Plan ma nieznana podstawe rozliczenia."
        }
      ],
      invalidRateVersions: [
        {
          id: "broken-rate",
          reason: "Wersja stawki ma nieprawidlowa kwote."
        }
      ]
    });

    render(
      <AdminSettlementPlansPanel
        authState={adminState}
        env={env}
        settlementPlansApi={{ list }}
      />
    );

    await waitFor(() => {
      expect(list).toHaveBeenCalled();
    });
    expect(
      screen.getByRole("heading", { name: "Lista planow rozliczen" })
    ).toBeInTheDocument();
    expect(screen.getByText("Za kilogram")).toBeInTheDocument();
    expect(screen.getByText("Za ubianke")).toBeInTheDocument();
    expect(screen.getByText("broken-plan")).toBeInTheDocument();
    expect(screen.getByText("broken-rate")).toBeInTheDocument();
  });

  it("filters rendered plans by basis and status", async () => {
    const user = userEvent.setup();
    const list = vi.fn<SettlementPlansApi["list"]>().mockResolvedValue({
      plans: [
        settlementPlan({
          id: "plan-weight-kg",
          name: "Za kilogram",
          code: "WEIGHT_KG",
          calculationBasis: "WEIGHT",
          unitSymbol: "kg",
          quantityPrecision: 3,
          weightRequired: true
        }),
        settlementPlan({
          id: "plan-archived",
          name: "Archiwalny plan",
          code: "ARCHIVED",
          active: false,
          archivedAt: "archived-at"
        })
      ],
      invalidPlans: [],
      invalidRateVersions: []
    });

    render(
      <AdminSettlementPlansPanel
        authState={adminState}
        env={env}
        settlementPlansApi={{ list }}
      />
    );

    await screen.findByText("Za kilogram");
    await user.selectOptions(screen.getAllByLabelText("Podstawa")[0], "WEIGHT");
    await user.selectOptions(screen.getByLabelText("Status"), "ACTIVE");

    expect(screen.getByText("Za kilogram")).toBeInTheDocument();
    expect(screen.queryByText("Archiwalny plan")).not.toBeInTheDocument();
  });

  it("creates a custom settlement plan after confirmation", async () => {
    const user = userEvent.setup();
    const list = vi.fn<SettlementPlansApi["list"]>().mockResolvedValue({
      plans: [],
      invalidPlans: [],
      invalidRateVersions: []
    });
    const create = vi.fn<NonNullable<SettlementPlansApi["create"]>>().mockResolvedValue({
      inventoryWarning: "Wpis bez wagi nie zwiekszy stanu kilogramow w magazynie."
    });

    render(
      <AdminSettlementPlansPanel
        authState={adminState}
        env={env}
        settlementPlansApi={{ list, create }}
      />
    );

    const form = within(
      await screen.findByRole("form", { name: "Tworzenie planu rozliczen" })
    );

    await user.type(form.getByLabelText("Nazwa planu"), "Za skrzynke");
    await user.type(form.getByLabelText("Kod"), "skrzynka");
    await user.type(form.getByLabelText("Jednostka"), "skrzynka");
    await user.type(form.getByLabelText("Jednostki"), "skrzynki");
    await user.type(form.getByLabelText("Symbol"), "skrz.");
    await user.selectOptions(form.getByLabelText("Precyzja"), "0");
    await user.type(form.getByLabelText("Opis"), "Rozliczenie za skrzynke.");
    await user.click(form.getByLabelText("Potwierdzam utworzenie planu"));
    await user.click(form.getByRole("button", { name: "Dodaj plan" }));

    await waitFor(() => {
      expect(create).toHaveBeenCalled();
    });
    const createInput = create.mock.calls[0]?.[1];
    expect(createInput).toMatchObject({
      actorProfile: adminState.profile,
      name: "Za skrzynke",
      code: "skrzynka",
      calculationBasis: "QUANTITY",
      unitLabelSingular: "skrzynka",
      unitLabelPlural: "skrzynki",
      unitSymbol: "skrz.",
      quantityPrecision: 0,
      weightRequired: false,
      allowBatchQuantity: true,
      description: "Rozliczenie za skrzynke."
    });
    expect(createInput.deviceId).toEqual(expect.any(String));
    expect(
      screen.getByText(
        "Utworzono plan. Wpis bez wagi nie zwiekszy stanu kilogramow w magazynie."
      )
    ).toBeInTheDocument();
  });

  it("edits safe settlement plan fields after snapshot confirmation", async () => {
    const user = userEvent.setup();
    const list = vi.fn<SettlementPlansApi["list"]>().mockResolvedValue({
      plans: [
        settlementPlan({
          id: "plan-quantity-ubianka",
          name: "Za ubianke",
          code: "QUANTITY_UBIANKA",
          unitLabelSingular: "ubianka",
          unitLabelPlural: "ubianki",
          unitSymbol: "ubianka",
          description: "Stary opis.",
          activeRateCount: 1,
          rateVersionCount: 1,
          wasUsed: true
        })
      ],
      invalidPlans: [],
      invalidRateVersions: []
    });
    const update = vi
      .fn<NonNullable<SettlementPlansApi["update"]>>()
      .mockResolvedValue({});

    render(
      <AdminSettlementPlansPanel
        authState={adminState}
        env={env}
        settlementPlansApi={{ list, update }}
      />
    );

    await screen.findByText("Za ubianke");
    await user.click(screen.getByRole("button", { name: "Edytuj" }));

    const form = within(
      await screen.findByRole("form", { name: "Edycja planu rozliczen" })
    );
    await user.clear(form.getByLabelText("Nazwa planu"));
    await user.type(form.getByLabelText("Nazwa planu"), "Za pelna ubianke");
    await user.clear(form.getByLabelText("Jednostki"));
    await user.type(form.getByLabelText("Jednostki"), "pelne ubianki");
    await user.click(
      form.getByLabelText("Potwierdzam, ze snapshoty historyczne pozostaja bez zmian")
    );
    await user.click(form.getByRole("button", { name: "Zapisz plan" }));

    await waitFor(() => {
      expect(update).toHaveBeenCalled();
    });
    const updateInput = update.mock.calls[0]?.[1];
    expect(updateInput).toMatchObject({
      actorProfile: adminState.profile,
      planId: "plan-quantity-ubianka",
      name: "Za pelna ubianke",
      unitLabelPlural: "pelne ubianki",
      confirmHistoricalSnapshotsUnchanged: true
    });
    expect(updateInput.deviceId).toEqual(expect.any(String));
    expect(screen.getByText("Zapisano plan.")).toBeInTheDocument();
  });

  it("archives an active settlement plan after confirmation", async () => {
    const user = userEvent.setup();
    const list = vi.fn<SettlementPlansApi["list"]>().mockResolvedValue({
      plans: [
        settlementPlan({
          id: "plan-skrzynka",
          name: "Za skrzynke",
          code: "SKRZYNKA",
          active: true
        })
      ],
      invalidPlans: [],
      invalidRateVersions: []
    });
    const archive = vi
      .fn<NonNullable<SettlementPlansApi["archive"]>>()
      .mockResolvedValue({});

    render(
      <AdminSettlementPlansPanel
        authState={adminState}
        env={env}
        settlementPlansApi={{ list, archive }}
      />
    );

    await screen.findByText("Za skrzynke");
    await user.click(screen.getByRole("button", { name: "Archiwizuj" }));

    const form = within(
      await screen.findByRole("form", { name: "Archiwizacja planu rozliczen" })
    );
    await user.type(form.getByLabelText("Powod"), "Nie uzywamy w tym sezonie.");
    await user.click(form.getByLabelText("Potwierdzam archiwizacje planu"));
    await user.click(form.getByRole("button", { name: "Archiwizuj plan" }));

    await waitFor(() => {
      expect(archive).toHaveBeenCalled();
    });
    const archiveInput = archive.mock.calls[0]?.[1];
    expect(archiveInput).toMatchObject({
      actorProfile: adminState.profile,
      planId: "plan-skrzynka",
      reason: "Nie uzywamy w tym sezonie."
    });
    expect(archiveInput.deviceId).toEqual(expect.any(String));
    expect(screen.getByText("Zarchiwizowano plan.")).toBeInTheDocument();
  });
});
