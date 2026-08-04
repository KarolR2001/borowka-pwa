# Emergency local export

Stage 6.19 defines a recovery-only JSON export for local harvest data that
cannot be synchronized normally. Stage 9.4 distinguishes it explicitly from
the full Firestore cloud export.

## Format

The root object uses:

- `format.name = BOROWKA_EMERGENCY_LOCAL_EXPORT`;
- `format.version = 2`;
- `format.purpose = EMERGENCY_RECOVERY`;
- `format.source = LOCAL_DEVICE_STORAGE`;
- `format.dataScope = CURRENT_DEVICE_LOCAL_PENDING_DATA`;
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

The UI calls this mechanism `Eksport awaryjny urzadzenia`. It never represents
all server data and must not be described as a full cloud export. The comparison
with the cloud archive is maintained in
`docs/domain/export-mechanism-boundaries.md`.
