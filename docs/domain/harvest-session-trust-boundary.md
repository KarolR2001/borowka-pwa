# Harvest session trust boundary

Stage 5.13 documents the MVP limitation without a trusted backend function.
Firestore Security Rules can validate field ownership, roles and basic status
transitions, but they cannot cheaply recalculate an arbitrary number of entry
documents to prove that a session aggregate is mathematically correct.

## Rules

- Harvest entries are the source of truth for session totals.
- Session aggregates are cached snapshots used for display and settlement state.
- The final session amount must never be manually entered by the operator.
- The close flow must fetch active entries and recalculate totals from entries.
- Cancelled entries are ignored by the final amount, but counted as skipped input.
- A reopened/details view must compare persisted aggregates with recalculated
  entry totals.
- Any mismatch must recommend `MARK_REVIEW_REQUIRED`.
- The client uses one shared calculator from `harvestSessionCalculation.ts`.
- A deliberately modified client is still weaker than a trusted backend; this is
  accepted only for the MVP stage and must be revisited before stronger audit or
  payment guarantees.

## Review Triggers

The consistency check recommends review when any of these persisted session
fields differs from recalculated entry totals:

- `totalEntryCount`;
- `totalQuantityMilli`;
- `totalWeightG`;
- `amountDueGrosz` when an official amount is present or required;
- `calculationVersion`.

## Covered Scenarios

Automated tests verify that close totals come only from active entries, manual
final amount input is rejected, empty close attempts are blocked, cancelled
entries are ignored, missing weight in quantity plans remains allowed and
manipulated aggregate fields lead to `REVIEW_REQUIRED`.

## Source

- `src/harvest/harvestSessionTrustBoundary.ts`
- `src/harvest/harvestSessionTrustBoundary.test.ts`
