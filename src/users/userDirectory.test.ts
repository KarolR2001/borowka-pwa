import type { UserProfile } from "../domain/identity";
import {
  decodeUserDirectoryDocuments,
  defaultUserDirectoryFilters,
  filterUserProfiles,
  sortUserProfiles
} from "./userDirectory";

const profile = ({
  uid,
  ...overrides
}: Partial<UserProfile> & { uid: string }): UserProfile => ({
  uid,
  email: `${uid}@example.test`,
  displayName: uid,
  role: "PICKER",
  workerId: "worker-1",
  active: true,
  registrationStatus: "APPROVED",
  offlineConsent: false,
  ...overrides
});

describe("user directory", () => {
  it("sorts active admins, operators, pickers and then blocked profiles", () => {
    const sorted = sortUserProfiles([
      profile({ uid: "blocked", active: false, registrationStatus: "BLOCKED" }),
      profile({ uid: "picker", role: "PICKER" }),
      profile({ uid: "operator", role: "OPERATOR", workerId: null }),
      profile({ uid: "admin", role: "ADMIN", workerId: null })
    ]);

    expect(sorted.map((item) => item.uid)).toEqual([
      "admin",
      "operator",
      "picker",
      "blocked"
    ]);
  });

  it("filters profiles by role, status, activity and search text", () => {
    const profiles = [
      profile({
        uid: "admin-1",
        displayName: "Karol Admin",
        role: "ADMIN",
        workerId: null
      }),
      profile({
        uid: "operator-1",
        displayName: "Operator Test",
        role: "OPERATOR",
        workerId: null
      }),
      profile({
        uid: "picker-1",
        displayName: "Anna Zbieracz",
        role: "PICKER",
        workerId: "worker-anna"
      }),
      profile({
        uid: "blocked-1",
        role: "OPERATOR",
        workerId: null,
        active: false,
        registrationStatus: "BLOCKED"
      })
    ];

    expect(
      filterUserProfiles(profiles, {
        ...defaultUserDirectoryFilters,
        role: "PICKER"
      }).map((item) => item.uid)
    ).toEqual(["picker-1"]);
    expect(
      filterUserProfiles(profiles, {
        ...defaultUserDirectoryFilters,
        registrationStatus: "BLOCKED"
      }).map((item) => item.uid)
    ).toEqual(["blocked-1"]);
    expect(
      filterUserProfiles(profiles, {
        ...defaultUserDirectoryFilters,
        activity: "INACTIVE"
      }).map((item) => item.uid)
    ).toEqual(["blocked-1"]);
    expect(
      filterUserProfiles(profiles, {
        ...defaultUserDirectoryFilters,
        search: "anna"
      }).map((item) => item.uid)
    ).toEqual(["picker-1"]);
  });

  it("separates invalid profile documents", () => {
    const decoded = decodeUserDirectoryDocuments([
      {
        id: "admin-1",
        data: profile({
          uid: "admin-1",
          role: "ADMIN",
          workerId: null
        })
      },
      {
        id: "broken-1",
        data: {
          uid: "different-uid",
          email: "broken@example.test"
        }
      }
    ]);

    expect(decoded.profiles.map((item) => item.uid)).toEqual(["admin-1"]);
    expect(decoded.invalidProfiles).toEqual([
      {
        id: "broken-1",
        reason: "Profil uzytkownika ma niezgodny identyfikator."
      }
    ]);
  });
});
