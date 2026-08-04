# Sprawdzenie stanu przed zapisem sprzedazy

## Zakres pakietu 8.4

Zwykla sprzedaz jest operacja online dostepna tylko dla aktywnego
administratora. Formularz nie zapisuje dokumentu bezposrednio. Przeplyw ma dwa
jawne kroki:

1. `checkOrdinarySaleStock` pobiera z serwera sezon, wszystkie sesje zbioru,
   dokumenty sprzedazy i ruchy projekcji potrzebne do kontrolnej kalkulacji
   oraz uzgodnienia stanu.
2. `createOrdinarySale` bezposrednio przed batchowym zapisem wykonuje ten sam
   swiezy odczyt ponownie.

Odczyt korzysta z `getDocFromServer` oraz `getDocsFromServer`; cache Firestore
nie jest akceptowany jako potwierdzenie stanu do zapisu sprzedazy.

## Zmiana stanu i blokady

Po pierwszej kontroli interfejs pokazuje:

- stan przed sprzedaza;
- sprzedawana mase;
- przewidywany stan po sprzedazy;
- cene;
- przychod.

Jesli stan zmienil sie od otwarcia formularza, podsumowanie jest zastapione
wartosciami z serwera i administrator musi potwierdzic je ponownie.

Przy kliknieciu `Potwierdz i zapisz` aplikacja jeszcze raz pobiera zrodla. Gdy
stan rozni sie od potwierdzonego:

- dokument nie jest tworzony;
- podsumowanie otrzymuje nowy stan;
- ponowne klikniecie jest wymagane.

Standardowy przeplyw blokuje zapis, gdy:

- sezon nie istnieje albo nie jest otwarty;
- brak polaczenia;
- aktor nie jest aktywnym administratorem;
- dokument zrodlowy jest nieprawidlowy;
- ruch projekcji jest nieprawidlowy, brakujacy, nadmiarowy albo niezgodny;
- suma projekcji rozni sie od sumy dokumentow zrodlowych;
- kontrolny stan jest juz ujemny;
- masa sprzedazy przekracza swiezy stan.

## Zapis i potwierdzenie

Poprawna operacja zapisuje jednym batchem:

- `sales/{saleId}`;
- `auditEvents/sale-created-{saleId}` z akcja `SALE_CREATED`.

Security Rules wymagaja aktywnego administratora, otwartego sezonu, daty w
zakresie sezonu, dodatniej masy, nieujemnej ceny, aktywnego typu `SALE` oraz
spojnego audytu. Operator, picker i uzytkownik anonimowy nie moga odczytywac ani
zapisywac kolekcji `sales`.

Sukces jest pokazywany dopiero po serwerowym odczycie dokumentu sprzedazy i
audytu oraz publikacji ruchu projekcji. Nastepnie aplikacja ponownie liczy i
uzgadnia stan. Wynik ujemny, roznica projekcji albo inna wartosc niz oczekiwana
jest pokazana jako alarm wymagajacy recznej kontroli.

## Ograniczenie wspolbieznosci

Bez zaufanej funkcji serwerowej nie ma absolutnej gwarancji serializacji dwoch
sprzedazy wykonywanych jednoczesnie przez roznych administratorow. Firestore
Rules nie moga wykonac zapytania sumujacego wszystkie sesje i sprzedaze, a
odczyt zrodel oraz batch zapisu nie stanowia jednej transakcji obejmujacej
zapytania.

Ryzyko jest ograniczone przez:

- role tylko administratora;
- wymog online;
- dwa swieze odczyty przed zapisem;
- krotki etap potwierdzenia;
- blokade szybkiego podwojnego klikniecia;
- ponowne przeliczenie po zapisie;
- jawne ostrzezenie przed rownolegla praca na kilku urzadzeniach.

Test kolizji dwoch administratorow nalezy do pakietu 8.17. Alarm ujemnego lub
niespojnego stanu i blokada zwyklej sprzedazy sa zdefiniowane w
`docs/domain/stock-reconciliation.md`.

## Pliki kontraktu

- `src/sales/saleStockPreflight.ts` - odczyt zrodel, kontrola, zapis i
  potwierdzenie.
- `src/sales/AdminOrdinarySalesPanel.tsx` - stan UI i ponowne potwierdzenie.
- `src/stock/stockReconciliation.ts` - porownanie zrodel z projekcja i raport.
- `firestore.rules` - dostep do `sales` i wymagany audyt.
- `tests/integration/sale-stock-preflight.test.ts` - rzeczywisty przeplyw przez
  emulator Firestore.
- `tests/rules/firestore-sales.test.ts` - role i walidacja dokumentow.
