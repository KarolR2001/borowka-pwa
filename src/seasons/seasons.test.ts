import type { SeasonDocument } from "../domain/domainConfiguration";
import type { UserProfile } from "../domain/identity";
import {
  createSeasonId,
  decodeSeason,
  filterBySeasonId,
  filterSeasons,
  findOverlappingSeasons,
  prepareSeasonCreate,
  prepareSeasonStatusUpdate,
  seasonStatusLabel
} from "./seasons";

const adminProfile: UserProfile = {
  uid: "admin-1",
  email: "admin@example.test",
  displayName: "Admin Test",
  role: "ADMIN",
  workerId: null,
  active: true,
  registrationStatus: "APPROVED",
  offlineConsent: false
};

const operatorProfile: UserProfile = {
  ...adminProfile,
  uid: "operator-1",
  role: "OPERATOR"
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

describe("seasons", () => {
  it("prepares a new open default season with audit summary", () => {
    const prepared = prepareSeasonCreate([], {
      actorProfile: adminProfile,
      id: "season-2027",
      name: " Sezon 2027 ",
      startDate: "2027-07-01",
      endDate: "2027-09-30",
      status: "OPEN",
      isDefault: true,
      allowDateOverlap: false,
      createdAt: "created-at",
      deviceId: "device-1"
    });

    expect(prepared.season).toMatchObject({
      id: "season-2027",
      name: "Sezon 2027",
      status: "OPEN",
      isDefault: true,
      createdBy: "admin-1"
    });
    expect(prepared.auditAction).toBe("SEASON_CREATED");
    expect(prepared.afterSummary).toMatchObject({
      seasonId: "season-2027",
      status: "OPEN",
      isDefault: true
    });
  });

  it("detects and blocks overlapping seasons unless explicitly accepted", () => {
    const existing = [
      season({
        id: "season-2026",
        startDate: "2026-07-01",
        endDate: "2026-09-30"
      })
    ];

    expect(
      findOverlappingSeasons(
        {
          id: "season-overlap",
          startDate: "2026-09-01",
          endDate: "2026-10-15"
        },
        existing
      ).map((overlap) => overlap.id)
    ).toEqual(["season-2026"]);

    expect(() =>
      prepareSeasonCreate(existing, {
        actorProfile: adminProfile,
        id: "season-overlap",
        name: "Sezon z nakladka",
        startDate: "2026-09-01",
        endDate: "2026-10-15",
        status: "PLANNED",
        isDefault: false,
        allowDateOverlap: false,
        createdAt: "created-at",
        deviceId: "device-1"
      })
    ).toThrow("Zakres dat nachodzi na istniejacy sezon.");

    expect(
      prepareSeasonCreate(existing, {
        actorProfile: adminProfile,
        id: "season-overlap",
        name: "Sezon z nakladka",
        startDate: "2026-09-01",
        endDate: "2026-10-15",
        status: "PLANNED",
        isDefault: false,
        allowDateOverlap: true,
        createdAt: "created-at",
        deviceId: "device-1"
      }).overlappingSeasons
    ).toHaveLength(1);
  });

  it("prepares opening, closing and reopening status changes", () => {
    const planned = season({
      id: "season-planned",
      status: "PLANNED"
    });
    const opened = prepareSeasonStatusUpdate({
      actorProfile: adminProfile,
      targetSeason: planned,
      action: "OPEN",
      reason: "Start sezonu",
      changedAt: "changed-at",
      deviceId: "device-1"
    });
    const closed = prepareSeasonStatusUpdate({
      actorProfile: adminProfile,
      targetSeason: opened.season,
      action: "CLOSE",
      reason: "Koniec sezonu",
      changedAt: "closed-at",
      deviceId: "device-1"
    });
    const reopened = prepareSeasonStatusUpdate({
      actorProfile: adminProfile,
      targetSeason: closed.season,
      action: "REOPEN",
      reason: "Korekta po zamknieciu",
      changedAt: "reopened-at",
      deviceId: "device-1"
    });

    expect(opened.season.status).toBe("OPEN");
    expect(opened.auditAction).toBe("SEASON_OPENED");
    expect(closed.season).toMatchObject({
      status: "CLOSED",
      closedAt: "closed-at",
      closedBy: "admin-1"
    });
    expect(closed.auditAction).toBe("SEASON_CLOSED");
    expect(reopened.season).toMatchObject({
      status: "OPEN",
      reopenedAt: "reopened-at"
    });
    expect(reopened.auditAction).toBe("SEASON_REOPENED");
  });

  it("blocks unsafe status changes", () => {
    expect(() =>
      prepareSeasonStatusUpdate({
        actorProfile: operatorProfile,
        targetSeason: season({ id: "season-1" }),
        action: "CLOSE",
        reason: "Brak uprawnien",
        changedAt: "changed-at",
        deviceId: "device-1"
      })
    ).toThrow("Operacja sezonu wymaga aktywnego administratora.");

    expect(() =>
      prepareSeasonStatusUpdate({
        actorProfile: adminProfile,
        targetSeason: season({
          id: "season-open",
          status: "OPEN",
          isDefault: true
        }),
        action: "ARCHIVE",
        reason: "Archiwizacja",
        changedAt: "changed-at",
        deviceId: "device-1"
      })
    ).toThrow("Nie archiwizuj otwartego sezonu.");
  });

  it("decodes and filters seasons", () => {
    const decoded = decodeSeason(
      "season-2026",
      season({
        id: "season-2026",
        name: "Sezon 2026"
      })
    );

    expect(decoded.status).toBe("FOUND");
    expect(
      filterSeasons(
        [
          season({
            id: "season-2026",
            name: "Sezon 2026",
            status: "OPEN"
          }),
          season({
            id: "season-2027",
            name: "Sezon 2027",
            status: "PLANNED"
          })
        ],
        {
          search: "2027",
          status: "PLANNED"
        }
      ).map((item) => item.id)
    ).toEqual(["season-2027"]);
  });

  it("filters future domain records by selected season id", () => {
    const records = [
      {
        id: "a",
        seasonId: "season-2026"
      },
      {
        id: "b",
        seasonId: "season-2027"
      }
    ];

    expect(filterBySeasonId(records, "season-2026").map((record) => record.id)).toEqual([
      "a"
    ]);
    expect(filterBySeasonId(records, "ALL")).toHaveLength(2);
  });

  it("creates stable season ids and labels statuses", () => {
    expect(createSeasonId("Sezon Testowy 2027", "2027-07-01")).toBe(
      "season-2027-07-01-sezon-testowy-2027"
    );
    expect(seasonStatusLabel("CLOSED")).toBe("Zamkniety");
  });
});
