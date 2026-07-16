# Last admin recovery

This procedure covers the emergency case where the application has no usable
active administrator or the only administrator cannot sign in.

## Application guarantees

- The administrator UI does not offer the currently signed-in administrator as a
  target for role changes, blocking or reactivation.
- The client-side update service rejects self-demotion and self-blocking.
- Firestore Rules reject administrative role and activation updates when
  `request.auth.uid == userId`.
- When the current account is the only active approved administrator, the UI
  shows an explicit protection notice.

## Incomplete guarantees without backend

Firestore Rules cannot safely count all active administrators in a collection
during a single profile update. Without Cloud Functions or another trusted
backend, the complete "at least one administrator remains" rule is enforced by
the combination of UI, client validation, Security Rules and the operational
procedure below.

Production operation should keep at least two active approved administrator
accounts. Emergency edits done directly in Firebase Console bypass application
audit events, so they must be recorded in the operational change log.

## Manual recovery in Firebase

Use this only for recovery. Do not use it as a normal account-management flow.

1. Confirm the Firebase project first: development and production must never be
   mixed.
2. Confirm the identity of the person who should receive administrator access.
3. In Firebase Authentication, create or re-enable the user account and copy its
   `uid`.
4. In Cloud Firestore, create or repair `users/{uid}` with:
   - `uid`: copied Authentication uid;
   - `email`: the Authentication e-mail;
   - `displayName`: operator-visible administrator name;
   - `role`: `ADMIN`;
   - `workerId`: `null`;
   - `active`: `true`;
   - `registrationStatus`: `APPROVED`;
   - `offlineConsent`: `false`.
5. Sign in with the recovered administrator account and create a second active
   approved administrator through the standard invitation flow.
6. Record who performed the recovery, when it happened, which project was
   changed and which `uid` was repaired.

## Development test

Run this procedure only on the development Firebase project.

1. Sign in as the bootstrap administrator.
2. Open the administrator users panel with exactly one active approved
   administrator profile.
3. Confirm that the UI shows "Ochrona ostatniego administratora" and that the
   current administrator is not selectable for role or status changes.
4. Add a second administrator through a preregistration invitation.
5. Confirm that normal role/status operations can target the other administrator
   while the current account still cannot target itself.
