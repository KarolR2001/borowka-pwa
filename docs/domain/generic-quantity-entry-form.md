# Generic quantity entry form

Date: 2026-07-17

This document records the stage 5.7 contract for quantity plans other than the
dedicated `Za ubianke` flow. The implementation returns a local draft through a
callback. UUID allocation, sequence numbering, persistence and synchronization
are owned by later stage 5 packages.

## Behaviour

- The form is generated from plan configuration.
- Visible plan data includes name, unit labels, precision, batch mode, weight
  requirement, description and rate example.
- Quantity accepts Polish comma and dot separators.
- Quantity is stored as `quantityMilli`.
- Quantity must match the configured precision.
- Batch quantity is rejected when `allowBatchQuantity = false`.
- Weight accepts up to three decimal places and is required only when the plan
  requires it.
- Missing optional weight returns `weightG = null`.
- Preview amount is informational and based on quantity times rate.
- After submit the form resets quantity to `1`, clears weight and focuses
  quantity.

## Code reference

- `src/harvest/GenericQuantityEntryForm.tsx`
- `src/harvest/GenericQuantityEntryForm.test.tsx`
