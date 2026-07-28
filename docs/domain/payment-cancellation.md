# Payment cancellation

Package 7.7 adds the administrator-only online reversal of an active payment.

## Identity and history

Payment IDs are deterministic for the session revision that becomes `PAID`:

`{sessionId}--payment-r{targetSessionRevision}`

Concurrent attempts for the same session revision therefore address one document,
while a payment after cancellation uses the next revision and a new document. The
cancelled payment remains in `payments` and both records stay in history.

## Preconditions

Cancellation requires:

- an active approved administrator;
- an online client and a device ID;
- an active payment linked from a `PAID` source session;
- the source session revision read with the payment details;
- a reason from 3 to 300 characters;
- an explicit confirmation containing the amount and worker.

A revision or payment-link mismatch means that a newer dependent operation exists
and requires a fresh read.

## Atomic write

One Firestore transaction:

- changes the payment from `ACTIVE` to `CANCELLED`;
- records `cancelledAt`, `cancelledBy` and `cancellationReason`;
- changes the source session from `PAID` to `CLOSED`;
- clears `paymentId` and `paidAt`;
- increments the session revision;
- creates immutable `PAYMENT_CANCELLED` audit evidence.

Security Rules reject standalone, partial, non-admin and inconsistent writes.

## Verification

- domain and UI tests cover validation, effects and submitted metadata;
- payment-write regression tests preserve duplicate protection;
- Firestore Rules test atomic cancellation and a second payment after cancellation;
- the integration flow executes payment, cancellation and repayment through the
  current runtime and Rules.
