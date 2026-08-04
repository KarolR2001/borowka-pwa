# Etap 8.17 - raport rownoleglej sprzedazy

## Cel

Test sprawdza granice klientowego preflightu bez zaufanej funkcji serwerowej.
Dwie niezalezne proby sprzedazy otrzymuja ten sam swiezy stan, przechodza drugi
odczyt i rozpoczynaja zapis dopiero, gdy obie sa gotowe.

## Dane scenariusza

- sezon: `season-1`;
- potwierdzony zbior: `10000 g`;
- pierwsza sprzedaz: `6000 g`;
- druga sprzedaz: `6000 g`;
- suma sprzedazy: `12000 g`;
- oczekiwany stan po obu zapisach: `-2000 g`.

## Wynik

| Pytanie                                           | Wynik                                                                               |
| ------------------------------------------------- | ----------------------------------------------------------------------------------- |
| Czy obie operacje przeszly pierwszy preflight?    | Tak, obie odczytaly `10000 g`.                                                      |
| Czy oba drugie swieze odczyty zaakceptowaly stan? | Tak, bariera testowa potwierdzila oba odczyty przed pierwszym zapisem.              |
| Czy obie sprzedaze zostaly zapisane?              | Tak, dwa rozne dokumenty maja status `ACTIVE`.                                      |
| Czy wykryto zmiane rownolegla?                    | Tak, co najmniej jeden odczyt po zapisie zwrocil inny stan niz oczekiwane `4000 g`. |
| Czy powstal stan ujemny?                          | Tak, zrodla i pulpit zwrocily `-2000 g`.                                            |
| Czy alarm zadzialal?                              | Tak, pulpit pokazal alarm, a kolejny preflight zwrocil `BLOCKED`.                   |
| Czy Rules zserializowaly operacje?                | Nie. Kazdy batch byl poprawny niezaleznie.                                          |

Test Firestore Emulatora zakonczyl sie wynikiem `PASS`. PASS oznacza, ze
scenariusz odtworzyl i wykryl ograniczenie zgodnie z oczekiwaniem; nie oznacza,
ze rownolegla sprzedaz jest bezpieczna.

## Ograniczenie modelu

Odczyty zapytan po sesjach i sprzedazach oraz batch tworzacy nowa sprzedaz nie
sa jedna transakcja. Firestore Rules nie potrafia policzyc stanu przez agregacje
wszystkich dokumentow sezonu. Dwa rozne dokumenty sprzedazy moga wiec przejsc
Rules na podstawie tego samego stanu odczytanego przez klientow.

Ponowne przeliczenie i alarm ograniczaja czas niewykrytej niespojnosci, ale nie
cofaja automatycznie zaakceptowanej operacji. Naprawa wymaga anulowania blednego
dokumentu albo jawnej korekty.

## Ocena ryzyka

Wariant z wieloma urzadzeniami zapisujacymi sprzedaz jest **nieakceptowalny**.
Dla MVP ryzyko jest warunkowo akceptowalne tylko przy obowiazkowym procesie:

- zwykla sprzedaz jest rejestrowana na jednym wyznaczonym urzadzeniu
  administracyjnym;
- drugi administrator nie otwiera formularza sprzedazy na innym urzadzeniu;
- alarm ujemnego lub niespojnego stanu blokuje kolejne zwykle sprzedaze do
  jawnej naprawy;
- wlasciciel potwierdza ograniczenie przed pilotazem i produkcja.

Jezeli gospodarstwo wymaga sprzedazy z wielu urzadzen, wdrozenie produkcyjne
jest zablokowane do dodania zaufanej funkcji serwerowej albo innego serwerowego
mechanizmu serializacji i ponownego wykonania tego testu.

## Automatyzacja

Scenariusz znajduje sie w
`tests/integration/sale-stock-preflight.test.ts`. Produkcyjna funkcja udostepnia
wstrzykiwany punkt `afterFreshStockAccepted`, ktory w tescie tworzy bariere
dwoch uczestnikow po drugim preflighcie, bez zmiany domyslnego przebiegu
aplikacji.

Android Emulator/ADB i fizyczne telefony nie sa czescia tego testu.
