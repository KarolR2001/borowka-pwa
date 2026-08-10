# Macierz wymagan PRD do testow

## Metadane

- wersja RC: `1.0.0-rc.1`;
- liczba unikalnych identyfikatorow: `392`;
- SHA-256 zrodlowego PRD: `7c09ca7801d105082b408f0f40ff4c0bbe24a2bfb2c7d2bc2c10665e7cb57597`;
- decyzja zakresowa: `DEC-0021` wyklucza dane poprzednich sezonow;
- generator i kontrola kompletnosci: `scripts/requirement-traceability.mjs`.

Status `AUTOMATED` oznacza istniejacy dowod automatyczny, a nie wynik pelnego
przebiegu etapu 10. Status `PARTIAL` wymaga wskazanej dalszej walidacji.
`PENDING_MANUAL` i `DEFERRED_DEVICE` nie sa zaliczone. `EXCLUDED_SCOPE` wymaga
jawnej decyzji produktowej. `GAP` oznacza brak jakiegokolwiek przypisania i
blokuje RC.

## Podsumowanie

| Status | Liczba |
| --- | ---: |
| `AUTOMATED` | 314 |
| `PARTIAL` | 54 |
| `PENDING_MANUAL` | 17 |
| `DEFERRED_DEVICE` | 6 |
| `EXCLUDED_SCOPE` | 1 |

## Otwarte bramki

- testy manualne i czesciowe sa wykonywane w kolejnych pakietach 10.x;
- scenariusze fizycznych telefonow pozostaja odroczone zgodnie z decyzja
  wlasciciela produktu;
- wymaganie danych importowanych jest wykluczone wraz z migracja poprzednich
  sezonow;
- kazdy status `GAP` blokuje przejscie RC; generator obecnie wymaga zera
  nieprzypisanych identyfikatorow.

## Pelna macierz

| ID | Obszar | Status | Dowod lub zaplanowana walidacja |
| --- | --- | --- | --- |
| `ACC-AUTH-002` | Konta i uwierzytelnianie | `AUTOMATED` | `src/auth/invitedRegistration.test.ts`<br>`src/auth/authSession.test.ts`<br>`src/app/App.test.tsx`<br>`tests/rules/firestore-registration-invitations.test.ts` |
| `ACC-AUTH-003` | Konta i uwierzytelnianie | `AUTOMATED` | `src/auth/invitedRegistration.test.ts`<br>`src/auth/authSession.test.ts`<br>`src/app/App.test.tsx`<br>`tests/rules/firestore-registration-invitations.test.ts` |
| `ACC-AUTH-004` | Konta i uwierzytelnianie | `AUTOMATED` | `src/auth/invitedRegistration.test.ts`<br>`src/auth/authSession.test.ts`<br>`src/app/App.test.tsx`<br>`tests/rules/firestore-registration-invitations.test.ts` |
| `ACC-HS-001` | Sesje zbioru | `AUTOMATED` | `src/harvest/harvestSessionState.test.ts`<br>`src/harvest/openHarvestSession.test.ts`<br>`tests/integration/harvest-session-flow.test.ts`<br>`tests/rules/firestore-harvest.test.ts` |
| `ACC-HS-002` | Sesje zbioru | `AUTOMATED` | `src/harvest/harvestSessionState.test.ts`<br>`src/harvest/openHarvestSession.test.ts`<br>`tests/integration/harvest-session-flow.test.ts`<br>`tests/rules/firestore-harvest.test.ts` |
| `ACC-HS-003` | Sesje zbioru | `AUTOMATED` | `src/harvest/harvestSessionState.test.ts`<br>`src/harvest/openHarvestSession.test.ts`<br>`tests/integration/harvest-session-flow.test.ts`<br>`tests/rules/firestore-harvest.test.ts` |
| `ACC-HS-004` | Sesje zbioru | `AUTOMATED` | `src/harvest/harvestSessionState.test.ts`<br>`src/harvest/openHarvestSession.test.ts`<br>`tests/integration/harvest-session-flow.test.ts`<br>`tests/rules/firestore-harvest.test.ts` |
| `ACC-HS-005` | Sesje zbioru | `AUTOMATED` | `src/harvest/harvestSessionState.test.ts`<br>`src/harvest/openHarvestSession.test.ts`<br>`tests/integration/harvest-session-flow.test.ts`<br>`tests/rules/firestore-harvest.test.ts` |
| `ACC-OFF-001` | Offline i synchronizacja | `PARTIAL` | `src/offline/offlineScenarioReconciliation.test.ts`<br>`docs/testing/etap-6-offline-scenarios-report.md`<br>`MANUAL:physical-device-offline` |
| `ACC-OFF-002` | Offline i synchronizacja | `PARTIAL` | `src/offline/offlineScenarioReconciliation.test.ts`<br>`docs/testing/etap-6-offline-scenarios-report.md`<br>`MANUAL:physical-device-offline` |
| `ACC-OFF-003` | Offline i synchronizacja | `PARTIAL` | `src/offline/offlineScenarioReconciliation.test.ts`<br>`docs/testing/etap-6-offline-scenarios-report.md`<br>`MANUAL:physical-device-offline` |
| `ACC-OFF-004` | Offline i synchronizacja | `PARTIAL` | `src/offline/offlineScenarioReconciliation.test.ts`<br>`docs/testing/etap-6-offline-scenarios-report.md`<br>`MANUAL:physical-device-offline` |
| `ACC-OFF-005` | Offline i synchronizacja | `PARTIAL` | `src/offline/offlineScenarioReconciliation.test.ts`<br>`docs/testing/etap-6-offline-scenarios-report.md`<br>`MANUAL:physical-device-offline` |
| `ACC-OFF-006` | Offline i synchronizacja | `PARTIAL` | `src/offline/offlineScenarioReconciliation.test.ts`<br>`docs/testing/etap-6-offline-scenarios-report.md`<br>`MANUAL:physical-device-offline` |
| `ACC-PAY-001` | Wyplaty | `AUTOMATED` | `src/payments/paymentEligibility.test.ts`<br>`src/payments/paymentWrite.test.ts`<br>`src/payments/paymentCancellation.test.ts`<br>`tests/rules/firestore-payments.test.ts` |
| `ACC-PAY-002` | Wyplaty | `AUTOMATED` | `src/payments/paymentEligibility.test.ts`<br>`src/payments/paymentWrite.test.ts`<br>`src/payments/paymentCancellation.test.ts`<br>`tests/rules/firestore-payments.test.ts` |
| `ACC-PAY-003` | Wyplaty | `AUTOMATED` | `src/payments/paymentEligibility.test.ts`<br>`src/payments/paymentWrite.test.ts`<br>`src/payments/paymentCancellation.test.ts`<br>`tests/rules/firestore-payments.test.ts` |
| `ACC-PAY-004` | Wyplaty | `AUTOMATED` | `src/payments/paymentEligibility.test.ts`<br>`src/payments/paymentWrite.test.ts`<br>`src/payments/paymentCancellation.test.ts`<br>`tests/rules/firestore-payments.test.ts` |
| `ACC-RATE-001` | Stawki indywidualne | `AUTOMATED` | `src/workers/workerDirectory.test.ts`<br>`src/harvest/openHarvestSession.test.ts`<br>`src/offline/rateConflict.test.ts` |
| `ACC-RATE-002` | Stawki indywidualne | `AUTOMATED` | `src/workers/workerDirectory.test.ts`<br>`src/harvest/openHarvestSession.test.ts`<br>`src/offline/rateConflict.test.ts` |
| `ACC-RATE-003` | Stawki indywidualne | `AUTOMATED` | `src/workers/workerDirectory.test.ts`<br>`src/harvest/openHarvestSession.test.ts`<br>`src/offline/rateConflict.test.ts` |
| `ACC-RATE-004` | Stawki indywidualne | `AUTOMATED` | `src/workers/workerDirectory.test.ts`<br>`src/harvest/openHarvestSession.test.ts`<br>`src/offline/rateConflict.test.ts` |
| `ACC-REPORT-001` | Raporty | `PARTIAL` | `src/reports/reportCatalog.test.ts`<br>`docs/domain/mvp-report-catalog.md`<br>`PLAN:10.3-full-unit-suite`<br>`PLAN:10.13-UAT` |
| `ACC-REPORT-002` | Raporty | `PARTIAL` | `src/reports/reportCatalog.test.ts`<br>`docs/domain/mvp-report-catalog.md`<br>`PLAN:10.3-full-unit-suite`<br>`PLAN:10.13-UAT` |
| `ACC-REPORT-003` | Raporty | `PARTIAL` | `src/reports/reportCatalog.test.ts`<br>`docs/domain/mvp-report-catalog.md`<br>`PLAN:10.3-full-unit-suite`<br>`PLAN:10.13-UAT` |
| `ACC-REPORT-004` | Raporty | `PARTIAL` | `src/reports/reportCatalog.test.ts`<br>`docs/domain/mvp-report-catalog.md`<br>`PLAN:10.3-full-unit-suite`<br>`PLAN:10.13-UAT` |
| `ACC-SALE-001` | Sprzedaz | `AUTOMATED` | `src/sales/ordinarySalePreparation.test.ts`<br>`src/sales/saleCorrectionWrite.test.ts`<br>`src/sales/saleCancellation.test.ts`<br>`tests/rules/firestore-sales.test.ts` |
| `ACC-SALE-002` | Sprzedaz | `AUTOMATED` | `src/sales/ordinarySalePreparation.test.ts`<br>`src/sales/saleCorrectionWrite.test.ts`<br>`src/sales/saleCancellation.test.ts`<br>`tests/rules/firestore-sales.test.ts` |
| `ACC-SALE-003` | Sprzedaz | `AUTOMATED` | `src/sales/ordinarySalePreparation.test.ts`<br>`src/sales/saleCorrectionWrite.test.ts`<br>`src/sales/saleCancellation.test.ts`<br>`tests/rules/firestore-sales.test.ts` |
| `ACC-SALE-004` | Sprzedaz | `AUTOMATED` | `src/sales/ordinarySalePreparation.test.ts`<br>`src/sales/saleCorrectionWrite.test.ts`<br>`src/sales/saleCancellation.test.ts`<br>`tests/rules/firestore-sales.test.ts` |
| `BR-CALC-001` | Obliczenia sesji | `AUTOMATED` | `src/harvest/harvestSessionCalculation.test.ts`<br>`docs/domain/calculation-scenarios.md` |
| `BR-CALC-002` | Obliczenia sesji | `AUTOMATED` | `src/harvest/harvestSessionCalculation.test.ts`<br>`docs/domain/calculation-scenarios.md` |
| `BR-CALC-003` | Obliczenia sesji | `AUTOMATED` | `src/harvest/harvestSessionCalculation.test.ts`<br>`docs/domain/calculation-scenarios.md` |
| `BR-CALC-010` | Obliczenia sesji | `AUTOMATED` | `src/harvest/harvestSessionCalculation.test.ts`<br>`docs/domain/calculation-scenarios.md` |
| `BR-CALC-011` | Obliczenia sesji | `AUTOMATED` | `src/harvest/harvestSessionCalculation.test.ts`<br>`docs/domain/calculation-scenarios.md` |
| `BR-CALC-012` | Obliczenia sesji | `AUTOMATED` | `src/harvest/harvestSessionCalculation.test.ts`<br>`docs/domain/calculation-scenarios.md` |
| `BR-CALC-020` | Dane historyczne | `EXCLUDED_SCOPE` | `docs/release/release-candidate-scope.md`<br>`DECISION:DEC-0021` |
| `BR-DATA-01` | Model danych | `AUTOMATED` | `src/domain/domainConfiguration.test.ts`<br>`src/domain/identity.test.ts`<br>`src/audit/auditEvents.test.ts`<br>`tests/rules/firestore-deny-default.test.ts` |
| `BR-DATA-02` | Model danych | `AUTOMATED` | `src/domain/domainConfiguration.test.ts`<br>`src/domain/identity.test.ts`<br>`src/audit/auditEvents.test.ts`<br>`tests/rules/firestore-deny-default.test.ts` |
| `BR-DATA-03` | Model danych | `AUTOMATED` | `src/domain/domainConfiguration.test.ts`<br>`src/domain/identity.test.ts`<br>`src/audit/auditEvents.test.ts`<br>`tests/rules/firestore-deny-default.test.ts` |
| `BR-DATA-04` | Model danych | `AUTOMATED` | `src/domain/domainConfiguration.test.ts`<br>`src/domain/identity.test.ts`<br>`src/audit/auditEvents.test.ts`<br>`tests/rules/firestore-deny-default.test.ts` |
| `BR-DATA-05` | Model danych | `AUTOMATED` | `src/domain/domainConfiguration.test.ts`<br>`src/domain/identity.test.ts`<br>`src/audit/auditEvents.test.ts`<br>`tests/rules/firestore-deny-default.test.ts` |
| `BR-DATA-06` | Model danych | `AUTOMATED` | `src/domain/domainConfiguration.test.ts`<br>`src/domain/identity.test.ts`<br>`src/audit/auditEvents.test.ts`<br>`tests/rules/firestore-deny-default.test.ts` |
| `BR-HE-001` | Wpisy zbioru | `AUTOMATED` | `src/harvest/harvestEntryValidation.test.ts`<br>`src/harvest/harvestEntryCorrection.test.ts`<br>`src/harvest/harvestEntryIdempotency.test.ts`<br>`tests/integration/harvest-session-flow.test.ts` |
| `BR-HE-002` | Wpisy zbioru | `AUTOMATED` | `src/harvest/harvestEntryValidation.test.ts`<br>`src/harvest/harvestEntryCorrection.test.ts`<br>`src/harvest/harvestEntryIdempotency.test.ts`<br>`tests/integration/harvest-session-flow.test.ts` |
| `BR-HE-003` | Wpisy zbioru | `AUTOMATED` | `src/harvest/harvestEntryValidation.test.ts`<br>`src/harvest/harvestEntryCorrection.test.ts`<br>`src/harvest/harvestEntryIdempotency.test.ts`<br>`tests/integration/harvest-session-flow.test.ts` |
| `BR-HE-004` | Wpisy zbioru | `AUTOMATED` | `src/harvest/harvestEntryValidation.test.ts`<br>`src/harvest/harvestEntryCorrection.test.ts`<br>`src/harvest/harvestEntryIdempotency.test.ts`<br>`tests/integration/harvest-session-flow.test.ts` |
| `BR-HE-005` | Wpisy zbioru | `AUTOMATED` | `src/harvest/harvestEntryValidation.test.ts`<br>`src/harvest/harvestEntryCorrection.test.ts`<br>`src/harvest/harvestEntryIdempotency.test.ts`<br>`tests/integration/harvest-session-flow.test.ts` |
| `BR-HE-006` | Wpisy zbioru | `AUTOMATED` | `src/harvest/harvestEntryValidation.test.ts`<br>`src/harvest/harvestEntryCorrection.test.ts`<br>`src/harvest/harvestEntryIdempotency.test.ts`<br>`tests/integration/harvest-session-flow.test.ts` |
| `BR-HE-007` | Wpisy zbioru | `AUTOMATED` | `src/harvest/harvestEntryValidation.test.ts`<br>`src/harvest/harvestEntryCorrection.test.ts`<br>`src/harvest/harvestEntryIdempotency.test.ts`<br>`tests/integration/harvest-session-flow.test.ts` |
| `BR-HE-008` | Wpisy zbioru | `AUTOMATED` | `src/harvest/harvestEntryValidation.test.ts`<br>`src/harvest/harvestEntryCorrection.test.ts`<br>`src/harvest/harvestEntryIdempotency.test.ts`<br>`tests/integration/harvest-session-flow.test.ts` |
| `BR-HS-001` | Sesje zbioru | `AUTOMATED` | `src/harvest/harvestSessionState.test.ts`<br>`src/harvest/openHarvestSession.test.ts`<br>`tests/integration/harvest-session-flow.test.ts`<br>`tests/rules/firestore-harvest.test.ts` |
| `BR-HS-002` | Sesje zbioru | `AUTOMATED` | `src/harvest/harvestSessionState.test.ts`<br>`src/harvest/openHarvestSession.test.ts`<br>`tests/integration/harvest-session-flow.test.ts`<br>`tests/rules/firestore-harvest.test.ts` |
| `BR-HS-003` | Sesje zbioru | `AUTOMATED` | `src/harvest/harvestSessionState.test.ts`<br>`src/harvest/openHarvestSession.test.ts`<br>`tests/integration/harvest-session-flow.test.ts`<br>`tests/rules/firestore-harvest.test.ts` |
| `BR-HS-004` | Sesje zbioru | `AUTOMATED` | `src/harvest/harvestSessionState.test.ts`<br>`src/harvest/openHarvestSession.test.ts`<br>`tests/integration/harvest-session-flow.test.ts`<br>`tests/rules/firestore-harvest.test.ts` |
| `BR-HS-005` | Sesje zbioru | `AUTOMATED` | `src/harvest/harvestSessionState.test.ts`<br>`src/harvest/openHarvestSession.test.ts`<br>`tests/integration/harvest-session-flow.test.ts`<br>`tests/rules/firestore-harvest.test.ts` |
| `BR-HS-006` | Sesje zbioru | `AUTOMATED` | `src/harvest/harvestSessionState.test.ts`<br>`src/harvest/openHarvestSession.test.ts`<br>`tests/integration/harvest-session-flow.test.ts`<br>`tests/rules/firestore-harvest.test.ts` |
| `BR-HS-007` | Sesje zbioru | `AUTOMATED` | `src/harvest/harvestSessionState.test.ts`<br>`src/harvest/openHarvestSession.test.ts`<br>`tests/integration/harvest-session-flow.test.ts`<br>`tests/rules/firestore-harvest.test.ts` |
| `BR-HS-008` | Sesje zbioru | `AUTOMATED` | `src/harvest/harvestSessionState.test.ts`<br>`src/harvest/openHarvestSession.test.ts`<br>`tests/integration/harvest-session-flow.test.ts`<br>`tests/rules/firestore-harvest.test.ts` |
| `BR-HS-009` | Sesje zbioru | `AUTOMATED` | `src/harvest/harvestSessionState.test.ts`<br>`src/harvest/openHarvestSession.test.ts`<br>`tests/integration/harvest-session-flow.test.ts`<br>`tests/rules/firestore-harvest.test.ts` |
| `BR-HS-010` | Sesje zbioru | `AUTOMATED` | `src/harvest/harvestSessionState.test.ts`<br>`src/harvest/openHarvestSession.test.ts`<br>`tests/integration/harvest-session-flow.test.ts`<br>`tests/rules/firestore-harvest.test.ts` |
| `BR-P-001` | Plany rozliczen | `AUTOMATED` | `src/plans/settlementPlans.test.ts`<br>`src/domain/domainConfiguration.test.ts`<br>`tests/rules/firestore-settlement-plans.test.ts` |
| `BR-P-002` | Plany rozliczen | `AUTOMATED` | `src/plans/settlementPlans.test.ts`<br>`src/domain/domainConfiguration.test.ts`<br>`tests/rules/firestore-settlement-plans.test.ts` |
| `BR-P-003` | Plany rozliczen | `AUTOMATED` | `src/plans/settlementPlans.test.ts`<br>`src/domain/domainConfiguration.test.ts`<br>`tests/rules/firestore-settlement-plans.test.ts` |
| `BR-P-004` | Plany rozliczen | `AUTOMATED` | `src/plans/settlementPlans.test.ts`<br>`src/domain/domainConfiguration.test.ts`<br>`tests/rules/firestore-settlement-plans.test.ts` |
| `BR-P-005` | Plany rozliczen | `AUTOMATED` | `src/plans/settlementPlans.test.ts`<br>`src/domain/domainConfiguration.test.ts`<br>`tests/rules/firestore-settlement-plans.test.ts` |
| `BR-P-006` | Plany rozliczen | `AUTOMATED` | `src/plans/settlementPlans.test.ts`<br>`src/domain/domainConfiguration.test.ts`<br>`tests/rules/firestore-settlement-plans.test.ts` |
| `BR-PAY-001` | Wyplaty | `AUTOMATED` | `src/payments/paymentEligibility.test.ts`<br>`src/payments/paymentWrite.test.ts`<br>`src/payments/paymentCancellation.test.ts`<br>`tests/rules/firestore-payments.test.ts` |
| `BR-PAY-002` | Wyplaty | `AUTOMATED` | `src/payments/paymentEligibility.test.ts`<br>`src/payments/paymentWrite.test.ts`<br>`src/payments/paymentCancellation.test.ts`<br>`tests/rules/firestore-payments.test.ts` |
| `BR-PAY-003` | Wyplaty | `AUTOMATED` | `src/payments/paymentEligibility.test.ts`<br>`src/payments/paymentWrite.test.ts`<br>`src/payments/paymentCancellation.test.ts`<br>`tests/rules/firestore-payments.test.ts` |
| `BR-PAY-004` | Wyplaty | `AUTOMATED` | `src/payments/paymentEligibility.test.ts`<br>`src/payments/paymentWrite.test.ts`<br>`src/payments/paymentCancellation.test.ts`<br>`tests/rules/firestore-payments.test.ts` |
| `BR-PAY-005` | Wyplaty | `AUTOMATED` | `src/payments/paymentEligibility.test.ts`<br>`src/payments/paymentWrite.test.ts`<br>`src/payments/paymentCancellation.test.ts`<br>`tests/rules/firestore-payments.test.ts` |
| `BR-PAY-006` | Wyplaty | `AUTOMATED` | `src/payments/paymentEligibility.test.ts`<br>`src/payments/paymentWrite.test.ts`<br>`src/payments/paymentCancellation.test.ts`<br>`tests/rules/firestore-payments.test.ts` |
| `BR-PAY-007` | Wyplaty | `AUTOMATED` | `src/payments/paymentEligibility.test.ts`<br>`src/payments/paymentWrite.test.ts`<br>`src/payments/paymentCancellation.test.ts`<br>`tests/rules/firestore-payments.test.ts` |
| `BR-PAY-030` | Wyplaty | `AUTOMATED` | `src/payments/paymentEligibility.test.ts`<br>`src/payments/paymentWrite.test.ts`<br>`src/payments/paymentCancellation.test.ts`<br>`tests/rules/firestore-payments.test.ts` |
| `BR-PAY-031` | Wyplaty | `AUTOMATED` | `src/payments/paymentEligibility.test.ts`<br>`src/payments/paymentWrite.test.ts`<br>`src/payments/paymentCancellation.test.ts`<br>`tests/rules/firestore-payments.test.ts` |
| `BR-R-001` | Stawki indywidualne | `AUTOMATED` | `src/workers/workerDirectory.test.ts`<br>`src/harvest/openHarvestSession.test.ts`<br>`src/offline/rateConflict.test.ts` |
| `BR-R-002` | Stawki indywidualne | `AUTOMATED` | `src/workers/workerDirectory.test.ts`<br>`src/harvest/openHarvestSession.test.ts`<br>`src/offline/rateConflict.test.ts` |
| `BR-R-003` | Stawki indywidualne | `AUTOMATED` | `src/workers/workerDirectory.test.ts`<br>`src/harvest/openHarvestSession.test.ts`<br>`src/offline/rateConflict.test.ts` |
| `BR-R-004` | Stawki indywidualne | `AUTOMATED` | `src/workers/workerDirectory.test.ts`<br>`src/harvest/openHarvestSession.test.ts`<br>`src/offline/rateConflict.test.ts` |
| `BR-R-005` | Stawki indywidualne | `AUTOMATED` | `src/workers/workerDirectory.test.ts`<br>`src/harvest/openHarvestSession.test.ts`<br>`src/offline/rateConflict.test.ts` |
| `BR-R-006` | Stawki indywidualne | `AUTOMATED` | `src/workers/workerDirectory.test.ts`<br>`src/harvest/openHarvestSession.test.ts`<br>`src/offline/rateConflict.test.ts` |
| `BR-R-007` | Stawki indywidualne | `AUTOMATED` | `src/workers/workerDirectory.test.ts`<br>`src/harvest/openHarvestSession.test.ts`<br>`src/offline/rateConflict.test.ts` |
| `BR-RATE-020` | Stawki indywidualne | `AUTOMATED` | `src/workers/workerDirectory.test.ts`<br>`src/harvest/openHarvestSession.test.ts`<br>`src/offline/rateConflict.test.ts` |
| `BR-RATE-021` | Stawki indywidualne | `AUTOMATED` | `src/workers/workerDirectory.test.ts`<br>`src/harvest/openHarvestSession.test.ts`<br>`src/offline/rateConflict.test.ts` |
| `BR-RATE-022` | Stawki indywidualne | `AUTOMATED` | `src/workers/workerDirectory.test.ts`<br>`src/harvest/openHarvestSession.test.ts`<br>`src/offline/rateConflict.test.ts` |
| `BR-RATE-023` | Stawki indywidualne | `AUTOMATED` | `src/workers/workerDirectory.test.ts`<br>`src/harvest/openHarvestSession.test.ts`<br>`src/offline/rateConflict.test.ts` |
| `BR-ROLE-01` | Role i uprawnienia | `AUTOMATED` | `src/app/App.test.tsx`<br>`tests/rules/firestore-user-profiles.test.ts`<br>`tests/rules/firestore-export-permissions.test.ts` |
| `BR-ROLE-02` | Role i uprawnienia | `AUTOMATED` | `src/app/App.test.tsx`<br>`tests/rules/firestore-user-profiles.test.ts`<br>`tests/rules/firestore-export-permissions.test.ts` |
| `BR-ROLE-03` | Role i uprawnienia | `AUTOMATED` | `src/app/App.test.tsx`<br>`tests/rules/firestore-user-profiles.test.ts`<br>`tests/rules/firestore-export-permissions.test.ts` |
| `BR-ROLE-04` | Role i uprawnienia | `AUTOMATED` | `src/app/App.test.tsx`<br>`tests/rules/firestore-user-profiles.test.ts`<br>`tests/rules/firestore-export-permissions.test.ts` |
| `BR-ROLE-05` | Role i uprawnienia | `AUTOMATED` | `src/app/App.test.tsx`<br>`tests/rules/firestore-user-profiles.test.ts`<br>`tests/rules/firestore-export-permissions.test.ts` |
| `BR-ROLE-06` | Role i uprawnienia | `AUTOMATED` | `src/app/App.test.tsx`<br>`tests/rules/firestore-user-profiles.test.ts`<br>`tests/rules/firestore-export-permissions.test.ts` |
| `BR-ROLE-07` | Role i uprawnienia | `AUTOMATED` | `src/app/App.test.tsx`<br>`tests/rules/firestore-user-profiles.test.ts`<br>`tests/rules/firestore-export-permissions.test.ts` |
| `BR-S-001` | Sprzedaz | `AUTOMATED` | `src/sales/ordinarySalePreparation.test.ts`<br>`src/sales/saleCorrectionWrite.test.ts`<br>`src/sales/saleCancellation.test.ts`<br>`tests/rules/firestore-sales.test.ts` |
| `BR-S-002` | Sprzedaz | `AUTOMATED` | `src/sales/ordinarySalePreparation.test.ts`<br>`src/sales/saleCorrectionWrite.test.ts`<br>`src/sales/saleCancellation.test.ts`<br>`tests/rules/firestore-sales.test.ts` |
| `BR-S-003` | Sprzedaz | `AUTOMATED` | `src/sales/ordinarySalePreparation.test.ts`<br>`src/sales/saleCorrectionWrite.test.ts`<br>`src/sales/saleCancellation.test.ts`<br>`tests/rules/firestore-sales.test.ts` |
| `BR-S-004` | Sprzedaz | `AUTOMATED` | `src/sales/ordinarySalePreparation.test.ts`<br>`src/sales/saleCorrectionWrite.test.ts`<br>`src/sales/saleCancellation.test.ts`<br>`tests/rules/firestore-sales.test.ts` |
| `BR-S-005` | Sprzedaz | `AUTOMATED` | `src/sales/ordinarySalePreparation.test.ts`<br>`src/sales/saleCorrectionWrite.test.ts`<br>`src/sales/saleCancellation.test.ts`<br>`tests/rules/firestore-sales.test.ts` |
| `BR-S-006` | Sprzedaz | `AUTOMATED` | `src/sales/ordinarySalePreparation.test.ts`<br>`src/sales/saleCorrectionWrite.test.ts`<br>`src/sales/saleCancellation.test.ts`<br>`tests/rules/firestore-sales.test.ts` |
| `BR-S-007` | Sprzedaz | `AUTOMATED` | `src/sales/ordinarySalePreparation.test.ts`<br>`src/sales/saleCorrectionWrite.test.ts`<br>`src/sales/saleCancellation.test.ts`<br>`tests/rules/firestore-sales.test.ts` |
| `BR-STOCK-001` | Stan i sumy | `AUTOMATED` | `src/stock/stockCorrectnessVerification.test.ts`<br>`src/stock/stockReconciliation.test.ts`<br>`src/dashboard/adminDashboard.test.ts` |
| `BR-STOCK-002` | Stan i sumy | `AUTOMATED` | `src/stock/stockCorrectnessVerification.test.ts`<br>`src/stock/stockReconciliation.test.ts`<br>`src/dashboard/adminDashboard.test.ts` |
| `BR-STOCK-003` | Stan i sumy | `AUTOMATED` | `src/stock/stockCorrectnessVerification.test.ts`<br>`src/stock/stockReconciliation.test.ts`<br>`src/dashboard/adminDashboard.test.ts` |
| `BR-STOCK-004` | Stan i sumy | `AUTOMATED` | `src/stock/stockCorrectnessVerification.test.ts`<br>`src/stock/stockReconciliation.test.ts`<br>`src/dashboard/adminDashboard.test.ts` |
| `BR-STOCK-005` | Stan i sumy | `AUTOMATED` | `src/stock/stockCorrectnessVerification.test.ts`<br>`src/stock/stockReconciliation.test.ts`<br>`src/dashboard/adminDashboard.test.ts` |
| `BR-STOCK-006` | Stan i sumy | `AUTOMATED` | `src/stock/stockCorrectnessVerification.test.ts`<br>`src/stock/stockReconciliation.test.ts`<br>`src/dashboard/adminDashboard.test.ts` |
| `BR-STOCK-007` | Stan i sumy | `AUTOMATED` | `src/stock/stockCorrectnessVerification.test.ts`<br>`src/stock/stockReconciliation.test.ts`<br>`src/dashboard/adminDashboard.test.ts` |
| `BR-SUM-001` | Stan i sumy | `AUTOMATED` | `src/stock/stockCorrectnessVerification.test.ts`<br>`src/stock/stockReconciliation.test.ts`<br>`src/dashboard/adminDashboard.test.ts` |
| `BR-SUM-002` | Stan i sumy | `AUTOMATED` | `src/stock/stockCorrectnessVerification.test.ts`<br>`src/stock/stockReconciliation.test.ts`<br>`src/dashboard/adminDashboard.test.ts` |
| `BR-SUM-003` | Stan i sumy | `AUTOMATED` | `src/stock/stockCorrectnessVerification.test.ts`<br>`src/stock/stockReconciliation.test.ts`<br>`src/dashboard/adminDashboard.test.ts` |
| `BR-SUM-004` | Stan i sumy | `AUTOMATED` | `src/stock/stockCorrectnessVerification.test.ts`<br>`src/stock/stockReconciliation.test.ts`<br>`src/dashboard/adminDashboard.test.ts` |
| `BR-SUM-005` | Stan i sumy | `AUTOMATED` | `src/stock/stockCorrectnessVerification.test.ts`<br>`src/stock/stockReconciliation.test.ts`<br>`src/dashboard/adminDashboard.test.ts` |
| `BR-SUM-006` | Stan i sumy | `AUTOMATED` | `src/stock/stockCorrectnessVerification.test.ts`<br>`src/stock/stockReconciliation.test.ts`<br>`src/dashboard/adminDashboard.test.ts` |
| `BR-SUM-007` | Stan i sumy | `AUTOMATED` | `src/stock/stockCorrectnessVerification.test.ts`<br>`src/stock/stockReconciliation.test.ts`<br>`src/dashboard/adminDashboard.test.ts` |
| `BR-SUM-008` | Stan i sumy | `AUTOMATED` | `src/stock/stockCorrectnessVerification.test.ts`<br>`src/stock/stockReconciliation.test.ts`<br>`src/dashboard/adminDashboard.test.ts` |
| `BR-U-001` | Uzytkownicy i urzadzenia | `AUTOMATED` | `src/users/userDirectory.test.ts`<br>`src/users/userProfileUpdates.test.ts`<br>`src/devices/deviceDirectory.test.ts`<br>`tests/rules/firestore-user-profiles.test.ts` |
| `BR-U-002` | Uzytkownicy i urzadzenia | `AUTOMATED` | `src/users/userDirectory.test.ts`<br>`src/users/userProfileUpdates.test.ts`<br>`src/devices/deviceDirectory.test.ts`<br>`tests/rules/firestore-user-profiles.test.ts` |
| `BR-U-004` | Uzytkownicy i urzadzenia | `AUTOMATED` | `src/users/userDirectory.test.ts`<br>`src/users/userProfileUpdates.test.ts`<br>`src/devices/deviceDirectory.test.ts`<br>`tests/rules/firestore-user-profiles.test.ts` |
| `BR-U-005` | Uzytkownicy i urzadzenia | `AUTOMATED` | `src/users/userDirectory.test.ts`<br>`src/users/userProfileUpdates.test.ts`<br>`src/devices/deviceDirectory.test.ts`<br>`tests/rules/firestore-user-profiles.test.ts` |
| `BR-U-006` | Uzytkownicy i urzadzenia | `AUTOMATED` | `src/users/userDirectory.test.ts`<br>`src/users/userProfileUpdates.test.ts`<br>`src/devices/deviceDirectory.test.ts`<br>`tests/rules/firestore-user-profiles.test.ts` |
| `BR-U-007` | Uzytkownicy i urzadzenia | `AUTOMATED` | `src/users/userDirectory.test.ts`<br>`src/users/userProfileUpdates.test.ts`<br>`src/devices/deviceDirectory.test.ts`<br>`tests/rules/firestore-user-profiles.test.ts` |
| `BR-U-008` | Uzytkownicy i urzadzenia | `AUTOMATED` | `src/users/userDirectory.test.ts`<br>`src/users/userProfileUpdates.test.ts`<br>`src/devices/deviceDirectory.test.ts`<br>`tests/rules/firestore-user-profiles.test.ts` |
| `FR-AUTH-001` | Konta i uwierzytelnianie | `AUTOMATED` | `src/auth/invitedRegistration.test.ts`<br>`src/auth/authSession.test.ts`<br>`src/app/App.test.tsx`<br>`tests/rules/firestore-registration-invitations.test.ts` |
| `FR-AUTH-002` | Konta i uwierzytelnianie | `AUTOMATED` | `src/auth/invitedRegistration.test.ts`<br>`src/auth/authSession.test.ts`<br>`src/app/App.test.tsx`<br>`tests/rules/firestore-registration-invitations.test.ts` |
| `FR-AUTH-010` | Konta i uwierzytelnianie | `AUTOMATED` | `src/auth/invitedRegistration.test.ts`<br>`src/auth/authSession.test.ts`<br>`src/app/App.test.tsx`<br>`tests/rules/firestore-registration-invitations.test.ts` |
| `FR-AUTH-011` | Konta i uwierzytelnianie | `AUTOMATED` | `src/auth/invitedRegistration.test.ts`<br>`src/auth/authSession.test.ts`<br>`src/app/App.test.tsx`<br>`tests/rules/firestore-registration-invitations.test.ts` |
| `FR-AUTH-020` | Konta i uwierzytelnianie | `AUTOMATED` | `src/auth/invitedRegistration.test.ts`<br>`src/auth/authSession.test.ts`<br>`src/app/App.test.tsx`<br>`tests/rules/firestore-registration-invitations.test.ts` |
| `FR-AUTH-021` | Konta i uwierzytelnianie | `AUTOMATED` | `src/auth/invitedRegistration.test.ts`<br>`src/auth/authSession.test.ts`<br>`src/app/App.test.tsx`<br>`tests/rules/firestore-registration-invitations.test.ts` |
| `FR-AUTH-022` | Konta i uwierzytelnianie | `AUTOMATED` | `src/auth/invitedRegistration.test.ts`<br>`src/auth/authSession.test.ts`<br>`src/app/App.test.tsx`<br>`tests/rules/firestore-registration-invitations.test.ts` |
| `FR-AUTH-023` | Konta i uwierzytelnianie | `AUTOMATED` | `src/auth/invitedRegistration.test.ts`<br>`src/auth/authSession.test.ts`<br>`src/app/App.test.tsx`<br>`tests/rules/firestore-registration-invitations.test.ts` |
| `FR-AUTH-024` | Konta i uwierzytelnianie | `AUTOMATED` | `src/auth/invitedRegistration.test.ts`<br>`src/auth/authSession.test.ts`<br>`src/app/App.test.tsx`<br>`tests/rules/firestore-registration-invitations.test.ts` |
| `FR-AUTH-030` | Konta i uwierzytelnianie | `AUTOMATED` | `src/auth/invitedRegistration.test.ts`<br>`src/auth/authSession.test.ts`<br>`src/app/App.test.tsx`<br>`tests/rules/firestore-registration-invitations.test.ts` |
| `FR-AUTH-031` | Konta i uwierzytelnianie | `AUTOMATED` | `src/auth/invitedRegistration.test.ts`<br>`src/auth/authSession.test.ts`<br>`src/app/App.test.tsx`<br>`tests/rules/firestore-registration-invitations.test.ts` |
| `FR-AUTH-032` | Konta i uwierzytelnianie | `AUTOMATED` | `src/auth/invitedRegistration.test.ts`<br>`src/auth/authSession.test.ts`<br>`src/app/App.test.tsx`<br>`tests/rules/firestore-registration-invitations.test.ts` |
| `FR-AUTH-040` | Konta i uwierzytelnianie | `AUTOMATED` | `src/auth/invitedRegistration.test.ts`<br>`src/auth/authSession.test.ts`<br>`src/app/App.test.tsx`<br>`tests/rules/firestore-registration-invitations.test.ts` |
| `FR-AUTH-041` | Konta i uwierzytelnianie | `AUTOMATED` | `src/auth/invitedRegistration.test.ts`<br>`src/auth/authSession.test.ts`<br>`src/app/App.test.tsx`<br>`tests/rules/firestore-registration-invitations.test.ts` |
| `FR-AUTH-042` | Konta i uwierzytelnianie | `AUTOMATED` | `src/auth/invitedRegistration.test.ts`<br>`src/auth/authSession.test.ts`<br>`src/app/App.test.tsx`<br>`tests/rules/firestore-registration-invitations.test.ts` |
| `FR-AUTH-043` | Konta i uwierzytelnianie | `AUTOMATED` | `src/auth/invitedRegistration.test.ts`<br>`src/auth/authSession.test.ts`<br>`src/app/App.test.tsx`<br>`tests/rules/firestore-registration-invitations.test.ts` |
| `FR-DASH-ADMIN-001` | Pulpity | `AUTOMATED` | `src/dashboard/AdminDashboardPanel.test.tsx`<br>`src/dashboard/OperatorDashboardPanel.test.tsx`<br>`src/picker/PickerDashboardPanel.test.tsx`<br>`tests/rules/firestore-picker-dashboard.test.ts` |
| `FR-DASH-ADMIN-002` | Pulpity | `AUTOMATED` | `src/dashboard/AdminDashboardPanel.test.tsx`<br>`src/dashboard/OperatorDashboardPanel.test.tsx`<br>`src/picker/PickerDashboardPanel.test.tsx`<br>`tests/rules/firestore-picker-dashboard.test.ts` |
| `FR-DASH-ADMIN-003` | Pulpity | `AUTOMATED` | `src/dashboard/AdminDashboardPanel.test.tsx`<br>`src/dashboard/OperatorDashboardPanel.test.tsx`<br>`src/picker/PickerDashboardPanel.test.tsx`<br>`tests/rules/firestore-picker-dashboard.test.ts` |
| `FR-DASH-ADMIN-004` | Pulpity | `AUTOMATED` | `src/dashboard/AdminDashboardPanel.test.tsx`<br>`src/dashboard/OperatorDashboardPanel.test.tsx`<br>`src/picker/PickerDashboardPanel.test.tsx`<br>`tests/rules/firestore-picker-dashboard.test.ts` |
| `FR-DASH-OP-001` | Pulpity | `AUTOMATED` | `src/dashboard/AdminDashboardPanel.test.tsx`<br>`src/dashboard/OperatorDashboardPanel.test.tsx`<br>`src/picker/PickerDashboardPanel.test.tsx`<br>`tests/rules/firestore-picker-dashboard.test.ts` |
| `FR-DASH-OP-002` | Pulpity | `AUTOMATED` | `src/dashboard/AdminDashboardPanel.test.tsx`<br>`src/dashboard/OperatorDashboardPanel.test.tsx`<br>`src/picker/PickerDashboardPanel.test.tsx`<br>`tests/rules/firestore-picker-dashboard.test.ts` |
| `FR-DASH-PICKER-001` | Pulpity | `AUTOMATED` | `src/dashboard/AdminDashboardPanel.test.tsx`<br>`src/dashboard/OperatorDashboardPanel.test.tsx`<br>`src/picker/PickerDashboardPanel.test.tsx`<br>`tests/rules/firestore-picker-dashboard.test.ts` |
| `FR-DASH-PICKER-002` | Pulpity | `AUTOMATED` | `src/dashboard/AdminDashboardPanel.test.tsx`<br>`src/dashboard/OperatorDashboardPanel.test.tsx`<br>`src/picker/PickerDashboardPanel.test.tsx`<br>`tests/rules/firestore-picker-dashboard.test.ts` |
| `FR-DASH-PICKER-003` | Pulpity | `AUTOMATED` | `src/dashboard/AdminDashboardPanel.test.tsx`<br>`src/dashboard/OperatorDashboardPanel.test.tsx`<br>`src/picker/PickerDashboardPanel.test.tsx`<br>`tests/rules/firestore-picker-dashboard.test.ts` |
| `FR-DASH-PICKER-004` | Pulpity | `AUTOMATED` | `src/dashboard/AdminDashboardPanel.test.tsx`<br>`src/dashboard/OperatorDashboardPanel.test.tsx`<br>`src/picker/PickerDashboardPanel.test.tsx`<br>`tests/rules/firestore-picker-dashboard.test.ts` |
| `FR-EXPORT-001` | Eksport | `AUTOMATED` | `src/reports/polishExcelCsv.test.ts`<br>`src/reports/fullCloudExport.test.ts`<br>`tests/integration/full-cloud-export.test.ts`<br>`tests/scripts/full-cloud-export-portability.test.mjs` |
| `FR-EXPORT-002` | Eksport | `PARTIAL` | `src/reports/polishExcelCsv.test.ts`<br>`tests/scripts/full-cloud-export-portability.test.mjs`<br>`MANUAL:Excel-and-alternative-sheet`<br>`MANUAL:realistic-DEV-export-two-copies` |
| `FR-EXPORT-003` | Eksport | `AUTOMATED` | `src/reports/polishExcelCsv.test.ts`<br>`src/reports/fullCloudExport.test.ts`<br>`tests/integration/full-cloud-export.test.ts`<br>`tests/scripts/full-cloud-export-portability.test.mjs` |
| `FR-EXPORT-010` | Eksport | `PARTIAL` | `src/reports/polishExcelCsv.test.ts`<br>`tests/scripts/full-cloud-export-portability.test.mjs`<br>`MANUAL:Excel-and-alternative-sheet`<br>`MANUAL:realistic-DEV-export-two-copies` |
| `FR-EXPORT-011` | Eksport | `PARTIAL` | `src/reports/polishExcelCsv.test.ts`<br>`tests/scripts/full-cloud-export-portability.test.mjs`<br>`MANUAL:Excel-and-alternative-sheet`<br>`MANUAL:realistic-DEV-export-two-copies` |
| `FR-HE-001` | Wpisy zbioru | `AUTOMATED` | `src/harvest/harvestEntryValidation.test.ts`<br>`src/harvest/harvestEntryCorrection.test.ts`<br>`src/harvest/harvestEntryIdempotency.test.ts`<br>`tests/integration/harvest-session-flow.test.ts` |
| `FR-HE-002` | Wpisy zbioru | `AUTOMATED` | `src/harvest/harvestEntryValidation.test.ts`<br>`src/harvest/harvestEntryCorrection.test.ts`<br>`src/harvest/harvestEntryIdempotency.test.ts`<br>`tests/integration/harvest-session-flow.test.ts` |
| `FR-HE-003` | Wpisy zbioru | `AUTOMATED` | `src/harvest/harvestEntryValidation.test.ts`<br>`src/harvest/harvestEntryCorrection.test.ts`<br>`src/harvest/harvestEntryIdempotency.test.ts`<br>`tests/integration/harvest-session-flow.test.ts` |
| `FR-HE-004` | Wpisy zbioru | `AUTOMATED` | `src/harvest/harvestEntryValidation.test.ts`<br>`src/harvest/harvestEntryCorrection.test.ts`<br>`src/harvest/harvestEntryIdempotency.test.ts`<br>`tests/integration/harvest-session-flow.test.ts` |
| `FR-HE-005` | Wpisy zbioru | `AUTOMATED` | `src/harvest/harvestEntryValidation.test.ts`<br>`src/harvest/harvestEntryCorrection.test.ts`<br>`src/harvest/harvestEntryIdempotency.test.ts`<br>`tests/integration/harvest-session-flow.test.ts` |
| `FR-HE-010` | Wpisy zbioru | `AUTOMATED` | `src/harvest/harvestEntryValidation.test.ts`<br>`src/harvest/harvestEntryCorrection.test.ts`<br>`src/harvest/harvestEntryIdempotency.test.ts`<br>`tests/integration/harvest-session-flow.test.ts` |
| `FR-HE-011` | Wpisy zbioru | `AUTOMATED` | `src/harvest/harvestEntryValidation.test.ts`<br>`src/harvest/harvestEntryCorrection.test.ts`<br>`src/harvest/harvestEntryIdempotency.test.ts`<br>`tests/integration/harvest-session-flow.test.ts` |
| `FR-HE-012` | Wpisy zbioru | `AUTOMATED` | `src/harvest/harvestEntryValidation.test.ts`<br>`src/harvest/harvestEntryCorrection.test.ts`<br>`src/harvest/harvestEntryIdempotency.test.ts`<br>`tests/integration/harvest-session-flow.test.ts` |
| `FR-HE-020` | Wpisy zbioru | `AUTOMATED` | `src/harvest/harvestEntryValidation.test.ts`<br>`src/harvest/harvestEntryCorrection.test.ts`<br>`src/harvest/harvestEntryIdempotency.test.ts`<br>`tests/integration/harvest-session-flow.test.ts` |
| `FR-HE-021` | Wpisy zbioru | `AUTOMATED` | `src/harvest/harvestEntryValidation.test.ts`<br>`src/harvest/harvestEntryCorrection.test.ts`<br>`src/harvest/harvestEntryIdempotency.test.ts`<br>`tests/integration/harvest-session-flow.test.ts` |
| `FR-HE-022` | Wpisy zbioru | `AUTOMATED` | `src/harvest/harvestEntryValidation.test.ts`<br>`src/harvest/harvestEntryCorrection.test.ts`<br>`src/harvest/harvestEntryIdempotency.test.ts`<br>`tests/integration/harvest-session-flow.test.ts` |
| `FR-HE-030` | Wpisy zbioru | `AUTOMATED` | `src/harvest/harvestEntryValidation.test.ts`<br>`src/harvest/harvestEntryCorrection.test.ts`<br>`src/harvest/harvestEntryIdempotency.test.ts`<br>`tests/integration/harvest-session-flow.test.ts` |
| `FR-HE-040` | Wpisy zbioru | `AUTOMATED` | `src/harvest/harvestEntryValidation.test.ts`<br>`src/harvest/harvestEntryCorrection.test.ts`<br>`src/harvest/harvestEntryIdempotency.test.ts`<br>`tests/integration/harvest-session-flow.test.ts` |
| `FR-HE-041` | Wpisy zbioru | `AUTOMATED` | `src/harvest/harvestEntryValidation.test.ts`<br>`src/harvest/harvestEntryCorrection.test.ts`<br>`src/harvest/harvestEntryIdempotency.test.ts`<br>`tests/integration/harvest-session-flow.test.ts` |
| `FR-HE-042` | Wpisy zbioru | `AUTOMATED` | `src/harvest/harvestEntryValidation.test.ts`<br>`src/harvest/harvestEntryCorrection.test.ts`<br>`src/harvest/harvestEntryIdempotency.test.ts`<br>`tests/integration/harvest-session-flow.test.ts` |
| `FR-HE-050` | Wpisy zbioru | `AUTOMATED` | `src/harvest/harvestEntryValidation.test.ts`<br>`src/harvest/harvestEntryCorrection.test.ts`<br>`src/harvest/harvestEntryIdempotency.test.ts`<br>`tests/integration/harvest-session-flow.test.ts` |
| `FR-HE-051` | Wpisy zbioru | `AUTOMATED` | `src/harvest/harvestEntryValidation.test.ts`<br>`src/harvest/harvestEntryCorrection.test.ts`<br>`src/harvest/harvestEntryIdempotency.test.ts`<br>`tests/integration/harvest-session-flow.test.ts` |
| `FR-HE-060` | Wpisy zbioru | `AUTOMATED` | `src/harvest/harvestEntryValidation.test.ts`<br>`src/harvest/harvestEntryCorrection.test.ts`<br>`src/harvest/harvestEntryIdempotency.test.ts`<br>`tests/integration/harvest-session-flow.test.ts` |
| `FR-HE-061` | Wpisy zbioru | `AUTOMATED` | `src/harvest/harvestEntryValidation.test.ts`<br>`src/harvest/harvestEntryCorrection.test.ts`<br>`src/harvest/harvestEntryIdempotency.test.ts`<br>`tests/integration/harvest-session-flow.test.ts` |
| `FR-HE-062` | Wpisy zbioru | `AUTOMATED` | `src/harvest/harvestEntryValidation.test.ts`<br>`src/harvest/harvestEntryCorrection.test.ts`<br>`src/harvest/harvestEntryIdempotency.test.ts`<br>`tests/integration/harvest-session-flow.test.ts` |
| `FR-HE-063` | Wpisy zbioru | `AUTOMATED` | `src/harvest/harvestEntryValidation.test.ts`<br>`src/harvest/harvestEntryCorrection.test.ts`<br>`src/harvest/harvestEntryIdempotency.test.ts`<br>`tests/integration/harvest-session-flow.test.ts` |
| `FR-HE-070` | Wpisy zbioru | `AUTOMATED` | `src/harvest/harvestEntryValidation.test.ts`<br>`src/harvest/harvestEntryCorrection.test.ts`<br>`src/harvest/harvestEntryIdempotency.test.ts`<br>`tests/integration/harvest-session-flow.test.ts` |
| `FR-HS-001` | Sesje zbioru | `AUTOMATED` | `src/harvest/harvestSessionState.test.ts`<br>`src/harvest/openHarvestSession.test.ts`<br>`tests/integration/harvest-session-flow.test.ts`<br>`tests/rules/firestore-harvest.test.ts` |
| `FR-HS-002` | Sesje zbioru | `AUTOMATED` | `src/harvest/harvestSessionState.test.ts`<br>`src/harvest/openHarvestSession.test.ts`<br>`tests/integration/harvest-session-flow.test.ts`<br>`tests/rules/firestore-harvest.test.ts` |
| `FR-HS-003` | Sesje zbioru | `AUTOMATED` | `src/harvest/harvestSessionState.test.ts`<br>`src/harvest/openHarvestSession.test.ts`<br>`tests/integration/harvest-session-flow.test.ts`<br>`tests/rules/firestore-harvest.test.ts` |
| `FR-HS-004` | Sesje zbioru | `AUTOMATED` | `src/harvest/harvestSessionState.test.ts`<br>`src/harvest/openHarvestSession.test.ts`<br>`tests/integration/harvest-session-flow.test.ts`<br>`tests/rules/firestore-harvest.test.ts` |
| `FR-HS-005` | Sesje zbioru | `AUTOMATED` | `src/harvest/harvestSessionState.test.ts`<br>`src/harvest/openHarvestSession.test.ts`<br>`tests/integration/harvest-session-flow.test.ts`<br>`tests/rules/firestore-harvest.test.ts` |
| `FR-HS-006` | Sesje zbioru | `AUTOMATED` | `src/harvest/harvestSessionState.test.ts`<br>`src/harvest/openHarvestSession.test.ts`<br>`tests/integration/harvest-session-flow.test.ts`<br>`tests/rules/firestore-harvest.test.ts` |
| `FR-HS-007` | Sesje zbioru | `AUTOMATED` | `src/harvest/harvestSessionState.test.ts`<br>`src/harvest/openHarvestSession.test.ts`<br>`tests/integration/harvest-session-flow.test.ts`<br>`tests/rules/firestore-harvest.test.ts` |
| `FR-HS-020` | Sesje zbioru | `AUTOMATED` | `src/harvest/harvestSessionState.test.ts`<br>`src/harvest/openHarvestSession.test.ts`<br>`tests/integration/harvest-session-flow.test.ts`<br>`tests/rules/firestore-harvest.test.ts` |
| `FR-HS-021` | Sesje zbioru | `AUTOMATED` | `src/harvest/harvestSessionState.test.ts`<br>`src/harvest/openHarvestSession.test.ts`<br>`tests/integration/harvest-session-flow.test.ts`<br>`tests/rules/firestore-harvest.test.ts` |
| `FR-HS-022` | Sesje zbioru | `AUTOMATED` | `src/harvest/harvestSessionState.test.ts`<br>`src/harvest/openHarvestSession.test.ts`<br>`tests/integration/harvest-session-flow.test.ts`<br>`tests/rules/firestore-harvest.test.ts` |
| `FR-HS-CANCEL-001` | Anulowanie sesji | `AUTOMATED` | `src/harvest/cancelHarvestSession.test.ts`<br>`src/harvest/cancelHarvestSessionRuntime.test.ts` |
| `FR-HS-CANCEL-002` | Anulowanie sesji | `AUTOMATED` | `src/harvest/cancelHarvestSession.test.ts`<br>`src/harvest/cancelHarvestSessionRuntime.test.ts` |
| `FR-HS-CANCEL-003` | Anulowanie sesji | `AUTOMATED` | `src/harvest/cancelHarvestSession.test.ts`<br>`src/harvest/cancelHarvestSessionRuntime.test.ts` |
| `FR-HS-CANCEL-004` | Anulowanie sesji | `AUTOMATED` | `src/harvest/cancelHarvestSession.test.ts`<br>`src/harvest/cancelHarvestSessionRuntime.test.ts` |
| `FR-HS-CLOSE-001` | Zamykanie sesji | `AUTOMATED` | `src/harvest/closeHarvestSession.test.ts`<br>`src/offline/offlineHarvestSessionClose.test.ts`<br>`tests/integration/harvest-session-flow.test.ts` |
| `FR-HS-CLOSE-002` | Zamykanie sesji | `AUTOMATED` | `src/harvest/closeHarvestSession.test.ts`<br>`src/offline/offlineHarvestSessionClose.test.ts`<br>`tests/integration/harvest-session-flow.test.ts` |
| `FR-HS-CLOSE-003` | Zamykanie sesji | `AUTOMATED` | `src/harvest/closeHarvestSession.test.ts`<br>`src/offline/offlineHarvestSessionClose.test.ts`<br>`tests/integration/harvest-session-flow.test.ts` |
| `FR-HS-CLOSE-004` | Zamykanie sesji | `AUTOMATED` | `src/harvest/closeHarvestSession.test.ts`<br>`src/offline/offlineHarvestSessionClose.test.ts`<br>`tests/integration/harvest-session-flow.test.ts` |
| `FR-HS-CLOSE-005` | Zamykanie sesji | `AUTOMATED` | `src/harvest/closeHarvestSession.test.ts`<br>`src/offline/offlineHarvestSessionClose.test.ts`<br>`tests/integration/harvest-session-flow.test.ts` |
| `FR-HS-REOPEN-001` | Ponowne otwieranie sesji | `AUTOMATED` | `src/harvest/reopenHarvestSession.test.ts`<br>`src/harvest/reopenHarvestSessionRuntime.test.ts` |
| `FR-HS-REOPEN-002` | Ponowne otwieranie sesji | `AUTOMATED` | `src/harvest/reopenHarvestSession.test.ts`<br>`src/harvest/reopenHarvestSessionRuntime.test.ts` |
| `FR-HS-REOPEN-003` | Ponowne otwieranie sesji | `AUTOMATED` | `src/harvest/reopenHarvestSession.test.ts`<br>`src/harvest/reopenHarvestSessionRuntime.test.ts` |
| `FR-PAY-001` | Wyplaty | `AUTOMATED` | `src/payments/paymentEligibility.test.ts`<br>`src/payments/paymentWrite.test.ts`<br>`src/payments/paymentCancellation.test.ts`<br>`tests/rules/firestore-payments.test.ts` |
| `FR-PAY-002` | Wyplaty | `AUTOMATED` | `src/payments/paymentEligibility.test.ts`<br>`src/payments/paymentWrite.test.ts`<br>`src/payments/paymentCancellation.test.ts`<br>`tests/rules/firestore-payments.test.ts` |
| `FR-PAY-003` | Wyplaty | `AUTOMATED` | `src/payments/paymentEligibility.test.ts`<br>`src/payments/paymentWrite.test.ts`<br>`src/payments/paymentCancellation.test.ts`<br>`tests/rules/firestore-payments.test.ts` |
| `FR-PAY-010` | Wyplaty | `AUTOMATED` | `src/payments/paymentEligibility.test.ts`<br>`src/payments/paymentWrite.test.ts`<br>`src/payments/paymentCancellation.test.ts`<br>`tests/rules/firestore-payments.test.ts` |
| `FR-PAY-011` | Wyplaty | `AUTOMATED` | `src/payments/paymentEligibility.test.ts`<br>`src/payments/paymentWrite.test.ts`<br>`src/payments/paymentCancellation.test.ts`<br>`tests/rules/firestore-payments.test.ts` |
| `FR-PAY-012` | Wyplaty | `AUTOMATED` | `src/payments/paymentEligibility.test.ts`<br>`src/payments/paymentWrite.test.ts`<br>`src/payments/paymentCancellation.test.ts`<br>`tests/rules/firestore-payments.test.ts` |
| `FR-PAY-013` | Wyplaty | `AUTOMATED` | `src/payments/paymentEligibility.test.ts`<br>`src/payments/paymentWrite.test.ts`<br>`src/payments/paymentCancellation.test.ts`<br>`tests/rules/firestore-payments.test.ts` |
| `FR-PAY-020` | Wyplaty | `AUTOMATED` | `src/payments/paymentEligibility.test.ts`<br>`src/payments/paymentWrite.test.ts`<br>`src/payments/paymentCancellation.test.ts`<br>`tests/rules/firestore-payments.test.ts` |
| `FR-PAY-021` | Wyplaty | `AUTOMATED` | `src/payments/paymentEligibility.test.ts`<br>`src/payments/paymentWrite.test.ts`<br>`src/payments/paymentCancellation.test.ts`<br>`tests/rules/firestore-payments.test.ts` |
| `FR-PLAN-001` | Plany rozliczen | `AUTOMATED` | `src/plans/settlementPlans.test.ts`<br>`src/domain/domainConfiguration.test.ts`<br>`tests/rules/firestore-settlement-plans.test.ts` |
| `FR-PLAN-002` | Plany rozliczen | `AUTOMATED` | `src/plans/settlementPlans.test.ts`<br>`src/domain/domainConfiguration.test.ts`<br>`tests/rules/firestore-settlement-plans.test.ts` |
| `FR-PLAN-010` | Plany rozliczen | `AUTOMATED` | `src/plans/settlementPlans.test.ts`<br>`src/domain/domainConfiguration.test.ts`<br>`tests/rules/firestore-settlement-plans.test.ts` |
| `FR-PLAN-011` | Plany rozliczen | `AUTOMATED` | `src/plans/settlementPlans.test.ts`<br>`src/domain/domainConfiguration.test.ts`<br>`tests/rules/firestore-settlement-plans.test.ts` |
| `FR-PLAN-012` | Plany rozliczen | `AUTOMATED` | `src/plans/settlementPlans.test.ts`<br>`src/domain/domainConfiguration.test.ts`<br>`tests/rules/firestore-settlement-plans.test.ts` |
| `FR-PLAN-020` | Plany rozliczen | `AUTOMATED` | `src/plans/settlementPlans.test.ts`<br>`src/domain/domainConfiguration.test.ts`<br>`tests/rules/firestore-settlement-plans.test.ts` |
| `FR-PLAN-021` | Plany rozliczen | `AUTOMATED` | `src/plans/settlementPlans.test.ts`<br>`src/domain/domainConfiguration.test.ts`<br>`tests/rules/firestore-settlement-plans.test.ts` |
| `FR-PLAN-022` | Plany rozliczen | `AUTOMATED` | `src/plans/settlementPlans.test.ts`<br>`src/domain/domainConfiguration.test.ts`<br>`tests/rules/firestore-settlement-plans.test.ts` |
| `FR-PLAN-030` | Plany rozliczen | `AUTOMATED` | `src/plans/settlementPlans.test.ts`<br>`src/domain/domainConfiguration.test.ts`<br>`tests/rules/firestore-settlement-plans.test.ts` |
| `FR-RATE-001` | Stawki indywidualne | `AUTOMATED` | `src/workers/workerDirectory.test.ts`<br>`src/harvest/openHarvestSession.test.ts`<br>`src/offline/rateConflict.test.ts` |
| `FR-RATE-010` | Stawki indywidualne | `AUTOMATED` | `src/workers/workerDirectory.test.ts`<br>`src/harvest/openHarvestSession.test.ts`<br>`src/offline/rateConflict.test.ts` |
| `FR-RATE-011` | Stawki indywidualne | `AUTOMATED` | `src/workers/workerDirectory.test.ts`<br>`src/harvest/openHarvestSession.test.ts`<br>`src/offline/rateConflict.test.ts` |
| `FR-RATE-012` | Stawki indywidualne | `AUTOMATED` | `src/workers/workerDirectory.test.ts`<br>`src/harvest/openHarvestSession.test.ts`<br>`src/offline/rateConflict.test.ts` |
| `FR-RATE-013` | Stawki indywidualne | `AUTOMATED` | `src/workers/workerDirectory.test.ts`<br>`src/harvest/openHarvestSession.test.ts`<br>`src/offline/rateConflict.test.ts` |
| `FR-REPORT-001` | Raporty | `PARTIAL` | `src/reports/reportCatalog.test.ts`<br>`docs/domain/mvp-report-catalog.md`<br>`PLAN:10.3-full-unit-suite`<br>`PLAN:10.13-UAT` |
| `FR-REPORT-010` | Raporty | `PARTIAL` | `src/reports/reportCatalog.test.ts`<br>`docs/domain/mvp-report-catalog.md`<br>`PLAN:10.3-full-unit-suite`<br>`PLAN:10.13-UAT` |
| `FR-SALE-001` | Sprzedaz | `AUTOMATED` | `src/sales/ordinarySalePreparation.test.ts`<br>`src/sales/saleCorrectionWrite.test.ts`<br>`src/sales/saleCancellation.test.ts`<br>`tests/rules/firestore-sales.test.ts` |
| `FR-SALE-002` | Sprzedaz | `AUTOMATED` | `src/sales/ordinarySalePreparation.test.ts`<br>`src/sales/saleCorrectionWrite.test.ts`<br>`src/sales/saleCancellation.test.ts`<br>`tests/rules/firestore-sales.test.ts` |
| `FR-SALE-010` | Sprzedaz | `AUTOMATED` | `src/sales/ordinarySalePreparation.test.ts`<br>`src/sales/saleCorrectionWrite.test.ts`<br>`src/sales/saleCancellation.test.ts`<br>`tests/rules/firestore-sales.test.ts` |
| `FR-SALE-011` | Sprzedaz | `AUTOMATED` | `src/sales/ordinarySalePreparation.test.ts`<br>`src/sales/saleCorrectionWrite.test.ts`<br>`src/sales/saleCancellation.test.ts`<br>`tests/rules/firestore-sales.test.ts` |
| `FR-SALE-012` | Sprzedaz | `AUTOMATED` | `src/sales/ordinarySalePreparation.test.ts`<br>`src/sales/saleCorrectionWrite.test.ts`<br>`src/sales/saleCancellation.test.ts`<br>`tests/rules/firestore-sales.test.ts` |
| `FR-SALE-013` | Sprzedaz | `AUTOMATED` | `src/sales/ordinarySalePreparation.test.ts`<br>`src/sales/saleCorrectionWrite.test.ts`<br>`src/sales/saleCancellation.test.ts`<br>`tests/rules/firestore-sales.test.ts` |
| `FR-SALE-014` | Sprzedaz | `AUTOMATED` | `src/sales/ordinarySalePreparation.test.ts`<br>`src/sales/saleCorrectionWrite.test.ts`<br>`src/sales/saleCancellation.test.ts`<br>`tests/rules/firestore-sales.test.ts` |
| `FR-SALE-020` | Sprzedaz | `AUTOMATED` | `src/sales/ordinarySalePreparation.test.ts`<br>`src/sales/saleCorrectionWrite.test.ts`<br>`src/sales/saleCancellation.test.ts`<br>`tests/rules/firestore-sales.test.ts` |
| `FR-SALE-021` | Sprzedaz | `AUTOMATED` | `src/sales/ordinarySalePreparation.test.ts`<br>`src/sales/saleCorrectionWrite.test.ts`<br>`src/sales/saleCancellation.test.ts`<br>`tests/rules/firestore-sales.test.ts` |
| `FR-SALE-022` | Sprzedaz | `AUTOMATED` | `src/sales/ordinarySalePreparation.test.ts`<br>`src/sales/saleCorrectionWrite.test.ts`<br>`src/sales/saleCancellation.test.ts`<br>`tests/rules/firestore-sales.test.ts` |
| `FR-SALE-030` | Sprzedaz | `AUTOMATED` | `src/sales/ordinarySalePreparation.test.ts`<br>`src/sales/saleCorrectionWrite.test.ts`<br>`src/sales/saleCancellation.test.ts`<br>`tests/rules/firestore-sales.test.ts` |
| `FR-SEASON-001` | Sezony | `AUTOMATED` | `src/seasons/seasons.test.ts`<br>`src/seasons/AdminSeasonsPanel.test.tsx`<br>`tests/rules/firestore-seasons.test.ts` |
| `FR-SEASON-002` | Sezony | `AUTOMATED` | `src/seasons/seasons.test.ts`<br>`src/seasons/AdminSeasonsPanel.test.tsx`<br>`tests/rules/firestore-seasons.test.ts` |
| `FR-SEASON-003` | Sezony | `AUTOMATED` | `src/seasons/seasons.test.ts`<br>`src/seasons/AdminSeasonsPanel.test.tsx`<br>`tests/rules/firestore-seasons.test.ts` |
| `FR-SEASON-010` | Sezony | `AUTOMATED` | `src/seasons/seasons.test.ts`<br>`src/seasons/AdminSeasonsPanel.test.tsx`<br>`tests/rules/firestore-seasons.test.ts` |
| `FR-SEASON-020` | Sezony | `AUTOMATED` | `src/seasons/seasons.test.ts`<br>`src/seasons/AdminSeasonsPanel.test.tsx`<br>`tests/rules/firestore-seasons.test.ts` |
| `FR-SEASON-021` | Sezony | `AUTOMATED` | `src/seasons/seasons.test.ts`<br>`src/seasons/AdminSeasonsPanel.test.tsx`<br>`tests/rules/firestore-seasons.test.ts` |
| `FR-SEASON-022` | Sezony | `AUTOMATED` | `src/seasons/seasons.test.ts`<br>`src/seasons/AdminSeasonsPanel.test.tsx`<br>`tests/rules/firestore-seasons.test.ts` |
| `FR-SEASON-030` | Sezony | `AUTOMATED` | `src/seasons/seasons.test.ts`<br>`src/seasons/AdminSeasonsPanel.test.tsx`<br>`tests/rules/firestore-seasons.test.ts` |
| `FR-SYNC-001` | Centrum synchronizacji | `AUTOMATED` | `src/offline/syncCenter.test.ts`<br>`src/offline/automaticSynchronization.test.ts`<br>`src/offline/emergencyLocalExport.test.ts` |
| `FR-SYNC-002` | Centrum synchronizacji | `AUTOMATED` | `src/offline/syncCenter.test.ts`<br>`src/offline/automaticSynchronization.test.ts`<br>`src/offline/emergencyLocalExport.test.ts` |
| `FR-SYNC-003` | Centrum synchronizacji | `AUTOMATED` | `src/offline/syncCenter.test.ts`<br>`src/offline/automaticSynchronization.test.ts`<br>`src/offline/emergencyLocalExport.test.ts` |
| `FR-SYNC-004` | Centrum synchronizacji | `AUTOMATED` | `src/offline/syncCenter.test.ts`<br>`src/offline/automaticSynchronization.test.ts`<br>`src/offline/emergencyLocalExport.test.ts` |
| `FR-USER-001` | Uzytkownicy i urzadzenia | `AUTOMATED` | `src/users/userDirectory.test.ts`<br>`src/users/userProfileUpdates.test.ts`<br>`src/devices/deviceDirectory.test.ts`<br>`tests/rules/firestore-user-profiles.test.ts` |
| `FR-USER-002` | Uzytkownicy i urzadzenia | `AUTOMATED` | `src/users/userDirectory.test.ts`<br>`src/users/userProfileUpdates.test.ts`<br>`src/devices/deviceDirectory.test.ts`<br>`tests/rules/firestore-user-profiles.test.ts` |
| `FR-USER-003` | Uzytkownicy i urzadzenia | `AUTOMATED` | `src/users/userDirectory.test.ts`<br>`src/users/userProfileUpdates.test.ts`<br>`src/devices/deviceDirectory.test.ts`<br>`tests/rules/firestore-user-profiles.test.ts` |
| `FR-USER-020` | Uzytkownicy i urzadzenia | `AUTOMATED` | `src/users/userDirectory.test.ts`<br>`src/users/userProfileUpdates.test.ts`<br>`src/devices/deviceDirectory.test.ts`<br>`tests/rules/firestore-user-profiles.test.ts` |
| `FR-USER-021` | Uzytkownicy i urzadzenia | `AUTOMATED` | `src/users/userDirectory.test.ts`<br>`src/users/userProfileUpdates.test.ts`<br>`src/devices/deviceDirectory.test.ts`<br>`tests/rules/firestore-user-profiles.test.ts` |
| `FR-USER-022` | Uzytkownicy i urzadzenia | `AUTOMATED` | `src/users/userDirectory.test.ts`<br>`src/users/userProfileUpdates.test.ts`<br>`src/devices/deviceDirectory.test.ts`<br>`tests/rules/firestore-user-profiles.test.ts` |
| `FR-USER-023` | Uzytkownicy i urzadzenia | `AUTOMATED` | `src/users/userDirectory.test.ts`<br>`src/users/userProfileUpdates.test.ts`<br>`src/devices/deviceDirectory.test.ts`<br>`tests/rules/firestore-user-profiles.test.ts` |
| `FR-USER-030` | Uzytkownicy i urzadzenia | `AUTOMATED` | `src/users/userDirectory.test.ts`<br>`src/users/userProfileUpdates.test.ts`<br>`src/devices/deviceDirectory.test.ts`<br>`tests/rules/firestore-user-profiles.test.ts` |
| `FR-USER-031` | Uzytkownicy i urzadzenia | `AUTOMATED` | `src/users/userDirectory.test.ts`<br>`src/users/userProfileUpdates.test.ts`<br>`src/devices/deviceDirectory.test.ts`<br>`tests/rules/firestore-user-profiles.test.ts` |
| `FR-USER-032` | Uzytkownicy i urzadzenia | `AUTOMATED` | `src/users/userDirectory.test.ts`<br>`src/users/userProfileUpdates.test.ts`<br>`src/devices/deviceDirectory.test.ts`<br>`tests/rules/firestore-user-profiles.test.ts` |
| `FR-USER-033` | Uzytkownicy i urzadzenia | `AUTOMATED` | `src/users/userDirectory.test.ts`<br>`src/users/userProfileUpdates.test.ts`<br>`src/devices/deviceDirectory.test.ts`<br>`tests/rules/firestore-user-profiles.test.ts` |
| `FR-USER-040` | Uzytkownicy i urzadzenia | `AUTOMATED` | `src/users/userDirectory.test.ts`<br>`src/users/userProfileUpdates.test.ts`<br>`src/devices/deviceDirectory.test.ts`<br>`tests/rules/firestore-user-profiles.test.ts` |
| `FR-USER-041` | Uzytkownicy i urzadzenia | `AUTOMATED` | `src/users/userDirectory.test.ts`<br>`src/users/userProfileUpdates.test.ts`<br>`src/devices/deviceDirectory.test.ts`<br>`tests/rules/firestore-user-profiles.test.ts` |
| `FR-WORKER-001` | Zbieracze | `AUTOMATED` | `src/workers/workerDirectory.test.ts`<br>`src/workers/WorkerDirectoryPanel.test.tsx`<br>`tests/rules/firestore-workers.test.ts` |
| `FR-WORKER-002` | Zbieracze | `AUTOMATED` | `src/workers/workerDirectory.test.ts`<br>`src/workers/WorkerDirectoryPanel.test.tsx`<br>`tests/rules/firestore-workers.test.ts` |
| `FR-WORKER-003` | Zbieracze | `AUTOMATED` | `src/workers/workerDirectory.test.ts`<br>`src/workers/WorkerDirectoryPanel.test.tsx`<br>`tests/rules/firestore-workers.test.ts` |
| `FR-WORKER-010` | Zbieracze | `AUTOMATED` | `src/workers/workerDirectory.test.ts`<br>`src/workers/WorkerDirectoryPanel.test.tsx`<br>`tests/rules/firestore-workers.test.ts` |
| `FR-WORKER-011` | Zbieracze | `AUTOMATED` | `src/workers/workerDirectory.test.ts`<br>`src/workers/WorkerDirectoryPanel.test.tsx`<br>`tests/rules/firestore-workers.test.ts` |
| `FR-WORKER-012` | Zbieracze | `AUTOMATED` | `src/workers/workerDirectory.test.ts`<br>`src/workers/WorkerDirectoryPanel.test.tsx`<br>`tests/rules/firestore-workers.test.ts` |
| `FR-WORKER-013` | Zbieracze | `AUTOMATED` | `src/workers/workerDirectory.test.ts`<br>`src/workers/WorkerDirectoryPanel.test.tsx`<br>`tests/rules/firestore-workers.test.ts` |
| `FR-WORKER-020` | Zbieracze | `AUTOMATED` | `src/workers/workerDirectory.test.ts`<br>`src/workers/WorkerDirectoryPanel.test.tsx`<br>`tests/rules/firestore-workers.test.ts` |
| `FR-WORKER-021` | Zbieracze | `AUTOMATED` | `src/workers/workerDirectory.test.ts`<br>`src/workers/WorkerDirectoryPanel.test.tsx`<br>`tests/rules/firestore-workers.test.ts` |
| `FR-WORKER-022` | Zbieracze | `AUTOMATED` | `src/workers/workerDirectory.test.ts`<br>`src/workers/WorkerDirectoryPanel.test.tsx`<br>`tests/rules/firestore-workers.test.ts` |
| `FR-WORKER-030` | Zbieracze | `AUTOMATED` | `src/workers/workerDirectory.test.ts`<br>`src/workers/WorkerDirectoryPanel.test.tsx`<br>`tests/rules/firestore-workers.test.ts` |
| `FR-WORKER-031` | Zbieracze | `AUTOMATED` | `src/workers/workerDirectory.test.ts`<br>`src/workers/WorkerDirectoryPanel.test.tsx`<br>`tests/rules/firestore-workers.test.ts` |
| `G-01` | Cele produktu | `PARTIAL` | `docs/release/release-candidate-scope.md`<br>`docs/testing/matrix.md`<br>`PLAN:10.13-UAT`<br>`PLAN:10.17-pilot` |
| `G-02` | Cele produktu | `PARTIAL` | `docs/release/release-candidate-scope.md`<br>`docs/testing/matrix.md`<br>`PLAN:10.13-UAT`<br>`PLAN:10.17-pilot` |
| `G-03` | Cele produktu | `PARTIAL` | `docs/release/release-candidate-scope.md`<br>`docs/testing/matrix.md`<br>`PLAN:10.13-UAT`<br>`PLAN:10.17-pilot` |
| `G-04` | Cele produktu | `PARTIAL` | `docs/release/release-candidate-scope.md`<br>`docs/testing/matrix.md`<br>`PLAN:10.13-UAT`<br>`PLAN:10.17-pilot` |
| `G-05` | Cele produktu | `PARTIAL` | `docs/release/release-candidate-scope.md`<br>`docs/testing/matrix.md`<br>`PLAN:10.13-UAT`<br>`PLAN:10.17-pilot` |
| `G-06` | Cele produktu | `PARTIAL` | `docs/release/release-candidate-scope.md`<br>`docs/testing/matrix.md`<br>`PLAN:10.13-UAT`<br>`PLAN:10.17-pilot` |
| `G-07` | Cele produktu | `PARTIAL` | `docs/release/release-candidate-scope.md`<br>`docs/testing/matrix.md`<br>`PLAN:10.13-UAT`<br>`PLAN:10.17-pilot` |
| `NFR-A11Y-001` | NFR dostepnosc | `PENDING_MANUAL` | `src/app/App.test.tsx`<br>`PLAN:10.8-accessibility` |
| `NFR-A11Y-002` | NFR dostepnosc | `PENDING_MANUAL` | `src/app/App.test.tsx`<br>`PLAN:10.8-accessibility` |
| `NFR-A11Y-003` | NFR dostepnosc | `PENDING_MANUAL` | `src/app/App.test.tsx`<br>`PLAN:10.8-accessibility` |
| `NFR-A11Y-004` | NFR dostepnosc | `PENDING_MANUAL` | `src/app/App.test.tsx`<br>`PLAN:10.8-accessibility` |
| `NFR-A11Y-005` | NFR dostepnosc | `PENDING_MANUAL` | `src/app/App.test.tsx`<br>`PLAN:10.8-accessibility` |
| `NFR-COST-001` | NFR koszt | `PARTIAL` | `src/dashboard/dashboardReadStrategy.test.ts`<br>`tests/integration/dashboard-performance.test.ts`<br>`PLAN:11.7-budget-alerts` |
| `NFR-COST-002` | NFR koszt | `PARTIAL` | `src/dashboard/dashboardReadStrategy.test.ts`<br>`tests/integration/dashboard-performance.test.ts`<br>`PLAN:11.7-budget-alerts` |
| `NFR-COST-003` | NFR koszt | `PARTIAL` | `src/dashboard/dashboardReadStrategy.test.ts`<br>`tests/integration/dashboard-performance.test.ts`<br>`PLAN:11.7-budget-alerts` |
| `NFR-COST-004` | NFR koszt | `PARTIAL` | `src/dashboard/dashboardReadStrategy.test.ts`<br>`tests/integration/dashboard-performance.test.ts`<br>`PLAN:11.7-budget-alerts` |
| `NFR-DATA-001` | NFR spojnosc danych | `AUTOMATED` | `src/stock/stockCorrectnessVerification.test.ts`<br>`src/offline/synchronizationIdempotency.test.ts`<br>`tests/integration/harvest-session-flow.test.ts` |
| `NFR-DATA-002` | NFR spojnosc danych | `AUTOMATED` | `src/stock/stockCorrectnessVerification.test.ts`<br>`src/offline/synchronizationIdempotency.test.ts`<br>`tests/integration/harvest-session-flow.test.ts` |
| `NFR-DATA-003` | NFR spojnosc danych | `AUTOMATED` | `src/stock/stockCorrectnessVerification.test.ts`<br>`src/offline/synchronizationIdempotency.test.ts`<br>`tests/integration/harvest-session-flow.test.ts` |
| `NFR-DATA-004` | NFR spojnosc danych | `AUTOMATED` | `src/stock/stockCorrectnessVerification.test.ts`<br>`src/offline/synchronizationIdempotency.test.ts`<br>`tests/integration/harvest-session-flow.test.ts` |
| `NFR-DATA-005` | NFR spojnosc danych | `AUTOMATED` | `src/stock/stockCorrectnessVerification.test.ts`<br>`src/offline/synchronizationIdempotency.test.ts`<br>`tests/integration/harvest-session-flow.test.ts` |
| `NFR-DATA-006` | NFR spojnosc danych | `AUTOMATED` | `src/stock/stockCorrectnessVerification.test.ts`<br>`src/offline/synchronizationIdempotency.test.ts`<br>`tests/integration/harvest-session-flow.test.ts` |
| `NFR-I18N-001` | NFR lokalizacja | `PARTIAL` | `src/domain/format.test.ts`<br>`src/reports/polishExcelCsv.test.ts`<br>`PLAN:10.6-browser-matrix` |
| `NFR-I18N-002` | NFR lokalizacja | `PARTIAL` | `src/domain/format.test.ts`<br>`src/reports/polishExcelCsv.test.ts`<br>`PLAN:10.6-browser-matrix` |
| `NFR-I18N-003` | NFR lokalizacja | `PARTIAL` | `src/domain/format.test.ts`<br>`src/reports/polishExcelCsv.test.ts`<br>`PLAN:10.6-browser-matrix` |
| `NFR-MAINT-001` | NFR utrzymywalnosc | `AUTOMATED` | `src/config/appMeta.test.ts`<br>`tests/scripts/validate-deploy-env.test.mjs`<br>`docs/process/definition-of-done.md` |
| `NFR-MAINT-002` | NFR utrzymywalnosc | `AUTOMATED` | `src/config/appMeta.test.ts`<br>`tests/scripts/validate-deploy-env.test.mjs`<br>`docs/process/definition-of-done.md` |
| `NFR-MAINT-003` | NFR utrzymywalnosc | `AUTOMATED` | `src/config/appMeta.test.ts`<br>`tests/scripts/validate-deploy-env.test.mjs`<br>`docs/process/definition-of-done.md` |
| `NFR-MAINT-004` | NFR utrzymywalnosc | `AUTOMATED` | `src/config/appMeta.test.ts`<br>`tests/scripts/validate-deploy-env.test.mjs`<br>`docs/process/definition-of-done.md` |
| `NFR-MAINT-005` | NFR utrzymywalnosc | `AUTOMATED` | `src/config/appMeta.test.ts`<br>`tests/scripts/validate-deploy-env.test.mjs`<br>`docs/process/definition-of-done.md` |
| `NFR-MAINT-006` | NFR utrzymywalnosc | `AUTOMATED` | `src/config/appMeta.test.ts`<br>`tests/scripts/validate-deploy-env.test.mjs`<br>`docs/process/definition-of-done.md` |
| `NFR-OBS-001` | NFR obserwowalnosc | `PARTIAL` | `src/app/App.test.tsx`<br>`docs/deployment/rollback.md`<br>`PLAN:10.11-security-review` |
| `NFR-OBS-002` | NFR obserwowalnosc | `PARTIAL` | `src/app/App.test.tsx`<br>`docs/deployment/rollback.md`<br>`PLAN:10.11-security-review` |
| `NFR-OBS-003` | NFR obserwowalnosc | `PARTIAL` | `src/app/App.test.tsx`<br>`docs/deployment/rollback.md`<br>`PLAN:10.11-security-review` |
| `NFR-OBS-004` | NFR obserwowalnosc | `PARTIAL` | `src/app/App.test.tsx`<br>`docs/deployment/rollback.md`<br>`PLAN:10.11-security-review` |
| `NFR-PERF-001` | NFR wydajnosc | `PARTIAL` | `tests/integration/dashboard-performance.test.ts`<br>`docs/testing/etap-8-dashboard-performance-report.md`<br>`PLAN:10.10-realistic-DEV-performance` |
| `NFR-PERF-002` | NFR wydajnosc | `PARTIAL` | `tests/integration/dashboard-performance.test.ts`<br>`docs/testing/etap-8-dashboard-performance-report.md`<br>`PLAN:10.10-realistic-DEV-performance` |
| `NFR-PERF-003` | NFR wydajnosc | `PARTIAL` | `tests/integration/dashboard-performance.test.ts`<br>`docs/testing/etap-8-dashboard-performance-report.md`<br>`PLAN:10.10-realistic-DEV-performance` |
| `NFR-PERF-004` | NFR wydajnosc | `PARTIAL` | `tests/integration/dashboard-performance.test.ts`<br>`docs/testing/etap-8-dashboard-performance-report.md`<br>`PLAN:10.10-realistic-DEV-performance` |
| `NFR-PERF-005` | NFR wydajnosc | `PARTIAL` | `tests/integration/dashboard-performance.test.ts`<br>`docs/testing/etap-8-dashboard-performance-report.md`<br>`PLAN:10.10-realistic-DEV-performance` |
| `NFR-PERF-006` | NFR wydajnosc | `PARTIAL` | `tests/integration/dashboard-performance.test.ts`<br>`docs/testing/etap-8-dashboard-performance-report.md`<br>`PLAN:10.10-realistic-DEV-performance` |
| `NFR-PORT-001` | NFR portowalnosc | `PARTIAL` | `tests/scripts/full-cloud-export-portability.test.mjs`<br>`docs/firebase/environments.md`<br>`MANUAL:realistic-DEV-export-two-copies` |
| `NFR-PORT-002` | NFR portowalnosc | `PARTIAL` | `tests/scripts/full-cloud-export-portability.test.mjs`<br>`docs/firebase/environments.md`<br>`MANUAL:realistic-DEV-export-two-copies` |
| `NFR-PORT-003` | NFR portowalnosc | `PARTIAL` | `tests/scripts/full-cloud-export-portability.test.mjs`<br>`docs/firebase/environments.md`<br>`MANUAL:realistic-DEV-export-two-copies` |
| `NFR-PORT-004` | NFR portowalnosc | `PARTIAL` | `tests/scripts/full-cloud-export-portability.test.mjs`<br>`docs/firebase/environments.md`<br>`MANUAL:realistic-DEV-export-two-copies` |
| `NFR-PORT-005` | NFR portowalnosc | `PARTIAL` | `tests/scripts/full-cloud-export-portability.test.mjs`<br>`docs/firebase/environments.md`<br>`MANUAL:realistic-DEV-export-two-copies` |
| `NFR-REL-001` | NFR niezawodnosc | `PARTIAL` | `src/offline/longOfflineVerification.test.ts`<br>`src/pwa/pwaUpdateRecovery.test.ts`<br>`PLAN:10.5-long-offline`<br>`PLAN:10.12-RC-update` |
| `NFR-REL-002` | NFR niezawodnosc | `PARTIAL` | `src/offline/longOfflineVerification.test.ts`<br>`src/pwa/pwaUpdateRecovery.test.ts`<br>`PLAN:10.5-long-offline`<br>`PLAN:10.12-RC-update` |
| `NFR-REL-003` | NFR niezawodnosc | `PARTIAL` | `src/offline/longOfflineVerification.test.ts`<br>`src/pwa/pwaUpdateRecovery.test.ts`<br>`PLAN:10.5-long-offline`<br>`PLAN:10.12-RC-update` |
| `NFR-REL-004` | NFR niezawodnosc | `PARTIAL` | `src/offline/longOfflineVerification.test.ts`<br>`src/pwa/pwaUpdateRecovery.test.ts`<br>`PLAN:10.5-long-offline`<br>`PLAN:10.12-RC-update` |
| `NFR-REL-005` | NFR niezawodnosc | `PARTIAL` | `src/offline/longOfflineVerification.test.ts`<br>`src/pwa/pwaUpdateRecovery.test.ts`<br>`PLAN:10.5-long-offline`<br>`PLAN:10.12-RC-update` |
| `NFR-REL-006` | NFR niezawodnosc | `PARTIAL` | `src/offline/longOfflineVerification.test.ts`<br>`src/pwa/pwaUpdateRecovery.test.ts`<br>`PLAN:10.5-long-offline`<br>`PLAN:10.12-RC-update` |
| `NFR-RESP-001` | NFR responsywnosc | `PENDING_MANUAL` | `tests/e2e/app-shell.spec.ts`<br>`PLAN:10.9-responsive` |
| `NFR-RESP-002` | NFR responsywnosc | `PENDING_MANUAL` | `tests/e2e/app-shell.spec.ts`<br>`PLAN:10.9-responsive` |
| `NFR-RESP-003` | NFR responsywnosc | `PENDING_MANUAL` | `tests/e2e/app-shell.spec.ts`<br>`PLAN:10.9-responsive` |
| `NFR-RESP-004` | NFR responsywnosc | `PENDING_MANUAL` | `tests/e2e/app-shell.spec.ts`<br>`PLAN:10.9-responsive` |
| `NFR-TIME-001` | NFR czas i daty | `PARTIAL` | `src/domain/format.test.ts`<br>`src/harvest/harvestSessionState.test.ts`<br>`PLAN:10.6-browser-matrix` |
| `NFR-TIME-002` | NFR czas i daty | `PARTIAL` | `src/domain/format.test.ts`<br>`src/harvest/harvestSessionState.test.ts`<br>`PLAN:10.6-browser-matrix` |
| `NFR-TIME-003` | NFR czas i daty | `PARTIAL` | `src/domain/format.test.ts`<br>`src/harvest/harvestSessionState.test.ts`<br>`PLAN:10.6-browser-matrix` |
| `NFR-TIME-004` | NFR czas i daty | `PARTIAL` | `src/domain/format.test.ts`<br>`src/harvest/harvestSessionState.test.ts`<br>`PLAN:10.6-browser-matrix` |
| `OFF-001` | Offline i synchronizacja | `AUTOMATED` | `src/offline/offlineScenarioReconciliation.test.ts`<br>`tests/integration/offline-harvest-runtime.test.ts`<br>`docs/testing/etap-6-offline-scenarios-report.md` |
| `OFF-002` | Offline i synchronizacja | `AUTOMATED` | `src/offline/offlineScenarioReconciliation.test.ts`<br>`tests/integration/offline-harvest-runtime.test.ts`<br>`docs/testing/etap-6-offline-scenarios-report.md` |
| `OFF-003` | Offline i synchronizacja | `AUTOMATED` | `src/offline/offlineScenarioReconciliation.test.ts`<br>`tests/integration/offline-harvest-runtime.test.ts`<br>`docs/testing/etap-6-offline-scenarios-report.md` |
| `OFF-004` | Offline i synchronizacja | `AUTOMATED` | `src/offline/offlineScenarioReconciliation.test.ts`<br>`tests/integration/offline-harvest-runtime.test.ts`<br>`docs/testing/etap-6-offline-scenarios-report.md` |
| `OFF-010` | Offline i synchronizacja | `AUTOMATED` | `src/offline/offlineScenarioReconciliation.test.ts`<br>`tests/integration/offline-harvest-runtime.test.ts`<br>`docs/testing/etap-6-offline-scenarios-report.md` |
| `OFF-011` | Offline i synchronizacja | `AUTOMATED` | `src/offline/offlineScenarioReconciliation.test.ts`<br>`tests/integration/offline-harvest-runtime.test.ts`<br>`docs/testing/etap-6-offline-scenarios-report.md` |
| `OFF-012` | Offline i synchronizacja | `AUTOMATED` | `src/offline/offlineScenarioReconciliation.test.ts`<br>`tests/integration/offline-harvest-runtime.test.ts`<br>`docs/testing/etap-6-offline-scenarios-report.md` |
| `OFF-013` | Offline i synchronizacja | `AUTOMATED` | `src/offline/offlineScenarioReconciliation.test.ts`<br>`tests/integration/offline-harvest-runtime.test.ts`<br>`docs/testing/etap-6-offline-scenarios-report.md` |
| `OFF-020` | Offline i synchronizacja | `AUTOMATED` | `src/offline/offlineScenarioReconciliation.test.ts`<br>`tests/integration/offline-harvest-runtime.test.ts`<br>`docs/testing/etap-6-offline-scenarios-report.md` |
| `OFF-021` | Offline i synchronizacja | `AUTOMATED` | `src/offline/offlineScenarioReconciliation.test.ts`<br>`tests/integration/offline-harvest-runtime.test.ts`<br>`docs/testing/etap-6-offline-scenarios-report.md` |
| `OFF-022` | Offline i synchronizacja | `AUTOMATED` | `src/offline/offlineScenarioReconciliation.test.ts`<br>`tests/integration/offline-harvest-runtime.test.ts`<br>`docs/testing/etap-6-offline-scenarios-report.md` |
| `OFF-023` | Offline i synchronizacja | `AUTOMATED` | `src/offline/offlineScenarioReconciliation.test.ts`<br>`tests/integration/offline-harvest-runtime.test.ts`<br>`docs/testing/etap-6-offline-scenarios-report.md` |
| `OFF-024` | Offline i synchronizacja | `AUTOMATED` | `src/offline/offlineScenarioReconciliation.test.ts`<br>`tests/integration/offline-harvest-runtime.test.ts`<br>`docs/testing/etap-6-offline-scenarios-report.md` |
| `OFF-030` | Offline i synchronizacja | `AUTOMATED` | `src/offline/offlineScenarioReconciliation.test.ts`<br>`tests/integration/offline-harvest-runtime.test.ts`<br>`docs/testing/etap-6-offline-scenarios-report.md` |
| `OFF-031` | Offline i synchronizacja | `AUTOMATED` | `src/offline/offlineScenarioReconciliation.test.ts`<br>`tests/integration/offline-harvest-runtime.test.ts`<br>`docs/testing/etap-6-offline-scenarios-report.md` |
| `OFF-032` | Offline i synchronizacja | `AUTOMATED` | `src/offline/offlineScenarioReconciliation.test.ts`<br>`tests/integration/offline-harvest-runtime.test.ts`<br>`docs/testing/etap-6-offline-scenarios-report.md` |
| `OFF-033` | Offline i synchronizacja | `AUTOMATED` | `src/offline/offlineScenarioReconciliation.test.ts`<br>`tests/integration/offline-harvest-runtime.test.ts`<br>`docs/testing/etap-6-offline-scenarios-report.md` |
| `OFF-040` | Offline i synchronizacja | `AUTOMATED` | `src/offline/offlineScenarioReconciliation.test.ts`<br>`tests/integration/offline-harvest-runtime.test.ts`<br>`docs/testing/etap-6-offline-scenarios-report.md` |
| `OFF-041` | Offline i synchronizacja | `AUTOMATED` | `src/offline/offlineScenarioReconciliation.test.ts`<br>`tests/integration/offline-harvest-runtime.test.ts`<br>`docs/testing/etap-6-offline-scenarios-report.md` |
| `OFF-042` | Offline i synchronizacja | `AUTOMATED` | `src/offline/offlineScenarioReconciliation.test.ts`<br>`tests/integration/offline-harvest-runtime.test.ts`<br>`docs/testing/etap-6-offline-scenarios-report.md` |
| `OFF-043` | Offline i synchronizacja | `AUTOMATED` | `src/offline/offlineScenarioReconciliation.test.ts`<br>`tests/integration/offline-harvest-runtime.test.ts`<br>`docs/testing/etap-6-offline-scenarios-report.md` |
| `OFF-050` | Offline i synchronizacja | `AUTOMATED` | `src/offline/offlineScenarioReconciliation.test.ts`<br>`tests/integration/offline-harvest-runtime.test.ts`<br>`docs/testing/etap-6-offline-scenarios-report.md` |
| `OFF-051` | Offline i synchronizacja | `AUTOMATED` | `src/offline/offlineScenarioReconciliation.test.ts`<br>`tests/integration/offline-harvest-runtime.test.ts`<br>`docs/testing/etap-6-offline-scenarios-report.md` |
| `OFF-060` | Offline i synchronizacja | `AUTOMATED` | `src/offline/offlineScenarioReconciliation.test.ts`<br>`tests/integration/offline-harvest-runtime.test.ts`<br>`docs/testing/etap-6-offline-scenarios-report.md` |
| `OFF-061` | Offline i synchronizacja | `AUTOMATED` | `src/offline/offlineScenarioReconciliation.test.ts`<br>`tests/integration/offline-harvest-runtime.test.ts`<br>`docs/testing/etap-6-offline-scenarios-report.md` |
| `OFF-062` | Offline i synchronizacja | `AUTOMATED` | `src/offline/offlineScenarioReconciliation.test.ts`<br>`tests/integration/offline-harvest-runtime.test.ts`<br>`docs/testing/etap-6-offline-scenarios-report.md` |
| `OFF-063` | Offline i synchronizacja | `AUTOMATED` | `src/offline/offlineScenarioReconciliation.test.ts`<br>`tests/integration/offline-harvest-runtime.test.ts`<br>`docs/testing/etap-6-offline-scenarios-report.md` |
| `OFF-070` | Offline i synchronizacja | `AUTOMATED` | `src/offline/offlineScenarioReconciliation.test.ts`<br>`tests/integration/offline-harvest-runtime.test.ts`<br>`docs/testing/etap-6-offline-scenarios-report.md` |
| `OFF-071` | Offline i synchronizacja | `AUTOMATED` | `src/offline/offlineScenarioReconciliation.test.ts`<br>`tests/integration/offline-harvest-runtime.test.ts`<br>`docs/testing/etap-6-offline-scenarios-report.md` |
| `OFF-T01` | Scenariusze urzadzeniowe offline | `DEFERRED_DEVICE` | `src/offline/offlineScenarioReconciliation.test.ts`<br>`docs/testing/etap-6-android-report.md`<br>`docs/testing/etap-6-ios-report.md`<br>`MANUAL:physical-Android-and-iOS` |
| `OFF-T02` | Scenariusze urzadzeniowe offline | `DEFERRED_DEVICE` | `src/offline/offlineScenarioReconciliation.test.ts`<br>`docs/testing/etap-6-android-report.md`<br>`docs/testing/etap-6-ios-report.md`<br>`MANUAL:physical-Android-and-iOS` |
| `OFF-T03` | Scenariusze urzadzeniowe offline | `DEFERRED_DEVICE` | `src/offline/offlineScenarioReconciliation.test.ts`<br>`docs/testing/etap-6-android-report.md`<br>`docs/testing/etap-6-ios-report.md`<br>`MANUAL:physical-Android-and-iOS` |
| `OFF-T04` | Scenariusze urzadzeniowe offline | `DEFERRED_DEVICE` | `src/offline/offlineScenarioReconciliation.test.ts`<br>`docs/testing/etap-6-android-report.md`<br>`docs/testing/etap-6-ios-report.md`<br>`MANUAL:physical-Android-and-iOS` |
| `OFF-T05` | Scenariusze urzadzeniowe offline | `DEFERRED_DEVICE` | `src/offline/offlineScenarioReconciliation.test.ts`<br>`docs/testing/etap-6-android-report.md`<br>`docs/testing/etap-6-ios-report.md`<br>`MANUAL:physical-Android-and-iOS` |
| `OFF-T06` | Scenariusze urzadzeniowe offline | `DEFERRED_DEVICE` | `src/offline/offlineScenarioReconciliation.test.ts`<br>`docs/testing/etap-6-android-report.md`<br>`docs/testing/etap-6-ios-report.md`<br>`MANUAL:physical-Android-and-iOS` |
| `SEC-001` | Bezpieczenstwo i prywatnosc | `AUTOMATED` | `tests/rules/firestore-deny-default.test.ts`<br>`tests/rules/firestore-export-permissions.test.ts`<br>`src/audit/auditEvents.test.ts`<br>`src/offline/safeSignOut.test.ts` |
| `SEC-002` | Bezpieczenstwo i prywatnosc | `AUTOMATED` | `tests/rules/firestore-deny-default.test.ts`<br>`tests/rules/firestore-export-permissions.test.ts`<br>`src/audit/auditEvents.test.ts`<br>`src/offline/safeSignOut.test.ts` |
| `SEC-004` | Bezpieczenstwo i prywatnosc | `AUTOMATED` | `tests/rules/firestore-deny-default.test.ts`<br>`tests/rules/firestore-export-permissions.test.ts`<br>`src/audit/auditEvents.test.ts`<br>`src/offline/safeSignOut.test.ts` |
| `SEC-005` | Bezpieczenstwo i prywatnosc | `AUTOMATED` | `tests/rules/firestore-deny-default.test.ts`<br>`tests/rules/firestore-export-permissions.test.ts`<br>`src/audit/auditEvents.test.ts`<br>`src/offline/safeSignOut.test.ts` |
| `SEC-006` | Bezpieczenstwo i prywatnosc | `AUTOMATED` | `tests/rules/firestore-deny-default.test.ts`<br>`tests/rules/firestore-export-permissions.test.ts`<br>`src/audit/auditEvents.test.ts`<br>`src/offline/safeSignOut.test.ts` |
| `SEC-007` | Bezpieczenstwo i prywatnosc | `AUTOMATED` | `tests/rules/firestore-deny-default.test.ts`<br>`tests/rules/firestore-export-permissions.test.ts`<br>`src/audit/auditEvents.test.ts`<br>`src/offline/safeSignOut.test.ts` |
| `SEC-008` | Bezpieczenstwo i prywatnosc | `AUTOMATED` | `tests/rules/firestore-deny-default.test.ts`<br>`tests/rules/firestore-export-permissions.test.ts`<br>`src/audit/auditEvents.test.ts`<br>`src/offline/safeSignOut.test.ts` |
| `SEC-009` | Bezpieczenstwo i prywatnosc | `AUTOMATED` | `tests/rules/firestore-deny-default.test.ts`<br>`tests/rules/firestore-export-permissions.test.ts`<br>`src/audit/auditEvents.test.ts`<br>`src/offline/safeSignOut.test.ts` |
| `SEC-AUDIT-001` | Bezpieczenstwo i prywatnosc | `AUTOMATED` | `tests/rules/firestore-deny-default.test.ts`<br>`tests/rules/firestore-export-permissions.test.ts`<br>`src/audit/auditEvents.test.ts`<br>`src/offline/safeSignOut.test.ts` |
| `SEC-AUDIT-002` | Bezpieczenstwo i prywatnosc | `AUTOMATED` | `tests/rules/firestore-deny-default.test.ts`<br>`tests/rules/firestore-export-permissions.test.ts`<br>`src/audit/auditEvents.test.ts`<br>`src/offline/safeSignOut.test.ts` |
| `SEC-AUDIT-003` | Bezpieczenstwo i prywatnosc | `AUTOMATED` | `tests/rules/firestore-deny-default.test.ts`<br>`tests/rules/firestore-export-permissions.test.ts`<br>`src/audit/auditEvents.test.ts`<br>`src/offline/safeSignOut.test.ts` |
| `SEC-LOCAL-001` | Bezpieczenstwo i prywatnosc | `AUTOMATED` | `tests/rules/firestore-deny-default.test.ts`<br>`tests/rules/firestore-export-permissions.test.ts`<br>`src/audit/auditEvents.test.ts`<br>`src/offline/safeSignOut.test.ts` |
| `SEC-LOCAL-002` | Bezpieczenstwo i prywatnosc | `AUTOMATED` | `tests/rules/firestore-deny-default.test.ts`<br>`tests/rules/firestore-export-permissions.test.ts`<br>`src/audit/auditEvents.test.ts`<br>`src/offline/safeSignOut.test.ts` |
| `SEC-LOCAL-003` | Bezpieczenstwo i prywatnosc | `AUTOMATED` | `tests/rules/firestore-deny-default.test.ts`<br>`tests/rules/firestore-export-permissions.test.ts`<br>`src/audit/auditEvents.test.ts`<br>`src/offline/safeSignOut.test.ts` |
| `SEC-LOCAL-004` | Bezpieczenstwo i prywatnosc | `AUTOMATED` | `tests/rules/firestore-deny-default.test.ts`<br>`tests/rules/firestore-export-permissions.test.ts`<br>`src/audit/auditEvents.test.ts`<br>`src/offline/safeSignOut.test.ts` |
| `SEC-ROLE-001` | Bezpieczenstwo i prywatnosc | `AUTOMATED` | `tests/rules/firestore-deny-default.test.ts`<br>`tests/rules/firestore-export-permissions.test.ts`<br>`src/audit/auditEvents.test.ts`<br>`src/offline/safeSignOut.test.ts` |
| `SEC-ROLE-003` | Bezpieczenstwo i prywatnosc | `AUTOMATED` | `tests/rules/firestore-deny-default.test.ts`<br>`tests/rules/firestore-export-permissions.test.ts`<br>`src/audit/auditEvents.test.ts`<br>`src/offline/safeSignOut.test.ts` |
| `SEC-ROLE-004` | Bezpieczenstwo i prywatnosc | `AUTOMATED` | `tests/rules/firestore-deny-default.test.ts`<br>`tests/rules/firestore-export-permissions.test.ts`<br>`src/audit/auditEvents.test.ts`<br>`src/offline/safeSignOut.test.ts` |
| `UX-001` | UX | `PENDING_MANUAL` | `src/app/App.test.tsx`<br>`PLAN:10.6-browser-matrix`<br>`PLAN:10.8-accessibility`<br>`PLAN:10.9-responsive` |
| `UX-002` | UX | `PENDING_MANUAL` | `src/app/App.test.tsx`<br>`PLAN:10.6-browser-matrix`<br>`PLAN:10.8-accessibility`<br>`PLAN:10.9-responsive` |
| `UX-003` | UX | `PENDING_MANUAL` | `src/app/App.test.tsx`<br>`PLAN:10.6-browser-matrix`<br>`PLAN:10.8-accessibility`<br>`PLAN:10.9-responsive` |
| `UX-004` | UX | `PENDING_MANUAL` | `src/app/App.test.tsx`<br>`PLAN:10.6-browser-matrix`<br>`PLAN:10.8-accessibility`<br>`PLAN:10.9-responsive` |
| `UX-005` | UX | `PENDING_MANUAL` | `src/app/App.test.tsx`<br>`PLAN:10.6-browser-matrix`<br>`PLAN:10.8-accessibility`<br>`PLAN:10.9-responsive` |
| `UX-006` | UX | `PENDING_MANUAL` | `src/app/App.test.tsx`<br>`PLAN:10.6-browser-matrix`<br>`PLAN:10.8-accessibility`<br>`PLAN:10.9-responsive` |
| `UX-007` | UX | `PENDING_MANUAL` | `src/app/App.test.tsx`<br>`PLAN:10.6-browser-matrix`<br>`PLAN:10.8-accessibility`<br>`PLAN:10.9-responsive` |
| `UX-008` | UX | `PENDING_MANUAL` | `src/app/App.test.tsx`<br>`PLAN:10.6-browser-matrix`<br>`PLAN:10.8-accessibility`<br>`PLAN:10.9-responsive` |
