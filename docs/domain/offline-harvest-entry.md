# Offline harvest entry

Stage 6.7 defines the domain contract for adding an entry to an open harvest
session without waiting for the network.

## Contract

`prepareOfflineHarvestEntry` receives the current session and local entry list,
then:

- reserves the entry UUID and sequence number before preparing the document;
- uses the same quantity, weight, role and session validation as online entry
  creation;
- creates an `ACTIVE` `HarvestEntryDocument` with `pendingSync: true`;
- stores `createdAtServer: null` because the server has not confirmed the write;
- returns entries sorted by `sequenceNumber`;
- returns `sessionWithLocalTotals` so the UI can update totals immediately;
- returns `readyForNextEntry: true` so the caller can reset the form without
  waiting for Firestore;
- returns `pendingEntryCount` and `pendingWriteCount` for sync status display.

`pendingWriteCount` is logical, not a Firestore metadata read. It counts pending
entry documents and also counts the session document when the session was itself
created locally with `createdAtServer: null`.

## Idempotency

If the caller retries with an entry UUID already present in the local list, the
helper returns `RETRY_EXISTING` and does not append another document. This keeps
the UUID as the primary duplicate protection, while the UI can still block
double-clicks during local write preparation.

## Scope

This package does not persist the entry to Firestore and does not implement
entry correction or deletion. Those remain separate offline synchronization
increments.

## Validation

Covered by `src/offline/offlineHarvestEntry.test.ts`.
