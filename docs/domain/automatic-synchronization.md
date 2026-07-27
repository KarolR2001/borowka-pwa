# Automatic synchronization triggers

Stage 6.11 defines when the application asks the synchronization runtime to
process local data. It does not define the business write ordering; that remains
in Stage 6.12.

## Triggers

Synchronization is requested after:

- first ready account on application start;
- regaining browser connectivity;
- window focus or visible PWA activation;
- manual `Synchronizuj teraz`;
- logging in to an account that has local data on the device.

Automatic triggers run only when the active account has local data. Manual retry
may ask the runtime even before local metadata has been refreshed, so the user
can force a safe check from the synchronization center.

## Gates

The trigger policy blocks synchronization when:

- the account profile is not ready;
- the browser is offline;
- the PWA is hidden or fully closed;
- another synchronization run is already in progress;
- an automatic trigger has no local data for the active account.

The interface must explain that some devices will not synchronize while the PWA
is fully closed. The user has to open the PWA after regaining internet access.

## Runtime Contract

The application calls the synchronization runtime with:

- trigger source;
- user UID and role;
- device ID;
- request timestamp;
- current pending document count.

The current package wires the trigger/runtime contract into `App` and the
synchronization center. Conflict handling and business ordering are implemented
in later offline packages.

## Validation

Covered by:

- `src/offline/automaticSynchronization.test.ts`;
- `src/app/App.test.tsx`.
