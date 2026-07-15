# Firebase environments

## Planned project IDs

| Environment | Project ID         | Display name     | Status  |
| ----------- | ------------------ | ---------------- | ------- |
| Development | `borowka-pwa-dev`  | Borowka PWA Dev  | Planned |
| Production  | `borowka-pwa-prod` | Borowka PWA Prod | Planned |

Production must not share Firestore, Authentication or Hosting with development.

## Firestore location

Recommended location for approval before database creation:

- `europe-central2` - Warsaw region.

Reason: primary users are in Poland and the app does not require multi-region availability in the MVP. Firestore database location is a long-lived infrastructure decision and should be selected before creating either database.

Alternative to consider only if higher regional redundancy is preferred over local latency:

- `eur3` - Europe multi-region.

Source: Firebase Firestore locations documentation, https://firebase.google.com/docs/firestore/locations.

## Services to enable

For both projects:

- Firebase Authentication with email/password only.
- Cloud Firestore in Native mode.
- Firebase Hosting.

For development:

- synthetic test data only;
- emulator-driven tests;
- no real passwords or production exports.

For production:

- real accounts and business data only after UAT;
- no free-form experiments;
- controlled smoke tests with clearly marked technical data.

## Manual setup checklist

- Create project `borowka-pwa-dev`.
- Create project `borowka-pwa-prod`.
- Confirm Firestore location before creating databases.
- Enable Authentication email/password in both projects.
- Create Web App in both projects and copy public client config into CI/environment secrets.
- Enable Hosting in both projects.
- Add authorized domains for local/development/production as needed.
- Record owner and production deploy approvers.
