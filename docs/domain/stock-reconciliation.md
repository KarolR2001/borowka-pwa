# Uzgodnienie stanu i alarm roznicy

## Zrodla porownania

Oficjalnym zrodlem stanu pozostaja dokumenty `harvestSessions` i `sales`.
Kolekcja `operationalStockMovements` jest odfiltrowana projekcja dla operatora,
a nie drugim zrodlem prawdy. Pakiet 8.14 porownuje oba obrazy dla jednego
sezonu przed zwykla sprzedaza.

`reconcileStockSources` buduje oczekiwany ruch dla kazdego dokumentu zrodlowego
z deterministycznym ID:

- `harvest-session-{sessionId}`;
- `sale-{saleId}`.

Kontrola porownuje identyfikator, sezon, typ zrodla, `sourceId` i podpisany
`weightImpactG`. Wykrywa:

- nieprawidlowe dokumenty zrodlowe;
- nieprawidlowe ruchy projekcji;
- brakujace ruchy;
- ruchy bez zrodla;
- ruchy niezgodne z aktualnym zrodlem;
- roznice sum;
- ujemny stan obliczony ze zrodel.

Raport definiuje roznice jako:

`differenceG = operationalAvailableWeightG - source.availableWeightG`

Wartosc ujemna oznacza, ze projekcja pokazuje mniej kilogramow niz zrodla.

## Blokada i naprawa

Kazdy problem raportu ustawia `blocksOrdinarySale = true`. Blokada jest
sprawdzana w trzech miejscach:

1. przy ladowaniu kontekstu sezonu do formularza;
2. przy przejsciu z formularza do potwierdzenia;
3. ponownie ze swiezych odczytow serwera przed zapisem.

Blokowana jest tylko zwykla sprzedaz. Korekta i anulowanie pozostaja dostepne,
aby administrator mogl jawnie naprawic dokument biznesowy. Aplikacja nie
zmienia automatycznie zrodel ani ruchow projekcji. Po korekcie, poprawieniu
zrodla albo kontrolowanej odbudowie projekcji administrator musi odswiezyc stan
i uzyskac raport bez problemow.

## Alarm i raport skladowych

Panel sprzedazy pokazuje dla problematycznego otwartego sezonu:

- nazwe sezonu;
- podpisana wartosc roznicy;
- przyczyny i liczbe dokumentow;
- zbiory potwierdzone, zwykla sprzedaz i oba kierunki korekt;
- stan ze zrodel oraz stan projekcji;
- oczekiwana i zapisana liczbe ruchow;
- identyfikatory dokumentow wymagajacych sprawdzenia.

Lista identyfikatorow w interfejsie jest ograniczona do 20 na przyczyne, ale
model raportu zachowuje komplet. Alarm nie jest pokazywany operatorowi ani
pickerowi, poniewaz raport zawiera skladowe sprzedazy.

## Pokrycie

- model uzgodnienia: `src/stock/stockReconciliation.test.ts`;
- blokada przygotowania i preflight:
  `src/sales/ordinarySalePreparation.test.ts` oraz
  `src/sales/saleStockPreflight.test.ts`;
- alarm i raport UI: `src/sales/AdminOrdinarySalesPanel.test.tsx`;
- brak ruchu w Firestore i brak zapisu sprzedazy:
  `tests/integration/sale-stock-preflight.test.ts`.
