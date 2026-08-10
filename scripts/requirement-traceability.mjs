/* eslint-disable @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-return, @typescript-eslint/use-unknown-in-catch-callback-variable */

import { access, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const IDS_PATH = path.join(ROOT, "docs/testing/prd-requirement-ids.txt");
const MATRIX_PATH = path.join(ROOT, "docs/testing/requirements-traceability.md");

export const PRD_SHA256 =
  "7c09ca7801d105082b408f0f40ff4c0bbe24a2bfb2c7d2bc2c10665e7cb57597";

export const TRACE_STATUSES = new Set([
  "AUTOMATED",
  "PARTIAL",
  "PENDING_MANUAL",
  "DEFERRED_DEVICE",
  "EXCLUDED_SCOPE",
  "GAP"
]);

const BUNDLES = {
  goals: {
    domain: "Cele produktu",
    status: "PARTIAL",
    evidence: [
      "docs/release/release-candidate-scope.md",
      "docs/testing/matrix.md",
      "PLAN:10.13-UAT",
      "PLAN:10.17-pilot"
    ]
  },
  roles: {
    domain: "Role i uprawnienia",
    status: "AUTOMATED",
    evidence: [
      "src/app/App.test.tsx",
      "tests/rules/firestore-user-profiles.test.ts",
      "tests/rules/firestore-export-permissions.test.ts"
    ]
  },
  data: {
    domain: "Model danych",
    status: "AUTOMATED",
    evidence: [
      "src/domain/domainConfiguration.test.ts",
      "src/domain/identity.test.ts",
      "src/audit/auditEvents.test.ts",
      "tests/rules/firestore-deny-default.test.ts"
    ]
  },
  auth: {
    domain: "Konta i uwierzytelnianie",
    status: "AUTOMATED",
    evidence: [
      "src/auth/invitedRegistration.test.ts",
      "src/auth/authSession.test.ts",
      "src/app/App.test.tsx",
      "tests/rules/firestore-registration-invitations.test.ts"
    ]
  },
  users: {
    domain: "Uzytkownicy i urzadzenia",
    status: "AUTOMATED",
    evidence: [
      "src/users/userDirectory.test.ts",
      "src/users/userProfileUpdates.test.ts",
      "src/devices/deviceDirectory.test.ts",
      "tests/rules/firestore-user-profiles.test.ts"
    ]
  },
  plans: {
    domain: "Plany rozliczen",
    status: "AUTOMATED",
    evidence: [
      "src/plans/settlementPlans.test.ts",
      "src/domain/domainConfiguration.test.ts",
      "tests/rules/firestore-settlement-plans.test.ts"
    ]
  },
  workers: {
    domain: "Zbieracze",
    status: "AUTOMATED",
    evidence: [
      "src/workers/workerDirectory.test.ts",
      "src/workers/WorkerDirectoryPanel.test.tsx",
      "tests/rules/firestore-workers.test.ts"
    ]
  },
  rates: {
    domain: "Stawki indywidualne",
    status: "AUTOMATED",
    evidence: [
      "src/workers/workerDirectory.test.ts",
      "src/harvest/openHarvestSession.test.ts",
      "src/offline/rateConflict.test.ts"
    ]
  },
  seasons: {
    domain: "Sezony",
    status: "AUTOMATED",
    evidence: [
      "src/seasons/seasons.test.ts",
      "src/seasons/AdminSeasonsPanel.test.tsx",
      "tests/rules/firestore-seasons.test.ts"
    ]
  },
  sessions: {
    domain: "Sesje zbioru",
    status: "AUTOMATED",
    evidence: [
      "src/harvest/harvestSessionState.test.ts",
      "src/harvest/openHarvestSession.test.ts",
      "tests/integration/harvest-session-flow.test.ts",
      "tests/rules/firestore-harvest.test.ts"
    ]
  },
  entries: {
    domain: "Wpisy zbioru",
    status: "AUTOMATED",
    evidence: [
      "src/harvest/harvestEntryValidation.test.ts",
      "src/harvest/harvestEntryCorrection.test.ts",
      "src/harvest/harvestEntryIdempotency.test.ts",
      "tests/integration/harvest-session-flow.test.ts"
    ]
  },
  calculations: {
    domain: "Obliczenia sesji",
    status: "AUTOMATED",
    evidence: [
      "src/harvest/harvestSessionCalculation.test.ts",
      "docs/domain/calculation-scenarios.md"
    ]
  },
  closeSession: {
    domain: "Zamykanie sesji",
    status: "AUTOMATED",
    evidence: [
      "src/harvest/closeHarvestSession.test.ts",
      "src/offline/offlineHarvestSessionClose.test.ts",
      "tests/integration/harvest-session-flow.test.ts"
    ]
  },
  reopenSession: {
    domain: "Ponowne otwieranie sesji",
    status: "AUTOMATED",
    evidence: [
      "src/harvest/reopenHarvestSession.test.ts",
      "src/harvest/reopenHarvestSessionRuntime.test.ts"
    ]
  },
  cancelSession: {
    domain: "Anulowanie sesji",
    status: "AUTOMATED",
    evidence: [
      "src/harvest/cancelHarvestSession.test.ts",
      "src/harvest/cancelHarvestSessionRuntime.test.ts"
    ]
  },
  payments: {
    domain: "Wyplaty",
    status: "AUTOMATED",
    evidence: [
      "src/payments/paymentEligibility.test.ts",
      "src/payments/paymentWrite.test.ts",
      "src/payments/paymentCancellation.test.ts",
      "tests/rules/firestore-payments.test.ts"
    ]
  },
  sales: {
    domain: "Sprzedaz",
    status: "AUTOMATED",
    evidence: [
      "src/sales/ordinarySalePreparation.test.ts",
      "src/sales/saleCorrectionWrite.test.ts",
      "src/sales/saleCancellation.test.ts",
      "tests/rules/firestore-sales.test.ts"
    ]
  },
  stock: {
    domain: "Stan i sumy",
    status: "AUTOMATED",
    evidence: [
      "src/stock/stockCorrectnessVerification.test.ts",
      "src/stock/stockReconciliation.test.ts",
      "src/dashboard/adminDashboard.test.ts"
    ]
  },
  dashboards: {
    domain: "Pulpity",
    status: "AUTOMATED",
    evidence: [
      "src/dashboard/AdminDashboardPanel.test.tsx",
      "src/dashboard/OperatorDashboardPanel.test.tsx",
      "src/picker/PickerDashboardPanel.test.tsx",
      "tests/rules/firestore-picker-dashboard.test.ts"
    ]
  },
  reports: {
    domain: "Raporty",
    status: "PARTIAL",
    evidence: [
      "src/reports/reportCatalog.test.ts",
      "docs/domain/mvp-report-catalog.md",
      "PLAN:10.3-full-unit-suite",
      "PLAN:10.13-UAT"
    ]
  },
  exports: {
    domain: "Eksport",
    status: "AUTOMATED",
    evidence: [
      "src/reports/polishExcelCsv.test.ts",
      "src/reports/fullCloudExport.test.ts",
      "tests/integration/full-cloud-export.test.ts",
      "tests/scripts/full-cloud-export-portability.test.mjs"
    ]
  },
  exportsManual: {
    domain: "Eksport",
    status: "PARTIAL",
    evidence: [
      "src/reports/polishExcelCsv.test.ts",
      "tests/scripts/full-cloud-export-portability.test.mjs",
      "MANUAL:Excel-and-alternative-sheet",
      "MANUAL:realistic-DEV-export-two-copies"
    ]
  },
  offline: {
    domain: "Offline i synchronizacja",
    status: "AUTOMATED",
    evidence: [
      "src/offline/offlineScenarioReconciliation.test.ts",
      "tests/integration/offline-harvest-runtime.test.ts",
      "docs/testing/etap-6-offline-scenarios-report.md"
    ]
  },
  offlineAcceptance: {
    domain: "Offline i synchronizacja",
    status: "PARTIAL",
    evidence: [
      "src/offline/offlineScenarioReconciliation.test.ts",
      "docs/testing/etap-6-offline-scenarios-report.md",
      "MANUAL:physical-device-offline"
    ]
  },
  sync: {
    domain: "Centrum synchronizacji",
    status: "AUTOMATED",
    evidence: [
      "src/offline/syncCenter.test.ts",
      "src/offline/automaticSynchronization.test.ts",
      "src/offline/emergencyLocalExport.test.ts"
    ]
  },
  security: {
    domain: "Bezpieczenstwo i prywatnosc",
    status: "AUTOMATED",
    evidence: [
      "tests/rules/firestore-deny-default.test.ts",
      "tests/rules/firestore-export-permissions.test.ts",
      "src/audit/auditEvents.test.ts",
      "src/offline/safeSignOut.test.ts"
    ]
  },
  ux: {
    domain: "UX",
    status: "PENDING_MANUAL",
    evidence: [
      "src/app/App.test.tsx",
      "PLAN:10.6-browser-matrix",
      "PLAN:10.8-accessibility",
      "PLAN:10.9-responsive"
    ]
  },
  performance: {
    domain: "NFR wydajnosc",
    status: "PARTIAL",
    evidence: [
      "tests/integration/dashboard-performance.test.ts",
      "docs/testing/etap-8-dashboard-performance-report.md",
      "PLAN:10.10-realistic-DEV-performance"
    ]
  },
  reliability: {
    domain: "NFR niezawodnosc",
    status: "PARTIAL",
    evidence: [
      "src/offline/longOfflineVerification.test.ts",
      "src/pwa/pwaUpdateRecovery.test.ts",
      "PLAN:10.5-long-offline",
      "PLAN:10.12-RC-update"
    ]
  },
  dataQuality: {
    domain: "NFR spojnosc danych",
    status: "AUTOMATED",
    evidence: [
      "src/stock/stockCorrectnessVerification.test.ts",
      "src/offline/synchronizationIdempotency.test.ts",
      "tests/integration/harvest-session-flow.test.ts"
    ]
  },
  accessibility: {
    domain: "NFR dostepnosc",
    status: "PENDING_MANUAL",
    evidence: ["src/app/App.test.tsx", "PLAN:10.8-accessibility"]
  },
  responsive: {
    domain: "NFR responsywnosc",
    status: "PENDING_MANUAL",
    evidence: ["tests/e2e/app-shell.spec.ts", "PLAN:10.9-responsive"]
  },
  localization: {
    domain: "NFR lokalizacja",
    status: "PARTIAL",
    evidence: [
      "src/domain/format.test.ts",
      "src/reports/polishExcelCsv.test.ts",
      "PLAN:10.6-browser-matrix"
    ]
  },
  time: {
    domain: "NFR czas i daty",
    status: "PARTIAL",
    evidence: [
      "src/domain/format.test.ts",
      "src/harvest/harvestSessionState.test.ts",
      "PLAN:10.6-browser-matrix"
    ]
  },
  maintainability: {
    domain: "NFR utrzymywalnosc",
    status: "AUTOMATED",
    evidence: [
      "src/config/appMeta.test.ts",
      "tests/scripts/validate-deploy-env.test.mjs",
      "docs/process/definition-of-done.md"
    ]
  },
  observability: {
    domain: "NFR obserwowalnosc",
    status: "PARTIAL",
    evidence: [
      "src/app/App.test.tsx",
      "docs/deployment/rollback.md",
      "PLAN:10.11-security-review"
    ]
  },
  portability: {
    domain: "NFR portowalnosc",
    status: "PARTIAL",
    evidence: [
      "tests/scripts/full-cloud-export-portability.test.mjs",
      "docs/firebase/environments.md",
      "MANUAL:realistic-DEV-export-two-copies"
    ]
  },
  cost: {
    domain: "NFR koszt",
    status: "PARTIAL",
    evidence: [
      "src/dashboard/dashboardReadStrategy.test.ts",
      "tests/integration/dashboard-performance.test.ts",
      "PLAN:11.7-budget-alerts"
    ]
  },
  deviceScenarios: {
    domain: "Scenariusze urzadzeniowe offline",
    status: "DEFERRED_DEVICE",
    evidence: [
      "src/offline/offlineScenarioReconciliation.test.ts",
      "docs/testing/etap-6-android-report.md",
      "docs/testing/etap-6-ios-report.md",
      "MANUAL:physical-Android-and-iOS"
    ]
  },
  importedCalculation: {
    domain: "Dane historyczne",
    status: "EXCLUDED_SCOPE",
    evidence: ["docs/release/release-candidate-scope.md", "DECISION:DEC-0021"]
  }
};

const PREFIX_RULES = [
  ["BR-CALC-020", "importedCalculation"],
  ["OFF-T", "deviceScenarios"],
  ["ACC-OFF-", "offlineAcceptance"],
  ["ACC-AUTH-", "auth"],
  ["ACC-RATE-", "rates"],
  ["ACC-HS-", "sessions"],
  ["ACC-PAY-", "payments"],
  ["ACC-SALE-", "sales"],
  ["ACC-REPORT-", "reports"],
  ["NFR-PERF-", "performance"],
  ["NFR-REL-", "reliability"],
  ["NFR-DATA-", "dataQuality"],
  ["NFR-A11Y-", "accessibility"],
  ["NFR-RESP-", "responsive"],
  ["NFR-I18N-", "localization"],
  ["NFR-TIME-", "time"],
  ["NFR-MAINT-", "maintainability"],
  ["NFR-OBS-", "observability"],
  ["NFR-PORT-", "portability"],
  ["NFR-COST-", "cost"],
  ["FR-HS-CLOSE-", "closeSession"],
  ["FR-HS-REOPEN-", "reopenSession"],
  ["FR-HS-CANCEL-", "cancelSession"],
  ["FR-DASH-", "dashboards"],
  ["FR-EXPORT-002", "exportsManual"],
  ["FR-EXPORT-010", "exportsManual"],
  ["FR-EXPORT-011", "exportsManual"],
  ["FR-EXPORT-", "exports"],
  ["FR-REPORT-", "reports"],
  ["FR-AUTH-", "auth"],
  ["FR-USER-", "users"],
  ["FR-PLAN-", "plans"],
  ["FR-WORKER-", "workers"],
  ["FR-RATE-", "rates"],
  ["FR-SEASON-", "seasons"],
  ["FR-HS-", "sessions"],
  ["FR-HE-", "entries"],
  ["FR-PAY-", "payments"],
  ["FR-SALE-", "sales"],
  ["FR-SYNC-", "sync"],
  ["BR-ROLE-", "roles"],
  ["BR-DATA-", "data"],
  ["BR-RATE-", "rates"],
  ["BR-CALC-", "calculations"],
  ["BR-PAY-", "payments"],
  ["BR-STOCK-", "stock"],
  ["BR-U-", "users"],
  ["BR-P-", "plans"],
  ["BR-R-", "rates"],
  ["BR-HS-", "sessions"],
  ["BR-HE-", "entries"],
  ["BR-S-", "sales"],
  ["BR-SUM-", "stock"],
  ["OFF-", "offline"],
  ["SEC-", "security"],
  ["UX-", "ux"],
  ["G-", "goals"]
];

export function classifyRequirement(id) {
  const rule = PREFIX_RULES.find(([prefix]) => id.startsWith(prefix));
  if (!rule) {
    return {
      domain: "Nieprzypisane",
      status: "GAP",
      evidence: []
    };
  }

  return BUNDLES[rule[1]];
}

export function parseRequirementIds(text) {
  return text
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter(Boolean);
}

export function buildTraceabilityRows(ids) {
  return ids.map((id) => ({ id, ...classifyRequirement(id) }));
}

export function validateRows(rows) {
  const errors = [];
  const ids = rows.map(({ id }) => id);
  const duplicates = ids.filter((id, index) => ids.indexOf(id) !== index);

  if (rows.length !== 392) {
    errors.push(`Expected 392 requirements, received ${rows.length}.`);
  }
  if (duplicates.length > 0) {
    errors.push(`Duplicate IDs: ${[...new Set(duplicates)].join(", ")}.`);
  }

  for (const row of rows) {
    if (!TRACE_STATUSES.has(row.status)) {
      errors.push(`${row.id}: unsupported status ${row.status}.`);
    }
    if (row.evidence.length === 0) {
      errors.push(`${row.id}: no evidence or planned verification.`);
    }
  }

  return errors;
}

function statusSummary(rows) {
  return [...TRACE_STATUSES]
    .map((status) => [status, rows.filter((row) => row.status === status).length])
    .filter(([, count]) => count > 0);
}

export function renderMatrix(rows) {
  const summary = statusSummary(rows);
  const lines = [
    "# Macierz wymagan PRD do testow",
    "",
    "## Metadane",
    "",
    `- wersja RC: \`1.0.0-rc.1\`;`,
    `- liczba unikalnych identyfikatorow: \`${rows.length}\`;`,
    `- SHA-256 zrodlowego PRD: \`${PRD_SHA256}\`;`,
    "- decyzja zakresowa: `DEC-0021` wyklucza dane poprzednich sezonow;",
    "- generator i kontrola kompletnosci: `scripts/requirement-traceability.mjs`.",
    "",
    "Status `AUTOMATED` oznacza istniejacy dowod automatyczny, a nie wynik pelnego",
    "przebiegu etapu 10. Status `PARTIAL` wymaga wskazanej dalszej walidacji.",
    "`PENDING_MANUAL` i `DEFERRED_DEVICE` nie sa zaliczone. `EXCLUDED_SCOPE` wymaga",
    "jawnej decyzji produktowej. `GAP` oznacza brak jakiegokolwiek przypisania i",
    "blokuje RC.",
    "",
    "## Podsumowanie",
    "",
    "| Status | Liczba |",
    "| --- | ---: |",
    ...summary.map(([status, count]) => `| \`${status}\` | ${count} |`),
    "",
    "## Otwarte bramki",
    "",
    "- testy manualne i czesciowe sa wykonywane w kolejnych pakietach 10.x;",
    "- scenariusze fizycznych telefonow pozostaja odroczone zgodnie z decyzja",
    "  wlasciciela produktu;",
    "- wymaganie danych importowanych jest wykluczone wraz z migracja poprzednich",
    "  sezonow;",
    "- kazdy status `GAP` blokuje przejscie RC; generator obecnie wymaga zera",
    "  nieprzypisanych identyfikatorow.",
    "",
    "## Pelna macierz",
    "",
    "| ID | Obszar | Status | Dowod lub zaplanowana walidacja |",
    "| --- | --- | --- | --- |",
    ...rows.map(
      ({ id, domain, status, evidence }) =>
        `| \`${id}\` | ${domain} | \`${status}\` | ${evidence.map((item) => `\`${item}\``).join("<br>")} |`
    ),
    ""
  ];

  return lines.join("\n");
}

export async function validateEvidenceFiles(rows) {
  const errors = [];
  const paths = new Set(
    rows.flatMap(({ evidence }) => evidence.filter((item) => !/^[A-Z]+:/u.test(item)))
  );

  for (const relativePath of paths) {
    try {
      await access(path.join(ROOT, relativePath));
    } catch {
      errors.push(`Missing evidence file: ${relativePath}.`);
    }
  }

  return errors;
}

async function run() {
  const ids = parseRequirementIds(await readFile(IDS_PATH, "utf8"));
  const rows = buildTraceabilityRows(ids);
  const errors = [...validateRows(rows), ...(await validateEvidenceFiles(rows))];
  const output = renderMatrix(rows);

  if (errors.length > 0) {
    throw new Error(errors.join("\n"));
  }
  if (rows.some(({ status }) => status === "GAP")) {
    throw new Error("Requirement matrix contains GAP entries.");
  }

  if (process.argv.includes("--write")) {
    await writeFile(MATRIX_PATH, output, "utf8");
    return;
  }

  const current = await readFile(MATRIX_PATH, "utf8");
  if (current !== output) {
    throw new Error("Requirement matrix is stale. Run `npm run requirements:write`.");
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  run().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
