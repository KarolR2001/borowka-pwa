# PWA update recovery

Package 6.28 verifies that a waiting PWA update cannot replace version A before
its offline work is synchronized and confirmed on the server.

## Recovery baseline

Before synchronization, the verifier records a versioned baseline containing:

- source version A and target version B;
- creation time;
- every unique pending document as a `kind:id` pair.

The baseline covers harvest sessions, harvest entries and audit events. It does
not copy domain payloads and does not replace the existing local recovery
export. Its purpose is to compare the exact identity set across the update.

## Activation gate

Version B can be activated only when all conditions are true:

- a waiting update is available;
- synchronization finished with `SUCCESS`;
- the local journal contains no pending, rejected or remotely changed data;
- the existing PWA safe-moment policy has no active form or session blocker;
- every document from the version A baseline exists exactly once in the server
  confirmation.

Missing and duplicated document keys are reported separately. A blocked gate
does not clear the journal, update intent, Firestore cache or IndexedDB data.

## Completion check

After activation, the completion check requires:

- a ready activation gate;
- the active application version to equal target version B.

The existing post-update integrity check still validates device identity,
local document presence and schema migrations. The recovery verifier adds the
cross-version server confirmation needed by package 6.28.

## Automated scenario

The Firestore integration test creates a closed offline session in version A
with three entries and five audit events. Nine unique journal documents block
the waiting update. After synchronization, the test reads the session, entries
and audit IDs from Firestore, confirms the same nine identities, verifies three
unique entry IDs and activates logical version B.

This deterministic scenario does not deploy Hosting and does not replace the
deferred physical Android and iOS update tests.
