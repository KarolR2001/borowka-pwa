# Transactional payment write

Package 7.4 finalizes an eligible payment as one online Firestore transaction.
The transaction reads the current session revision and reserved payment ID
before writing:

- `payments/{sessionId}` with the worker, season and official amount snapshots;
- the source session as `PAID`, with `paymentId`, `paidAt` and incremented
  revision;
- `auditEvents/payment-created-{sessionId}` with action
  `HARVEST_SESSION_PAID`.

The transaction rejects a stale revision, a non-`CLOSED` session, an occupied
payment ID, a changed official amount or mismatched worker and season snapshots.
The payment amount cannot be edited by the administrator.

## Server confirmation

Payments cannot be finalized offline. A successful UI result is shown only
after the transaction resolves and fresh server reads confirm all three
documents. A local pending write is never treated as completion.

If the transaction response is lost, the runtime reads the deterministic
payment, session and audit IDs from the server. A complete matching state is
reported as `SERVER_RECONCILIATION`. If the server cannot be reached, the UI
reports an uncertain result and requires refreshing the payment list after
connectivity returns.

## Security Rules

Rules use `getAfter` to require the payment and `PAID` session transition in the
same atomic write. The payment also requires its deterministic audit event.
Only an active approved administrator can create the immutable `ACTIVE`
payment. Standalone writes, operators, changed snapshots, changed amounts,
updates and deletes are denied.
