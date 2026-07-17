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
}: Partial<WorkerDirectoryListItem> & { id: string }): WorkerDirectoryListItem => {
  const currentRateVersion = {
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
  };

  return {
    id,
    displayName: id,
    normalizedName: id,
    active: true,
    currentPlanId: "plan-weight",
    currentRateVersionId: currentRateVersion.id,
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
    currentRateVersion,
    rateVersions: [currentRateVersion],
    linkedUser: null,
    auditEvents: [],
    warnings: [],
    seasonSummary: {
      totalKgGrams: null,
      earnedGrosz: null,
      paidGrosz: null,
      dueGrosz: null
    },
    ...overrides
  };
};

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
      profiles: [],
      invalidWorkers: [],
      invalidPlans: [],
      invalidRateVersions: [],
      invalidProfiles: [],
      invalidAuditEvents: []
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

  it("opens administrator worker profile with rate history and audit events", async () => {
    const user = userEvent.setup();
    const currentRateVersion = {
      id: "rate-worker-anna-2026-07-01",
      workerId: "worker-anna",
      planId: "plan-weight",
      rateGroszPerUnit: 1000,
      validFrom: "2026-07-01",
      validTo: null,
      active: true,
      note: "Aktualna stawka.",
      createdAt: "created-at",
      createdBy: "admin-1",
      supersedesRateId: null
    };
    const list = vi.fn<WorkerDirectoryApi["list"]>().mockResolvedValue({
      workers: [
        worker({
          id: "worker-anna",
          displayName: "Anna Test",
          phone: "500 600 700",
          emailContact: "anna@example.test",
          notes: "Osoba testowa.",
          currentRateVersionId: currentRateVersion.id,
          currentRateVersion,
          rateVersions: [
            currentRateVersion,
            {
              id: "rate-worker-anna-2026-06-01",
              workerId: "worker-anna",
              planId: "plan-weight",
              rateGroszPerUnit: 900,
              validFrom: "2026-06-01",
              validTo: "2026-06-30",
              active: false,
              note: "Poprzednia stawka.",
              createdAt: "created-at",
              createdBy: "admin-1",
              supersedesRateId: null
            },
            {
              id: "rate-worker-anna-2999-08-01",
              workerId: "worker-anna",
              planId: "plan-weight",
              rateGroszPerUnit: 1100,
              validFrom: "2999-08-01",
              validTo: null,
              active: true,
              note: "Przyszla stawka.",
              createdAt: "created-at",
              createdBy: "admin-1",
              supersedesRateId: null
            }
          ],
          auditEvents: [
            {
              id: "audit-worker-created",
              actorUid: "admin-1",
              actorRoleSnapshot: "ADMIN",
              action: "WORKER_CREATED",
              entityType: "WORKER",
              entityId: "worker-anna",
              businessDate: null,
              beforeSummary: null,
              afterSummary: {
                workerId: "worker-anna"
              },
              reason: "Pierwszy zapis.",
              createdAtDevice: "device-time",
              createdAtServer: "server-time",
              deviceId: "device-1"
            }
          ]
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
      profiles: [],
      invalidWorkers: [],
      invalidPlans: [],
      invalidRateVersions: [],
      invalidProfiles: [],
      invalidAuditEvents: []
    });

    render(
      <WorkerDirectoryPanel
        authState={adminState}
        env={env}
        workerDirectoryApi={{ list }}
      />
    );

    await screen.findByText("Anna Test");
    await user.click(screen.getByRole("button", { name: "Profil" }));

    const profile = screen.getByRole("region", {
      name: "Profil zbieracza Anna Test"
    });

    expect(
      within(profile).getByRole("heading", { name: "Anna Test" })
    ).toBeInTheDocument();
    expect(within(profile).getByText("500 600 700")).toBeInTheDocument();
    expect(within(profile).getByText("anna@example.test")).toBeInTheDocument();
    expect(within(profile).getByText("Aktualna stawka.")).toBeInTheDocument();
    expect(within(profile).getByText("Poprzednia stawka.")).toBeInTheDocument();
    expect(within(profile).getByText("Przyszla stawka.")).toBeInTheDocument();
    expect(within(profile).getByText("9,00 zł")).toBeInTheDocument();
    expect(within(profile).getByText("Przyszla")).toBeInTheDocument();
    expect(
      within(profile).getAllByText("Naklada sie z wersja od 2026-07-01.").length
    ).toBeGreaterThan(0);
    expect(
      within(profile).getByRole("heading", {
        name: "Kontrola spojnosci stawek"
      })
    ).toBeInTheDocument();
    expect(
      within(profile).getByText(
        "Bez funkcji serwerowej nie ma pelnej gwarancji serializacji dwoch rownoleglych zmian."
      )
    ).toBeInTheDocument();
    expect(within(profile).getByText("Utworzenie zbieracza")).toBeInTheDocument();
    expect(within(profile).getByText("Pierwszy zapis.")).toBeInTheDocument();
  });

  it("adds a new worker rate from administrator profile", async () => {
    const user = userEvent.setup();
    const list = vi.fn<WorkerDirectoryApi["list"]>().mockResolvedValue({
      workers: [
        worker({
          id: "worker-anna",
          displayName: "Anna Test"
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
      profiles: [],
      invalidWorkers: [],
      invalidPlans: [],
      invalidRateVersions: [],
      invalidProfiles: [],
      invalidAuditEvents: []
    });
    const createRate = vi
      .fn<NonNullable<WorkerDirectoryApi["createRate"]>>()
      .mockResolvedValue({});

    render(
      <WorkerDirectoryPanel
        authState={adminState}
        env={env}
        workerDirectoryApi={{ list, createRate }}
      />
    );

    await screen.findByText("Anna Test");
    await user.click(screen.getByRole("button", { name: "Profil" }));

    const form = await screen.findByRole("form", {
      name: "Dodawanie stawki zbieracza"
    });

    await user.type(within(form).getByLabelText("Stawka"), "14,00");
    await user.clear(within(form).getByLabelText("Od dnia"));
    await user.type(within(form).getByLabelText("Od dnia"), "2999-07-15");
    await user.type(within(form).getByLabelText("Notatka"), "Nowa stawka.");
    await user.click(
      within(form).getByLabelText(
        "Potwierdzam, ze historyczne snapshoty nie zostana przeliczone"
      )
    );
    await user.click(within(form).getByRole("button", { name: "Dodaj stawke" }));

    await waitFor(() => {
      expect(createRate).toHaveBeenCalled();
    });
    expect(createRate.mock.calls[0]?.[1]).toMatchObject({
      actorProfile: adminState.profile,
      workerId: "worker-anna",
      expectedCurrentRateVersionId: "rate-worker-anna",
      planId: "plan-weight",
      rateGroszPerUnit: 1400,
      validFrom: "2999-07-15",
      note: "Nowa stawka.",
      confirmBackdatedRate: false,
      confirmHistoricalSnapshotsUnchanged: true,
      confirmPeriodWarning: false
    });
    expect(screen.getByText("Dodano stawke.")).toBeInTheDocument();
  });

  it("links an unassigned account from administrator worker profile", async () => {
    const user = userEvent.setup();
    const list = vi.fn<WorkerDirectoryApi["list"]>().mockResolvedValue({
      workers: [
        worker({
          id: "worker-anna",
          displayName: "Anna Test"
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
      profiles: [
        {
          uid: "operator-anna",
          email: "operator.anna@example.test",
          displayName: "Operator Anna",
          role: "OPERATOR",
          workerId: null,
          active: true,
          registrationStatus: "APPROVED",
          offlineConsent: false
        }
      ],
      invalidWorkers: [],
      invalidPlans: [],
      invalidRateVersions: [],
      invalidProfiles: [],
      invalidAuditEvents: []
    });
    const updateAccountLink = vi
      .fn<NonNullable<WorkerDirectoryApi["updateAccountLink"]>>()
      .mockResolvedValue({
        privacyWarning:
          "Powiazane konto zobaczy dane przypisane do tego zbieracza po ponownym pobraniu profilu."
      });

    render(
      <WorkerDirectoryPanel
        authState={adminState}
        env={env}
        workerDirectoryApi={{ list, updateAccountLink }}
      />
    );

    await screen.findByText("Anna Test");
    await user.click(screen.getByRole("button", { name: "Profil" }));

    const form = await screen.findByRole("form", {
      name: "Powiazanie konta zbieracza"
    });

    await user.selectOptions(
      within(form).getByLabelText("Konto do powiazania"),
      "operator-anna"
    );
    await user.type(
      within(form).getByLabelText("Powod zmiany powiazania"),
      "Konto nalezy do Anny."
    );
    await user.click(
      within(form).getByLabelText(
        "Potwierdzam, ze konto zobaczy dane tego zbieracza po ponownym pobraniu profilu"
      )
    );
    await user.click(within(form).getByRole("button", { name: "Zapisz powiazanie" }));

    await waitFor(() => {
      expect(updateAccountLink).toHaveBeenCalled();
    });
    expect(updateAccountLink.mock.calls[0]?.[1]).toMatchObject({
      actorProfile: adminState.profile,
      workerId: "worker-anna",
      targetUid: "operator-anna",
      reason: "Konto nalezy do Anny.",
      confirmPrivacyNotice: true
    });
    expect(screen.getByText(/Zapisano powiazanie konta/)).toBeInTheDocument();
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
      profiles: [],
      invalidWorkers: [],
      invalidPlans: [],
      invalidRateVersions: [],
      invalidProfiles: [],
      invalidAuditEvents: []
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
      profiles: [],
      invalidWorkers: [],
      invalidPlans: [],
      invalidRateVersions: [],
      invalidProfiles: [],
      invalidAuditEvents: []
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
      profiles: [],
      invalidWorkers: [],
      invalidPlans: [],
      invalidRateVersions: [],
      invalidProfiles: [],
      invalidAuditEvents: []
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
