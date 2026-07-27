# Pending write metadata

Stage 6.9 defines the presentation model for local and server synchronization
metadata.

## Inputs

The model accepts both Firestore snapshot metadata and app-owned metadata:

- Firestore `hasPendingWrites`;
- Firestore `fromCache`;
- app `pendingSync`;
- app `savedLocally`;
- rejected write reason;
- remote change marker and device IDs;
- last local write time;
- last successful sync time.

The app must not promise synchronization only because the browser reports
network access. A document is treated as synchronized only when there is no
pending write, no local-only marker, no rejection and no remote-change marker.

## Statuses

`evaluateSyncDocumentMetadata` returns one of:

- `LOCAL_SAVED` - accepted locally, but Firestore queue metadata has not yet
  confirmed the pending write;
- `PENDING_SYNC` - Firestore or the domain model reports a local write waiting
  for server confirmation;
- `SYNCED` - no pending or rejected local state is known;
- `REJECTED` - synchronization failed and requires intervention;
- `REMOTE_CHANGED` - another device changed the document and the UI must force a
  fresh read/review.

Rejected writes have the highest priority. Remote changes win over pending
metadata. Pending writes win over local-only saved state.

## Summary

`summarizeSyncDocumentMetadata` returns counts for the synchronization center:

- locally saved documents;
- pending documents;
- synchronized documents;
- rejected documents;
- documents changed on another device;
- actionable errors;
- latest successful sync timestamp.

Full synchronization center layout and actions are handled in Stage 6.10.

## Validation

Covered by `src/offline/pendingWriteMetadata.test.ts`.
