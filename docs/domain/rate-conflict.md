# Rate conflict after offline work

Stage 6.14 defines what happens when a harvest session was opened offline with
a cached rate snapshot and the rate changed on the server before sync.

## Rule

The local session snapshot is preserved. The application never silently
recalculates `rateGroszSnapshot` or `amountDueGrosz`.

After synchronization resumes, the client compares:

- session `rateVersionIdSnapshot`;
- session `rateGroszSnapshot`;
- session business date;
- current server rate versions for the same worker and plan.

## Outcomes

If the snapshot rate is still active and effective for the session business
date, the session can keep the local snapshot.

If the snapshot is missing, inactive, outside its effective period or differs in
amount from the server version, the session must enter `REVIEW_REQUIRED`.

The administrator sees:

- local snapshot data;
- current effective server rate, if one exists;
- preserved session amount;
- required decision.

## Allowed Review Decisions

The domain contract exposes:

- `KEEP_LOCAL_SNAPSHOT`;
- `APPLY_CURRENT_RATE_BEFORE_CLOSE`, only when a current replacement rate exists;
- `CANCEL_SESSION`.

Payments remain blocked until the conflict is resolved and the final session is
confirmed in the cloud.

## Validation

Covered by `src/offline/rateConflict.test.ts`.
