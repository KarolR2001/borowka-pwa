# Etap 5 - raport testow E2E

Ten raport sledzi punkt 8.24. Pierwszy przyrost dodaje harness Playwright dla
aplikacji webowej uruchamianej w WSL oraz stabilny smoke test pierwszego ekranu.
Seeded harvest E2E uruchamia ten sam UI przez kontrolowany harness danych, bez
sekretow Firebase i bez recznego seedowania DEV. Scenariusz obejmuje tez
adminowa korekte potwierdzonego wpisu przez anulowanie i dodanie wpisu
zastepczego, ponowne zamkniecie skorygowanej sesji i anulowanie sesji testowej.

## Pokrycie 8.24

| Wymaganie 8.24                      | Pokrycie                                                  | Status  |
| ----------------------------------- | --------------------------------------------------------- | ------- |
| Harness E2E web                     | `playwright.config.ts`, `tests/e2e/app-shell.spec.ts`     | OK      |
| Aplikacja startuje w przegladarce   | Smoke: glowny naglowek, nawigacja i diagnostyka           | OK      |
| Administrator tworzy osobe i stawke | Wymaga runtime E2E danych/admin flow                      | TODO    |
| Operator widzi otwarta sesje        | Runtime panel czyta `harvestSessions` i `harvestEntries`  | OK      |
| Operator otwiera sesje              | Seeded browser E2E + runtime UI                           | OK      |
| Operator dodaje 10 wpisow           | Seeded browser E2E + runtime UI                           | OK      |
| Operator poprawia wpis              | Admin cancel + replacement w seeded E2E; local edit czeka | PARTIAL |
| Operator zamyka sesje               | Seeded browser E2E + runtime UI                           | OK      |
| Blokada wpisu po zamknieciu         | Seeded browser E2E potwierdza brak aktywnej sesji         | OK      |
| Admin reopen, anulowanie i reclose  | Reopen, cancel entry, replacement, reclose i cancel       | OK      |
| Picker widzi wlasna sesje           | Pokryte Rules/integracyjnie; E2E UI do dodania            | TODO    |

## Uruchamianie lokalne

```bash
PATH="$PWD/.tools/node-v24.14.0-linux-x64/bin:$PATH" npm run verify:e2e
```

Playwright uzywa lokalnego preview Vite pod `http://127.0.0.1:4173`.
W nowym WSL moze byc wymagane jednorazowe doinstalowanie bibliotek Chromium:

```bash
PATH="$PWD/.tools/node-v24.14.0-linux-x64/bin:$PATH" npx playwright install-deps chromium
```
