# Cancel harvest session

Stage 5.16 defines the online cancel operation for a harvest session. Runtime UI
now exposes cancellable open and closed sessions to administrators, requires a
reason, fetches current entries and writes the session update with the audit
event in one client batch.

## Rules

- Only an `ADMIN` can cancel a session.
- The operation requires an online connection.
- The source session can be `OPEN`, `CLOSED` or `REVIEW_REQUIRED`.
- `PAID` sessions and active payment state block cancellation.
- A non-empty reason is required.
- Pending local writes for this session block cancellation.
- Cancellation does not delete or rewrite harvest entries.
- Historical totals, weight and amount remain in the document.
- Reports and stock must exclude cancelled sessions by status.
- `cancelledAt`, `cancelledBy`, `cancellationReason` and `revision` are updated.
- A `HARVEST_SESSION_CANCELLED` audit event is prepared for the same logical
  write.

## Atomic Write Contract

`prepareCancelHarvestSession` returns:

- the cancelled `session`;
- the minimal `sessionUpdate` fields for the write batch;
- the `auditEvent` document;
- the confirmation summary that records historical totals and the reason.

`cancelHarvestSessionOnline` writes the session update and audit event together
through Firestore `writeBatch`. The operation never deletes harvest entries.

## Source

- `src/harvest/cancelHarvestSession.ts`
- `src/harvest/cancelHarvestSession.test.ts`
- `src/harvest/cancelHarvestSessionRuntime.ts`
- `src/harvest/cancelHarvestSessionRuntime.test.ts`
