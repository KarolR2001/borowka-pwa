# CSV dla polskiego Excela

## Kontrakt formatu

Pakiet 9.2 wprowadza wspolny serializer `src/reports/polishExcelCsv.ts` dla
raportow CSV. Kazdy plik:

- jest kodowany jako UTF-8 i zaczyna sie od BOM;
- ma pierwszy wiersz `sep=;`, aby Excel wybral srednik;
- uzywa srednika jako separatora i CRLF jako zakonczenia wiersza;
- ujmuje kazda komorke w cudzyslow i podwaja cudzyslow wewnetrzny;
- zachowuje polskie znaki, sredniki i nowe linie wewnatrz komorki;
- ma MIME `text/csv;charset=utf-8`;
- otrzymuje nazwe z bezpiecznego prefiksu i czasu UTC ISO.

## Typy wartosci

- daty biznesowe pozostaja w stabilnym `YYYY-MM-DD` i sa walidowane jako
  rzeczywiste daty;
- czas wygenerowania jest normalizowany do UTC ISO;
- kwoty sa liczone z calkowitych groszy i maja dokladnie dwa miejsca po
  przecinku;
- kilogramy i ilosci sa liczone z gramow/milli bez arytmetyki zmiennoprzecinkowej
  i maja maksymalnie trzy miejsca po przecinku;
- eksporty szczegolowe zachowuja osobne surowe kolumny groszy, gramow i milli;
- identyfikatory dokumentow i sezonow nie sa formatowane ani skrocane;
- statusy oraz metody platnosci maja polskie etykiety prezentacyjne, a nie
  surowe kody domenowe.

## Bezpieczenstwo formul

Komorka, ktorej pierwszy niekontrolny znak to `=`, `+`, `-` lub `@`, otrzymuje
prefiks apostrofu przed escapowaniem. Sprawdzenie uwzglednia spacje, tabulatory
i znaki kontrolne przed operatorem. Dotyczy to rowniez notatek, nazw, statusow,
identyfikatorow i wartosci ujemnych. Otwarcie CSV nie moze uruchomic formuly,
polecenia ani lacza pochodzacego z danych.

## Zmigrowane eksporty

### Wyplaty administratora

Eksport zawiera czas wygenerowania, liste `seasonId: nazwa`, liczbe rekordow,
identyfikatory wyplaty i sesji, stabilne daty, kwote PLN oraz surowe grosze,
polska metode i status, oznaczenie importu, autora, czasy, notatke i dane
anulowania. Generator i nazwa pliku korzystaja z jednego czasu UTC przekazanego
przez panel.

### Wlasne dane pickera

Istniejacy prywatny eksport zachowuje metadane zrodla, kompletnosci, `workerId`,
sezonu i zakresu. Sesje maja polskie statusy oraz oddzielne wartosci
prezentacyjne i surowe; wyplaty maja polskie statusy i metody. Ograniczenie do
wlasnego `workerId` i oznaczenie niepelnego cache nie ulegly zmianie.

## Weryfikacja

| Kontrola                                           | Stan    | Dowod                  |
| -------------------------------------------------- | ------- | ---------------------- |
| BOM, `sep=;`, srednik, CRLF i cudzyslowy           | PASS    | test serializera       |
| Polskie znaki, srednik, cudzyslow i nowa linia     | PASS    | test serializera       |
| Ochrona `=`, `+`, `-`, `@` i prefiksow kontrolnych | PASS    | test serializera       |
| Kwoty ujemne i dodatnie bez bledu zaokraglenia     | PASS    | test serializera       |
| Daty `YYYY-MM-DD`, UTC i bezpieczna nazwa pliku    | PASS    | test serializera       |
| Eksport wyplat po migracji                         | PASS    | test katalogu wyplat   |
| Eksport pickera po migracji                        | PASS    | test eksportu pickera  |
| Otwarcie w aktualnym Microsoft Excel               | PENDING | test manualny poza WSL |
| Otwarcie w LibreOffice/innym arkuszu               | PENDING | test manualny poza WSL |

W srodowisku WSL nie sa zainstalowane `libreoffice`, `soffice` ani `ssconvert`,
a zgodnie z zasadami projektu nie nalezy uruchamiac Windowsowego Excela z
linuksowego procesu. Oba testy manualne pozostaja bramka przed uznaniem
zgodnosci aplikacyjnej za pelna i przed PROD; automatyczne testy struktury nie
zastepuja rzeczywistego otwarcia pliku.
