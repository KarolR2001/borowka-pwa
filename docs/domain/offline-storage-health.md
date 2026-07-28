# Offline storage health

Stage 6.20 defines the storage diagnostics required before the application may
report offline readiness.

## Signals

The `offlineStorageHealth` contract combines:

- IndexedDB availability;
- the browser Persistence API result;
- storage usage and quota estimates;
- local read or write errors;
- a per-user and per-device preparation marker;
- configuration cache completeness.

Private browsing cannot be identified reliably by one browser flag. The
application reports it as suspected when IndexedDB is unavailable, marker
storage is blocked, or storage operations fail with browser security/state
errors.

## Blocking issues

The following issue codes block offline readiness:

- `PERSISTENT_STORAGE_UNAVAILABLE`;
- `PRIVATE_MODE_SUSPECTED`;
- `LOCAL_WRITE_FAILED`;
- `LOW_SPACE`;
- `STORAGE_CLEARED`;
- `CONFIGURATION_INCOMPLETE`.

Low space is reported when less than 50 MiB remains or estimated usage reaches
90 percent of the browser quota. A `QuotaExceededError` also reports both the
write failure and low-space issue.

## Storage-cleared detection

After successful offline preparation, the application writes a lightweight
marker outside the configuration snapshot. If that marker exists but the
IndexedDB snapshot is missing, the application reports that browser or system
storage may have been cleared. Intentional cache clearing removes the marker.

The marker contains only the preparation timestamp and is scoped by user UID
and device ID.

## Readiness gate

The data layer is ready only when both conditions are true:

- the domain configuration snapshot is complete;
- storage health has status `READY`.

Any blocking storage issue changes the readiness indicator to an error or an
incomplete-configuration state. The application must not show `Gotowe offline`
until the issue is resolved and the cache is prepared again.
