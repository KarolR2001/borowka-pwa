# Picker payment list

Package 7.11 adds the `Moje wyplaty` tab to the private picker workspace.

## Ownership boundary

The API derives `workerId` only from an active, approved `PICKER` profile. The
payment and source-session reads always use:

```text
payments where workerId == profile.workerId order by paidBusinessDate desc
harvestSessions where workerId == profile.workerId order by businessDate desc
```

The payment query has a matching composite index. Production Firestore Rules
accept the own-worker query and reject unfiltered or foreign-worker reads. No
picker write permission is added.

The presentation model excludes payment and session notes, actor identifiers,
device identifiers, cancellation metadata, audit fields and data belonging to
another worker.

## List and period

The list shows active and cancelled payments with:

- payment and source-session dates;
- season;
- amount;
- payment method;
- explicit status;
- a details action for the source session.

Filters cover season, source-session date range and payment status. Using the
source-session date keeps accrued, paid and remaining values on the same period
boundary. A missing or inconsistent source session remains visible as a data
warning, but its details action is disabled.

## Summary rules

For the selected season and source-session period:

- accrued uses official amounts of `CLOSED` and `PAID` sessions;
- paid uses only `ACTIVE` payment documents;
- remaining equals accrued minus paid;
- cancelled payments remain visible and have a separate count and amount;
- cancelled amounts never increase the paid total.

The status filter narrows the history table without changing these period
totals, so active and cancelled amounts remain directly comparable.

The tab reuses package 7.10 session details for navigation to the source
session. Cached data is explicitly marked as potentially stale. Full picker
offline behavior remains in package 7.13.

Physical Android and iOS verification remains `SKIPPED`. This package does not
perform a deploy.
