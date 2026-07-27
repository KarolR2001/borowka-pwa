# Business synchronization order

Stage 6.12 defines the logical order in which offline harvest documents are
handed to the synchronization runtime. It does not implement UUID de-duplication
or conflict resolution; those remain in Stage 6.13 and later packages.

## Prerequisites

The plan requires:

- active application profile;
- current offline configuration snapshot;
- session-level grouping by `sessionId`.

If profile or configuration is not ready, no business writes are scheduled.

## Session Order

For every independent harvest session the runtime must preserve this logical
order:

1. create harvest session;
2. write harvest entries;
3. apply local entry corrections;
4. confirm session close;
5. write audit events.

Only after the closed session has no local or pending documents can it enter the
later payment flow.

## Firestore Ordering Note

The planner treats close and audit writes as ordered operations. If Firestore SDK
does not provide the needed business ordering for multiple independent queued
documents, the runtime must either use a logical batch/barrier or tolerate the
temporary intermediate state in Rules and UI.

Rejected or remotely changed documents are not scheduled by the plan. They must
go through conflict review packages before another retry.

## Validation

Covered by `src/offline/businessSynchronizationPlan.test.ts`.
