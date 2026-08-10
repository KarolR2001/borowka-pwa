# Raport przenosnosci pelnego eksportu - etap 9.18

## Zakres

Pakiet potwierdza, ze archiwum `BOROWKA_FULL_CLOUD_EXPORT` w wersji 2 mozna
sprawdzic i zinterpretowac bez uruchamiania produkcyjnej aplikacji oraz bez
dostepu do Firebase. Kontrolnym importerem jest niezalezne narzedzie Node
`scripts/verify-full-cloud-export.mjs`; nie zapisuje ono danych do Firestore.

## Dowod automatyczny

Test `tests/scripts/full-cloud-export-portability.test.mjs` tworzy syntetyczny
eksport biezacego sezonu, zapisuje dwie kopie w roznych lokalizacjach i
potwierdza:

- identyczny SHA-256 obu archiwow;
- poprawne otwarcie ZIP i kompletny zestaw 15 kolekcji;
- zgodnosc formatu, manifestu, rozmiarow i SHA-256 plikow;
- unikalne identyfikatory oraz liczby dokumentow;
- liczbe pominiec;
- niezalezne od manifestu przeliczenie sum sezonu;
- wykrycie zmodyfikowanego pliku danych;
- wykrycie zmienionego podsumowania manifestu;
- odrzucenie tej samej sciezki i nieidentycznych kopii.

Celowany przebieg 2026-08-10: 2 pliki testowe, 7/7 testow `PASS`.

## Firebase Authentication

Eksport obejmuje dokumenty Firestore, ale nie konta Firebase Authentication.
Nie zawiera hasel ani mechanizmu ich odtworzenia. Raport walidatora zawsze
zwraca to ograniczenie jawnie. Odtworzenie kont wymaga odrebnej procedury
administracyjnej i ponownego nadania dostepu uzytkownikom.

## Bramka przed PROD

Automatyczny test nie dowodzi, ze dwie sciezki znajduja sie na niezaleznych
nosnikach. Przed wdrozeniem produkcyjnym administrator musi:

1. wygenerowac pelny eksport z Firebase DEV na realistycznym zestawie danych;
2. potwierdzic brak nieoczekiwanych pominiec;
3. zapisac identyczny ZIP w dwoch zabezpieczonych, niezaleznych lokalizacjach;
4. uruchomic `npm run export:verify-portability` dla obu kopii;
5. zachowac wynik JSON razem z eksportem;
6. porownac liczby dokumentow i sumy z widokiem administracyjnym DEV.

Do czasu wykonania tego przebiegu bramka rzeczywistego nosnika ma status
`PENDING`; nie blokuje dalszej implementacji, ale blokuje PROD.
