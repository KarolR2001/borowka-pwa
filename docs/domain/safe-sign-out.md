# Safe sign out

Stage 6.21 defines the sign-out gate for an account that may own local data on
a shared device.

## Fresh local inspection

Every sign-out attempt reads account-scoped local documents again. This check
does not depend on Firebase service readiness or network availability. A failed
inspection blocks sign out instead of assuming that the device is clean.

The following document states require resolution:

- `LOCAL_SAVED`;
- `PENDING_SYNC`;
- `REJECTED`;
- `REMOTE_CHANGED`.

Only `SYNCED` documents are clear for normal sign out.

## Pending-data decision

When pending documents exist, the application:

- blocks Firebase sign out;
- shows the total pending document count;
- groups affected harvest sessions with worker, business date and error;
- states that the data belongs to the current account;
- offers synchronization when the device is online;
- allows the user to cancel sign out;
- does not offer local deletion.

After synchronization, sign out remains a separate explicit action.

## Device clearing

`Wyloguj i wyczysc urzadzenie` is available only to an administrator or
operator and only when a fresh inspection reports no pending documents. The
user must enter `WYCZYSC URZADZENIE` before confirmation.

The operation clears:

- account- and device-scoped synchronization data;
- the account configuration cache for the device;
- the offline preparation marker.

Firebase sign out runs only after those local operations succeed. Server data
is not deleted.

## Shared-device isolation

Documents held by the application state are tagged with their owner UID. They
are passed to account views only while that UID matches the current profile.
Late asynchronous results from a previous account are ignored. Switching users
therefore cannot temporarily expose the previous account's local sessions or
pending-document details.
