# Safe PWA update

Stage 6.22 replaces automatic service-worker activation with an explicit update
decision. A new application version may download in the background, but it
cannot reload the page until the current work is safe.

## Background lifecycle

`vite-plugin-pwa` uses `registerType: "prompt"`. The registered worker checks
for updates when:

- the browser discovers a new service-worker version;
- connectivity returns;
- the PWA regains focus;
- the hourly background check runs while online.

The waiting worker remains downloaded until the user applies or defers it.

## Safe-moment gate

The update action is blocked by any of the following:

- an active or changed form;
- an open harvest session, including a locally cached `OPEN` session;
- local documents in `LOCAL_SAVED`, `PENDING_SYNC`, `REJECTED` or
  `REMOTE_CHANGED`.

The application lists every blocker and never reloads automatically. The user
may defer the prompt and return to it after the form, session and
synchronization queue are resolved.

## Preserved local state

Applying an update activates only the waiting service worker. It does not call
the configuration-cache clear API, the synchronization-data clear API or any
Firestore persistence clear operation.

Before activation, the application stores a versioned update intent containing:

- current application and schema versions;
- device ID and account UID;
- update request time;
- all currently known local document UUIDs.

This marker is separate from Firestore cache and domain IndexedDB data.

## Schema migration

Post-update integrity accepts a migration registry. When the previous and
current schema versions differ, migrations run as an explicit chain from the
recorded schema to the current schema. Missing, cyclic or failed migration
paths produce `REVIEW_REQUIRED`; local data is retained.

## Post-update integrity

After the updated client starts and account-scoped local data has been read, it
checks:

- stable device identity;
- presence of every recorded local document UUID;
- completion of the schema migration chain.

A successful report clears the intent marker. Any issue remains visible and
keeps the marker for investigation. A blocked account is allowed to load its
local documents for this inspection without starting synchronization.
