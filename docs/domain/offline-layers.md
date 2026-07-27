# Offline layers

Stage 6.1 separates two offline layers that must not be treated as the same
state.

## Application availability

The PWA service worker is responsible for loading the app shell when the device
has no network. This layer covers:

- start screen;
- navigation;
- session and entry forms;
- synchronization center;
- emergency messages;
- visible app version.

When this layer is ready, the app can start from cached files. It does not prove
that domain data required for field work is present.

## Data durability

The data layer covers local domain snapshots and Firestore synchronization
state. The UI distinguishes:

- data available from cache;
- local writes waiting for synchronization;
- server-confirmed data;
- rejected writes;
- stale data that may need a refresh or conflict handling.

The first runtime implementation evaluates configuration data readiness. Later
offline packages will extend the same model with session drafts, entry writes
and synchronization conflicts.

## Overall status

The synchronization center reports:

- `READY` only when PWA files and domain data are both ready;
- `PARTIAL` when only one layer is ready or data has pending writes;
- `NOT_READY` when neither layer can support offline field work.

## Source

- `src/offline/offlineReadiness.ts`
- `src/offline/offlineReadiness.test.ts`
- `src/offline/ConfigurationCachePanel.tsx`
