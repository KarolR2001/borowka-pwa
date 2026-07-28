# Payment confirmation

Package 7.3 adds the confirmation screen opened only after the server preflight
returns `ELIGIBLE`.

## Immutable summary

The screen displays without editable controls:

- worker name;
- harvest business date and session ID;
- plan and historical rate snapshot;
- quantity and weight;
- calculation basis;
- full official amount due.

The amount comes from the eligible session and must equal the amount returned
by the preflight. A mismatch rejects the form instead of allowing a manual
correction.

## Administrator input

The administrator can provide only:

- payment business date;
- `CASH`, `BANK_TRANSFER` or `OTHER`;
- an optional note up to 200 characters;
- explicit confirmation that the payment covers the whole session.

The prepared payload retains the session ID as payment ID, season and worker
snapshots, official amount and expected session revision. These values form the
input for the transactional write in package 7.4.

## Boundary

Preparing the form does not write to Firestore and does not change the session
status. Cancelling returns to the successful eligibility result. A discrepancy
requires session correction and a new preflight; the amount is never editable.
