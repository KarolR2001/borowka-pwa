import {
  CLIENT_UPDATE_REQUIRED_MESSAGE,
  assessRulesRollout,
  evaluateClientWriteCompatibility,
  prepareLastSupportedPendingWriteForRules,
  type LocalClientWrite,
  type RulesCompatibilityPolicy
} from "./clientRulesCompatibility";

const policy: RulesCompatibilityPolicy = {
  currentRelease: {
    appVersion: "0.2.0",
    rulesRevision: "rules-0002",
    schemaVersion: "schema-0002"
  },
  graceEndsAtIso: "2026-08-15T22:00:00.000Z",
  lastSupportedRelease: {
    appVersion: "0.1.0",
    rulesRevision: "rules-0001",
    schemaVersion: "schema-0001"
  },
  optionalDuringGrace: {
    HARVEST_ENTRY: ["qualityClass"]
  },
  requiredFields: {
    HARVEST_ENTRY: ["id", "sessionId", "quantityMilli", "qualityClass"]
  }
};

describe("client and Rules compatibility", () => {
  it("allows a valid pending write from the last supported client during grace", () => {
    const decision = evaluateClientWriteCompatibility(
      createWrite({
        origin: "PENDING_OFFLINE"
      }),
      policy
    );

    expect(decision).toMatchObject({
      action: "ALLOW_PENDING_RETRY",
      allowedByRulesRollout: true
    });
  });

  it("normalizes only the local pending flag and preserves the document UUID", () => {
    const serverPayload = prepareLastSupportedPendingWriteForRules("HARVEST_ENTRY", {
      id: "entry-uuid",
      pendingSync: true,
      quantityMilli: 1000
    });

    expect(serverPayload).toEqual({
      id: "entry-uuid",
      pendingSync: false,
      quantityMilli: 1000
    });
  });

  it("does not allow the old client to create new documents", () => {
    const decision = evaluateClientWriteCompatibility(
      createWrite({
        origin: "NEW_WRITE"
      }),
      policy
    );

    expect(decision).toEqual({
      action: "REQUIRE_UPDATE",
      allowedByRulesRollout: false,
      message: CLIENT_UPDATE_REQUIRED_MESSAGE
    });
  });

  it("requires review for older unsupported formats and malformed pending writes", () => {
    expect(
      evaluateClientWriteCompatibility(
        createWrite({
          appVersion: "0.0.8",
          schemaVersion: "schema-0000"
        }),
        policy
      ).action
    ).toBe("BLOCK_AND_REVIEW");
    expect(
      evaluateClientWriteCompatibility(
        createWrite({
          fields: ["id", "quantityMilli"]
        }),
        {
          ...policy,
          optionalDuringGrace: {}
        }
      ).action
    ).toBe("BLOCK_AND_REVIEW");
  });

  it("blocks an old-client retry after the compatibility window", () => {
    const decision = evaluateClientWriteCompatibility(
      createWrite({
        createdAtDeviceIso: "2026-08-16T06:00:00.000Z"
      }),
      policy
    );

    expect(decision.action).toBe("REQUIRE_UPDATE");
    expect(decision.message).toBe(CLIENT_UPDATE_REQUIRED_MESSAGE);
  });

  it("blocks a Rules rollout when any representative pending fixture would fail", () => {
    const assessment = assessRulesRollout(
      [
        createWrite({ documentId: "entry-compatible" }),
        createWrite({
          appVersion: "0.0.8",
          documentId: "entry-too-old",
          schemaVersion: "schema-0000"
        })
      ],
      policy
    );

    expect(assessment.status).toBe("BLOCKED");
    expect(assessment.issues).toEqual([expect.stringContaining("entry-too-old")]);
  });
});

function createWrite(overrides: Partial<LocalClientWrite> = {}): LocalClientWrite {
  return {
    appVersion: "0.1.0",
    createdAtDeviceIso: "2026-07-28T08:00:00.000Z",
    documentId: "entry-1",
    fields: ["id", "sessionId", "quantityMilli"],
    kind: "HARVEST_ENTRY",
    origin: "PENDING_OFFLINE",
    schemaVersion: "schema-0001",
    ...overrides
  };
}
