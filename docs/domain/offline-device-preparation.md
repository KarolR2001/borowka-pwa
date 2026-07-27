# Offline device preparation

Stage 6.3 defines what the "Prepare offline" action stores before field work.

## Prepared data

The configuration snapshot contains:

- active user account summary;
- active season;
- active workers visible to the current role;
- active settlement plans;
- needed worker rate versions;
- open harvest sessions visible to the current operator/admin scope;
- app version, schema version and calculation rule version;
- preparation time and device ID.

The snapshot intentionally stores only a limited open-session shape. It excludes
free-form session notes and does not yet store harvest entries. Offline entry
drafts, write queue metadata and conflict handling are handled by later Stage 6
packages.

## Readiness

Readiness remains `READY` only when required configuration data and PWA files are
available. Having zero open sessions is not a blocker; it is reported as a count
so the operator can see what was prepared.

Invalid open-session documents are counted through `invalidDocumentCount` and
make the snapshot `NOT_READY`, the same as invalid configuration documents.

## Code reference

- `src/offline/configurationCache.ts`
- `src/offline/configurationCache.test.ts`
- `src/offline/ConfigurationCachePanel.tsx`
- `src/offline/ConfigurationCachePanel.test.tsx`
