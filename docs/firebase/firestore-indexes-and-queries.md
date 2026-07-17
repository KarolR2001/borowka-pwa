# Firestore indexes and query patterns

This document maps the stage 4 configuration screens to Firestore queries and
the index manifest deployed from `firestore.indexes.json`.

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

## Planned later-stage query families

PRD section 38 defines additional query families for sessions, entries,
payments and sales. They are intentionally not added to the stage 4 manifest
yet. Add them when the corresponding collections and Firestore calls are
implemented, so the manifest reflects real screens and Rules tests.

Expected future collection names from the PRD:

- `harvestSessions`;
- `harvestEntries`;
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
