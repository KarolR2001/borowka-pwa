# Etap 5 - raport testow E2E

Ten raport sledzi punkt 8.24. Pierwszy przyrost dodaje harness Playwright dla
aplikacji webowej uruchamianej w WSL oraz stabilny smoke test pierwszego ekranu.
Pelny scenariusz harvest E2E pozostaje do podlaczenia po runtime UI sesji.

## Pokrycie 8.24

| Wymaganie 8.24                      | Pokrycie                                                 | Status |
| ----------------------------------- | -------------------------------------------------------- | ------ |
| Harness E2E web                     | `playwright.config.ts`, `tests/e2e/app-shell.spec.ts`    | OK     |
| Aplikacja startuje w przegladarce   | Smoke: glowny naglowek, nawigacja i diagnostyka          | OK     |
| Administrator tworzy osobe i stawke | Wymaga runtime E2E danych/admin flow                     | TODO   |
| Operator otwiera sesje              | Wymaga podlaczenia `ActiveHarvestSessionPanel` do danych | TODO   |
| Operator dodaje 10 wpisow           | Pokryte integracyjnie; E2E UI do dodania                 | TODO   |
| Operator poprawia wpis              | Pokryte domenowo/integracyjnie; E2E UI do dodania        | TODO   |
| Operator zamyka sesje               | Pokryte domenowo/integracyjnie; E2E UI do dodania        | TODO   |
| Blokada wpisu po zamknieciu         | Pokryte integracyjnie; E2E UI do dodania                 | TODO   |
| Admin reopen, anulowanie i reclose  | Pokryte integracyjnie; E2E UI do dodania                 | TODO   |
| Picker widzi wlasna sesje           | Pokryte Rules/integracyjnie; E2E UI do dodania           | TODO   |

## Uruchamianie lokalne

```bash
PATH="$PWD/.tools/node-v24.14.0-linux-x64/bin:$PATH" npm run verify:e2e
```

Playwright uzywa lokalnego preview Vite pod `http://127.0.0.1:4173`.
W nowym WSL moze byc wymagane jednorazowe doinstalowanie bibliotek Chromium:

```bash
PATH="$PWD/.tools/node-v24.14.0-linux-x64/bin:$PATH" npx playwright install-deps chromium
```
