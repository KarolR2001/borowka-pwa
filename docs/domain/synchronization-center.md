# Synchronization center

Stage 6.10 expands the synchronization center from configuration-cache status
into an operational offline/sync view.

## Visible State

The center shows:

- browser connection state;
- offline readiness indicator;
- number of local changes;
- sessions with pending or problematic documents;
- last successful synchronization timestamp;
- last synchronization error;
- app version;
- current device ID.

Pending session rows show worker name, business date, business status, local
entry count, confirmed entry count, pending document count, last error and the
next safe action.

## Actions

The center includes:

- `Synchronizuj teraz` for explicit retry when the sync runtime is available;
- configuration refresh through the existing offline preparation action;
- `Eksport awaryjny`, producing a JSON payload with summary and pending session
  details.

The regular UI does not expose a simple "delete all pending writes" action.
Clearing configuration cache remains separate from pending harvest writes.

## Safety Instructions

When synchronization has errors, the center tells the user not to clear browser
data, sign out, or pay sessions that are still local/pending. This protects
offline work before the later conflict resolution packages are implemented.

## Validation

Covered by:

- `src/offline/syncCenter.test.ts`;
- `src/offline/ConfigurationCachePanel.test.tsx`.
