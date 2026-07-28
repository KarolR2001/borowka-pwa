# Payment idempotency

Package 7.5 prevents a second active payment for the same harvest session and
distinguishes the accepted write from a competing attempt.

## Identity and ownership

The payment document ID is always the session ID:
`payments/{sessionId}`. A client cannot choose another UUID for the same
session. The session points back to that ID and the deterministic audit event is
`auditEvents/payment-created-{sessionId}`.

New clients also write a unique `creationAttemptId`. It identifies the exact
submit invocation, not the user or device. A fresh server read is reported as
the current client's confirmation only when the payment payload, creator,
session revision and attempt ID all match. The field is optional in Security
Rules so the immediately preceding client schema remains accepted.

## Required scenarios

| Scenario                                | Expected behavior                                                                                                                                     |
| --------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| Fast double click                       | A synchronous form lock starts before the first await, so only one call reaches Firestore.                                                            |
| Retry after a network error             | The same invocation reconciles its attempt from fresh server reads. A later submit uses a new attempt ID and reads an existing payment as a conflict. |
| Two browser tabs                        | Firestore accepts one transaction. The other tab reads `ALREADY_PAID`; only one payment and one audit exist.                                          |
| Two administrators or devices           | Exactly one administrator becomes `createdBy`. The other receives that author and the server timestamp.                                               |
| Stale PWA state after payment elsewhere | The reserved document already exists, so no second write is attempted. The client refreshes the list and shows who and when paid.                     |

## User-visible result

`CONFIRMED` means the server state belongs to the current creation attempt.
`ALREADY_PAID` means another accepted attempt already owns the session. The
conflict is a warning, not a second success. Its message uses the
`Europe/Warsaw` time zone and the panel reloads the pending-payment list.

If the server cannot prove either state, the runtime returns an uncertain error
instead of claiming success.

## Verification

- `paymentWrite.test.ts` covers response-loss reconciliation and conflict data.
- `PaymentConfirmationForm.test.tsx` covers the fast-submit lock and warning.
- `AdminPendingPaymentsPanel.test.tsx` covers refresh after a conflict.
- `payment-write.test.ts` on Firestore Emulator covers two tabs, two
  administrators and stale state.
- `firestore-payments.test.ts` covers the attempt field and compatibility with
  the preceding payload schema.
