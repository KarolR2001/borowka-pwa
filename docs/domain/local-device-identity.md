# Local device identity

Stage 6.5 defines the local device identity used by offline work and conflict
diagnostics.

## Identity fields

The client uses:

- stable local installation ID from `localStorage`;
- friendly device name derived from platform/user agent;
- platform value when the browser exposes it.

The ID is not a secret. It is a diagnostic and correlation value used to connect
local writes, sessions, entries and the registered `devices/{deviceId}` record.

## Persistence rules

The local ID is stored under `borowka.deviceId`. If browser data is cleared, the
next app launch creates a new ID. This is expected and means the app sees the
browser as a new installation.

Private browsing or unavailable local storage cannot be treated as reliable
field-work storage. Stage 6.2 already warns users not to use private mode for
offline work.

## Usage

The same identity is used for:

- `devices/{deviceId}` registration with `userUid`, friendly name and platform;
- trusted offline consent for the current user and device;
- diagnostics and profile display;
- `createdDeviceId` on harvest sessions and harvest entries;
- audit/conflict diagnostics in later synchronization packages.

## Code reference

- `src/domain/device.ts`
- `src/domain/device.test.ts`
- `src/devices/deviceIdentity.ts`
- `src/devices/deviceIdentity.test.ts`
- `src/devices/deviceRegistry.ts`
- `src/app/App.tsx`
- `src/app/App.test.tsx`
- `src/harvest/openHarvestSession.ts`
- `src/harvest/harvestEntryRuntime.ts`
