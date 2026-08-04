# Stan pulpitow offline

## Zrodla i swiezosc

Pakiet 8.13 rozdziela trzy zrodla danych pulpitu:

- `SERVER` - wynik pobrany online z Firestore;
- `LOCAL_SNAPSHOT` - ostatni udany wynik serwera zapisany lokalnie;
- `CACHE` - awaryjny odczyt dokumentow z cache Firestore operatora.

Snapshot zachowuje czas pierwotnego odczytu serwera. Czas otwarcia pulpitu
offline nie moze go zastapic. Interfejs zawsze ostrzega, ze wynik offline jest
historyczny i ze inne urzadzenia moga miec niezsynchronizowane zmiany.

Snapshot ma wersje schematu, rodzaj pulpitu i `ownerUid`. Klucze administratora
i operatora sa rozdzielone. Nieprawidlowy, obcy lub niezgodny wersja payload
jest ignorowany. Jawne czyszczenie danych lokalnych usuwa oba snapshoty konta.

## Lokalna prognoza

Prognoza nie zmienia oficjalnych metryk. Jest liczona osobno z lokalnego
dziennika synchronizacji biezacego urzadzenia:

- uwzglednia tylko dokumenty `HARVEST_SESSION` ze statusem lokalnym albo
  oczekujacym;
- dekoduje pelny snapshot sesji i odrzuca dane nieprawidlowe;
- ogranicza sesje do aktywnego sezonu, a u administratora takze do okresu;
- do masy dodaje tylko sesje `CLOSED` lub `PAID`;
- sesje `OPEN` sa widoczne w liczniku, ale nie zwiekszaja masy;
- deduplikuje sesje wedlug identyfikatora.

Karta `Dostepne wg serwera` pozostaje wartoscia oficjalna. Karty `Lokalne sesje
poza stanem` i `Przewidywane lokalnie` opisuja wylacznie biezace urzadzenie.

## Operacje offline

Zmiana sezonu, okresu i odswiezenie serwerowe sa zablokowane offline. Operator
moze nadal przejsc do `Nowy zbior`, poniewaz zbiory maja przeplyw offline-first.
Sprzedaz, korekta i anulowanie sprzedazy wymagaja polaczenia online oraz
swiezego sprawdzenia stanu i nie moga zostac zapisane z pulpitu offline.

## Pokrycie

- magazyn, izolacja, czyszczenie i prognoza:
  `src/dashboard/dashboardOfflineState.test.ts`;
- administrator: `src/dashboard/AdminDashboardPanel.test.tsx`;
- operator: `src/dashboard/operatorDashboard.test.ts` i
  `src/dashboard/OperatorDashboardPanel.test.tsx`;
- blokada sprzedazy: `src/sales/OrdinarySaleForm.test.tsx` i
  `src/sales/SaleCorrectionForm.test.tsx`.
