# Domain schema v1

Schema version `1` starts the configurable domain for seasons, settlement
plans, workers and individual rates.

## Collections

| Collection           | Purpose                                      |
| -------------------- | -------------------------------------------- |
| `appSettings/domain` | Project schema and calculation rule version. |
| `seasons`            | Business seasons.                            |
| `settlementPlans`    | Settlement plan definitions.                 |
| `workers`            | People being settled for picking work.       |
| `workerRateVersions` | Individual worker rate history.              |

## Initial seed

The initial seed is deterministic and uses stable document IDs, so rerunning the
same seed writes the same document targets instead of creating duplicates.

Initial data:

- default open test season `season-2026-test`;
- system plan `plan-weight-kg` for `WEIGHT` settlement;
- system plan `plan-quantity-ubianka` for `QUANTITY` settlement;
- three synthetic development workers;
- one active rate version per test worker.

The `plan-quantity-ubianka` seed has `weightRequired = false`. A quantity entry
without weight does not increase kilogram stock; later session validation must
apply that rule when entries are implemented.

## Control rule

Seed documents are development/test bootstrap data. Production data must be
created through administrator workflows after UAT, not by importing synthetic
development workers.

## Calculation references

Session calculation scenarios for stage 5 are maintained in
`docs/domain/calculation-scenarios.md`.

## Harvest session state references

Stage 5.1 session status transitions are maintained in
`docs/domain/harvest-session-state.md`.

Stage 5.2/5.3 opening and snapshot rules are maintained in
`docs/domain/open-harvest-session.md`.

Stage 5.4 active session screen contract is maintained in
`docs/domain/active-harvest-session-screen.md`.

Stage 5.5 ubianka entry form contract is maintained in
`docs/domain/ubianka-entry-form.md`.

Stage 5.6 weight entry form contract is maintained in
`docs/domain/weight-entry-form.md`.

Stage 5.7 generic quantity entry form contract is maintained in
`docs/domain/generic-quantity-entry-form.md`.

Stage 5.8 harvest entry validation contract is maintained in
`docs/domain/harvest-entry-validation.md`.
