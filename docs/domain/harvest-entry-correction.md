# Harvest entry correction

Stage 5.11 records the correction model before session close. The domain model
is backed by runtime admin cancellation for confirmed entries.

## Decision

The correction model follows the PRD recommendation:

- a local pending entry can be updated in place;
- a confirmed entry is not edited directly;
- a confirmed entry is corrected by cancelling the original and creating a new
  replacement entry;
- history remains available;
- only active entries should be included by later totals.

## Local pending entry

An entry can be updated in place when:

- the session is `OPEN`;
- the entry belongs to the session;
- the entry is `ACTIVE`;
- the entry is still pending synchronization;
- the operation is performed on the session device;
- the actor is `ADMIN` or the operator who created the entry.

The update preserves the original UUID, sequence number, author and device.

## Confirmed entry

A confirmed entry can be corrected only by an administrator. The operation
requires:

- an `OPEN` session;
- the session device;
- an active original entry;
- a cancellation reason;
- a new UUID and sequence number for the replacement entry.

The cancelled entry keeps the original history and the replacement entry stores
`replacesEntryId`.

Runtime cancellation of a confirmed entry is online-only and available only to
an active administrator. It writes a controlled `harvestEntries` update with
`status: CANCELLED`, `cancellationReason`, `cancelledBy`, `cancelledAtServer`
and an incremented `revision`. The same batch appends `HARVEST_ENTRY_CANCELLED`
to audit events. A closed session must be reopened first, and a paid session
requires payment cancellation before entry correction.

## Validation

Corrected values are checked against the session snapshots:

- quantity must be positive and match `quantityPrecisionSnapshot`;
- required weight must be present and positive;
- `WEIGHT` sessions require quantity and weight to match.

## Source

- `src/harvest/harvestEntryCorrection.ts`
- `src/harvest/harvestEntryCorrection.test.ts`
- `src/harvest/cancelHarvestEntryRuntime.ts`
- `src/harvest/cancelHarvestEntryRuntime.test.ts`
