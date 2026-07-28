# Picker session details

Package 7.10 replaces the lightweight harvest preview with details loaded only
after the picker opens one of their sessions.

## Ownership boundary

The details API accepts a session identifier, but never accepts a worker
identifier. It derives `workerId` from an active, approved `PICKER` profile,
reads the selected session, and rejects it unless the session belongs to that
worker. The entry query always contains both constraints:

```text
harvestEntries
  where workerId == profile.workerId
  where sessionId == selectedSession.id
  order by sequenceNumber
```

The matching composite index is declared in `firestore.indexes.json`.
Firestore Rules allow the own-session query and direct own-session payment
read, while foreign and insufficiently constrained reads remain denied. No
picker write permission is added.

## Presentation model

The picker sees:

- business date, status, plan and rate snapshot;
- the official active-entry count, quantity units and weight;
- the official amount when available and a meaningful payment status;
- active entries, corrections and cancellations in sequence order;
- active payment date, method and amount;
- an action that hands the session identifier to the discrepancy flow.

The model returned to the component excludes administrative notes, actor and
device identifiers, worker data not required by the view, payment notes, audit
metadata, sales and farm-wide results. A missing or inconsistent expected
payment and invalid entry documents are surfaced as data requiring review.

The session header remains authoritative for official totals. Individual
entries are loaded for explanation and correction history, not for replacing
the closed-session calculation.

## Offline behavior

Online reads use the regular Firestore source and report `CACHE` whenever any
required snapshot came from cache. Offline reads explicitly use the existing
Firestore cache. Package 7.13 will extend the complete picker offline
experience; package 7.10 only presents an already cached session safely.

Physical Android and iOS verification remains `SKIPPED`. This package does not
perform a deploy.
