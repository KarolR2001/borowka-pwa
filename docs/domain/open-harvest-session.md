# Open harvest session draft

Date: 2026-07-17

This document records the stage 5.2/5.3 domain rules for preparing a new
`harvestSessions` document in status `OPEN`. The current package prepares a
validated draft and audit metadata. Firestore persistence, transaction handling
and Security Rules are intentionally left for later stage 5 packages.

## Opening flow

1. Check that the actor can perform the `CREATE` transition.
2. Require active connectivity for the stage 5 online flow.
3. Validate the session UUID generated before persistence.
4. Validate an `OPEN` season and a business date inside that season.
5. Validate an active worker.
6. Select exactly one worker rate version effective on the business date.
7. Load the active settlement plan referenced by that rate version.
8. Detect existing `OPEN` sessions for the same worker and date.
9. Return a continue-existing decision unless admin confirms a second session
   with a reason.
10. Build the immutable worker, plan and rate snapshot.
11. Return planned audit metadata for `HARVEST_SESSION_CREATED`.

## Draft defaults

New session drafts start with:

- `status = OPEN`;
- `revision = 1`;
- `totalEntryCount = 0`;
- `totalQuantityMilli = 0`;
- `totalWeightG = 0`;
- `amountDueGrosz = null`;
- `createdAtServer = null` until Firestore confirms persistence;
- no close, payment or cancellation fields;
- `legacyImport = false`.

## Snapshot fields

The draft freezes:

- worker id and display name;
- season id and business date;
- plan id, name, calculation basis and unit label;
- worker rate version id and rate in grosz;
- weight requirement and quantity precision for later entry validation;
- calculation rule version.

Later changes to worker name, plan name or rate amount do not update the
session draft.

## Existing open sessions

For the same worker and business date:

- operator receives a continue-existing decision;
- admin also receives that decision by default;
- admin can create a second session only with a short reason;
- cancelled, closed, paid and review-required sessions do not block opening.

## Code reference

- `src/harvest/openHarvestSession.ts`
- `src/harvest/openHarvestSession.test.ts`
