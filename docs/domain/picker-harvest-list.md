# Picker harvest list

Package 7.9 adds the `Moje zbiory` tab to the picker workspace.

## Ownership boundary

The list API does not accept a worker identifier from filters or UI state. It
derives `workerId` from the approved active picker profile and always executes:

```text
harvestSessions where workerId == profile.workerId
```

Firestore Rules introduced and tested in package 7.8 enforce the same
constraint. Foreign or unfiltered reads remain denied, and no write permission
is added.

## List and filters

The initial result is sorted by business date from newest to oldest. Client-side
filters cover:

- season;
- inclusive start and end business dates;
- `OPEN`, `CLOSED`, `PAID`, `CANCELLED`, and `REVIEW_REQUIRED`.

Each row shows the business date, season, plan, quantity units when the plan is
quantity-based, weight, official amount when available, session/payment state,
and a details action. The details action opens a session summary without
exposing notes or data from another worker.

## Synchronization state

The list receives account-scoped local synchronization metadata from the
application shell. It shows a synchronization label only for an actionable
state:

- pending or locally saved;
- rejected;
- changed on another device.

Synced sessions and sessions without local metadata do not receive redundant
status text. The whole list is marked as offline data when either required
Firestore snapshot comes from cache.

Physical Android and iOS verification remains `SKIPPED`. This package does not
perform a deploy.
