# Reopen harvest session

Stage 5.15 defines the online reopen operation for a closed harvest session.
Runtime UI now exposes closed sessions to administrators, requires a reason,
shows the previous official amount, fetches current entries and writes the
session update with the audit event in one client batch.

## Rules

- Only an `ADMIN` can reopen a session.
- The operation requires an online connection.
- The source session must be `CLOSED`.
- Active payment state blocks reopening.
- A non-empty reason is required.
- Pending local writes for this session block reopening.
- The current official amount is shown before confirmation.
- The user is warned that reports may change.
- The current session status returns to `OPEN`.
- `amountDueGrosz` is cleared to `null` so the reopened session requires a new
  close calculation.
- The previous official amount remains in the audit `beforeSummary`.
- Close metadata is cleared from the current session state.
- `revision` increments.
- A `HARVEST_SESSION_REOPENED` audit event is prepared for the same logical
  write.

## Atomic Write Contract

`prepareReopenHarvestSession` returns:

- the reopened `session`;
- the minimal `sessionUpdate` fields for the write batch;
- the `auditEvent` document;
- the confirmation summary with previous official amount and report warning.

`reopenHarvestSessionOnline` writes the session update and audit event together
through Firestore `writeBatch`.

## Source

- `src/harvest/reopenHarvestSession.ts`
- `src/harvest/reopenHarvestSession.test.ts`
- `src/harvest/reopenHarvestSessionRuntime.ts`
- `src/harvest/reopenHarvestSessionRuntime.test.ts`
