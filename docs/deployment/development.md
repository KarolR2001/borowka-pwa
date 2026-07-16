# Development deployment

Development deployment is defined in `.github/workflows/deploy-development.yml`.
Automatic deploy from `main` is disabled until the real Firebase development
project and GitHub configuration exist.

## Intended flow

1. Pull request runs `npm run verify`.
2. Pull request runs `npm run verify:rules`.
3. After merge to `main`, local or CI verification confirms that the branch did
   not regress `npm run verify` and, when Rules changed, `npm run verify:rules`.
4. Development deploy is run after a coherent block of work, at the end of a
   stage or on explicit request. It is not required after every package merge.
5. CI deploys Rules, indexes and Hosting only when
   `FIREBASE_DEV_DEPLOY_ENABLED=true`.
6. A smoke test confirms that the app loads, SPA fallback works and Firestore
   still denies anonymous access.

## GitHub repository variables

Set these in GitHub repository variables:

| Name                               | Value                                |
| ---------------------------------- | ------------------------------------ |
| `FIREBASE_DEV_DEPLOY_ENABLED`      | `true` only after manual setup       |
| `FIREBASE_DEV_PROJECT_ID`          | Firebase development project ID      |
| `FIREBASE_DEV_API_KEY`             | Firebase Web App API key             |
| `FIREBASE_DEV_AUTH_DOMAIN`         | Firebase Web App auth domain         |
| `FIREBASE_DEV_STORAGE_BUCKET`      | Firebase Web App storage bucket      |
| `FIREBASE_DEV_MESSAGING_SENDER_ID` | Firebase Web App messaging sender ID |
| `FIREBASE_DEV_APP_ID`              | Firebase Web App application ID      |

## GitHub repository secret

Set this in GitHub repository secrets:

| Name                                | Value                                     |
| ----------------------------------- | ----------------------------------------- |
| `FIREBASE_DEV_SERVICE_ACCOUNT_JSON` | JSON key for a development deploy account |

No production credential may be used for development deployment.

## Manual activation

1. Create or confirm the Firebase development project.
2. Enable Authentication, Firestore and Hosting.
3. Create the Firebase Web App and copy its client configuration to the GitHub
   variables above.
4. Create a deploy service account for development and save its JSON key as
   `FIREBASE_DEV_SERVICE_ACCOUNT_JSON`.
5. Run `Deploy Development` manually from GitHub Actions and verify that it
   passes.
6. Set `FIREBASE_DEV_DEPLOY_ENABLED=true` only after the manual run passes.

The workflow validates that the service account project, deployment project and
client project match before deploying.
