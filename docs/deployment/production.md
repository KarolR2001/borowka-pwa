# Production deployment

Production deployment is manual and version-based. It must not run automatically after every merge to `main`.

## Intended flow

1. Select a tested commit or release tag.
2. Confirm release notes, schema impact, offline impact and Security Rules impact.
3. Run full automated tests and required manual smoke tests.
4. Deploy indexes, Rules and Hosting as separate controlled steps.
5. Run production smoke tests on technical data.

## Required approvals

Production deploy approvers are not yet selected. This is a manual decision before enabling CI/CD for production.

## Required secrets

Names are placeholders until CI authentication is selected:

- `FIREBASE_PROD_PROJECT_ID`
- `FIREBASE_PROD_SERVICE_ACCOUNT` or approved workload identity configuration

Production credentials must not be available to ordinary pull request workflows.
