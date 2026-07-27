# Trusted offline device consent

Stage 6.2 defines the consent required before persistent offline data is used on
a device.

## User disclosure

The login/profile panel must show that:

- data can remain on the device after the app is closed;
- the device should be private or trusted;
- clearing browser data can remove unsynchronized records;
- private browsing is not suitable for field work;
- pending data should be synchronized before signing out;
- the cleanup path is: clear cache in the synchronization center, then sign out.

## Stored consent

Consent is stored for two targets:

- `users/{uid}.offlineConsent` records the user's decision;
- `devices/{deviceId}.trustedOfflineStorage` records that the current device is
  allowed to keep persistent offline data.

The client writes both targets in one Firestore batch. If the current device
does not exist yet, the same batch creates it with the current user UID,
platform, device name and `trustedOfflineStorage` value.

## Code reference

- `src/offline/trustedOfflineConsent.ts`
- `src/offline/trustedOfflineConsent.test.ts`
- `src/app/App.tsx`
- `src/app/App.test.tsx`
