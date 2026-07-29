# Wzorcowe scenariusze obliczen

Data: 2026-07-17

Dokument zbiera scenariusze wymagane przed Etapem 5. W Etapie 5 obowiazuja
scenariusze sesji i wpisow. Scenariusze sprzedazy, wyplat i migracji sa
zapisane jako przyszle rozszerzenia, bo odpowiadaja pozniejszym etapom planu.

## Reguly bazowe

- Jedna sesja dotyczy jednej osoby, jednego sezonu i jednej daty biznesowej.
- Oficjalna kwota jest liczona przy zamknieciu sesji.
- Oficjalna kwota jest liczona z aktywnych wpisow.
- Zaokraglenie nastepuje raz na poziomie sesji.
- Polowa grosza jest zaokraglana w gore.
- `calculationVersion` jest zapisywana w sesji.
- Migracja moze zachowac historyczna kwote jako wartosc nadrzedna, jesli
  historycznych danych nie da sie odtworzyc z pelnej precyzji.

## Scenariusze Etapu 5

| ID       | Przypadek                                            | Dane wejsciowe                                                               | Oczekiwany wynik                                                                                           |
| -------- | ---------------------------------------------------- | ---------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| CALC-001 | Plan za kilogram, pelne kg                           | stawka 1000 gr/kg, wpisy 1000 g i 2000 g                                     | suma 3000 g, kwota 3000 gr                                                                                 |
| CALC-002 | Plan za kilogram, gramy                              | stawka 1000 gr/kg, wpisy 1495 g i 2000 g                                     | suma 3495 g, kwota 3495 gr                                                                                 |
| CALC-003 | Plan za kilogram, polowa grosza                      | stawka 333 gr/kg, wpis 500 g                                                 | wynik surowy 166,5 gr, kwota 167 gr                                                                        |
| CALC-004 | Plan za ubianke, pelna ilosc                         | stawka 1500 gr/ubianke, wpisy 1000 i 2000 `quantityMilli`                    | suma 3000 `quantityMilli`, kwota 4500 gr                                                                   |
| CALC-005 | Plan za ubianke, 0,5                                 | stawka 1500 gr/ubianke, wpis 500 `quantityMilli`                             | kwota 750 gr                                                                                               |
| CALC-006 | Wpis zbiorczy                                        | stawka 1500 gr/ubianke, jeden wpis 3000 `quantityMilli`, waga 8700 g         | kwota 4500 gr, masa magazynowa 8700 g                                                                      |
| CALC-007 | Kilka wpisow w jednej sesji                          | aktywne wpisy 1000 g, 1200 g, 800 g                                          | suma 3000 g, licznik aktywnych wpisow 3                                                                    |
| CALC-008 | Wpis anulowany                                       | aktywny wpis 1000 g, anulowany wpis 1000 g                                   | suma 1000 g, licznik aktywnych wpisow 1                                                                    |
| CALC-009 | Zmiana stawki miedzy sesjami                         | sesja A snapshot 1000 gr/kg, sesja B snapshot 1200 gr/kg                     | sesja A nie zmienia kwoty po zmianie stawki                                                                |
| CALC-010 | Sesja otwarta przed zmiana stawki                    | sesja ma snapshot 1000 gr/kg, potem aktywna stawka zmienia sie na 1200 gr/kg | zamkniecie sesji uzywa snapshotu 1000 gr/kg albo trafia do przegladu tylko przy jawnie wykrytym konflikcie |
| CALC-011 | Wpis bez wagi w planie ilosciowym bez wymaganej wagi | stawka 1500 gr/ubianke, wpis 1000 `quantityMilli`, `weightG = null`          | kwota 1500 gr, masa magazynowa nie wzrasta                                                                 |
| CALC-012 | Wpis bez wymaganej wagi w planie wagowym             | plan `WEIGHT`, `weightG = null`                                              | walidacja odrzuca wpis                                                                                     |
| CALC-013 | Zamkniecie pustej sesji                              | sesja `OPEN`, brak aktywnych wpisow                                          | walidacja odrzuca zamkniecie                                                                               |
| CALC-014 | Druga sesja tej samej osoby i dnia                   | istnieje sesja tej samej osoby i daty                                        | nowa sesja wymaga jawnego potwierdzenia                                                                    |

## Scenariusze sprzedazy Etapu 8

| ID           | Przypadek                                  | Dane wejsciowe              | Oczekiwany wynik                             |
| ------------ | ------------------------------------------ | --------------------------- | -------------------------------------------- |
| CALC-SALE-01 | Pelne kilogramy                            | 3000 g, 1250 gr/kg          | 3750 gr, `calculationVersion = "1"`          |
| CALC-SALE-02 | Ponizej polowy grosza                      | 1 g, 499 gr/kg              | 0 gr                                         |
| CALC-SALE-03 | Dokladnie polowa grosza                    | 1 g, 500 gr/kg              | 1 gr                                         |
| CALC-SALE-04 | Wszystkie gramy i jedno zaokraglenie       | 12 345 g, 1550 gr/kg        | 19 134,750 gr przed zaokragleniem, 19 135 gr |
| CALC-SALE-05 | Cena zero                                  | 1500 g, 0 gr/kg             | 0 gr                                         |
| CALC-SALE-06 | Niespojna kwota albo wersja podczas zapisu | 3000 g, 1250 gr/kg, 3749 gr | zapis odrzucony                              |

Regula i jej granice sa opisane w
`docs/domain/sale-revenue-calculation.md`.

## Scenariusze korekt sprzedazy Etapu 8

| ID           | Przypadek                  | Dane wejsciowe                               | Oczekiwany wynik                        |
| ------------ | -------------------------- | -------------------------------------------- | --------------------------------------- |
| CALC-CORR-01 | Zwrot do stanu             | `INCREASE_STOCK`, 3000 g, 1250 gr/kg         | stan `+3000 g`, przychod `-3750 gr`     |
| CALC-CORR-02 | Dodatkowy rozchod          | `DECREASE_STOCK`, 12 345 g, 1550 gr/kg       | stan `-12 345 g`, przychod `+19 135 gr` |
| CALC-CORR-03 | Brak jawnego kierunku      | `CORRECTION`, `correctionDirection = null`   | zapis odrzucony                         |
| CALC-CORR-04 | Brak powodu                | `CORRECTION`, `note = null`                  | zapis odrzucony                         |
| CALC-CORR-05 | Niespojny podpisany wplyw  | `INCREASE_STOCK`, przychod audytu `+3750 gr` | batch odrzucony                         |
| CALC-CORR-06 | Zmiana stanu przed zapisem | potwierdzono 10 kg, serwer zwraca potem 8 kg | bez zapisu, wymagane nowe potwierdzenie |

## Przyszle rozszerzenia

| ID           | Przypadek                                          | Etap   |
| ------------ | -------------------------------------------------- | ------ |
| CALC-FUT-002 | Reczna klasyfikacja historycznego przypadku -20 zl | Etap 9 |
| CALC-FUT-003 | Anulowanie sprzedazy i wplyw na stan               | Etap 8 |
| CALC-FUT-004 | Wyplata jednej zamknietej sesji                    | Etap 7 |
| CALC-FUT-005 | Anulowanie wyplaty i powrot sesji do `CLOSED`      | Etap 7 |
| CALC-FUT-006 | Sesja importowana z historyczna kwota nadrzedna    | Etap 9 |

## Minimalne pokrycie automatyczne

Etap 5.12 pokrywa automatycznie scenariusze `CALC-001` - `CALC-012` w
`src/harvest/harvestSessionCalculation.test.ts`. Etap 5.13 pokrywa domenowa
czesc `CALC-013`, blokujac przygotowanie zamkniecia pustej sesji w
`src/harvest/harvestSessionTrustBoundary.test.ts`. Przed zamknieciem Etapu 5
nadal trzeba pokryc integracyjny przeplyw zamkniecia sesji oraz `CALC-014` w
przeplywach zamkniecia i otwierania sesji.

Pakiet 8.5 pokrywa `CALC-SALE-01` - `CALC-SALE-05` w
`src/sales/saleRevenueCalculation.test.ts`, prezentacje metody w
`src/sales/OrdinarySaleForm.test.tsx` oraz `CALC-SALE-06` w
`tests/rules/firestore-sales.test.ts`. Pozostale przyszle rozszerzenia musza
zostac przeniesione do testow w odpowiednich etapach.

Pakiet 8.6 pokrywa `CALC-CORR-01` - `CALC-CORR-06` w
`src/sales/saleCorrectionPreparation.test.ts`,
`src/sales/saleCorrectionWrite.test.ts`,
`src/sales/AdminOrdinarySalesPanel.test.tsx`,
`tests/rules/firestore-sales.test.ts` oraz
`tests/integration/sale-stock-preflight.test.ts`.
