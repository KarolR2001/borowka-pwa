# Harvest session calculation

Stage 5.12 provides one domain module for session totals and money calculation.
It is intended for active session preview, close flow, reports, tests and later
migration checks.

## Rules

- Only `ACTIVE` entries are included in totals.
- `CANCELLED` entries are skipped and counted separately.
- Quantity and weight are summed independently.
- Missing weight is allowed for `QUANTITY` sessions and does not increase total
  kilograms.
- Missing weight is rejected for `WEIGHT` sessions.
- Session rate snapshot is the only rate used by the calculation.
- `WEIGHT` amount uses total grams.
- `QUANTITY` amount uses total `quantityMilli`.
- Amount is rounded once at session level.
- Half grosz rounds up.
- Money arithmetic uses integer and `BigInt` operations, not floating point.
- The result returns `calculationVersion`.

## Covered Scenarios

Automated tests cover `CALC-001` through `CALC-012` from
`docs/domain/calculation-scenarios.md`, including cancelled entries, missing
weight, rate snapshot behavior and the difference between entry previews and
session-level rounding.

## Source

- `src/harvest/harvestSessionCalculation.ts`
- `src/harvest/harvestSessionCalculation.test.ts`
