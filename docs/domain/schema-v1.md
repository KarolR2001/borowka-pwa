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

Stage 5.9 harvest entry UUID and idempotency contract is maintained in
`docs/domain/harvest-entry-idempotency.md`.

Stage 5.10 harvest entry list contract is maintained in
`docs/domain/harvest-entry-list.md`.

Stage 5.11 harvest entry correction contract is maintained in
`docs/domain/harvest-entry-correction.md`.

Stage 5.12 harvest session calculation contract is maintained in
`docs/domain/harvest-session-calculation.md`.

Stage 5.13 client trust boundary and aggregate consistency contract is
maintained in `docs/domain/harvest-session-trust-boundary.md`.

Stage 5.14 online close contract is maintained in
`docs/domain/close-harvest-session-online.md`.

Stage 5.15 reopen contract is maintained in
`docs/domain/reopen-harvest-session.md`.

Stage 5.16 cancel contract is maintained in
`docs/domain/cancel-harvest-session.md`.

Stage 5.17 harvest operation audit contract is maintained in
`docs/domain/harvest-audit.md`.

Stage 5.18 harvest session and entry Security Rules contract is maintained in
`docs/domain/harvest-security-rules.md`.

Stage 5.19 harvest query and index contract is maintained in
`docs/domain/harvest-queries-and-indexes.md`.

Stage 6.1 offline readiness layers contract is maintained in
`docs/domain/offline-layers.md`.

Stage 6.2 trusted offline device consent contract is maintained in
`docs/domain/trusted-offline-device-consent.md`.

Stage 6.3 offline device preparation contract is maintained in
`docs/domain/offline-device-preparation.md`.

Stage 6.4 offline readiness indicator contract is maintained in
`docs/domain/offline-readiness-indicator.md`.

Stage 6.5 local device identity contract is maintained in
`docs/domain/local-device-identity.md`.

Stage 6.6 offline harvest session opening contract is maintained in
`docs/domain/offline-open-harvest-session.md`.

Stage 6.7 offline harvest entry contract is maintained in
`docs/domain/offline-harvest-entry.md`.

Stage 6.8 offline harvest session close contract is maintained in
`docs/domain/offline-close-harvest-session.md`.

Stage 6.9 pending write metadata contract is maintained in
`docs/domain/pending-write-metadata.md`.

Stage 6.10 synchronization center contract is maintained in
`docs/domain/synchronization-center.md`.

Stage 6.11 automatic synchronization trigger contract is maintained in
`docs/domain/automatic-synchronization.md`.

Stage 6.12 business synchronization order contract is maintained in
`docs/domain/business-synchronization-order.md`.

Stage 6.13 synchronization idempotency contract is maintained in
`docs/domain/synchronization-idempotency.md`.

Stage 6.14 offline rate conflict contract is maintained in
`docs/domain/rate-conflict.md`.

Stage 6.15 closed season conflict contract is maintained in
`docs/domain/closed-season-conflict.md`.

Stage 6.16 archived configuration conflict contract is maintained in
`docs/domain/archived-configuration-conflict.md`.
