# Client and Firestore Rules compatibility

Stage 6.23 defines the release gate required before Firestore Rules make a
document format stricter.

## Version boundary

Firestore Rules cannot reliably tell whether a create request was produced by a
new write in an old client or by a valid offline write created before the Rules
deployment. Adding a required client-version field directly to every document
would itself reject the pending writes that the compatibility window must
protect.

The application therefore maintains a release manifest with:

- current application, schema and Rules revisions;
- the last supported application and schema revisions;
- the end of the compatibility grace period;
- required fields per document kind;
- fields that remain optional only for a pending retry during grace.

## Decisions

The compatibility policy returns one of four actions:

- `ALLOW_CURRENT` for a complete current-format document;
- `ALLOW_PENDING_RETRY` for a valid pending write from the last supported
  client, created before the grace deadline;
- `REQUIRE_UPDATE` when the old client attempts a new write or retries after
  grace;
- `BLOCK_AND_REVIEW` for malformed or older unsupported formats.

The rollout assessment is `BLOCKED` when any representative pending fixture
would be rejected.

## Pending-write normalization

`pendingSync` is local queue state. A last-supported offline harvest entry keeps
`pendingSync: true` locally, but synchronization changes that value to `false`
in the server payload. The transformation preserves the document UUID and all
business fields.

Current Rules accept that normalized last-supported payload and reject unknown
legacy fields through `keys().hasOnly(...)`.

## Deployment order

A Rules change that introduces a required field must follow this order:

1. deploy a client that understands the new field and displays the PWA update
   prompt;
2. keep the field optional for last-supported pending retries during grace;
3. run the compatibility assessment and emulator fixtures against proposed
   Rules;
4. allow old pending writes to synchronize after devices return from the
   field;
5. block new old-client documents with the update-required message;
6. tighten Rules only after the grace window and pending-write review.

The application update flow from stage 6.22 remains the supported route from
the last client to the current schema.
