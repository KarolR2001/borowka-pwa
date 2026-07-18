# Harvest entry list

Stage 5.10 extends the active session entry list. The list is still a
presentational contract: it receives entries for one session and does not fetch
the whole season.

## Required row data

Each visible row can show:

- entry sequence number;
- technical UUID;
- quantity formatted with the session precision snapshot;
- weight or `brak`;
- created time label;
- preview amount or `brak`;
- author when the view model supplies it;
- synchronization state;
- active or cancelled status;
- correction marker when the view model supplies it.

## Actions

The row renders edit and cancellation actions only when the view model marks the
entry as allowed:

- `canEdit` shows the local correction action;
- `canCancel` shows the admin cancellation action.

Action handlers receive the entry UUID. Permission decisions stay outside this
presentational component and must be derived from the authenticated profile and
entry/session state before rendering.

## Large sessions

The list is a bounded scroll area and keeps entries scoped to the current
session. It must not maintain a listener for all entries in the whole season.

## Source

- `src/harvest/ActiveHarvestSessionPanel.tsx`
- `src/harvest/ActiveHarvestSessionPanel.test.tsx`
