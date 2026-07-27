# Synchronization idempotency

Stage 6.13 defines how retrying the same offline document avoids duplicates.

## Identity

The UUID is generated before the first local save. Reopening a form, pressing a
button twice, restarting the app or retrying synchronization must keep using the
same document ID.

Documents are de-duplicated by `kind:id`, not only by ID, so a session and an
entry with the same textual UUID cannot collapse into one item.

## Retry Classification

For a pending local document, retrying the same UUID is classified as
`RETRY_EXISTING_LOCAL_DOCUMENT`.

For a UUID already confirmed by the server, retry is classified as
`SKIP_ALREADY_CONFIRMED`.

Only an unknown `kind:id` is classified as `NEW_DOCUMENT`.

## Listener Merges

Firestore listeners may emit a local cache snapshot and a server-confirmed
snapshot for the same document. The merge policy keeps one document and prefers
server-confirmed data. If both snapshots are still local, the higher revision or
newer write timestamp wins.

## Validation

Covered by:

- `src/offline/synchronizationIdempotency.test.ts`;
- existing entry-level `src/harvest/harvestEntryIdempotency.test.ts`.
