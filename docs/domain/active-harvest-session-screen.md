# Active harvest session screen

Date: 2026-07-17

This document records the stage 5.4 screen contract for an active
`harvestSessions` document. The first implementation is a presentational React
component with explicit input data. Runtime Firestore loading is left for the
later persistence packages.

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

## Code reference

- `src/harvest/ActiveHarvestSessionPanel.tsx`
- `src/harvest/ActiveHarvestSessionPanel.test.tsx`
