import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import type { AuthSessionState } from "../auth/authSession";
import type { WorkerDirectoryListItem } from "./workerDirectory";
import { WorkerDirectoryPanel, type WorkerDirectoryApi } from "./WorkerDirectoryPanel";

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

const worker = ({
  id,
  ...overrides
}: Partial<WorkerDirectoryListItem> & { id: string }): WorkerDirectoryListItem => ({
  id,
  displayName: id,
  normalizedName: id,
  active: true,
  currentPlanId: "plan-weight",
  currentRateVersionId: `rate-${id}`,
  linkedUserUid: null,
  phone: null,
  emailContact: null,
  notes: null,
  createdAt: "created-at",
  createdBy: "admin-1",
  updatedAt: "created-at",
  archivedAt: null,
  legacyName: null,
  currentPlan: {
    id: "plan-weight",
    name: "Za kilogram",
    code: "WEIGHT_KG",
    calculationBasis: "WEIGHT",
    unitLabelSingular: "kilogram",
    unitLabelPlural: "kilogramy",
    unitSymbol: "kg",
    quantityPrecision: 3,
    weightRequired: true,
    allowBatchQuantity: true,
    description: null,
    active: true,
    systemDefault: true,
    createdAt: "created-at",
    createdBy: "admin-1",
    archivedAt: null
  },
  currentRateVersion: {
    id: `rate-${id}`,
    workerId: id,
    planId: "plan-weight",
    rateGroszPerUnit: 1000,
    validFrom: "2026-07-01",
    validTo: null,
    active: true,
    note: null,
    createdAt: "created-at",
    createdBy: "admin-1",
    supersedesRateId: null
  },
  linkedUser: null,
  warnings: [],
  seasonSummary: {
    totalKgGrams: null,
    earnedGrosz: null,
    paidGrosz: null,
    dueGrosz: null
  },
  ...overrides
});

const env = {};

describe("WorkerDirectoryPanel", () => {
  it("requires a signed-in administrator or operator", () => {
    render(<WorkerDirectoryPanel authState={signedOutState} env={env} />);

    expect(screen.getByText("Logowanie wymagane")).toBeInTheDocument();
  });

  it("blocks picker profiles", () => {
    render(<WorkerDirectoryPanel authState={pickerState} env={env} />);

    expect(screen.getByText("Brak dostepu")).toBeInTheDocument();
  });

  it("loads administrator worker directory with account, financial placeholders and warnings", async () => {
    const list = vi.fn<WorkerDirectoryApi["list"]>().mockResolvedValue({
      workers: [
        worker({
          id: "worker-anna",
          displayName: "Anna Test",
          linkedUserUid: "picker-anna",
          linkedUser: {
            uid: "picker-anna",
            email: "anna@example.test",
            displayName: "Anna Picker",
            role: "PICKER",
            workerId: "worker-anna",
            active: true,
            registrationStatus: "APPROVED",
            offlineConsent: false
          },
          warnings: ["Brak aktualnej stawki."]
        })
      ],
      plans: [
        {
          id: "plan-weight",
          name: "Za kilogram",
          code: "WEIGHT_KG",
          calculationBasis: "WEIGHT",
          unitLabelSingular: "kilogram",
          unitLabelPlural: "kilogramy",
          unitSymbol: "kg",
          quantityPrecision: 3,
          weightRequired: true,
          allowBatchQuantity: true,
          description: null,
          active: true,
          systemDefault: true,
          createdAt: "created-at",
          createdBy: "admin-1",
          archivedAt: null
        }
      ],
      invalidWorkers: [],
      invalidPlans: [],
      invalidRateVersions: [],
      invalidProfiles: []
    });

    render(
      <WorkerDirectoryPanel
        authState={adminState}
        env={env}
        workerDirectoryApi={{ list }}
      />
    );

    await waitFor(() => {
      expect(list).toHaveBeenCalledWith(env, {
        viewerRole: "ADMIN"
      });
    });
    expect(screen.getByRole("heading", { name: "Lista zbieraczy" })).toBeInTheDocument();
    expect(screen.getByText("Anna Test")).toBeInTheDocument();
    expect(screen.getByText("10,00 zł")).toBeInTheDocument();
    expect(screen.getByText("anna@example.test")).toBeInTheDocument();
    expect(screen.getAllByText("brak danych")).toHaveLength(4);
    expect(screen.getByText("Brak aktualnej stawki.")).toBeInTheDocument();
  });

  it("creates a worker with initial rate after confirmation", async () => {
    const user = userEvent.setup();
    const list = vi.fn<WorkerDirectoryApi["list"]>().mockResolvedValue({
      workers: [],
      plans: [
        {
          id: "plan-weight",
          name: "Za kilogram",
          code: "WEIGHT_KG",
          calculationBasis: "WEIGHT",
          unitLabelSingular: "kilogram",
          unitLabelPlural: "kilogramy",
          unitSymbol: "kg",
          quantityPrecision: 3,
          weightRequired: true,
          allowBatchQuantity: true,
          description: null,
          active: true,
          systemDefault: true,
          createdAt: "created-at",
          createdBy: "admin-1",
          archivedAt: null
        }
      ],
      invalidWorkers: [],
      invalidPlans: [],
      invalidRateVersions: [],
      invalidProfiles: []
    });
    const create = vi
      .fn<NonNullable<WorkerDirectoryApi["create"]>>()
      .mockResolvedValue({});

    render(
      <WorkerDirectoryPanel
        authState={adminState}
        env={env}
        workerDirectoryApi={{ list, create }}
      />
    );

    const form = await screen.findByRole("form", { name: "Tworzenie zbieracza" });

    await user.type(screen.getByLabelText("Nazwa zbieracza"), "Anna Nowa");
    await user.type(screen.getByLabelText("Stawka"), "12,50");
    await user.clear(screen.getByLabelText("Od dnia"));
    await user.type(screen.getByLabelText("Od dnia"), "2026-07-15");
    await user.type(screen.getByLabelText("Telefon"), "500 600 700");
    await user.type(screen.getByLabelText("E-mail kontaktowy"), "anna@example.test");
    await user.type(screen.getByLabelText("Notatka"), "Pierwsza osoba.");
    await user.click(
      screen.getByLabelText("Potwierdzam utworzenie zbieracza i pierwszej stawki")
    );
    await user.click(within(form).getByRole("button", { name: "Dodaj zbieracza" }));

    await waitFor(() => {
      expect(create).toHaveBeenCalled();
    });
    const createInput = create.mock.calls[0]?.[1];
    expect(createInput).toMatchObject({
      actorProfile: adminState.profile,
      displayName: "Anna Nowa",
      planId: "plan-weight",
      rateGroszPerUnit: 1250,
      validFrom: "2026-07-15",
      phone: "500 600 700",
      emailContact: "anna@example.test",
      notes: "Pierwsza osoba.",
      confirmSimilarName: true
    });
    expect(createInput.deviceId).toEqual(expect.any(String));
    expect(screen.getByText("Utworzono zbieracza.")).toBeInTheDocument();
  });

  it("loads simplified active worker directory for operator", async () => {
    const list = vi.fn<WorkerDirectoryApi["list"]>().mockResolvedValue({
      workers: [
        worker({
          id: "worker-bartek",
          displayName: "Bartek Test"
        })
      ],
      plans: [],
      invalidWorkers: [],
      invalidPlans: [],
      invalidRateVersions: [],
      invalidProfiles: []
    });

    render(
      <WorkerDirectoryPanel
        authState={operatorState}
        env={env}
        workerDirectoryApi={{ list }}
      />
    );

    await waitFor(() => {
      expect(list).toHaveBeenCalledWith(env, {
        viewerRole: "OPERATOR"
      });
    });
    expect(screen.getByText("Bartek Test")).toBeInTheDocument();
    expect(screen.getByText("Za kilogram")).toBeInTheDocument();
    expect(screen.getByText("kg")).toBeInTheDocument();
    expect(screen.queryByText("Naliczone")).not.toBeInTheDocument();
    expect(screen.queryByText("10,00 zł")).not.toBeInTheDocument();
  });

  it("filters workers by status and plan", async () => {
    const user = userEvent.setup();
    const list = vi.fn<WorkerDirectoryApi["list"]>().mockResolvedValue({
      workers: [
        worker({
          id: "worker-active",
          displayName: "Aktywna osoba"
        }),
        worker({
          id: "worker-archived",
          displayName: "Archiwalna osoba",
          active: false
        })
      ],
      plans: [
        {
          id: "plan-weight",
          name: "Za kilogram",
          code: "WEIGHT_KG",
          calculationBasis: "WEIGHT",
          unitLabelSingular: "kilogram",
          unitLabelPlural: "kilogramy",
          unitSymbol: "kg",
          quantityPrecision: 3,
          weightRequired: true,
          allowBatchQuantity: true,
          description: null,
          active: true,
          systemDefault: true,
          createdAt: "created-at",
          createdBy: "admin-1",
          archivedAt: null
        }
      ],
      invalidWorkers: [],
      invalidPlans: [],
      invalidRateVersions: [],
      invalidProfiles: []
    });

    render(
      <WorkerDirectoryPanel
        authState={adminState}
        env={env}
        workerDirectoryApi={{ list }}
      />
    );

    await screen.findByText("Aktywna osoba");
    const filters = screen.getByRole("group", { name: "Filtry zbieraczy" });

    await user.selectOptions(screen.getByLabelText("Status"), "ARCHIVED");
    await user.selectOptions(within(filters).getByLabelText("Plan"), "plan-weight");

    expect(screen.queryByText("Aktywna osoba")).not.toBeInTheDocument();
    expect(screen.getByText("Archiwalna osoba")).toBeInTheDocument();
  });
});
