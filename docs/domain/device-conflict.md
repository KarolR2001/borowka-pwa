# Two device harvest conflict

Stage 6.17 defines the contract for harvest work created or modified on more
than one trusted offline device.

## Contract

`evaluateDeviceConflict` compares a local session, optional server session,
other sessions with the same worker/date business key and entries assigned to
the session.

The contract covers:

- two independent sessions for the same worker and business date;
- the same session changed on another device;
- divergent session revisions;
- a session closed on one device while another device still has pending entries;
- entries from more than one device.

## Rules

Independent sessions are not merged automatically. The app keeps both session
documents and all entry documents, marks a possible duplicate business key and
requires administrator review before the session can enter payments.

When the same session has a newer remote revision or was closed on another
device, pending local data is preserved and the recommended session status is
`REVIEW_REQUIRED`. Payments stay blocked until an administrator reviews the
conflict.

Entries from different devices are tracked even when they do not create a
conflict by themselves. This gives the administrator a review surface without
turning normal multi-device visibility into data loss or a silent merge.

## Admin review

The review model exposes:

- affected session IDs;
- affected device IDs;
- affected entry IDs;
- review severity;
- resolution options for keeping sessions separate, accepting the remote session
  state, marking the session reviewed or cancelling local pending changes.

## Validation

Covered by `src/offline/deviceConflict.test.ts`.
