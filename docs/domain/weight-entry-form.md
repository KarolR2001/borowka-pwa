# Weight entry form

Date: 2026-07-17

This document records the stage 5.6 contract for the `Za kilogram` entry form.
The implementation returns a local draft through a callback. UUID allocation,
sequence numbering, persistence and synchronization are owned by later stage 5
packages.

## Behaviour

- The main field is weight in kilograms.
- Weight accepts Polish comma and dot separators with up to three decimal
  places.
- Weight is stored as exact integer grams.
- `quantityMilli` mirrors grams for the weight plan so current summary widgets
  can use one quantity field.
- Zero and negative values are rejected.
- The preview amount is shown for operator feedback.
- Preview amount is not the official payable value; official session amount is
  calculated once at session close.
- After submit the form clears weight and focuses the weight field.

## Code reference

- `src/harvest/WeightEntryForm.tsx`
- `src/harvest/WeightEntryForm.test.tsx`
