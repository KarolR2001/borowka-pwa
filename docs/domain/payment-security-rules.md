# Payment Security Rules

Package 7.15 makes the Firestore boundary authoritative for payment privacy,
identity, creation, cancellation and retention.

## Read boundary

- Anonymous users and operators cannot read payment documents or lists.
- An active approved administrator can read all payments.
- An active approved picker can read only documents whose `workerId` equals the
  `workerId` in the authenticated profile. Picker list queries must carry that
  constraint.

## Create boundary

Only an active approved administrator can create a payment. The write must be
atomic with the source session transition from `CLOSED` to `PAID` and the
immutable audit event.

The payment ID is:

`{sessionId}--payment-r{targetSessionRevision}`

Rules derive the expected value from the resulting session revision. They also
require string identifiers for the session, season and worker, a string worker
snapshot, an integer amount equal to the session amount, and an existing source
session.

## Mutation boundary

An accepted payment cannot be edited or deleted. The only update is an atomic
administrator cancellation that changes exactly `status`, `cancelledAt`,
`cancelledBy` and `cancellationReason`, restores the session to `CLOSED`, and
creates the matching cancellation audit event. The amount and ownership
snapshots remain immutable.

## Test matrix

`tests/rules/firestore-payments.test.ts` contains positive and negative cases
for:

1. anonymous reads;
2. picker ownership;
3. operator reads and creates;
4. active administrator creation;
5. payment identity;
6. amount and ownership field types;
7. existing `CLOSED` source session;
8. amount immutability;
9. cancellation field allowlist;
10. hard-delete denial and document retention.
