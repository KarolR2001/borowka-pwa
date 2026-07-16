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

## Local environment files

Runtime client configuration is split by Vite mode:

| Environment | Local file               | Example file               | Local file status |
| ----------- | ------------------------ | -------------------------- | ----------------- |
| Development | `.env.development.local` | `.env.development.example` | Ignored           |
| Production  | `.env.production.local`  | `.env.production.example`  | Ignored           |

Only example files may be committed. The `.env.*.local` files contain machine-local Firebase Web App configuration and must stay outside Git history.

The Firebase Web App keys used by the browser client are not administrator secrets, but production values should still be handled as environment configuration and managed separately from development.

## CI deployment configuration

GitHub Actions receives Firebase Web App values from GitHub variables and deploy
credentials from GitHub secrets. The deploy workflow maps them to `VITE_*`
variables at build time and validates them with
`scripts/validate-deploy-env.mjs`.

Do not add service account JSON, Firebase Admin SDK credentials, refresh tokens
or production exports to repository files.

## Operational recovery

Emergency recovery of administrator access is described in
[last-admin-recovery.md](last-admin-recovery.md). The procedure must be tested
on development before production launch.
