# Harvest Security Rules

Stage 5.18 adds initial Firestore Rules for `harvestSessions` and
`harvestEntries`.

## Session rules

- `ADMIN` and `OPERATOR` can create `OPEN` sessions.
- `PICKER` cannot create sessions.
- A normal created session must point to an open season and an active worker.
- The worker snapshot name must match the current worker document at creation.
- Initial totals must be zero, `amountDueGrosz` must be `null`, and `revision`
  must be `1`.
- `OPERATOR` and `ADMIN` can close an `OPEN` session.
- Only `ADMIN` can reopen a `CLOSED` unpaid session.
- Only `ADMIN` can cancel `OPEN`, `CLOSED`, or `REVIEW_REQUIRED` unpaid
  sessions.
- Hard delete is forbidden.

## Entry rules

- `ADMIN` and `OPERATOR` can create active entries.
- Entries must match an existing open session by `sessionId`, `seasonId`,
  `workerId`, and `businessDate`.
- An operator can add entries only to a session created by that operator.
- Entry author must equal the authenticated user.
- Quantities must be positive; weight can be `null` or positive.
- Only `ADMIN` can cancel an active entry.
- Hard delete is forbidden.

## Picker reads

Picker reads are allowed only when document `workerId` equals the picker's
profile `workerId`. Firestore still requires filtered client queries; an
unfiltered list that could return another worker's data is rejected.

## Rules limit boundary

Firestore Rules have a strict expression limit. Creation rules validate the
expected document shape. Status updates intentionally validate the transition,
the changed fields, and `diff().affectedKeys().hasOnly(...)` instead of
rechecking every immutable snapshot field. Full transaction wiring and deeper
cross-document consistency remain outside this Rules package.
