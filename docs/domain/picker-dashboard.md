# Picker dashboard

Package 7.8 introduces the private picker summary. The dashboard is available
only to an approved active `PICKER` profile with a non-empty `workerId`.

## Read boundary

The runtime always constrains harvest session and payment queries with:

```text
workerId == profile.workerId
```

Firestore Rules enforce the same ownership condition and reject unfiltered or
foreign queries. A picker can read only the worker document linked to their
account. Season metadata is readable because it is required to navigate current
and historical own summaries. No picker write permission is added.

## Aggregation

For the selected season:

- total weight uses `OPEN`, `CLOSED`, and `PAID` sessions;
- accrued amount uses official `amountDueGrosz` from `CLOSED` and `PAID`
  sessions;
- paid amount uses only `ACTIVE` payment documents;
- remaining amount is accrued minus paid;
- status counters show `OPEN`, `CLOSED`, and `PAID` separately;
- `CANCELLED` and `REVIEW_REQUIRED` sessions are excluded from totals.

Quantity totals are shown only for plans whose calculation basis snapshot is
`QUANTITY`. They remain separated by plan, unit label, and precision so
incompatible units are never combined.

## Offline state

An online read uses normal Firestore reads and derives the source from snapshot
metadata. An offline read uses cache-only APIs. If any required snapshot comes
from cache, the entire dashboard is marked `CACHE` and the UI displays an
offline-data warning. The dashboard also records the completion time of each
successful refresh.

Physical Android and iOS verification remains `SKIPPED` until a device is
available. Firestore Rules and integration tests use the local Firestore
emulator and do not use ADB.
