# Emergency local export

Stage 6.19 defines a recovery-only JSON export for local harvest data that
cannot be synchronized normally.

## Format

The root object uses:

- `format.name = BOROWKA_EMERGENCY_LOCAL_EXPORT`;
- `format.version = 1`;
- `format.purpose = EMERGENCY_RECOVERY`;
- `format.productionImportPolicy = CONTROLLED_REVIEW_REQUIRED`;
- `format.automaticProductionImportAllowed = false`.

The warning in `format.warning` is mandatory. The file is evidence for recovery
and administrator review, not an automatically accepted production import.

## Recovery metadata

Every export contains:

- application version, schema version, calculation version, build date and
  environment;
- export timestamp;
- user identity, role and account state;
- stable device ID, device name and platform;
- summary counts for local, pending, rejected and remotely changed documents.

## Local documents

Documents are split into `data.sessions`, `data.entries` and
`data.relatedDocuments`. Every item preserves:

- document UUID and session UUID;
- document kind and local synchronization status;
- the complete local domain snapshot supplied by local persistence;
- Firestore cache/pending metadata;
- local write and successful synchronization timestamps;
- rejection reason and remote/current device identifiers.

The export builder does not mutate or delete local data. A caller that supplies
only metadata without `localSnapshot` receives `snapshot: null`; runtime local
persistence is responsible for supplying complete snapshots for recoverable
documents.

## File handling

The browser downloads a timestamped JSON file named
`borowka-emergency-local-export-<timestamp>.json`. Creating the file works
offline and does not contact Firebase.
