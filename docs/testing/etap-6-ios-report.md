# Etap 6 - raport testow iOS

Raport realizuje pakiet 6.25. Pelne zaliczenie wymaga wykonania calego
przebiegu na rzeczywistym iPhonie. Test w przegladarce desktopowej ani
symulator nie spelnia tego kryterium.

## Status

- Wynik: `SKIPPED`
- Powod: fizyczny iPhone nie jest obecnie dostepny.
- Decyzja: 2026-07-28 wlasciciel produktu jawnie odroczyl testy na fizycznych
  telefonach i zezwolil na kontynuowanie implementacji.
- Zakres: IOS-01 do IOS-10 pozostaja `NOT RUN`; status `SKIPPED` nie jest
  rownowazny z `PASS`.

## Ryzyko odchylenia

Na rzeczywistym iOS nie potwierdzono instalacji PWA, trybu standalone,
utrzymania danych po dluzszym zamknieciu, pracy offline, synchronizacji,
aktualizacji ani czyszczenia danych po usunieciu aplikacji. Nie zweryfikowano
tez roznic miedzy PWA uruchomiona z ekranu glownego i Safari w karcie.
Scenariusz trzeba wykonac przed pilotazem terenowym lub wdrozeniem
produkcyjnym.

## Metryka przyszlego przebiegu

Uzupelnic bez danych logowania i innych sekretow:

| Pole                       | Wartosc           |
| -------------------------- | ----------------- |
| Data i czas                | `DO UZUPELNIENIA` |
| Tester                     | `DO UZUPELNIENIA` |
| Model iPhone               | `DO UZUPELNIENIA` |
| Wersja iOS                 | `DO UZUPELNIENIA` |
| Wersja Safari              | `DO UZUPELNIENIA` |
| Commit aplikacji           | `DO UZUPELNIENIA` |
| Wersja aplikacji           | `DO UZUPELNIENIA` |
| Srodowisko Firebase        | `development`     |
| Czas pozostawienia offline | `DO UZUPELNIENIA` |

## Scenariusz obowiazkowy

| ID     | Krok                                                      | Oczekiwany wynik                                                                   | Wynik     | Dowod |
| ------ | --------------------------------------------------------- | ---------------------------------------------------------------------------------- | --------- | ----- |
| IOS-01 | Dodaj aplikacje z Safari do ekranu glownego.              | Ikona PWA jest dostepna na ekranie glownym.                                        | `NOT RUN` |       |
| IOS-02 | Uruchom aplikacje z ekranu glownego.                      | Aplikacja dziala w trybie standalone.                                              | `NOT RUN` |       |
| IOS-03 | Przygotuj dane online i wlacz zgode zaufanego urzadzenia. | Diagnostyka potwierdza gotowosc offline.                                           | `NOT RUN` |       |
| IOS-04 | Wlacz tryb samolotowy i utworz wpisy oraz zamknij sesje.  | Dane sa zapisywane lokalnie i pozostaja oczekujace.                                | `NOT RUN` |       |
| IOS-05 | Zamknij PWA na dluzszy czas i uruchom ponownie offline.   | Sesja i wpisy pozostaja dostepne bez utraty danych.                                | `NOT RUN` |       |
| IOS-06 | Odzyskaj siec i ponownie otworz PWA.                      | Synchronizacja uruchamia sie albo mozna ja jawnie wywolac.                         | `NOT RUN` |       |
| IOS-07 | Potwierdz dane po synchronizacji w Firebase development.  | Liczba UUID i sumy odpowiadaja danym lokalnym, bez duplikatow.                     | `NOT RUN` |       |
| IOS-08 | Udostepnij nowa wersje PWA i zastosuj aktualizacje.       | Aktualizacja zachowuje dane i aktywuje sie dopiero w bezpiecznym momencie.         | `NOT RUN` |       |
| IOS-09 | Wyloguj uzytkownika, a nastepnie wyczysc dane urzadzenia. | Blokady pending dzialaja, a po czyszczeniu nie pozostaja dane poprzedniego konta.  | `NOT RUN` |       |
| IOS-10 | Porownaj PWA standalone, Safari w karcie i usuniecie PWA. | Raport opisuje roznice oraz konsekwencje dla cache i niezsynchronicowanych danych. | `NOT RUN` |       |

## Kryterium zaliczenia

- IOS-01 do IOS-10 maja wynik `PASS`;
- raport zawiera metryke urzadzenia i dowody bez sekretow;
- liczba UUID i sumy po synchronizacji odpowiadaja danym lokalnym;
- po aktualizacji i dluzszym zamknieciu nie zniknely dane;
- po czyszczeniu nie pozostaly dane poprzedniego konta.

Jawne odroczenie opisane w tym raporcie dopuszcza zamkniecie pakietu 6.25 ze
statusem `SKIPPED`, ale nie spelnia bramki gotowosci do pilotazu ani produkcji.
