# Archived configuration conflict after offline work

Stage 6.16 defines what happens when a worker or settlement plan is archived
after an offline session was started.

## Existing Offline Session

The existing session snapshot remains the source of historical context:

- worker snapshot is preserved;
- plan snapshot is preserved;
- entries are not deleted;
- payment stays blocked when review is required.

If the archived configuration can be accepted by an approved historical rule,
the session may continue with the stored snapshot. That acceptance must be
audited.

If review is required, the session should move to `REVIEW_REQUIRED`.

## New Session Attempt

A new session cannot be opened with archived or missing worker/plan
configuration. This is different from a session that already exists locally from
before the archive.

## Administrator Decisions

For existing offline sessions, the available decisions are:

- `ACCEPT_HISTORICALLY`;
- `REACTIVATE_WORKER`, when the worker is archived;
- `REACTIVATE_PLAN`, when the plan is archived;
- `CANCEL_SESSION`.

Missing references can still be accepted historically or cancelled, but cannot
be reactivated by this contract.

## Validation

Covered by `src/offline/archivedConfigurationConflict.test.ts`.
