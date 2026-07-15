# Srodowisko lokalne

## Instalacja

1. Zainstaluj Node.js `24.14.0`.
2. Uruchom:

```bash
npm ci
npm run dev
```

## Konfiguracja Firebase

Skopiuj `.env.example` do `.env.local` i wpisz publiczna konfiguracje projektu development.

Nie wpisuj w `.env.local` zadnych sekretow administracyjnych. Webowa konfiguracja Firebase klienta jest publiczna, ale musi wskazywac development podczas pracy lokalnej.

## Weryfikacja

```bash
npm run verify
```

## Emulator Suite

Emulatory Firebase beda uruchamiane od Etapu 2. Do testow Rules i integracji wymagane beda:

- Java;
- Firebase CLI;
- syntetyczne dane startowe.
