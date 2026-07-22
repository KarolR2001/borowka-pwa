# Harvest operation audit

Stage 5.17 defines the MVP audit contract for harvest sessions and entries.
The audit is operational and append-only through Security Rules, but it is not a
legally immutable register.

## Session actions

- `HARVEST_SESSION_CREATED` records a new session draft.
- `HARVEST_SESSION_CLOSED` records the first official close.
- `HARVEST_SESSION_RECLOSED` records a later close after an earlier transition.
- `HARVEST_SESSION_REOPENED` records admin reopen with a reason.
- `HARVEST_SESSION_CANCELLED` records admin cancellation with a reason.
- `HARVEST_SESSION_MARKED_REVIEW_REQUIRED` records a review hold with a reason.
- `HARVEST_SESSION_REVIEW_RESOLVED` records explicit review resolution with a
  reason.

## Entry actions

- `HARVEST_ENTRY_CREATED` records a new harvest entry when entry-level audit is
  required.
- `HARVEST_ENTRY_CANCELLED` records cancellation of an existing entry with a
  reason.

Correction of a confirmed entry is represented as two audit events:

1. `HARVEST_ENTRY_CANCELLED` for the original entry.
2. `HARVEST_ENTRY_CREATED` for the replacement entry with `replacesEntryId`.

## Summary keys

Session summaries use Rules-compatible keys:

- `status`, `seasonId`, `workerId`, `businessDate`;
- `planId`, `rateVersionId`, `rateGroszPerUnit`;
- `totalEntryCount`, `totalQuantityMilli`, `totalWeightG`;
- `amountDueGrosz`, `calculationVersion`, `closedBy`, `paymentId`, `revision`.

Entry summaries use:

- `entryId`, `sessionId`, `seasonId`, `workerId`, `businessDate`;
- `status`, `sequenceNumber`, `quantityMilli`, `weightG`, `pendingSync`;
- `createdBy`, `createdDeviceId`, `replacesEntryId`, `cancelledBy`.

## Current boundary

Runtime session opening writes `HARVEST_SESSION_CREATED` in the same client batch
as `harvestSessions`. Runtime entry creation writes `HARVEST_ENTRY_CREATED` in
the same client batch as `harvestEntries`. Runtime session close writes
`HARVEST_SESSION_CLOSED` or `HARVEST_SESSION_RECLOSED` in the same client batch
as the official `harvestSessions` close update. Runtime session reopen writes
`HARVEST_SESSION_REOPENED` in the same client batch as the `harvestSessions`
reopen update. Runtime session cancel writes `HARVEST_SESSION_CANCELLED` in the
same client batch as the `harvestSessions` cancel update and leaves entries
historical. Security Rules allow operators to append harvest operation audit
events for their operational actions, but audit reads remain admin-only.
