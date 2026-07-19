# Macierz testow

## Warstwy

- Jednostkowe: czyste obliczenia, formatowanie i walidacje.
- Komponentowe: podstawowe stany ekranow.
- Integracyjne: Authentication i Firestore na emulatorach.
- Security Rules: pozytywne i negatywne przypadki dostepu.
- E2E: glowne przeplywy wedlug roli.
- Offline: cache, lokalne zapisy, synchronizacja i aktualizacja PWA.
- UAT: scenariusze biznesowe z dokumentu `Scenariusze.md`.

## Minimalny pakiet dla Etapu 1

- `npm run format:check`
- `npm run lint`
- `npm run typecheck`
- `npm run test`
- `npm run build`

## Rozszerzenia dla kolejnych etapow

- Konta i role: testy Rules dla anonimowego, pending, aktywnego, zablokowanego i niekompletnego profilu.
  - Etap 3 / model profilu: anonimowy nie czyta profilu, aktywny uzytkownik czyta wlasny profil, zablokowany profil nie czyta danych, operator nie listuje uzytkownikow, administrator listuje profile.
- Etap 4 / konfiguracja domenowa: raport bramki wyjscia w `docs/testing/etap-4-configuration-report.md`.
- Etap 5 / sesje online: minimalne scenariusze obliczen w `docs/domain/calculation-scenarios.md`.
- Etap 5.1 / model stanu sesji: przejscia statusow w `src/harvest/harvestSessionState.test.ts` i dokumentacja w `docs/domain/harvest-session-state.md`.
- Etap 5.2/5.3 / otwieranie sesji: snapshot, wybor stawki i istniejace otwarte sesje w `src/harvest/openHarvestSession.test.ts`.
- Etap 5.4 / ekran aktywnej sesji: stale widoczne pola sesji, akcje i lista wpisow w `src/harvest/ActiveHarvestSessionPanel.test.tsx`.
- Etap 5.5 / formularz ubianki: szybkie ilosci, opcjonalna waga, reset formularza i draft lokalny w `src/harvest/UbiankaEntryForm.test.tsx`.
- Etap 5.6 / formularz za kilogram: walidacja wagi, przeliczenie na gramy i podglad kwoty w `src/harvest/WeightEntryForm.test.tsx`.
- Etap 5.7 / inne plany ilosciowe: formularz generowany z konfiguracji planu w `src/harvest/GenericQuantityEntryForm.test.tsx`.
- Etap 5.8 / walidacja wpisu: sesja, autor, precyzja, waga, zakresy liczbowe i offline w `src/harvest/harvestEntryValidation.test.ts`.
- Etap 5.9 / UUID i idempotencja wpisu: rezerwacja `id`, retry tego samego dokumentu, deduplikacja listenera i blokada podwojnego submitu w `src/harvest/harvestEntryIdempotency.test.ts`, `src/harvest/ActiveHarvestSessionPanel.test.tsx` oraz testach formularzy wpisu.
- Etap 5.10 / lista wpisow: numer, ilosc, waga, czas, autor, synchronizacja, korekta, anulowanie i poprawa w `src/harvest/ActiveHarvestSessionPanel.test.tsx`.
- Etap 5.11 / poprawa przed zamknieciem: lokalna poprawa pending wpisu, administracyjna korekta potwierdzonego wpisu przez anulowanie i nowy UUID, blokady roli, sesji i urzadzenia w `src/harvest/harvestEntryCorrection.test.ts`.
- Etap 5.12 / obliczenia sesji: aktywne wpisy, anulowane wpisy, brak wagi, snapshot stawki, WEIGHT/QUANTITY, jedno zaokraglenie i bezpieczne zakresy w `src/harvest/harvestSessionCalculation.test.ts`.
- Etap 5.13 / ograniczenie zaufania bez backendu: wpisy jako zrodlo prawdy, przeliczenie przy zamknieciu, blokada recznej kwoty, kontrola agregatow i rekomendacja `REVIEW_REQUIRED` w `src/harvest/harvestSessionTrustBoundary.test.ts`.
- Etap 5.14 / zamkniecie sesji online: potwierdzenie, online-only, brak pending writes, walidacja sezonu/zbieracza/stawki, oficjalne sumy, rewizja i audyt w `src/harvest/closeHarvestSession.test.ts` oraz `tests/rules/firestore-audit-events.test.ts`.
- Etap 5.15 / ponowne otwarcie: tylko admin online, powod, brak aktywnej wyplaty, brak pending writes, wyczyszczenie biezacej kwoty oficjalnej, zachowanie poprzedniej kwoty w audycie i rewizja w `src/harvest/reopenHarvestSession.test.ts` oraz `tests/rules/firestore-audit-events.test.ts`.
- Etap 5.16 / anulowanie sesji: tylko admin online, powod, blokada aktywnej wyplaty, brak pending writes, status `CANCELLED`, zachowanie historycznych snapshotow i audyt w `src/harvest/cancelHarvestSession.test.ts` oraz `tests/rules/firestore-audit-events.test.ts`.
- Etap 5.17 / audyt operacji zbiorowych: katalog akcji sesji i wpisow, wymaganie powodow, summary zgodne z Rules, korekta wpisu jako anulowanie plus nowy wpis w `src/harvest/harvestAudit.test.ts`, `src/audit/auditEvents.test.ts` oraz `tests/rules/firestore-audit-events.test.ts`.
- Etap 5.18 / Security Rules sesji i wpisow: tworzenie sesji przez admina/operatora, blokady pickera i kont zablokowanych, aktywny worker, wpis do otwartej sesji, zgodnosc `sessionId`/`workerId`/`seasonId`/`businessDate`, dodatnie wartosci, kontrolowane update'y statusu, delete forbidden i izolacja pickera w `tests/rules/firestore-harvest.test.ts`.
- Etap 5.19 / zapytania i indeksy: kontrakt zapytan harvest, brak listenera wpisow calego sezonu, manifest indeksow i test spojnosc indeksow w `src/harvest/harvestQueries.test.ts` oraz `tests/scripts/firestore-indexes.test.ts`.
- Etap 5.22 / bramka testow jednostkowych: raport checklisty obliczen i statusow w `docs/testing/etap-5-unit-test-report.md`.
- Etap 5.23 / test integracyjny przeplywu sesji: emulator Firestore, 10 wpisow, listener wpisow konkretnej sesji, zamkniecie i blokada kolejnego wpisu w `tests/integration/harvest-session-flow.test.ts`.
- Etap 5.23 / korekta administracyjna integracyjnie: reopen admina, anulowanie wpisu, replacement entry, ponowne zamkniecie i anulowanie sesji w `tests/integration/harvest-session-flow.test.ts`.
- Etap 5.23 / negatywne scenariusze integracyjne: stale close, rownolegly close payload, blokada recznej zmiany snapshotu i odczytu cudzej sesji przez pickera w `tests/integration/harvest-session-flow.test.ts`.
- Sesje i wpisy: testy kalkulatora, statusow i blokad edycji.
- Offline: test trybu samolotowego, restartu i ponownej synchronizacji.
- Wyplaty: test blokady drugiej aktywnej wyplaty.
- Sprzedaz: test blokady sprzedazy ponad stan i anulowania.
