# Firebase Emulator Suite

## Local toolchain

This workspace uses ignored local tools:

- Node.js: `.tools/node-v24.14.0-linux-x64`
- Java: `.tools/jdk-21.0.11+10-jre`

The repo does not commit these binaries. CI installs Java with `actions/setup-java`.

## Commands

```bash
PATH=.tools/node-v24.14.0-linux-x64/bin:$PATH npm run emulators:start
PATH=.tools/node-v24.14.0-linux-x64/bin:$PATH npm run test:rules
```

`test:rules` runs:

- Firebase CLI `15.23.0` through `npx`;
- Firestore emulator in demo project `demo-borowka-pwa-dev`;
- Vitest tests from `tests/rules`.

The demo project ID prevents accidental contact with real Firebase services during emulator tests.

## Environment flags

Local `.env.local` should keep:

```bash
VITE_APP_ENV=local
VITE_USE_FIREBASE_EMULATORS=true
VITE_FIREBASE_EMULATOR_HOST=127.0.0.1
VITE_FIREBASE_AUTH_EMULATOR_PORT=9099
VITE_FIRESTORE_EMULATOR_PORT=8080
```

Production must keep `VITE_USE_FIREBASE_EMULATORS=false`.

## Current rules coverage

- Anonymous users cannot read Firestore.
- Anonymous users cannot write Firestore.
- Authenticated users cannot read Firestore before profile rules exist.
- Authenticated users cannot write Firestore before profile rules exist.

Rules will be expanded with each functional module and every expansion must include positive and negative tests.
