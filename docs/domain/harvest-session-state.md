# Harvest session state model

Date: 2026-07-17

This document records the stage 5.1 domain decision for `harvestSessions`
status transitions. It is intentionally limited to state rules and metadata.
Firestore writes, transaction handling, audit persistence and Security Rules are
implemented in later stage 5 packages.

## Statuses

| Status            | Meaning                                                        |
| ----------------- | -------------------------------------------------------------- |
| `OPEN`            | Entries can be added or corrected. Amount is preview only.     |
| `CLOSED`          | Entries are locked. Totals and amount are official.            |
| `PAID`            | An active payout exists. Session is fully locked.              |
| `CANCELLED`       | Session is historical and removed from kg/amount/payment sums. |
| `REVIEW_REQUIRED` | Conflict or missing configuration blocks payment.              |

## Transition table

| Transition             | From                                | To                | Roles               | Online | Required fields                                                                                                                                  | Entries impact       | Amount impact                 | Kg stock impact                | Reason | Audit action                             | Reversal                       |
| ---------------------- | ----------------------------------- | ----------------- | ------------------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------- | ----------------------------- | ------------------------------ | ------ | ---------------------------------------- | ------------------------------ |
| `CREATE`               | none                                | `OPEN`            | `ADMIN`, `OPERATOR` | yes    | `seasonId`, `workerId`, `workerNameSnapshot`, `businessDate`, plan/rate snapshots, `createdBy`, `createdDeviceId`, `createdAtDevice`, `revision` | open for active edit | preview only                  | no official impact             | no     | `HARVEST_SESSION_CREATED`                | admin `CANCEL` keeps history   |
| `CLOSE`                | `OPEN`                              | `CLOSED`          | `ADMIN`, `OPERATOR` | yes    | `totalEntryCount`, `totalQuantityMilli`, `totalWeightG`, `amountDueGrosz`, `calculationVersion`, `closedBy`, `closedAtDevice`, `revision`        | locked               | recalculated official amount  | recalculated official stock    | no     | `HARVEST_SESSION_CLOSED`                 | admin `REOPEN` if unpaid       |
| `MARK_REVIEW_REQUIRED` | `OPEN`, `CLOSED`                    | `REVIEW_REQUIRED` | `ADMIN`, `OPERATOR` | yes    | `reason`, `revision`                                                                                                                             | requires review      | blocked for review            | no official impact             | yes    | `HARVEST_SESSION_MARKED_REVIEW_REQUIRED` | later review flow or `CANCEL`  |
| `MARK_PAID`            | `CLOSED`                            | `PAID`            | `ADMIN`             | yes    | `paymentId`, `paidAt`, `revision`                                                                                                                | locked by payment    | payment confirmed             | locked                         | no     | `HARVEST_SESSION_PAID`                   | payout module only             |
| `CANCEL`               | `OPEN`, `CLOSED`, `REVIEW_REQUIRED` | `CANCELLED`       | `ADMIN`             | yes    | `cancelledBy`, `cancelledAt`, `cancellationReason`, `revision`                                                                                   | remains historical   | removed from settlements      | removed from stock totals      | yes    | `HARVEST_SESSION_CANCELLED`              | no direct restore in stage 5.1 |
| `REOPEN`               | `CLOSED`                            | `OPEN`            | `ADMIN`             | yes    | `reason`, `revision`                                                                                                                             | open for active edit | back to preview; recalc later | no official impact until close | yes    | `HARVEST_SESSION_REOPENED`               | `CLOSE` or `CANCEL`            |

## Guard rules

- `PICKER` cannot perform session state transitions.
- Every transition in stage 5 online flow requires active connectivity.
- `CLOSE` requires at least one active entry.
- `REOPEN` and `CANCEL` are blocked when an active payment exists.
- `PAID` has no direct session-level reversal; payout cancellation is owned by
  the payout module.
- `CANCELLED` remains historical and is not hard-deleted.

## Code reference

The executable model and unit tests are in:

- `src/harvest/harvestSessionState.ts`
- `src/harvest/harvestSessionState.test.ts`
