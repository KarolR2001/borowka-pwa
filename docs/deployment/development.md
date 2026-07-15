# Development deployment

Development deployment is not active until the real Firebase development project exists.

## Intended flow

1. Pull request runs `npm run verify`.
2. Pull request runs `npm run verify:rules`.
3. After merge to `main`, CI may deploy Hosting, Rules and indexes to the development project.
4. A smoke test confirms that the app loads, SPA fallback works and Firestore still denies anonymous access.

## Required secrets

Names are placeholders until CI authentication is selected:

- `FIREBASE_DEV_PROJECT_ID`
- `FIREBASE_DEV_SERVICE_ACCOUNT` or approved workload identity configuration

No production credential may be used for development deployment.
