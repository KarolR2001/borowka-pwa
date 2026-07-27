# Offline open harvest session

Stage 6.6 defines the domain contract for creating a harvest session while the
device is offline.

## Preconditions

Offline session creation is allowed only when all of the following are true:

- the offline readiness result is `READY`;
- the signed-in profile is active and `APPROVED`;
- the profile role is `ADMIN` or `OPERATOR`;
- persistent offline data consent is present on the live profile and in the
  cached account snapshot;
- the configuration snapshot belongs to the same user and local device;
- the snapshot schema and calculation versions match the current app;
- an open season exists in cache and the business date belongs to it;
- the selected worker exists in cache and is active;
- a current worker rate is present in cache and an effective rate exists for the
  business date;
- the settlement plan referenced by the effective rate exists in cache and is
  active;
- the snapshot contains no invalid configuration documents.

If any required element is missing, the app must block creation with an explicit
error. Stage 6.6 does not introduce a review-draft fallback.

## Session Draft

`prepareOfflineHarvestSession` creates the same `HarvestSessionDocument` shape as
online session opening, but with local-only server fields:

- `status` is `OPEN`;
- worker, season, plan and rate snapshots are copied from the local cache;
- totals start at zero and `amountDueGrosz` remains `null`;
- `createdAtServer` and `updatedAtServer` remain `null`;
- the result is marked as `LOCAL_PENDING_SYNC` outside the document.

The helper also returns the audit summary needed by the later synchronization
runtime, but it does not write to Firestore in this package.

## Duplicate Handling

If the cache already contains an open session for the same worker and business
date, the helper returns `CONTINUE_EXISTING` instead of silently creating another
session. An administrator may prepare a second same-day offline session only when
a reason is provided. Operators cannot force that duplicate offline.

## Validation

Covered by `src/offline/offlineHarvestSession.test.ts`.
