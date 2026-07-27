# Offline readiness indicator

Stage 6.4 adds the operational readiness indicator for offline work and
synchronization.

## Statuses

The indicator has explicit states:

- `ONLINE_SYNCED` - browser is online, required offline data is ready and there
  are no pending local writes;
- `ONLINE_PENDING_WRITES` - browser is online, but local writes still wait for
  synchronization;
- `OFFLINE_READY` - browser is offline, and both the PWA files and domain data
  are ready;
- `OFFLINE_MISSING_DATA` - required app files, domain data or cache confirmation
  are missing;
- `SYNC_ERROR` - the latest cache/sync read failed or rejected writes are present;
- `REAUTH_REQUIRED` - the app cannot confirm the current account/profile state.

## Decision rules

The status is not based only on browser connectivity. It also uses:

- application/data layer readiness from Stage 6.1;
- pending write count;
- rejected writes/synchronization errors;
- account confirmation state;
- last confirmed Firestore contact from the prepared local snapshot.

Account reconfirmation wins over other states. Synchronization errors win over
ordinary readiness. Pending writes are shown separately from a fully synchronized
online state.

## Code reference

- `src/offline/offlineReadinessIndicator.ts`
- `src/offline/offlineReadinessIndicator.test.ts`
- `src/offline/ConfigurationCachePanel.tsx`
- `src/offline/ConfigurationCachePanel.test.tsx`
