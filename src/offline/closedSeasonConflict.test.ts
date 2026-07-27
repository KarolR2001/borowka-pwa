import type { SeasonDocument } from "../domain/domainConfiguration";
import {
  evaluateClosedSeasonConflict,
  type ClosedSeasonSessionSnapshot
} from "./closedSeasonConflict";

describe("closed season offline conflict", () => {
  it("accepts the session when the season is still open for the business date", () => {
    const result = evaluateClosedSeasonConflict({
      currentSeason: season({
        status: "OPEN"
      }),
      session: sessionSnapshot({
        status: "CLOSED"
      })
    });

    expect(result).toEqual({
      adminResolutionOptions: [],
      auditRequired: false,
      currentSeason: {
        endDate: "2026-09-30",
        id: "season-2026",
        name: "Sezon 2026",
        startDate: "2026-07-01",
        status: "OPEN"
      },
      localSessionPreserved: true,
      message: "Sezon nadal przyjmuje sesje z tej daty.",
      paymentBlocked: false,
      recommendedSessionStatus: "CLOSED",
      reviewRequired: false,
      status: "SEASON_ACCEPTS_SESSION"
    });
  });

  it("preserves data and marks review required when the season closed before sync", () => {
    const result = evaluateClosedSeasonConflict({
      currentSeason: season({
        closedAt: "2026-07-18T08:00:00.000Z",
        closedBy: "admin-2",
        status: "CLOSED"
      }),
      session: sessionSnapshot({
        amountDueGrosz: 4500,
        status: "CLOSED",
        totalEntryCount: 3
      })
    });

    expect(result).toEqual({
      adminResolutionOptions: ["REOPEN_SEASON", "CANCEL_SESSION"],
      auditRequired: true,
      currentSeason: {
        endDate: "2026-09-30",
        id: "season-2026",
        name: "Sezon 2026",
        startDate: "2026-07-01",
        status: "CLOSED"
      },
      localSessionPreserved: true,
      message:
        "Sesja pozostaje zapisana lokalnie, ale sezon zostal zamkniety przed synchronizacja. Wymagana jest decyzja administratora.",
      paymentBlocked: true,
      recommendedSessionStatus: "REVIEW_REQUIRED",
      reviewRequired: true,
      status: "CLOSED_SEASON_REVIEW_REQUIRED"
    });
  });

  it("offers moving the session only when another open season covers the date", () => {
    const result = evaluateClosedSeasonConflict({
      alternativeOpenSeasons: [
        season({
          id: "season-2026-correction",
          name: "Sezon korekcyjny 2026",
          status: "OPEN",
          startDate: "2026-07-01",
          endDate: "2026-07-31"
        }),
        season({
          id: "season-2027",
          name: "Sezon 2027",
          status: "OPEN",
          startDate: "2027-07-01",
          endDate: "2027-09-30"
        })
      ],
      currentSeason: season({
        status: "CLOSED"
      }),
      session: sessionSnapshot()
    });

    expect(result.adminResolutionOptions).toEqual([
      "REOPEN_SEASON",
      "MOVE_TO_OPEN_SEASON",
      "CANCEL_SESSION"
    ]);
  });

  it("does not accept archived or out-of-range seasons as automatic sync targets", () => {
    expect(
      evaluateClosedSeasonConflict({
        currentSeason: season({
          status: "ARCHIVED"
        }),
        session: sessionSnapshot()
      })
    ).toMatchObject({
      localSessionPreserved: true,
      paymentBlocked: true,
      recommendedSessionStatus: "REVIEW_REQUIRED",
      status: "CLOSED_SEASON_REVIEW_REQUIRED"
    });

    expect(
      evaluateClosedSeasonConflict({
        currentSeason: season({
          endDate: "2026-07-10",
          status: "OPEN"
        }),
        session: sessionSnapshot({
          businessDate: "2026-07-17"
        })
      })
    ).toMatchObject({
      paymentBlocked: true,
      recommendedSessionStatus: "REVIEW_REQUIRED"
    });
  });

  it("validates that the offline session points to the checked season", () => {
    expect(() =>
      evaluateClosedSeasonConflict({
        currentSeason: season({
          id: "season-other"
        }),
        session: sessionSnapshot({
          seasonId: "season-2026"
        })
      })
    ).toThrow("Sesja konfliktu sezonu musi wskazywac sprawdzany sezon.");
  });
});

function sessionSnapshot(
  overrides: Partial<ClosedSeasonSessionSnapshot> = {}
): ClosedSeasonSessionSnapshot {
  return {
    amountDueGrosz: 4500,
    businessDate: "2026-07-17",
    id: "session-1",
    seasonId: "season-2026",
    status: "CLOSED",
    totalEntryCount: 3,
    workerId: "worker-1",
    workerNameSnapshot: "Anna Test",
    ...overrides
  };
}

function season(overrides: Partial<SeasonDocument> = {}): SeasonDocument {
  return {
    closedAt: null,
    closedBy: null,
    createdAt: null,
    createdBy: "admin-1",
    endDate: "2026-09-30",
    id: "season-2026",
    isDefault: true,
    name: "Sezon 2026",
    reopenedAt: null,
    startDate: "2026-07-01",
    status: "OPEN",
    ...overrides
  };
}
