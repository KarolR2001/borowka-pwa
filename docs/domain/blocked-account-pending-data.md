# Blocked account with pending local data

Stage 6.18 defines the behavior when an account is blocked after a device has
saved harvest data locally.

## Contract

`evaluateBlockedAccountPendingData` receives the current profile, device ID and
synchronization center model. If the account is blocked and there are pending or
rejected local documents, the app must:

- preserve all local session and entry documents;
- stop automatic retry loops;
- show the account block to the user;
- keep payments blocked;
- expose emergency export;
- give the administrator the device ID, user UID, e-mail, affected session IDs
  and pending document IDs.

## Resolution

The allowed resolution paths are:

- temporary account reactivation so the same device can synchronize;
- controlled import from the emergency export;
- keeping local data untouched until an administrator decides.

The client must not silently delete local data, silently retry forever or accept
payments for affected sessions.

## UI

The synchronization center remains accessible for a blocked profile when local
pending documents are known. In that state `Synchronizuj teraz` is disabled and
`Eksport awaryjny` remains available.

## Validation

Covered by:

- `src/offline/blockedAccountPendingData.test.ts`;
- `src/offline/ConfigurationCachePanel.test.tsx`.
