import { evaluatePwaUpdateDecision } from "./pwaUpdatePolicy";
import {
  createPwaUpdateRecoveryBaseline,
  evaluatePwaUpdateActivationGate,
  verifyPwaUpdateCompletion,
  type PwaUpdateRecoveryDocument
} from "./pwaUpdateRecovery";

const pendingDocuments = [
  {
    id: "session-a",
    kind: "HARVEST_SESSION" as const,
    pendingSync: true
  },
  {
    id: "entry-a",
    kind: "HARVEST_ENTRY" as const,
    pendingSync: true
  },
  {
    id: "audit-a",
    kind: "AUDIT_EVENT" as const,
    pendingSync: true
  }
];

describe("PWA update recovery", () => {
  it("allows A-to-B activation only after sync and exact server confirmation", () => {
    const baseline = createPwaUpdateRecoveryBaseline({
      createdAt: new Date("2026-07-28T10:00:00.000Z"),
      pendingDocuments,
      sourceVersion: "A",
      targetVersion: "B"
    });
    const gate = evaluatePwaUpdateActivationGate({
      baseline,
      confirmedServerDocuments: baseline.expectedDocuments,
      currentSyncDocuments: [],
      decision: evaluatePwaUpdateDecision({
        hasActiveForm: false,
        hasActiveHarvestSession: false,
        syncDocuments: []
      }),
      synchronizationStatus: "SUCCESS",
      updateAvailable: true
    });

    expect(baseline).toMatchObject({
      format: "BOROWKA_PWA_UPDATE_RECOVERY",
      formatVersion: 1,
      sourceVersion: "A",
      targetVersion: "B"
    });
    expect(gate).toEqual({
      blockers: [],
      canActivate: true,
      expectedDocumentCount: 3,
      status: "READY"
    });
    expect(
      verifyPwaUpdateCompletion({
        activeVersion: "B",
        baseline,
        gate
      })
    ).toEqual({
      activeVersion: "B",
      expectedDocumentCount: 3,
      issues: [],
      sourceVersion: "A",
      status: "PASS",
      targetVersion: "B"
    });
  });

  it("blocks activation for pending, missing, duplicated or failed synchronization", () => {
    const baseline = createPwaUpdateRecoveryBaseline({
      pendingDocuments,
      sourceVersion: "A",
      targetVersion: "B"
    });
    const confirmedServerDocuments: PwaUpdateRecoveryDocument[] = [
      { id: "session-a", kind: "HARVEST_SESSION" },
      { id: "entry-a", kind: "HARVEST_ENTRY" },
      { id: "entry-a", kind: "HARVEST_ENTRY" }
    ];
    const gate = evaluatePwaUpdateActivationGate({
      baseline,
      confirmedServerDocuments,
      currentSyncDocuments: pendingDocuments,
      decision: evaluatePwaUpdateDecision({
        hasActiveForm: false,
        hasActiveHarvestSession: false,
        syncDocuments: pendingDocuments
      }),
      synchronizationStatus: "FAILED",
      updateAvailable: true
    });

    expect(gate.status).toBe("BLOCKED");
    expect(gate.blockers).toEqual(
      expect.arrayContaining([
        { code: "SYNCHRONIZATION_NOT_SUCCESSFUL", documentKeys: [] },
        { code: "PENDING_DATA_REMAINS", documentKeys: [] },
        { code: "UPDATE_POLICY_BLOCKED", documentKeys: [] },
        {
          code: "SERVER_DOCUMENT_MISSING",
          documentKeys: ["AUDIT_EVENT:audit-a"]
        },
        {
          code: "SERVER_DOCUMENT_DUPLICATED",
          documentKeys: ["HARVEST_ENTRY:entry-a"]
        }
      ])
    );
    expect(
      verifyPwaUpdateCompletion({
        activeVersion: "A",
        baseline,
        gate
      })
    ).toMatchObject({
      status: "FAIL",
      issues: ["ACTIVATION_GATE_NOT_READY", "TARGET_VERSION_NOT_ACTIVE"]
    });
  });

  it("requires distinct versions and a non-empty pending baseline", () => {
    expect(() =>
      createPwaUpdateRecoveryBaseline({
        pendingDocuments,
        sourceVersion: "A",
        targetVersion: "A"
      })
    ).toThrow("Wersja B musi roznic sie od wersji A.");
    expect(() =>
      createPwaUpdateRecoveryBaseline({
        pendingDocuments: [],
        sourceVersion: "A",
        targetVersion: "B"
      })
    ).toThrow("Baseline aktualizacji wymaga oczekujacych dokumentow wersji A.");
  });
});
