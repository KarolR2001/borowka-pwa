# Cancel harvest session

Stage 5.16 prepares the domain payload for cancelling a harvest session. The
Firestore session and entry collections are still not connected, so this
package defines the operation that a later transaction must write atomically.

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

## Source

- `src/harvest/cancelHarvestSession.ts`
- `src/harvest/cancelHarvestSession.test.ts`
