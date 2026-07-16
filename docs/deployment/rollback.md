# Hosting rollback

Rollback is allowed only if the previous version is compatible with current Firestore data and Security Rules.

## Development

1. Identify the last good Hosting release.
2. Roll back Hosting in the Firebase console or with Firebase CLI.
3. Confirm that `index.html`, `sw.js` and `registerSW.js` are not cached incorrectly.
4. Run smoke tests.

## Production

1. Stop new deployments.
2. Confirm whether Rules or indexes changed with the release.
3. Roll back Hosting only if the previous client remains compatible.
4. If data or Rules changed incompatibly, prefer forward fix over Hosting rollback.
5. Record the incident and follow-up tests.
