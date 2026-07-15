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
- Sesje i wpisy: testy kalkulatora, statusow i blokad edycji.
- Offline: test trybu samolotowego, restartu i ponownej synchronizacji.
- Wyplaty: test blokady drugiej aktywnej wyplaty.
- Sprzedaz: test blokady sprzedazy ponad stan i anulowania.
