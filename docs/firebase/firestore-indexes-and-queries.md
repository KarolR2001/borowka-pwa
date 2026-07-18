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

## Planned later-stage query families

PRD section 38 defines additional query families for sessions, entries,
payments and sales. Harvest session and entry families are now represented in
the manifest. Add payments and sales indexes when the corresponding collections
and Firestore calls are implemented, so the manifest reflects real screens and
Rules tests.

Expected future collection names from the PRD:

- `payments`;
- `sales`.

## Deployment

`firebase.json` points Firestore index deployment to
`firestore.indexes.json`. Development and production workflows deploy indexes
with Rules through:

```sh
npm run firebase -- deploy --project "$FIREBASE_PROJECT_ID" --only firestore:rules,firestore:indexes --non-interactive
```

For DEV we deploy indexes after a coherent block or stage, not after every small
package.
