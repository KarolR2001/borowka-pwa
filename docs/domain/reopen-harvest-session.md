# Reopen harvest session

Stage 5.15 prepares the domain payload for reopening a closed harvest session.
The Firestore session and entry collections are still not connected, so this
package defines the operation that a later transaction must write atomically.

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

## Source

- `src/harvest/reopenHarvestSession.ts`
- `src/harvest/reopenHarvestSession.test.ts`
