# Production deployment

Production deployment is manual and version-based. It must not run
automatically after every merge to `main`.

Production deployment is defined in `.github/workflows/deploy-production.yml`.
The workflow can only be started manually and requires the `confirm_production`
input.

## Intended flow

1. Select a tested commit or release tag.
2. Confirm release notes, schema impact, offline impact and Security Rules
   impact.
3. Run full automated tests and required manual smoke tests.
4. Deploy indexes, Rules and Hosting as separate controlled steps.
5. Run production smoke tests on technical data.

## GitHub environment protection

Create the GitHub environment `production` and configure required reviewers
before adding production credentials. This is the manual approval gate for the
workflow.

## GitHub production variables

Set these as production environment variables:

| Name                                | Value                                |
| ----------------------------------- | ------------------------------------ |
| `FIREBASE_PROD_PROJECT_ID`          | Firebase production project ID       |
| `FIREBASE_PROD_API_KEY`             | Firebase Web App API key             |
| `FIREBASE_PROD_AUTH_DOMAIN`         | Firebase Web App auth domain         |
| `FIREBASE_PROD_STORAGE_BUCKET`      | Firebase Web App storage bucket      |
| `FIREBASE_PROD_MESSAGING_SENDER_ID` | Firebase Web App messaging sender ID |
| `FIREBASE_PROD_APP_ID`              | Firebase Web App application ID      |

## GitHub production secret

Set this as a production environment secret:

| Name                                 | Value                                    |
| ------------------------------------ | ---------------------------------------- |
| `FIREBASE_PROD_SERVICE_ACCOUNT_JSON` | JSON key for a production deploy account |

Production credentials must not be available to ordinary pull request workflows.

## Manual activation

1. Create or confirm the Firebase production project.
2. Enable Authentication, Firestore and Hosting.
3. Create the Firebase Web App and copy its client configuration to the GitHub
   production variables above.
4. Create a production deploy service account and save its JSON key as
   `FIREBASE_PROD_SERVICE_ACCOUNT_JSON`.
5. Configure required reviewers for the GitHub `production` environment.
6. Run `Deploy Production` manually only for an approved release.

The workflow validates that `CONFIRM_PRODUCTION_DEPLOY=true`, the service
account project, deployment project and client project match before deploying.
