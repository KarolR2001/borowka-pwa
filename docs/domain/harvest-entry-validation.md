# Harvest entry validation

Stage 5.8 keeps entry validation as pure domain logic before Firestore or local
offline persistence is attached.

## Rules

- An entry requires an existing `OPEN` harvest session.
- `sessionId`, `seasonId`, `workerId` and `businessDate` must match the session.
- The actor must be `ADMIN` or `OPERATOR`.
- `createdBy` must match the current actor UID.
- `quantityMilli` must be a safe integer greater than zero.
- Quantity must match the session plan precision snapshot.
- Required weight must be a safe integer greater than zero.
- Optional weight may be missing; then it does not increase kilogram stock.
- A `WEIGHT` session requires `quantityMilli` to mirror `weightG`.
- Offline mode is allowed by the validator and marked as `OFFLINE_ALLOWED`.
- Session next totals are checked against JavaScript safe integer limits.

No suspicious-high-value threshold is enforced yet. The implementation only
blocks technically unsafe numeric ranges until a configurable business threshold
is approved.

## Amount preview

`amountPreviewGrosz` is calculated for the single entry only. The returned
`nextSessionTotals.estimatedAmountGrosz` is calculated from total session
quantity or weight after adding the entry, so later closing can keep the PRD rule
of rounding once at the session level.

## Source

- `src/harvest/harvestEntryValidation.ts`
- `src/harvest/harvestEntryValidation.test.ts`
