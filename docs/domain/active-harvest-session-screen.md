# Active harvest session screen

Date: 2026-07-17

This document records the stage 5.4 screen contract for an active
`harvestSessions` document. The screen is rendered by a presentational React
component, and the operator dashboard now adapts Firestore `harvestSessions` and
`harvestEntries` documents into that view model.

## Required visible data

The screen shows:

- worker name;
- business date;
- season name;
- settlement plan;
- rate;
- session status;
- online/offline status;
- active entry count;
- quantity total;
- kilogram total;
- estimated amount while the session is `OPEN`;
- pending write count;
- latest entry;
- creator and device;
- entry list;
- add-entry action;
- close-session action.

## Interaction rules

- Actions are available only for an `OPEN` session.
- Current stage 5 online flow disables actions while offline.
- Close action is disabled for an empty session.
- A status notice can block the screen when synchronization reports that the
  session changed elsewhere.
- Entries are displayed by newest sequence number first.
- Entries with the same UUID are displayed once; server-confirmed data replaces
  the pending local snapshot for display.
- The add-entry action opens the runtime entry form for the selected session.
  The form writes online through `harvestEntryRuntime` and refreshes the selected
  dashboard view after a successful write.
- Stage 5.10 entry row details and actions are maintained in
  `docs/domain/harvest-entry-list.md`.
- The runtime operator dashboard recalculates the visible active totals from
  entries, because entries remain the source of truth before official close.

## Code reference

- `src/harvest/ActiveHarvestSessionPanel.tsx`
- `src/harvest/ActiveHarvestSessionPanel.test.tsx`
- `src/harvest/OperatorHarvestSessionsPanel.tsx`
- `src/harvest/OperatorHarvestSessionsPanel.test.tsx`
- `src/harvest/harvestSessionDashboard.ts`
- `src/harvest/harvestSessionDashboard.test.ts`
- `src/harvest/harvestEntryRuntime.ts`
- `src/harvest/harvestEntryRuntime.test.ts`
