# Offline close harvest session

Stage 6.8 defines the domain contract for closing an open harvest session while
the device is offline.

## Contract

`prepareOfflineHarvestSessionClose` performs the close calculations that can be
trusted locally:

- requires explicit confirmation of the summary;
- allows only active `ADMIN` and `OPERATOR` profiles;
- allows an operator to close only their own session;
- uses the shared trusted close totals calculator;
- blocks empty sessions and invalid weight totals;
- writes local `status: CLOSED`;
- stores `closedAtDevice` and leaves `closedAtServer` and `updatedAtServer` as
  `null`;
- increments the local revision;
- returns audit before/after summaries for later sync/audit persistence.

## Local State

The result is marked as `LOCAL_CLOSED_PENDING_SYNC`. Entries are locked locally,
payment is unavailable and `amountDueGrosz` is only
`PENDING_SERVER_CONFIRMATION` until the server accepts the close.

`pendingWriteCount` counts the session close update plus pending entry writes.
This supports the offline flow where one local session and ten local entries
should be presented as eleven logical pending writes after close.

## Server Recheck

After synchronization the app must recheck profile permissions, session status,
season state, rate version and calculation version. A conflict must lead to a
review path such as `REVIEW_REQUIRED`, never to silent rejection or silent
recalculation.

## Validation

Covered by `src/offline/offlineHarvestSessionClose.test.ts`.
