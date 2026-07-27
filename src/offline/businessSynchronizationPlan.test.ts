import {
  buildBusinessSynchronizationPlan,
  type BusinessSyncDocumentInput
} from "./businessSynchronizationPlan";

describe("business synchronization plan", () => {
  it("orders session creation, entries, corrections, close and audit per session", () => {
    const plan = buildBusinessSynchronizationPlan({
      configurationReady: true,
      profileReady: true,
      documents: [
        syncDocument({
          id: "audit-close",
          kind: "AUDIT_EVENT",
          sessionId: "session-1",
          syncIntent: "WRITE_AUDIT_EVENT"
        }),
        syncDocument({
          businessStatus: "CLOSED",
          id: "session-1",
          kind: "HARVEST_SESSION",
          syncIntent: "CLOSE_HARVEST_SESSION"
        }),
        syncDocument({
          id: "entry-correction",
          kind: "HARVEST_ENTRY",
          sessionId: "session-1",
          syncIntent: "APPLY_ENTRY_CORRECTION"
        }),
        syncDocument({
          id: "entry-new",
          kind: "HARVEST_ENTRY",
          sessionId: "session-1",
          syncIntent: "UPSERT_HARVEST_ENTRY"
        }),
        syncDocument({
          id: "session-1",
          kind: "HARVEST_SESSION",
          syncIntent: "CREATE_HARVEST_SESSION"
        })
      ]
    });

    expect(plan.blockedReason).toBeNull();
    expect(plan.sessions).toHaveLength(1);
    expect(plan.sessions[0].stages.map((stage) => stage.operation)).toEqual([
      "CREATE_HARVEST_SESSION",
      "UPSERT_HARVEST_ENTRIES",
      "APPLY_ENTRY_CORRECTIONS",
      "CONFIRM_SESSION_CLOSE",
      "WRITE_AUDIT_EVENTS"
    ]);
    expect(plan.sessions[0].stages.map((stage) => stage.sequence)).toEqual([
      2, 3, 4, 5, 6
    ]);
    expect(plan.sessions[0].warningMessages).toEqual([
      "Zamkniecie sesji musi czekac na synchronizacje wpisow.",
      "Audyt zamkniecia musi zostac zapisany po potwierdzeniu sesji."
    ]);
    expect(plan.sessions[0].paymentGate).toEqual({
      canEnterPayments: false,
      label: "Wyplata zablokowana do czasu potwierdzenia sesji w chmurze."
    });
  });

  it("blocks synchronization before profile and configuration prerequisites are ready", () => {
    const plan = buildBusinessSynchronizationPlan({
      configurationReady: false,
      profileReady: false,
      documents: [
        syncDocument({
          id: "session-1",
          kind: "HARVEST_SESSION",
          syncIntent: "CREATE_HARVEST_SESSION"
        })
      ]
    });

    expect(plan).toMatchObject({
      blockedReason:
        "Synchronizacja wymaga istniejacego profilu i aktualnej konfiguracji.",
      profileAndConfigurationReady: false,
      warningMessages: [
        "Konfiguracja offline musi zostac odswiezona przed sync.",
        "Profil aplikacji musi byc aktywny przed sync."
      ]
    });
    expect(plan.sessions[0].stages).toEqual([]);
  });

  it("keeps payments blocked until a closed session has no local pending writes", () => {
    const pendingPlan = buildBusinessSynchronizationPlan({
      configurationReady: true,
      profileReady: true,
      documents: [
        syncDocument({
          businessStatus: "CLOSED",
          id: "session-1",
          kind: "HARVEST_SESSION",
          lastSuccessfulSyncIso: "2026-07-17T12:00:00.000Z",
          pendingSync: false,
          savedLocally: false,
          syncIntent: "CLOSE_HARVEST_SESSION"
        }),
        syncDocument({
          id: "entry-pending",
          kind: "HARVEST_ENTRY",
          sessionId: "session-1",
          syncIntent: "UPSERT_HARVEST_ENTRY"
        })
      ]
    });
    const confirmedPlan = buildBusinessSynchronizationPlan({
      configurationReady: true,
      profileReady: true,
      documents: [
        syncDocument({
          businessStatus: "CLOSED",
          id: "session-1",
          kind: "HARVEST_SESSION",
          lastSuccessfulSyncIso: "2026-07-17T12:00:00.000Z",
          pendingSync: false,
          savedLocally: false,
          syncIntent: "CLOSE_HARVEST_SESSION"
        })
      ]
    });

    expect(pendingPlan.sessions[0].paymentGate.canEnterPayments).toBe(false);
    expect(confirmedPlan.sessions[0].paymentGate).toEqual({
      canEnterPayments: true,
      label: "Sesja moze wejsc do procesu wyplat."
    });
  });

  it("does not schedule rejected or remotely changed documents before conflict review", () => {
    const plan = buildBusinessSynchronizationPlan({
      configurationReady: true,
      profileReady: true,
      documents: [
        syncDocument({
          id: "entry-rejected",
          kind: "HARVEST_ENTRY",
          rejectedReason: "Rules odrzucily wpis.",
          sessionId: "session-1",
          syncIntent: "UPSERT_HARVEST_ENTRY"
        }),
        syncDocument({
          id: "session-1",
          kind: "HARVEST_SESSION",
          remoteChanged: true,
          syncIntent: "CLOSE_HARVEST_SESSION"
        })
      ]
    });

    expect(plan.sessions[0]).toMatchObject({
      blockedReason: "Sesja wymaga przegladu konfliktu przed ponowieniem synchronizacji.",
      stages: []
    });
    expect(plan.sessions[0].paymentGate.canEnterPayments).toBe(false);
  });

  it("validates that sync intent matches document kind", () => {
    expect(() =>
      buildBusinessSynchronizationPlan({
        configurationReady: true,
        profileReady: true,
        documents: [
          syncDocument({
            id: "audit-as-entry",
            kind: "HARVEST_ENTRY",
            sessionId: "session-1",
            syncIntent: "WRITE_AUDIT_EVENT"
          })
        ]
      })
    ).toThrow("Intencja synchronizacji nie pasuje do rodzaju dokumentu.");
  });
});

function syncDocument(
  overrides: Partial<BusinessSyncDocumentInput> & {
    id: string;
    kind: BusinessSyncDocumentInput["kind"];
    syncIntent: BusinessSyncDocumentInput["syncIntent"];
  }
): BusinessSyncDocumentInput {
  const { id, kind, syncIntent, ...rest } = overrides;

  return {
    businessDate: "2026-07-17",
    businessStatus: "OPEN",
    id,
    kind,
    pendingSync: true,
    savedLocally: false,
    sessionId: kind === "HARVEST_SESSION" ? null : "session-1",
    syncIntent,
    workerName: "Anna Test",
    ...rest
  };
}
