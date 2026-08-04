# Agregacje i budzet odczytow pulpitow

## Pomiar dla skali docelowej

Pomiar jest deterministyczny i znajduje sie w
`src/dashboard/dashboardReadStrategy.ts`. Uzywa gornej oczekiwanej skali z PRD:
10 sezonow, 200 zbieraczy, 20 000 sesji, 20 000 wyplat, 20 000 sprzedazy oraz
do 40 000 ruchow operacyjnego stanu.

| Pulpit        | Strategia przed 8.12                       | Strategia 8.12                                    |
| ------------- | ------------------------------------------ | ------------------------------------------------- |
| Administrator | 60 210 dokumentow na odswiezenie           | do 75 naliczanych odczytow agregatow i sezonow    |
| Operator      | do 40 000 ruchow i cala historia operatora | do 118 dokumentow list oraz 61 odczytow agregatow |
| Zbieracz      | srednio 211 dokumentow z calej historii    | srednio 31 dokumentow wybranego sezonu            |

Koszt agregatu jest liczony konserwatywnie jako jeden odczyt za kazde
rozpoczete 1000 wpisow indeksu oraz minimum jeden odczyt dla pustego zapytania.
Podzial dokumentow miedzy kilka rozlacznych zapytan uwzglednia koszt zaokraglenia
kazdej partycji. Rzeczywisty koszt i plan indeksu trzeba przed produkcja
potwierdzic przez Firestore Query Explain na danych zblizonych do produkcyjnych.

## Wybrana strategia

- Administrator online korzysta z `count()` i `sum()` dla jednego wybranego
  sezonu i okresu. Pobierana jest tylko mala lista sezonow.
- Operator online korzysta z agregatu ruchow stanu oraz agregatow licznikow.
  Lista wszystkich otwartych sesji ma limit 100, a historia operatora limit 8.
- Administrator i operator zapisuja ostatni udany wynik serwera jako lokalny,
  wersjonowany snapshot przypisany do konta. Snapshot nie wykonuje odczytow
  Firestore i nigdy nie jest przedstawiany jako aktualny.
- Operator bez snapshotu moze awaryjnie policzyc stan z dokumentow dostepnych
  w cache. Odczyt z cache nie jest przedstawiany jako nowy wynik serwera.
- Zbieracz online i offline pobiera dokumenty zrodlowe ograniczone przez
  `workerId`, `seasonId` i zakres daty biznesowej. Dokumenty sa potrzebne do
  grupowania ilosci wedlug planu, ktorego agregaty Firestore nie realizuja.
- Pelne dokumenty sa nadal dekodowane przez funkcje `build*Dashboard` w testach
  i beda podstawa okresowego przeliczenia kontrolnego oraz pakietu uzgodnien.

Dokumenty podsumowujace utrzymywane przez klienta nie sa tworzone. Bez Cloud
Functions lub innego zaufanego backendu zapis zrodla i podsumowania moglby
zostac przerwany pomiedzy operacjami albo wykonany przez nieaktualnego klienta.
Takie podsumowanie nie moze byc jedynym zrodlem prawdy. Jezeli pomiar
produkcyjny przekroczy ponizsze progi, nastepnym krokiem jest zaufany backend
utrzymujacy agregaty oraz okresowe przeliczenie ze zrodel:

- ponad 100 naliczanych odczytow na odswiezenie administratora;
- ponad 250 lacznych odczytow na odswiezenie operatora;
- ponad 1000 dokumentow sesji lub wyplat dla jednego zakresu zbieracza;
- czas odpowiedzi p95 powyzej 2 sekund na stabilnym polaczeniu.

## Karty administratora

Wszystkie filtry okresu sa wlaczne na obu koncach. Sesje i sprzedaz uzywaja
`businessDate`, a wyplaty `paidBusinessDate`.

| Karta                   | Zrodlo i filtr                            | Obliczenie                                 | Offline                    |
| ----------------------- | ----------------------------------------- | ------------------------------------------ | -------------------------- |
| Zebrano potwierdzone    | sesje sezonu, `CLOSED` lub `PAID`, okres  | `sum(totalWeightG)`                        | ostatni snapshot           |
| Zbiory w toku           | sesje sezonu, `OPEN`, okres               | `sum(totalWeightG)`                        | ostatni snapshot           |
| Sprzedano               | aktywne sprzedaze i korekty sezonu, okres | sprzedaz + korekta ubytku - korekta zwrotu | ostatni snapshot           |
| Dostepne                | dwa poprzednie zrodla                     | potwierdzone - sprzedano                   | snapshot + prognoza        |
| Naliczone zbieraczom    | sesje sezonu, `CLOSED` lub `PAID`, okres  | `sum(amountDueGrosz)`                      | ostatni snapshot           |
| Wyplacone               | wyplaty sezonu, `ACTIVE`, okres           | `sum(amountGrosz)`                         | ostatni snapshot           |
| Do wyplaty              | naliczenia i wyplaty                      | naliczone - wyplacone                      | ostatni snapshot           |
| Przychod                | aktywne sprzedaze i korekty sezonu, okres | sprzedaz + korekta ubytku - korekta zwrotu | ostatni snapshot           |
| Wynik po koszcie zbioru | przychod i naliczenia                     | przychod - naliczone                       | ostatni snapshot           |
| Aktywni zbieracze       | `workers`, `active == true`               | `count()`; bez filtra historycznego        | ostatni snapshot           |
| Otwarte sesje           | sesje sezonu, `OPEN`, okres               | `count()`                                  | snapshot + licznik lokalny |
| Wymagaja sprawdzenia    | sesje sezonu, `REVIEW_REQUIRED`, okres    | `count()`                                  | ostatni snapshot           |

## Karty operatora

| Karta            | Zrodlo i filtr                                     | Obliczenie                     | Offline                   |
| ---------------- | -------------------------------------------------- | ------------------------------ | ------------------------- |
| Dostepny stan    | ruchy stanu aktywnego sezonu                       | `sum(weightImpactG)`           | snapshot lub cache        |
| Otwarte sesje    | aktywny sezon, `OPEN`, najnowsze 100               | liczba pobranych pozycji       | lista z cache             |
| Moje zamkniete   | `createdBy`, aktywny sezon, `CLOSED`/`PAID`, okres | `count()`                      | liczba dokumentow z cache |
| Moje otwarte     | `createdBy`, aktywny sezon, `OPEN`                 | `count()`                      | liczba dokumentow z cache |
| Lokalne zapisy   | lokalny dziennik synchronizacji                    | oczekujace + zapisane lokalnie | pelna informacja lokalna  |
| Konflikty        | lokalny dziennik synchronizacji                    | odrzucone + zmienione zdalnie  | pelna informacja lokalna  |
| Prognoza lokalna | snapshot + sesje biezacego urzadzenia              | stan + zamkniete/wyplacone     | oddzielna od oficjalnej   |

Lista historii operatora jest osobnym odczytem ograniczonym do 8 pozycji po
`createdBy`, sezonie i okresie. Nie zawiera danych finansowych.

## Karty zbieracza

| Karta                       | Zrodlo i filtr                                       | Obliczenie                     | Offline           |
| --------------------------- | ---------------------------------------------------- | ------------------------------ | ----------------- |
| Laczna masa                 | sesje `workerId`, sezon, okres, aktywne statusy      | suma `totalWeightG`            | dokumenty z cache |
| Ilosci wedlug planu         | te same sesje, podstawa `QUANTITY`                   | grupowanie planu i suma ilosci | dokumenty z cache |
| Otwarte/zamkniete/wyplacone | te same sesje                                        | licznik wedlug statusu         | dokumenty z cache |
| Naliczone                   | sesje `CLOSED` lub `PAID`                            | suma `amountDueGrosz`          | dokumenty z cache |
| Wyplacone                   | wyplaty `workerId`, sezon, `ACTIVE`, okres platnosci | suma `amountGrosz`             | dokumenty z cache |
| Pozostalo                   | naliczenia i wyplaty                                 | naliczone - wyplacone          | dokumenty z cache |

## Uzgodnienie i jakosc danych

Agregaty Firestore czytaja indeksy i nie dekoduja calego dokumentu. Rules
pozostaja pierwsza ochrona poprawnosci nowych zapisow, ale agregat nie raportuje
pelnej liczby historycznych dokumentow o zlym ksztalcie. Okresowe uzgodnienie
ma odczytac zrodla stronami, zdekodowac je tymi samymi dekoderami domenowymi,
porownac wynik z agregatami i zapisac raport kontroli bez zmiany zrodel.
Przed zwykla sprzedaza kontrola odczytuje pelne zrodla i ruchy wybranego sezonu,
dekoduje je oraz porownuje dokument po dokumencie. Ten odczyt bezpieczenstwa nie
jest wykonywany przez kazde odswiezenie kart pulpitu. Alarm, raport skladowych i
blokade opisuje `docs/domain/stock-reconciliation.md`.

Dokumentacja Firestore:

- https://firebase.google.com/docs/firestore/query-data/aggregation-queries
- https://firebase.google.com/docs/firestore/pricing
