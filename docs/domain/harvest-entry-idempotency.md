# Harvest entry idempotency

Stage 5.9 defines how an entry intent gets a stable technical identity before
the document is saved locally or sent to Firestore.

## Rules

- Every entry intent receives a UUID before persistence.
- The UUID is separate from the human sequence number.
- `sequenceNumber` is a positive safe integer used for field comparison and UI
  ordering, not as a document id.
- A retry with the same UUID is classified as `RETRY_EXISTING_DOCUMENT`.
- A new UUID is classified as `NEW_DOCUMENT`.
- Duplicate listener snapshots with the same UUID are displayed once.
- When local and server snapshots for the same UUID exist, the server-confirmed
  snapshot wins over the pending local snapshot.
- Entry forms block another submit while the local operation for the current
  intent is pending.

## Source

- `src/harvest/harvestEntryIdempotency.ts`
- `src/harvest/harvestEntryIdempotency.test.ts`
- form submit guards:
  - `src/harvest/UbiankaEntryForm.tsx`
  - `src/harvest/WeightEntryForm.tsx`
  - `src/harvest/GenericQuantityEntryForm.tsx`
- duplicate display protection:
  - `src/harvest/ActiveHarvestSessionPanel.tsx`
