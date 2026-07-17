# Ubianka entry form

Date: 2026-07-17

This document records the stage 5.5 contract for the quantity entry form used by
the `Za ubianke` plan. The first implementation returns a local draft through a
callback. UUID allocation, sequence numbering, persistence and synchronization
are owned by later stage 5 packages.

## Behaviour

- Default quantity is `1`.
- Quick quantities are `0,5`, `1` and `2`.
- The `2` quick action is disabled when the plan does not allow batch quantity.
- Manual batch quantity is rejected when the plan does not allow it.
- Weight accepts Polish comma and dot separators with up to three decimal
  places.
- Missing weight is allowed only when `weightRequired = false`.
- Missing optional weight returns `weightG = null`.
- Submit returns a local draft immediately.
- After submit the form resets quantity to `1`, clears weight and focuses the
  weight field.
- The last quantity can be repeated, but the last weight is never copied.

## Code reference

- `src/harvest/UbiankaEntryForm.tsx`
- `src/harvest/UbiankaEntryForm.test.tsx`
