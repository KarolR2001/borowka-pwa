# Etap 8.19 - raport wydajnosci pulpitu

## Metoda

Pomiar wykonano 2026-08-04 w WSL/Linux przez produkcyjne
`loadAdminDashboard` i lokalny Firestore Emulator. Zestaw syntetyczny zawieral:

- 5 sezonow, w tym 4 sezony z danymi izolacyjnymi;
- 1200 sesji, 600 sprzedazy i 600 wyplat w wybranym sezonie;
- po 50 sesji, sprzedazy i wyplat w kazdym z 4 pozostalych sezonow;
- 100 aktywnych zbieraczy;
- 3000 wpisow zbioru, ktorych pulpit nie powinien odczytywac;
- 6106 dokumentow lacznie z profilem i sezonami.

Test uzywa Security Rules aktywnego administratora przy odczycie. Dane
syntetyczne sa przygotowywane przy wylaczonych Rules, aby czas seedowania nie
zostal pomylony z czasem pulpitu. Limit 10 sekund jest szerokim bezpiecznikiem
regresji CI, a nie docelowym SLA.

## Wynik lokalny

| Operacja                                      | Wynik     | Stan |
| --------------------------------------------- | --------- | ---- |
| Pierwsze zaladowanie wybranego sezonu         | 399,16 ms | PASS |
| Zmiana filtra na pusty dzien                  | 108,50 ms | PASS |
| Ponowne otwarcie wersjonowanego snapshotu     | 0,30 ms   | PASS |
| Odswiezenie po nowej sesji i sprzedazy        | 83,41 ms  | PASS |
| Budzet odczytow agregatow dla zestawu         | maks. 14  | PASS |
| Budzet administratora przy maksymalnej skali  | maks. 75  | PASS |
| Dokumenty `harvestEntries` odczytane pulpitem | 0 z 3000  | PASS |

Wyniki sa pojedyncza lokalna baza regresyjna. Nie opisuja p95 w prawdziwej
sieci i nie moga byc przedstawiane jako wynik Firebase DEV albo produkcji.

## Poprawnosc wyniku

Pierwszy odczyt potwierdzil `1 200 000 g` zbioru, `300 000 g` sprzedazy,
`900 000 g` stanu, `1 200 000 gr` naliczen, `300 000 gr` wyplat i
`1 200 000 gr` przychodu. Dokumenty innych sezonow nie weszly do metryk.

Po dodaniu zamknietej sesji `+2000 g / +2500 gr` i sprzedazy
`-500 g / +2000 gr` kolejny odczyt pokazal `901 500 g` stanu,
`1 202 500 gr` naliczen i `1 202 000 gr` przychodu. Zmiana filtra ograniczyla
metryki okresowe do zera, pozostawiajac globalny licznik 100 aktywnych
zbieraczy.

## Liczba odczytow

Konserwatywny budzet dla zestawu wynosi 14 naliczanych odczytow:

- 5 dokumentow sezonow;
- 4 odczyty dla trzech agregatow sesji, w tym 2 partie po 1000 dla 1200
  zamknietych sesji;
- 3 odczyty dla agregatow sprzedazy i korekt;
- 1 odczyt agregatu wyplat;
- 1 odczyt agregatu aktywnych zbieraczy.

Pusty filtr wymaga maksymalnie 13 odczytow: 5 sezonow i minimum po jednym dla
8 pustych zapytan agregujacych. Szczegolowe wpisy zbioru nie sa zrodlem kart,
wiec wzrost z 0 do 3000 wpisow nie zmienia budzetu. Przy gornej skali PRD
(200 000 wpisow, 20 000 sesji, 20 000 sprzedazy, 20 000 wyplat, 200 osob i
10 sezonow) estymator wskazuje maksymalnie 75 odczytow administratora zamiast
60 210 dokumentow poprzedniej strategii.

## Wolne polaczenie i cache

Test UI zatrzymuje druga odpowiedz sieciowa na kontrolowanej obietnicy. W tym
czasie ostatnie kompletne metryki pozostaja widoczne, a odswiezenie i filtry sa
zablokowane. Po odpowiedzi widok atomowo przechodzi na nowy wynik. Nie ma
chwilowego pustego pulpitu ani mieszania starego i nowego sezonu.

Snapshot jest wersjonowany i przypisany do UID oraz roli. Ponowne otwarcie
wykonuje jeden odczyt `Storage`, zero odczytow Firestore i jawnie oznacza wynik
jako `LOCAL_SNAPSHOT`.

## Progi zmiany strategii

Zmiana na zaufane agregaty utrzymywane przez backend jest wymagana, gdy na
reprezentatywnym Firebase DEV wystapi co najmniej jeden z warunkow:

- ponad 100 naliczanych odczytow na odswiezenie administratora;
- ponad 250 lacznych odczytow na odswiezenie operatora;
- ponad 1000 dokumentow dla jednego zakresu pickera;
- p95 pierwszego odczytu lub zmiany filtra przekracza 2 sekundy na stabilnym
  polaczeniu w serii co najmniej 20 prob;
- czas p95 rosnie o ponad 25% po podwojeniu danych tego samego sezonu;
- Query Explain ujawnia pelny skan kolekcji, brak wymaganego indeksu albo plan
  niezgodny z filtrem `seasonId` i data biznesowa.

Regresja cache powyzej 250 ms wymaga optymalizacji lokalnego snapshotu, ale nie
jest sama w sobie powodem do zmiany agregacji Firestore. Na wolnym polaczeniu
czas odpowiedzi zawiera opoznienie sieci; ostatni snapshot ma pozostac widoczny
i poprawnie oznaczony niezaleznie od czasu oczekiwania.

## Bramka przed PROD

Automatyczny test emulatora i budzety odczytow sa `PASS`. Przed PROD pozostaje
obowiazkowy pomiar co najmniej 20 prob na Firebase DEV z normalnie
uwierzytelnionym administratorem, zestawem zblizonym do produkcyjnego, profilem
stabilnego i ograniczonego polaczenia oraz Query Explain dla zapytan kart.
Android Emulator, ADB i fizyczny telefon nie sa potrzebne do tego pakietu.
