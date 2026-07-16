import type { UserProfile } from "../domain/identity";
import {
  findActiveWorkerLinkConflict,
  prepareUserRoleAndWorkerUpdate
} from "./userProfileUpdates";

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

const adminProfile = profile({
  uid: "admin-1",
  role: "ADMIN",
  workerId: null
});

describe("user profile updates", () => {
  it("prepares role and worker updates with audit summaries", () => {
    const targetProfile = profile({
      uid: "operator-1",
      role: "OPERATOR",
      workerId: null
    });

    expect(
      prepareUserRoleAndWorkerUpdate({
        actorProfile: adminProfile,
        targetProfile,
        targetRole: "PICKER",
        targetWorkerId: " worker-2 ",
        reason: " Zmiana po przypisaniu zbieracza ",
        deviceId: "device-1"
      })
    ).toMatchObject({
      updatedProfile: {
        role: "PICKER",
        workerId: "worker-2"
      },
      auditAction: "USER_ROLE_CHANGED",
      beforeSummary: {
        role: "OPERATOR",
        workerId: null
      },
      afterSummary: {
        role: "PICKER",
        workerId: "worker-2"
      },
      reason: "Zmiana po przypisaniu zbieracza"
    });
  });

  it("preserves existing workerId when changing picker to operator", () => {
    const prepared = prepareUserRoleAndWorkerUpdate({
      actorProfile: adminProfile,
      targetProfile: profile({
        uid: "picker-1",
        role: "PICKER",
        workerId: "worker-1"
      }),
      targetRole: "OPERATOR",
      reason: "Awans do obslugi sesji",
      deviceId: "device-1"
    });

    expect(prepared.updatedProfile).toMatchObject({
      role: "OPERATOR",
      workerId: "worker-1"
    });
  });

  it("rejects picker role without workerId and duplicate active worker links", () => {
    const targetProfile = profile({
      uid: "operator-1",
      role: "OPERATOR",
      workerId: null
    });

    expect(() =>
      prepareUserRoleAndWorkerUpdate({
        actorProfile: adminProfile,
        targetProfile,
        targetRole: "PICKER",
        targetWorkerId: null,
        reason: "Przypisanie roli",
        deviceId: "device-1"
      })
    ).toThrow("Rola Zbieracz wymaga workerId.");

    expect(() =>
      prepareUserRoleAndWorkerUpdate({
        actorProfile: adminProfile,
        targetProfile,
        targetRole: "PICKER",
        targetWorkerId: "worker-2",
        reason: "Przypisanie roli",
        deviceId: "device-1",
        activeProfilesWithRequestedWorker: [
          profile({
            uid: "other-picker",
            workerId: "worker-2"
          })
        ]
      })
    ).toThrow("Ten workerId jest juz przypisany do aktywnego konta.");
  });

  it("blocks self-demotion of administrator and no-op updates", () => {
    expect(() =>
      prepareUserRoleAndWorkerUpdate({
        actorProfile: adminProfile,
        targetProfile: adminProfile,
        targetRole: "OPERATOR",
        reason: "Samodzielna degradacja",
        deviceId: "device-1"
      })
    ).toThrow("Administrator nie moze zmienic wlasnej roli.");

    expect(() =>
      prepareUserRoleAndWorkerUpdate({
        actorProfile: adminProfile,
        targetProfile: profile({
          uid: "operator-1",
          role: "OPERATOR",
          workerId: null
        }),
        targetRole: "OPERATOR",
        targetWorkerId: null,
        reason: "Bez zmian",
        deviceId: "device-1"
      })
    ).toThrow("Nie wybrano zmiany roli ani powiazania.");
  });

  it("finds active worker link conflicts only on other profiles", () => {
    expect(
      findActiveWorkerLinkConflict(
        [
          profile({
            uid: "picker-1",
            workerId: "worker-1"
          }),
          profile({
            uid: "archived-1",
            workerId: "worker-1",
            active: false
          })
        ],
        "picker-2",
        "worker-1"
      )?.uid
    ).toBe("picker-1");

    expect(
      findActiveWorkerLinkConflict(
        [
          profile({
            uid: "picker-1",
            workerId: "worker-1"
          })
        ],
        "picker-1",
        "worker-1"
      )
    ).toBeNull();
  });
});
