import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment
} from "@firebase/rules-unit-testing";
import {
  Timestamp,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  serverTimestamp,
  setDoc,
  updateDoc
} from "firebase/firestore";
import { readFileSync } from "node:fs";

const projectId = "demo-borowka-pwa-audit";

type ProfileSeed = {
  uid: string;
  email: string;
  displayName: string;
  role: "ADMIN" | "OPERATOR" | "PICKER";
  workerId: string | null;
  active: boolean;
  registrationStatus: "APPROVED" | "REJECTED" | "BLOCKED";
  offlineConsent: boolean;
};

let testEnv: RulesTestEnvironment | undefined;

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    projectId,
    firestore: {
      host: "127.0.0.1",
      port: 8080,
      rules: readFileSync("firestore.rules", "utf8")
    }
  });
});

afterEach(async () => {
  await testEnv?.clearFirestore();
});

afterAll(async () => {
  await testEnv?.cleanup();
});

const profile = ({
  uid,
  ...overrides
}: Partial<ProfileSeed> & { uid: string }): ProfileSeed => ({
  uid,
  email: `${uid}@example.test`,
  displayName: uid,
  role: "OPERATOR",
  workerId: null,
  active: true,
  registrationStatus: "APPROVED",
  offlineConsent: false,
  ...overrides
});

const auditEvent = (overrides: Record<string, unknown> = {}) => ({
  id: "audit-1",
  actorUid: "admin-1",
  actorRoleSnapshot: "ADMIN",
  action: "USER_ROLE_CHANGED",
  entityType: "USER_PROFILE",
  entityId: "operator-1",
  businessDate: null,
  beforeSummary: {
    uid: "operator-1",
    role: "OPERATOR",
    workerId: null,
    active: true,
    registrationStatus: "APPROVED"
  },
  afterSummary: {
    uid: "operator-1",
    role: "PICKER",
    workerId: "worker-1",
    active: true,
    registrationStatus: "APPROVED"
  },
  reason: "Zmiana testowa",
  createdAtDevice: Timestamp.now(),
  createdAtServer: serverTimestamp(),
  deviceId: "device-1",
  ...overrides
});

const seedProfiles = async (...profiles: ProfileSeed[]) => {
  expect(testEnv).toBeDefined();
  if (!testEnv) {
    return;
  }

  await testEnv.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    await Promise.all(
      profiles.map((seedProfile) =>
        setDoc(doc(db, "users", seedProfile.uid), seedProfile)
      )
    );
  });
};

const seedAuditEvent = async () => {
  expect(testEnv).toBeDefined();
  if (!testEnv) {
    return;
  }

  await testEnv.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    await setDoc(doc(db, "auditEvents", "audit-1"), {
      ...auditEvent({
        createdAtServer: Timestamp.now()
      })
    });
  });
};

describe("Firestore audit event rules", () => {
  it("allows active admin to create and read audit events", async () => {
    await seedProfiles(
      profile({
        uid: "admin-1",
        role: "ADMIN"
      }),
      profile({ uid: "operator-1" })
    );
    expect(testEnv).toBeDefined();
    if (!testEnv) {
      return;
    }

    const db = testEnv
      .authenticatedContext("admin-1", { email: "admin-1@example.test" })
      .firestore();

    await assertSucceeds(setDoc(doc(db, "auditEvents", "audit-1"), auditEvent()));
    const snapshot = await assertSucceeds(getDoc(doc(db, "auditEvents", "audit-1")));
    expect(snapshot.data()?.action).toBe("USER_ROLE_CHANGED");

    const listSnapshot = await assertSucceeds(getDocs(collection(db, "auditEvents")));
    expect(listSnapshot.size).toBe(1);
  });

  it("rejects audit reads for non-admin users", async () => {
    await seedProfiles(
      profile({
        uid: "admin-1",
        role: "ADMIN"
      }),
      profile({ uid: "operator-1" })
    );
    await seedAuditEvent();
    expect(testEnv).toBeDefined();
    if (!testEnv) {
      return;
    }

    const db = testEnv
      .authenticatedContext("operator-1", { email: "operator-1@example.test" })
      .firestore();

    await assertFails(getDoc(doc(db, "auditEvents", "audit-1")));
    await assertFails(getDocs(collection(db, "auditEvents")));
  });

  it("rejects forged actor, role and invalid audit action", async () => {
    await seedProfiles(
      profile({
        uid: "admin-1",
        role: "ADMIN"
      }),
      profile({ uid: "operator-1" })
    );
    expect(testEnv).toBeDefined();
    if (!testEnv) {
      return;
    }

    const db = testEnv
      .authenticatedContext("admin-1", { email: "admin-1@example.test" })
      .firestore();

    await assertFails(
      setDoc(
        doc(db, "auditEvents", "audit-forged-actor"),
        auditEvent({
          id: "audit-forged-actor",
          actorUid: "operator-1"
        })
      )
    );
    await assertFails(
      setDoc(
        doc(db, "auditEvents", "audit-forged-role"),
        auditEvent({
          id: "audit-forged-role",
          actorRoleSnapshot: "OPERATOR"
        })
      )
    );
    await assertFails(
      setDoc(
        doc(db, "auditEvents", "audit-invalid-action"),
        auditEvent({
          id: "audit-invalid-action",
          action: "UNKNOWN"
        })
      )
    );
  });

  it("allows admin to create season audit events", async () => {
    await seedProfiles(
      profile({
        uid: "admin-1",
        role: "ADMIN"
      })
    );
    expect(testEnv).toBeDefined();
    if (!testEnv) {
      return;
    }

    const db = testEnv
      .authenticatedContext("admin-1", { email: "admin-1@example.test" })
      .firestore();

    await assertSucceeds(
      setDoc(
        doc(db, "auditEvents", "audit-season-created"),
        auditEvent({
          id: "audit-season-created",
          action: "SEASON_CREATED",
          entityType: "SEASON",
          entityId: "season-2027",
          beforeSummary: null,
          afterSummary: {
            seasonId: "season-2027",
            name: "Sezon 2027",
            startDate: "2027-07-01",
            endDate: "2027-09-30",
            status: "OPEN",
            isDefault: true
          }
        })
      )
    );
  });

  it("allows admin to create settlement plan audit events", async () => {
    await seedProfiles(
      profile({
        uid: "admin-1",
        role: "ADMIN"
      })
    );
    expect(testEnv).toBeDefined();
    if (!testEnv) {
      return;
    }

    const db = testEnv
      .authenticatedContext("admin-1", { email: "admin-1@example.test" })
      .firestore();

    await assertSucceeds(
      setDoc(
        doc(db, "auditEvents", "audit-plan-created"),
        auditEvent({
          id: "audit-plan-created",
          action: "SETTLEMENT_PLAN_CREATED",
          entityType: "SETTLEMENT_PLAN",
          entityId: "plan-skrzynka",
          beforeSummary: null,
          afterSummary: {
            planId: "plan-skrzynka",
            name: "Za skrzynke",
            code: "SKRZYNKA",
            calculationBasis: "QUANTITY",
            unitLabelSingular: "skrzynka",
            unitLabelPlural: "skrzynki",
            unitSymbol: "skrz.",
            quantityPrecision: 0,
            weightRequired: false,
            allowBatchQuantity: true,
            description: "Rozliczenie za skrzynke.",
            active: true
          }
        })
      )
    );
    await assertSucceeds(
      setDoc(
        doc(db, "auditEvents", "audit-plan-updated"),
        auditEvent({
          id: "audit-plan-updated",
          action: "SETTLEMENT_PLAN_UPDATED",
          entityType: "SETTLEMENT_PLAN",
          entityId: "plan-skrzynka",
          beforeSummary: {
            planId: "plan-skrzynka",
            name: "Za skrzynke",
            code: "SKRZYNKA",
            calculationBasis: "QUANTITY",
            unitLabelSingular: "skrzynka",
            unitLabelPlural: "skrzynki",
            unitSymbol: "skrz.",
            quantityPrecision: 0,
            weightRequired: false,
            allowBatchQuantity: true,
            description: "Rozliczenie za skrzynke.",
            active: true
          },
          afterSummary: {
            planId: "plan-skrzynka",
            name: "Za pelna skrzynke",
            code: "SKRZYNKA",
            calculationBasis: "QUANTITY",
            unitLabelSingular: "skrzynka",
            unitLabelPlural: "pelne skrzynki",
            unitSymbol: "skrz.",
            quantityPrecision: 0,
            weightRequired: false,
            allowBatchQuantity: true,
            description: "Opis po zmianie.",
            active: true
          }
        })
      )
    );
    await assertSucceeds(
      setDoc(
        doc(db, "auditEvents", "audit-plan-archived"),
        auditEvent({
          id: "audit-plan-archived",
          action: "SETTLEMENT_PLAN_ARCHIVED",
          entityType: "SETTLEMENT_PLAN",
          entityId: "plan-skrzynka",
          beforeSummary: {
            planId: "plan-skrzynka",
            name: "Za skrzynke",
            code: "SKRZYNKA",
            calculationBasis: "QUANTITY",
            active: true
          },
          afterSummary: {
            planId: "plan-skrzynka",
            name: "Za skrzynke",
            code: "SKRZYNKA",
            calculationBasis: "QUANTITY",
            active: false
          },
          reason: "Nie uzywamy w tym sezonie."
        })
      )
    );
  });

  it("allows admin to create worker audit events", async () => {
    await seedProfiles(
      profile({
        uid: "admin-1",
        role: "ADMIN"
      })
    );
    expect(testEnv).toBeDefined();
    if (!testEnv) {
      return;
    }

    const db = testEnv
      .authenticatedContext("admin-1", { email: "admin-1@example.test" })
      .firestore();

    await assertSucceeds(
      setDoc(
        doc(db, "auditEvents", "audit-worker-created"),
        auditEvent({
          id: "audit-worker-created",
          action: "WORKER_CREATED",
          entityType: "WORKER",
          entityId: "worker-new-1234",
          beforeSummary: null,
          afterSummary: {
            workerId: "worker-new-1234",
            displayName: "Anna Nowa",
            active: true,
            planId: "plan-weight-kg",
            currentPlanId: "plan-weight-kg",
            rateVersionId: "rate-worker-new-1234-2026-07-15",
            currentRateVersionId: "rate-worker-new-1234-2026-07-15",
            rateGroszPerUnit: 1250,
            validFrom: "2026-07-15"
          }
        })
      )
    );
    await assertSucceeds(
      setDoc(
        doc(db, "auditEvents", "audit-worker-archived"),
        auditEvent({
          id: "audit-worker-archived",
          action: "WORKER_ARCHIVED",
          entityType: "WORKER",
          entityId: "worker-new-1234",
          beforeSummary: {
            workerId: "worker-new-1234",
            displayName: "Anna Nowa",
            active: true,
            currentPlanId: "plan-weight-kg",
            currentRateVersionId: "rate-worker-new-1234-2026-07-15",
            uid: "picker-anna",
            email: "anna@example.test",
            role: "PICKER"
          },
          afterSummary: {
            workerId: "worker-new-1234",
            displayName: "Anna Nowa",
            active: false,
            currentPlanId: "plan-weight-kg",
            currentRateVersionId: "rate-worker-new-1234-2026-07-15",
            uid: "picker-anna",
            email: "anna@example.test",
            role: "PICKER"
          },
          reason: "Koniec wspolpracy. Kontrola: sprawdzono sesje."
        })
      )
    );
  });

  it("allows admin to create worker rate change audit events", async () => {
    await seedProfiles(
      profile({
        uid: "admin-1",
        role: "ADMIN"
      })
    );
    expect(testEnv).toBeDefined();
    if (!testEnv) {
      return;
    }

    const db = testEnv
      .authenticatedContext("admin-1", { email: "admin-1@example.test" })
      .firestore();

    await assertSucceeds(
      setDoc(
        doc(db, "auditEvents", "audit-worker-rate-changed"),
        auditEvent({
          id: "audit-worker-rate-changed",
          action: "WORKER_RATE_CHANGED",
          entityType: "WORKER",
          entityId: "worker-new-1234",
          beforeSummary: {
            workerId: "worker-new-1234",
            displayName: "Anna Nowa",
            active: true,
            planId: "plan-weight-kg",
            currentPlanId: "plan-weight-kg",
            rateVersionId: "rate-worker-new-1234-2026-07-01",
            currentRateVersionId: "rate-worker-new-1234-2026-07-01",
            rateGroszPerUnit: 1000,
            validFrom: "2026-07-01",
            validTo: null
          },
          afterSummary: {
            workerId: "worker-new-1234",
            displayName: "Anna Nowa",
            active: true,
            planId: "plan-weight-kg",
            currentPlanId: "plan-weight-kg",
            rateVersionId: "rate-worker-new-1234-2026-07-15",
            currentRateVersionId: "rate-worker-new-1234-2026-07-15",
            rateGroszPerUnit: 1400,
            validFrom: "2026-07-15",
            validTo: null
          },
          reason: "Historyczne snapshoty sesji nie zostana przeliczone."
        })
      )
    );
  });

  it("allows admin to create harvest session close audit events", async () => {
    await seedProfiles(
      profile({
        uid: "admin-1",
        role: "ADMIN"
      })
    );
    expect(testEnv).toBeDefined();
    if (!testEnv) {
      return;
    }

    const db = testEnv
      .authenticatedContext("admin-1", { email: "admin-1@example.test" })
      .firestore();

    await assertSucceeds(
      setDoc(
        doc(db, "auditEvents", "audit-harvest-session-closed"),
        auditEvent({
          id: "audit-harvest-session-closed",
          action: "HARVEST_SESSION_CLOSED",
          entityType: "HARVEST_SESSION",
          entityId: "session-worker-anna-test",
          businessDate: "2026-07-17",
          beforeSummary: {
            status: "OPEN",
            totalEntryCount: 0,
            totalQuantityMilli: 0,
            totalWeightG: 0,
            amountDueGrosz: null,
            calculationVersion: "1",
            closedBy: null,
            revision: 1
          },
          afterSummary: {
            status: "CLOSED",
            totalEntryCount: 2,
            totalQuantityMilli: 2495,
            totalWeightG: 2495,
            amountDueGrosz: 2495,
            calculationVersion: "1",
            closedBy: "admin-1",
            revision: 2
          },
          reason: null
        })
      )
    );
  });

  it("allows admin to create harvest session reopen audit events", async () => {
    await seedProfiles(
      profile({
        uid: "admin-1",
        role: "ADMIN"
      })
    );
    expect(testEnv).toBeDefined();
    if (!testEnv) {
      return;
    }

    const db = testEnv
      .authenticatedContext("admin-1", { email: "admin-1@example.test" })
      .firestore();

    await assertSucceeds(
      setDoc(
        doc(db, "auditEvents", "audit-harvest-session-reopened"),
        auditEvent({
          id: "audit-harvest-session-reopened",
          action: "HARVEST_SESSION_REOPENED",
          entityType: "HARVEST_SESSION",
          entityId: "session-worker-anna-test",
          businessDate: "2026-07-17",
          beforeSummary: {
            status: "CLOSED",
            totalEntryCount: 2,
            totalQuantityMilli: 2495,
            totalWeightG: 2495,
            amountDueGrosz: 2495,
            calculationVersion: "1",
            closedBy: "admin-1",
            paymentId: null,
            revision: 2
          },
          afterSummary: {
            status: "OPEN",
            totalEntryCount: 2,
            totalQuantityMilli: 2495,
            totalWeightG: 2495,
            amountDueGrosz: null,
            calculationVersion: "1",
            closedBy: null,
            paymentId: null,
            revision: 3
          },
          reason: "Korekta blednego wpisu."
        })
      )
    );
  });

  it("allows admin to create harvest session cancel audit events", async () => {
    await seedProfiles(
      profile({
        uid: "admin-1",
        role: "ADMIN"
      })
    );
    expect(testEnv).toBeDefined();
    if (!testEnv) {
      return;
    }

    const db = testEnv
      .authenticatedContext("admin-1", { email: "admin-1@example.test" })
      .firestore();

    await assertSucceeds(
      setDoc(
        doc(db, "auditEvents", "audit-harvest-session-cancelled"),
        auditEvent({
          id: "audit-harvest-session-cancelled",
          action: "HARVEST_SESSION_CANCELLED",
          entityType: "HARVEST_SESSION",
          entityId: "session-worker-anna-test",
          businessDate: "2026-07-17",
          beforeSummary: {
            status: "CLOSED",
            totalEntryCount: 2,
            totalQuantityMilli: 2495,
            totalWeightG: 2495,
            amountDueGrosz: 2495,
            calculationVersion: "1",
            closedBy: "admin-1",
            paymentId: null,
            revision: 2
          },
          afterSummary: {
            status: "CANCELLED",
            totalEntryCount: 2,
            totalQuantityMilli: 2495,
            totalWeightG: 2495,
            amountDueGrosz: 2495,
            calculationVersion: "1",
            closedBy: "admin-1",
            paymentId: null,
            revision: 3
          },
          reason: "Duplikat sesji."
        })
      )
    );
  });

  it("rejects mutable or malformed audit events", async () => {
    await seedProfiles(
      profile({
        uid: "admin-1",
        role: "ADMIN"
      }),
      profile({ uid: "operator-1" })
    );
    await seedAuditEvent();
    expect(testEnv).toBeDefined();
    if (!testEnv) {
      return;
    }

    const db = testEnv
      .authenticatedContext("admin-1", { email: "admin-1@example.test" })
      .firestore();

    await assertFails(
      updateDoc(doc(db, "auditEvents", "audit-1"), {
        reason: "Zmieniony powod"
      })
    );
    await assertFails(deleteDoc(doc(db, "auditEvents", "audit-1")));
    await assertFails(
      setDoc(
        doc(db, "auditEvents", "audit-bad-summary"),
        auditEvent({
          id: "audit-bad-summary",
          beforeSummary: {
            unexpected: "field"
          }
        })
      )
    );
    await assertFails(
      setDoc(
        doc(db, "auditEvents", "audit-client-server-time"),
        auditEvent({
          id: "audit-client-server-time",
          createdAtServer: Timestamp.now()
        })
      )
    );
  });
});
