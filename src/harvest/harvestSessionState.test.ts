import {
  HARVEST_SESSION_STATUSES,
  HARVEST_SESSION_TRANSITION_TYPES,
  assertHarvestSessionTransitionAllowed,
  canRolePerformHarvestSessionTransition,
  checkHarvestSessionTransition,
  getHarvestSessionTransitionDefinition,
  harvestSessionStatusLabel,
  isHarvestSessionStatus,
  isHarvestSessionTransitionType,
  listHarvestSessionTransitionDefinitions
} from "./harvestSessionState";

describe("harvest session state model", () => {
  it("defines the required PRD session statuses", () => {
    expect(HARVEST_SESSION_STATUSES).toEqual([
      "OPEN",
      "CLOSED",
      "PAID",
      "CANCELLED",
      "REVIEW_REQUIRED"
    ]);
    expect(isHarvestSessionStatus("OPEN")).toBe(true);
    expect(isHarvestSessionStatus("INVALID")).toBe(false);
    expect(harvestSessionStatusLabel("REVIEW_REQUIRED")).toBe("Wymaga przegladu");
  });

  it("defines exactly the stage 5.1 transitions with operational metadata", () => {
    const definitions = listHarvestSessionTransitionDefinitions();

    expect(definitions.map((definition) => definition.type)).toEqual([
      "CREATE",
      "CLOSE",
      "MARK_REVIEW_REQUIRED",
      "MARK_PAID",
      "CANCEL",
      "REOPEN"
    ]);
    expect(HARVEST_SESSION_TRANSITION_TYPES.every(isHarvestSessionTransitionType)).toBe(
      true
    );

    for (const definition of definitions) {
      expect(definition.allowedRoles.length).toBeGreaterThan(0);
      expect(definition.requiredFields.length).toBeGreaterThan(0);
      expect(definition.auditAction).toMatch(/^HARVEST_SESSION_/);
      expect(definition.reversalNote.length).toBeGreaterThan(0);
    }
  });

  it("allows admin and operator to create an online OPEN session", () => {
    expect(
      checkHarvestSessionTransition({
        type: "CREATE",
        actorRole: "ADMIN",
        isOnline: true
      })
    ).toMatchObject({ status: "ALLOWED" });
    expect(
      checkHarvestSessionTransition({
        type: "CREATE",
        actorRole: "OPERATOR",
        isOnline: true
      })
    ).toMatchObject({ status: "ALLOWED" });
    expect(canRolePerformHarvestSessionTransition("PICKER", "CREATE")).toBe(false);
  });

  it("blocks create when role, source status or connectivity is invalid", () => {
    expect(
      checkHarvestSessionTransition({
        type: "CREATE",
        actorRole: "PICKER",
        isOnline: true
      })
    ).toMatchObject({ status: "DENIED", code: "ROLE_NOT_ALLOWED" });
    expect(
      checkHarvestSessionTransition({
        type: "CREATE",
        fromStatus: "OPEN",
        actorRole: "ADMIN",
        isOnline: true
      })
    ).toMatchObject({ status: "DENIED", code: "SOURCE_STATUS_MUST_BE_EMPTY" });
    expect(
      checkHarvestSessionTransition({
        type: "CREATE",
        actorRole: "ADMIN",
        isOnline: false
      })
    ).toMatchObject({ status: "DENIED", code: "ONLINE_REQUIRED" });
  });

  it("closes only non-empty OPEN sessions and makes amounts official", () => {
    const definition = getHarvestSessionTransitionDefinition("CLOSE");

    expect(definition).toMatchObject({
      fromStatuses: ["OPEN"],
      toStatus: "CLOSED",
      entriesImpact: "ENTRIES_LOCKED",
      amountImpact: "OFFICIAL_RECALCULATED",
      stockImpact: "OFFICIAL_STOCK_RECALCULATED",
      auditAction: "HARVEST_SESSION_CLOSED"
    });
    expect(
      checkHarvestSessionTransition({
        type: "CLOSE",
        fromStatus: "OPEN",
        actorRole: "OPERATOR",
        isOnline: true,
        activeEntryCount: 2
      })
    ).toMatchObject({ status: "ALLOWED" });
  });

  it("blocks close for empty sessions, wrong source status and offline mode", () => {
    expect(
      checkHarvestSessionTransition({
        type: "CLOSE",
        fromStatus: "OPEN",
        actorRole: "ADMIN",
        isOnline: true,
        activeEntryCount: 0
      })
    ).toMatchObject({ status: "DENIED", code: "ACTIVE_ENTRY_REQUIRED" });
    expect(
      checkHarvestSessionTransition({
        type: "CLOSE",
        fromStatus: "REVIEW_REQUIRED",
        actorRole: "ADMIN",
        isOnline: true,
        activeEntryCount: 1
      })
    ).toMatchObject({ status: "DENIED", code: "SOURCE_STATUS_NOT_ALLOWED" });
    expect(
      checkHarvestSessionTransition({
        type: "CLOSE",
        fromStatus: "OPEN",
        actorRole: "ADMIN",
        isOnline: false,
        activeEntryCount: 1
      })
    ).toMatchObject({ status: "DENIED", code: "ONLINE_REQUIRED" });
  });

  it("marks OPEN or CLOSED sessions as REVIEW_REQUIRED with a reason", () => {
    expect(
      checkHarvestSessionTransition({
        type: "MARK_REVIEW_REQUIRED",
        fromStatus: "OPEN",
        actorRole: "OPERATOR",
        isOnline: true,
        reason: "Brak aktywnej stawki."
      })
    ).toMatchObject({ status: "ALLOWED" });
    expect(
      checkHarvestSessionTransition({
        type: "MARK_REVIEW_REQUIRED",
        fromStatus: "CLOSED",
        actorRole: "ADMIN",
        isOnline: true,
        reason: "Rozbieznosc snapshotu."
      })
    ).toMatchObject({ status: "ALLOWED" });
    expect(getHarvestSessionTransitionDefinition("MARK_REVIEW_REQUIRED")).toMatchObject({
      toStatus: "REVIEW_REQUIRED",
      requiresReason: true,
      amountImpact: "OFFICIAL_BLOCKED_FOR_REVIEW"
    });
  });

  it("blocks REVIEW_REQUIRED without a reason or for picker role", () => {
    expect(
      checkHarvestSessionTransition({
        type: "MARK_REVIEW_REQUIRED",
        fromStatus: "OPEN",
        actorRole: "ADMIN",
        isOnline: true
      })
    ).toMatchObject({ status: "DENIED", code: "REASON_REQUIRED" });
    expect(
      checkHarvestSessionTransition({
        type: "MARK_REVIEW_REQUIRED",
        fromStatus: "OPEN",
        actorRole: "PICKER",
        isOnline: true,
        reason: "Konflikt."
      })
    ).toMatchObject({ status: "DENIED", code: "ROLE_NOT_ALLOWED" });
  });

  it("marks a CLOSED session as PAID only through admin payment context", () => {
    expect(
      checkHarvestSessionTransition({
        type: "MARK_PAID",
        fromStatus: "CLOSED",
        actorRole: "ADMIN",
        isOnline: true,
        paymentId: "payment-1"
      })
    ).toMatchObject({ status: "ALLOWED" });
    expect(getHarvestSessionTransitionDefinition("MARK_PAID")).toMatchObject({
      toStatus: "PAID",
      entriesImpact: "ENTRIES_LOCKED_BY_PAYMENT",
      amountImpact: "OFFICIAL_PAYMENT_CONFIRMED",
      reversibleBy: []
    });
  });

  it("blocks PAID transition without payment id, from non-CLOSED source or by operator", () => {
    expect(
      checkHarvestSessionTransition({
        type: "MARK_PAID",
        fromStatus: "CLOSED",
        actorRole: "ADMIN",
        isOnline: true
      })
    ).toMatchObject({ status: "DENIED", code: "PAYMENT_ID_REQUIRED" });
    expect(
      checkHarvestSessionTransition({
        type: "MARK_PAID",
        fromStatus: "OPEN",
        actorRole: "ADMIN",
        isOnline: true,
        paymentId: "payment-1"
      })
    ).toMatchObject({ status: "DENIED", code: "SOURCE_STATUS_NOT_ALLOWED" });
    expect(
      checkHarvestSessionTransition({
        type: "MARK_PAID",
        fromStatus: "CLOSED",
        actorRole: "OPERATOR",
        isOnline: true,
        paymentId: "payment-1"
      })
    ).toMatchObject({ status: "DENIED", code: "ROLE_NOT_ALLOWED" });
  });

  it("cancels only unpaid sessions by admin with a reason", () => {
    for (const fromStatus of ["OPEN", "CLOSED", "REVIEW_REQUIRED"] as const) {
      expect(
        checkHarvestSessionTransition({
          type: "CANCEL",
          fromStatus,
          actorRole: "ADMIN",
          isOnline: true,
          reason: "Pomylka operatora."
        })
      ).toMatchObject({ status: "ALLOWED" });
    }

    expect(getHarvestSessionTransitionDefinition("CANCEL")).toMatchObject({
      toStatus: "CANCELLED",
      requiresReason: true,
      amountImpact: "REMOVED_FROM_SETTLEMENTS",
      stockImpact: "REMOVED_FROM_STOCK_TOTALS"
    });
  });

  it("blocks cancellation for active payment, missing reason, paid source or operator role", () => {
    expect(
      checkHarvestSessionTransition({
        type: "CANCEL",
        fromStatus: "CLOSED",
        actorRole: "ADMIN",
        isOnline: true,
        hasActivePayment: true,
        reason: "Pomylka."
      })
    ).toMatchObject({
      status: "DENIED",
      code: "ACTIVE_PAYMENT_BLOCKS_TRANSITION"
    });
    expect(
      checkHarvestSessionTransition({
        type: "CANCEL",
        fromStatus: "OPEN",
        actorRole: "ADMIN",
        isOnline: true
      })
    ).toMatchObject({ status: "DENIED", code: "REASON_REQUIRED" });
    expect(
      checkHarvestSessionTransition({
        type: "CANCEL",
        fromStatus: "PAID",
        actorRole: "ADMIN",
        isOnline: true,
        reason: "Pomylka."
      })
    ).toMatchObject({ status: "DENIED", code: "SOURCE_STATUS_NOT_ALLOWED" });
    expect(
      checkHarvestSessionTransition({
        type: "CANCEL",
        fromStatus: "OPEN",
        actorRole: "OPERATOR",
        isOnline: true,
        reason: "Pomylka."
      })
    ).toMatchObject({ status: "DENIED", code: "ROLE_NOT_ALLOWED" });
  });

  it("reopens only a CLOSED unpaid session by admin with a reason", () => {
    expect(
      checkHarvestSessionTransition({
        type: "REOPEN",
        fromStatus: "CLOSED",
        actorRole: "ADMIN",
        isOnline: true,
        reason: "Korekta wpisu."
      })
    ).toMatchObject({ status: "ALLOWED" });
    expect(getHarvestSessionTransitionDefinition("REOPEN")).toMatchObject({
      toStatus: "OPEN",
      requiresReason: true,
      reversibleBy: ["CLOSE", "CANCEL"]
    });
  });

  it("blocks reopen for active payment, missing reason, wrong source or operator role", () => {
    expect(
      checkHarvestSessionTransition({
        type: "REOPEN",
        fromStatus: "CLOSED",
        actorRole: "ADMIN",
        isOnline: true,
        hasActivePayment: true,
        reason: "Korekta."
      })
    ).toMatchObject({
      status: "DENIED",
      code: "ACTIVE_PAYMENT_BLOCKS_TRANSITION"
    });
    expect(
      checkHarvestSessionTransition({
        type: "REOPEN",
        fromStatus: "CLOSED",
        actorRole: "ADMIN",
        isOnline: true
      })
    ).toMatchObject({ status: "DENIED", code: "REASON_REQUIRED" });
    expect(
      checkHarvestSessionTransition({
        type: "REOPEN",
        fromStatus: "PAID",
        actorRole: "ADMIN",
        isOnline: true,
        reason: "Korekta."
      })
    ).toMatchObject({ status: "DENIED", code: "SOURCE_STATUS_NOT_ALLOWED" });
    expect(
      checkHarvestSessionTransition({
        type: "REOPEN",
        fromStatus: "CLOSED",
        actorRole: "OPERATOR",
        isOnline: true,
        reason: "Korekta."
      })
    ).toMatchObject({ status: "DENIED", code: "ROLE_NOT_ALLOWED" });
  });

  it("throws a domain error when asserting a denied transition", () => {
    expect(() =>
      assertHarvestSessionTransitionAllowed({
        type: "CLOSE",
        fromStatus: "OPEN",
        actorRole: "ADMIN",
        isOnline: true,
        activeEntryCount: 0
      })
    ).toThrow("Nie mozna zamknac pustej sesji.");
  });
});
