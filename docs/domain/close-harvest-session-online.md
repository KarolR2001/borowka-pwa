# Close harvest session online

Stage 5.14 prepares the online close operation for `harvestSessions`. The app
does not yet have connected Firestore collections for sessions and entries, so
this package defines the atomic domain payload that the later transaction must
write as one logical operation.

## Rules

- Closing requires an online actor with the `ADMIN` or `OPERATOR` role.
- The user must confirm the close summary.
- Pending local writes block the online official close.
- The current session document must still be `OPEN`.
- The season must match the session and remain `OPEN`.
- The worker must match the session and remain active.
- The fetched rate version must match the session snapshot.
- Active entries are recalculated through `harvestSessionTrustBoundary.ts`.
- Empty sessions are rejected.
- Missing weight in weight sessions is rejected by the shared calculator.
- The result updates status to `CLOSED`, writes official totals, stores close
  timestamps, sets `closedBy` and increments `revision`.
- The result includes one `HARVEST_SESSION_CLOSED` audit event for the same
  logical write.

## Atomic Write Contract

`prepareCloseHarvestSessionOnline` returns:

- the full closed `session`;
- the minimal `sessionUpdate` fields for a transaction;
- the `auditEvent` document;
- the trusted totals used for the official amount;
- the confirmation summary that should be shown before the user confirms.

Later Firestore integration must write the session update and audit event
together. A partial write must not leave the session payable without the audit
event and official totals.

## Source

- `src/harvest/closeHarvestSession.ts`
- `src/harvest/closeHarvestSession.test.ts`
