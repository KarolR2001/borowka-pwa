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
- Sesje i wpisy: testy kalkulatora, statusow i blokad edycji.
- Offline: test trybu samolotowego, restartu i ponownej synchronizacji.
- Wyplaty: test blokady drugiej aktywnej wyplaty.
- Sprzedaz: test blokady sprzedazy ponad stan i anulowania.
