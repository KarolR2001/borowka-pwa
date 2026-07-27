import type { SeasonDocument } from "../domain/domainConfiguration";
import type { HarvestSessionDocument } from "../harvest/openHarvestSession";

export const CLOSED_SEASON_RESOLUTION_OPTIONS = [
  "REOPEN_SEASON",
  "MOVE_TO_OPEN_SEASON",
  "CANCEL_SESSION"
] as const;

export type ClosedSeasonResolutionOption =
  (typeof CLOSED_SEASON_RESOLUTION_OPTIONS)[number];

export type ClosedSeasonSessionSnapshot = Pick<
  HarvestSessionDocument,
  | "amountDueGrosz"
  | "businessDate"
  | "id"
  | "seasonId"
  | "status"
  | "totalEntryCount"
  | "workerId"
  | "workerNameSnapshot"
>;

export type ClosedSeasonCurrentSeasonView = Pick<
  SeasonDocument,
  "endDate" | "id" | "name" | "startDate" | "status"
>;

export type ClosedSeasonConflictEvaluation =
  | {
      adminResolutionOptions: [];
      auditRequired: false;
      currentSeason: ClosedSeasonCurrentSeasonView;
      localSessionPreserved: true;
      message: string;
      paymentBlocked: false;
      recommendedSessionStatus: ClosedSeasonSessionSnapshot["status"];
      reviewRequired: false;
      status: "SEASON_ACCEPTS_SESSION";
    }
  | {
      adminResolutionOptions: readonly ClosedSeasonResolutionOption[];
      auditRequired: true;
      currentSeason: ClosedSeasonCurrentSeasonView;
      localSessionPreserved: true;
      message: string;
      paymentBlocked: true;
      recommendedSessionStatus: "REVIEW_REQUIRED";
      reviewRequired: true;
      status: "CLOSED_SEASON_REVIEW_REQUIRED";
    };

export function evaluateClosedSeasonConflict({
  alternativeOpenSeasons = [],
  currentSeason,
  session
}: {
  alternativeOpenSeasons?: readonly SeasonDocument[];
  currentSeason: SeasonDocument;
  session: ClosedSeasonSessionSnapshot;
}): ClosedSeasonConflictEvaluation {
  assertSessionMatchesSeason(session, currentSeason);
  const currentSeasonView = createSeasonView(currentSeason);

  if (seasonAcceptsSession(currentSeason, session.businessDate)) {
    return {
      adminResolutionOptions: [],
      auditRequired: false,
      currentSeason: currentSeasonView,
      localSessionPreserved: true,
      message: "Sezon nadal przyjmuje sesje z tej daty.",
      paymentBlocked: false,
      recommendedSessionStatus: session.status,
      reviewRequired: false,
      status: "SEASON_ACCEPTS_SESSION"
    };
  }

  return {
    adminResolutionOptions: createResolutionOptions(alternativeOpenSeasons, session),
    auditRequired: true,
    currentSeason: currentSeasonView,
    localSessionPreserved: true,
    message:
      "Sesja pozostaje zapisana lokalnie, ale sezon zostal zamkniety przed synchronizacja. Wymagana jest decyzja administratora.",
    paymentBlocked: true,
    recommendedSessionStatus: "REVIEW_REQUIRED",
    reviewRequired: true,
    status: "CLOSED_SEASON_REVIEW_REQUIRED"
  };
}

function seasonAcceptsSession(
  season: Pick<SeasonDocument, "endDate" | "startDate" | "status">,
  sessionBusinessDate: string
): boolean {
  const businessDate = normalizeBusinessDate(sessionBusinessDate);

  return season.status === "OPEN" && seasonCoversDate(season, businessDate);
}

function createResolutionOptions(
  alternativeOpenSeasons: readonly SeasonDocument[],
  session: ClosedSeasonSessionSnapshot
): ClosedSeasonResolutionOption[] {
  const options: ClosedSeasonResolutionOption[] = ["REOPEN_SEASON"];

  if (
    alternativeOpenSeasons.some((season) =>
      seasonAcceptsSession(season, session.businessDate)
    )
  ) {
    options.push("MOVE_TO_OPEN_SEASON");
  }

  options.push("CANCEL_SESSION");

  return options;
}

function assertSessionMatchesSeason(
  session: ClosedSeasonSessionSnapshot,
  season: SeasonDocument
): void {
  if (session.seasonId !== season.id) {
    throw new Error("Sesja konfliktu sezonu musi wskazywac sprawdzany sezon.");
  }

  normalizeBusinessDate(session.businessDate);
  normalizeEntryCount(session.totalEntryCount);
  normalizeOptionalAmount(session.amountDueGrosz);
}

function seasonCoversDate(
  season: Pick<SeasonDocument, "endDate" | "startDate">,
  businessDate: string
): boolean {
  const startDate = normalizeBusinessDate(season.startDate);
  const endDate = normalizeOptionalBusinessDate(season.endDate);

  return startDate <= businessDate && (endDate === null || businessDate <= endDate);
}

function createSeasonView(season: SeasonDocument): ClosedSeasonCurrentSeasonView {
  return {
    endDate: season.endDate,
    id: season.id,
    name: season.name,
    startDate: season.startDate,
    status: season.status
  };
}

function normalizeBusinessDate(value: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(Date.parse(value))) {
    throw new Error("Data biznesowa konfliktu sezonu musi miec format YYYY-MM-DD.");
  }

  return value;
}

function normalizeOptionalBusinessDate(value: string | null): string | null {
  return value === null ? null : normalizeBusinessDate(value);
}

function normalizeEntryCount(value: number): number {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error("Liczba wpisow sesji musi byc nieujemna.");
  }

  return value;
}

function normalizeOptionalAmount(value: number | null): number | null {
  if (value === null) {
    return null;
  }

  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error("Kwota sesji musi byc nieujemna liczba groszy.");
  }

  return value;
}
