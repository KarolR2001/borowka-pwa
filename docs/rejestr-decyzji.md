# Rejestr decyzji

## DEC-0001 - Lokalizacja repozytorium

- Status: zaakceptowana
- Data: 2026-07-15
- Decyzja: repozytorium powstaje w podfolderze `borowka-pwa`.
- Uzasadnienie: pliki PRD, plany i eksporty HTML z katalogu nadrzednego nie powinny przypadkowo wejsc do historii Git nowego projektu.
- Skutki: dokumenty zrodlowe pozostaja poza repo, ale README wskazuje je jako zrodla wymagan.

## DEC-0002 - Strategia galezi

- Status: zaakceptowana
- Data: 2026-07-15
- Decyzja: `main` jest stabilna galezia development, a prace ida na krotkich galeziach funkcjonalnych.
- Uzasadnienie: zgodne ze szczegolowym planem implementacji i pozwala wykonywac testowane commity.
- Skutki: kazdy etap lub pakiet prac ma oddzielna galaz.

## DEC-0003 - Toolchain

- Status: zaakceptowana technicznie
- Data: 2026-07-15
- Decyzja: Node.js `24.14.0`, npm `11.9.0`, React, TypeScript, Vite i Vitest.
- Uzasadnienie: Node 24 jest linia LTS, a Vite/React/TypeScript pasuja do rekomendowanej architektury PRD.
- Skutki: repo ma `.nvmrc`, `engines` i `packageManager`; zaleznosci sa blokowane przez `package-lock.json`.

## DEC-0004 - Poczatkowe Security Rules

- Status: zaakceptowana
- Data: 2026-07-15
- Decyzja: poczatkowe reguly Firestore odmawiaja kazdego odczytu i zapisu.
- Uzasadnienie: plan wymaga startu od deny by default.
- Skutki: aplikacja nie ma jeszcze dostepu do danych biznesowych; dostepy beda rozszerzane wraz z testami Rules.

## DEC-0005 - Dlugosc sesji zbioru

- Status: do zatwierdzenia przed implementacja sesji
- Rekomendacja: jedna sesja = jedna osoba i jedna data biznesowa.
- Powod: prostsze raportowanie dzienne, snapshot stawki i synchronizacja.
- Wymagane od uzytkownika: akceptacja albo decyzja o wariancie wielodniowym.

## DEC-0006 - Reset hasla w MVP

- Status: do zatwierdzenia przed implementacja kont
- Rekomendacja: standardowy reset hasla Firebase przez e-mail.
- Powod: MVP nie ma backendu, a administrator aplikacji nie powinien poznawac hasla innej osoby.
- Wymagane od uzytkownika: akceptacja procesu.

## DEC-0007 - Prerejestracja bez backendu

- Status: do zatwierdzenia przed implementacja kont
- Rekomendacja: administrator tworzy zaproszenie, uzytkownik zaklada konto Firebase na ten sam e-mail, aplikacja laczy konto z zaproszeniem.
- Wymagane od uzytkownika: decyzja o weryfikacji e-mail, czasie waznosci i anulowaniu zaproszen.

## DEC-0008 - Historyczna ujemna sprzedaz

- Status: do recznego rozstrzygniecia przed migracja produkcyjna
- Problem: jeden wpis sprzedazy ma brakujaca date oraz ujemna cene i przychod.
- Wymagane od uzytkownika: potwierdzenie, czy to korekta, jaka ma date i jak wplywa na stan.
