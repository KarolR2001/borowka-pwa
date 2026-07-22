# Close harvest session online

Stage 5.14 defines the online close operation for `harvestSessions`. Runtime UI
now fetches the current session, its entries and required configuration from
Firestore, recalculates official totals from entries, and writes the session
update with the audit event in one client batch.

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
- the minimal `sessionUpdate` fields for the write batch;
- the `auditEvent` document;
- the trusted totals used for the official amount;
- the confirmation summary that should be shown before the user confirms.

`closeHarvestSessionOnline` writes the session update and audit event together
through Firestore `writeBatch`. A partial write must not leave the session
payable without the audit event and official totals.

## Source

- `src/harvest/closeHarvestSession.ts`
- `src/harvest/closeHarvestSession.test.ts`
- `src/harvest/closeHarvestSessionRuntime.ts`
- `src/harvest/closeHarvestSessionRuntime.test.ts`
