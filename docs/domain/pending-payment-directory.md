# Pending payment directory

Package 7.1 adds the administrator queue of harvest sessions awaiting full
payment.

## Data sources

The directory reads:

- `harvestSessions` with status `CLOSED`;
- `seasons` for the displayed season name;
- `payments` for active or cancelled payment history;
- the account synchronization journal supplied by the application shell.

Payment reads are limited to active administrators. Client creates, updates and
deletes remain denied until the payment transaction packages are implemented.

## Inclusion rules

A session is listed when:

- its decoded status is `CLOSED`;
- `amountDueGrosz` contains an official non-negative amount;
- neither the session nor a payment document identifies an active payment;
- no session, entry or audit metadata for that session remains pending,
  rejected or remotely changed.

A cancelled payment remains visible as history and does not hide the restored
closed session. Invalid documents are counted and omitted.

## Presentation

The queue shows worker, business date, season, plan, unit, entry count,
quantity, weight, official amount, close time and author, synchronization state
and payment history. Sessions are sorted by oldest business date first.

Client-side filters cover season, worker, plan, date range and amount range.
The summary reports the number of eligible and visible sessions, visible amount
and sessions excluded because of pending synchronization.

Package 7.1 does not expose a payment command. The complete eligibility check
and payment action start in package 7.2.
