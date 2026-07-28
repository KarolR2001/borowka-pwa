# Payment eligibility preflight

Package 7.2 adds a server-backed preflight that must finish before the
administrator sees an active `Wyplac` button.

## Fresh server state

When online, the preflight reads directly from Firestore:

- the current administrator profile;
- the selected harvest session;
- all entries of that session;
- the referenced season and worker;
- the payment document whose ID is reserved for the session.

The check does not accept a cached list row as proof of eligibility. Offline it
returns `ONLINE_REQUIRED` without attempting to approve a financial operation.

## Conditions

The result is `ELIGIBLE` only when:

1. the current profile has role `ADMIN`;
2. the application is online;
3. the administrator profile is active and approved;
4. the session exists and decodes correctly;
5. its status is `CLOSED`;
6. no active payment exists;
7. the session is not `REVIEW_REQUIRED`;
8. entries and session-related journal documents are fully synchronized;
9. the official amount, aggregates and calculation version match active
   entries read from the server;
10. the season exists and has status `OPEN` or `CLOSED`;
11. the historical worker document exists; an archived worker remains valid;
12. the reserved payment ID is not occupied by another active document.

Missing or malformed payment documents, entries, seasons and workers also
produce explicit blockers.

## User feedback

Each blocker contains a stable code, a Polish explanation and a concrete next
step. The payment queue first offers `Sprawdz warunki`. A blocked result shows
all reasons and keeps `Wyplac` disabled. An eligible result exposes `Wyplac`
and records the selected session as ready for the confirmation screen.

Package 7.2 does not create or update payment documents. Package 7.3 consumes
the eligible result in the immutable summary and administrator input form
described in `payment-confirmation.md`.
