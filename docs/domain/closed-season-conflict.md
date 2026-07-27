# Closed season conflict after offline work

Stage 6.15 defines what happens when a harvest session was created or closed
offline and the season was closed before the device synchronized.

## Rule

The session and entries are never deleted automatically. The synchronization
runtime must not silently append a session into a closed season.

If the current season is still open and covers the session business date, the
session can continue through the normal synchronization flow.

If the season is closed, archived, or no longer covers the business date, the
session is preserved and must enter `REVIEW_REQUIRED`.

## User Message

The user-facing message must answer:

- the session is still saved locally;
- the season changed while the device was offline;
- an administrator decision is required.

## Administrator Decisions

The available review decisions are:

- `REOPEN_SEASON`;
- `MOVE_TO_OPEN_SEASON`, only when an open season covers the business date;
- `CANCEL_SESSION`.

Every decision must be audited. Payments stay blocked until review is resolved
and the final session is confirmed in the cloud.

## Validation

Covered by `src/offline/closedSeasonConflict.test.ts`.
