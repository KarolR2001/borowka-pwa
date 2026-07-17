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

## Przyszle rozszerzenia

| ID           | Przypadek                                             | Etap     |
| ------------ | ----------------------------------------------------- | -------- |
| CALC-FUT-001 | Sprzedaz zwykla liczona z pelnej precyzji masy        | Etap 8   |
| CALC-FUT-002 | Korekta sprzedazy, w tym historyczny przypadek -20 zl | Etap 8/9 |
| CALC-FUT-003 | Anulowanie sprzedazy i wplyw na stan                  | Etap 8   |
| CALC-FUT-004 | Wyplata jednej zamknietej sesji                       | Etap 7   |
| CALC-FUT-005 | Anulowanie wyplaty i powrot sesji do `CLOSED`         | Etap 7   |
| CALC-FUT-006 | Sesja importowana z historyczna kwota nadrzedna       | Etap 9   |

## Minimalne pokrycie automatyczne

Przed zamknieciem Etapu 5 testy musza pokryc scenariusze `CALC-001` -
`CALC-014`. Przyszle rozszerzenia musza zostac przeniesione do testow w
odpowiednich etapach.
