# Firestore indexes and query patterns

This document maps the current Firestore query families to the index manifest
deployed from `firestore.indexes.json`.

## Control rule

Firestore indexes must be changed in the repository. Do not create required
indexes only in Firebase Console, because the next deployment would not be
reproducible.

## Current stage 4 queries

| Area                               | Collection                | Query pattern                                                            | Index status                                                                                               |
| ---------------------------------- | ------------------------- | ------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------- |
| Pending invitation claim           | `registrationInvitations` | `emailNormalized == email`, `status == PENDING`, `limit(1)`              | Composite index in manifest                                                                                |
| Admin season list                  | `seasons`                 | full collection read                                                     | No composite index required                                                                                |
| Operator season cache              | `seasons`                 | `status == OPEN`                                                         | Single-field index is automatic; `status + startDate` composite is prepared for sorted active season lists |
| Operator worker cache              | `workers`                 | `active == true`                                                         | Single-field index is automatic; `active + normalizedName` composite is prepared for sorted active lists   |
| Worker list filtered by plan       | `workers`                 | `currentPlanId == planId`, `active == true`, ordered by `normalizedName` | Composite index in manifest                                                                                |
| Operator plan cache                | `settlementPlans`         | `active == true`                                                         | Single-field index is automatic; `active + code` composite is prepared for sorted active plan lists        |
| Rate history for one worker        | `workerRateVersions`      | `workerId == workerId`, ordered by `validFrom desc`                      | Composite index in manifest                                                                                |
| Active/current rate for one worker | `workerRateVersions`      | `workerId == workerId`, `active == true`, ordered by `validFrom desc`    | Composite index in manifest                                                                                |
| Active rates for one plan          | `workerRateVersions`      | `planId == planId`, `active == true`                                     | Composite index in manifest                                                                                |
| Accounts available for linking     | `users`                   | `active == true`, `registrationStatus == APPROVED`, `workerId == null`   | Composite index in manifest                                                                                |
| Account directory role filters     | `users`                   | `role == role`, `active == true`                                         | Composite index in manifest                                                                                |

## Current stage 5 harvest queries

| Area                       | Collection        | Query pattern                                                       | Index status                |
| -------------------------- | ----------------- | ------------------------------------------------------------------- | --------------------------- |
| Today's sessions           | `harvestSessions` | `businessDate == date`, ordered by `createdAtServer desc`           | Composite index in manifest |
| Open sessions              | `harvestSessions` | `status == OPEN`, ordered by `businessDate desc`, `createdAtServer` | Composite index in manifest |
| Sessions for worker/picker | `harvestSessions` | `workerId == workerId`, ordered by `businessDate desc`              | Composite index in manifest |
| Sessions for season        | `harvestSessions` | `seasonId == seasonId`, ordered by `businessDate desc`              | Composite index in manifest |
| Sessions by status         | `harvestSessions` | `status == status`, ordered by `businessDate desc`                  | Composite index in manifest |
| Sessions by operator       | `harvestSessions` | `createdBy == operatorUid`, ordered by `businessDate desc`          | Composite index in manifest |
| Review queue               | `harvestSessions` | `status == REVIEW_REQUIRED`, ordered by `updatedAtServer desc`      | Composite index in manifest |
| Entries for one session    | `harvestEntries`  | `sessionId == sessionId`, ordered by `sequenceNumber asc`           | Composite index in manifest |

Do not attach a listener to all `harvestEntries` for a season. Entry queries
must remain scoped to a single session.

## Dashboard aggregation queries

Stage 8 adds indexes for queries bounded by season and business date:

| Area                     | Collection                  | Equality prefix                                       | Range/order/aggregate fields           |
| ------------------------ | --------------------------- | ----------------------------------------------------- | -------------------------------------- |
| Admin harvest aggregates | `harvestSessions`           | `seasonId`, `status`                                  | data, `amountDueGrosz`, `totalWeightG` |
| Operator open list       | `harvestSessions`           | `seasonId`, `status`                                  | `businessDate desc`, `createdAtServer` |
| Operator history/counts  | `harvestSessions`           | `createdBy`, `seasonId`, optionally `status`          | `businessDate`                         |
| Picker session summary   | `harvestSessions`           | `workerId`, `seasonId`                                | `businessDate desc`, `createdAtServer` |
| Picker payments          | `payments`                  | `workerId`, `seasonId`                                | `paidBusinessDate desc`                |
| Admin payment aggregate  | `payments`                  | `seasonId`, `status`                                  | data, `amountGrosz`                    |
| Admin sale aggregates    | `sales`                     | `seasonId`, `status`, `entryType`, optional direction | data, `totalGrosz`, `weightG`          |
| Operator stock aggregate | `operationalStockMovements` | `seasonId`                                            | `weightImpactG`                        |

The exact read budgets and card calculations are documented in
`docs/domain/dashboard-read-strategy.md`.
Fields passed to `sum()` are included in the matching composite index, as
required by the Firestore aggregation index model.

## Stage 8.15 directory and review queries

The manifest also prepares bounded, server-side list queries. Equality filters
form the index prefix. The business date is descending for newest-first lists;
`createdAtServer desc` is the deterministic tie-breaker where the document model
provides it.

| Area                    | Collection        | Equality prefix                               | Order/range                                 | Purpose                                         |
| ----------------------- | ----------------- | --------------------------------------------- | ------------------------------------------- | ----------------------------------------------- |
| Registration review     | `users`           | `registrationStatus`                          | `createdAt desc`                            | Newest pending or rejected accounts             |
| Picker session status   | `harvestSessions` | `workerId`, `status`                          | `businessDate desc`, `createdAtServer desc` | Picker history by active business state         |
| Operator session status | `harvestSessions` | `createdBy`, `status`                         | `businessDate desc`, `createdAtServer desc` | Operator-owned open or review lists             |
| Entry state             | `harvestEntries`  | `sessionId`, `status`                         | none                                        | Active or cancelled entries in one session      |
| Picker entry report     | `harvestEntries`  | `workerId`, `seasonId`                        | `businessDate desc`                         | Explicitly requested cross-session report only  |
| Season payments         | `payments`        | `seasonId`                                    | `paidBusinessDate desc`                     | Payment directory for one season                |
| Payment audit           | `payments`        | `status`                                      | `paidBusinessDate desc`                     | Active/cancelled payment audit                  |
| Active season payments  | `payments`        | `seasonId`, `status`                          | `paidBusinessDate desc`                     | Active documents within a season/date range     |
| Picker season payments  | `payments`        | `workerId`, `seasonId`, optional `status`     | `paidBusinessDate desc`                     | Picker settlement history and active-only views |
| Season sales            | `sales`           | `seasonId`                                    | `businessDate desc`, `createdAtServer desc` | Complete sale directory for a season            |
| Active season sales     | `sales`           | `seasonId`, `status`                          | `businessDate desc`, `createdAtServer desc` | Active/cancelled documents within a date range  |
| Sale document type      | `sales`           | `seasonId`, `entryType`                       | `businessDate desc`, `createdAtServer desc` | Ordinary sale and correction lists              |
| Issue queue             | `issueReports`    | `status`, optionally `seasonId` or `workerId` | `createdAt desc`                            | Open admin queue and scoped issue history       |

Existing indexes additionally cover `seasonId + status + businessDate` for
session lists and aggregates, `workerId + seasonId + businessDate` for picker
dashboards, and `status + updatedAtServer` for synchronization conflicts marked
as `REVIEW_REQUIRED`. Synchronization conflict details are derived from session
state and the local sync journal; there is no separate Firestore conflict
collection.

### Date ranges

Dashboard and directory queries use inclusive lower and upper bounds on the
business-date field (`>= from`, `<= to`). The range field and its direction must
match the corresponding composite index. Aggregates use ascending business-date
indexes; newest-first lists use descending indexes. A season filter remains
mandatory for farm-wide sales, payment and dashboard ranges so one screen does
not scan unrelated seasons.

The cross-session `harvestEntries` index is reserved for an explicit report. A
dashboard must continue to aggregate `harvestSessions` and must not attach a
listener to all entries in a season.

## Deployment

`firebase.json` points Firestore index deployment to
`firestore.indexes.json`. Development and production workflows deploy indexes
with Rules through:

```sh
npm run firebase -- deploy --project "$FIREBASE_PROJECT_ID" --only firestore:rules,firestore:indexes --non-interactive
```

For DEV we deploy indexes after a coherent block or stage, not after every small
package.

Stage 8.15 is an explicit index deployment gate. Deploy only indexes to the
development project and wait until every index reports `READY` before running
the large synthetic data tests from stages 8.16-8.19:

```sh
npm run firebase -- deploy --project borowka-pwa-dev --only firestore:indexes --non-interactive
npm run firebase -- firestore:indexes --project borowka-pwa-dev
```

This gate does not authorize or imply a production deployment.
