# Pulpit operatora

## Dostep i zakres

Pulpit jest dostepny wylacznie aktywnemu, zatwierdzonemu operatorowi. Pokazuje
aktywny sezon, otwarte sesje, ostatnie sesje utworzone przez zalogowanego
operatora, liczbe zamknietych dzis sesji, lokalne zapisy oczekujace, konflikty
wlasnych operacji oraz biezacy operacyjny stan kilogramow.

Przycisk `Nowy zbior` przenosi fokus do formularza otwarcia sesji. Lista
otwartych sesji jest wyswietlana przed formularzem zgodnie z wymaganiem
FR-HS-021.

Widok operatora nie zawiera katalogu zbieraczy. Pelny katalog, wersje stawek,
wyplaty, sprzedaze, przychod i wynik pozostaja dostepne tylko administratorowi.
Bezpieczny model sesji pulpitu zawiera jedynie identyfikator, date biznesowa,
status i snapshot nazwy zbieracza.

## Operacyjny stan kilogramow

Operator nie ma dostepu do kolekcji `sales`. Stan jest odczytywany z
odfiltrowanej projekcji `operationalStockMovements`, ktora zawiera wylacznie:

- deterministyczne `id`;
- `seasonId`;
- `sourceId`;
- `sourceType` rowne `HARVEST_SESSION` albo `SALE`;
- podpisany `weightImpactG`;
- techniczne `updatedAt` i `updatedBy`.

Projekcja nie zawiera ceny, przychodu, kwoty wyplaty ani snapshotu stawki.
Ruch sesji ma identyfikator `harvest-session-{sessionId}`, a ruch sprzedazy
`sale-{saleId}`. Ponowny zapis trafia do tego samego dokumentu, dlatego jest
idempotentny.

Security Rules pozwalaja administratorowi i operatorowi czytac projekcje.
Picker i uzytkownik anonimowy nie maja dostepu. Zapis ruchu sprzedazy wymaga
administratora, a ruch sesji moze zapisac administrator lub operator. W obu
przypadkach identyfikator, sezon i wplyw w gramach musza dokladnie odpowiadac
aktualnemu dokumentowi zrodlowemu. Usuwanie ruchow jest zabronione.

## Kolejnosc zapisu

Operacja biznesowa i jej audyt pozostaja w jednym atomowym batchu. Ruch stanu
jest zapisywany bezposrednio po potwierdzeniu operacji. Rozdzielenie jest
konieczne, poniewaz dolaczenie projekcji do rozbudowanych Rules zamkniecia sesji
przekracza limit 1000 ocenianych wyrazen Firestore.

Zapis nastepczy jest bezpieczny, poniewaz:

- dokument ma deterministyczny identyfikator;
- Rules wyliczaja oczekiwany wplyw z aktualnego zrodla;
- klient online odczytuje ruch ponownie z serwera i porownuje jego pola;
- kolejka offline wysyla batch sesji przed osobnym batchem projekcji.

Brak albo odrzucenie ruchu nie zmienia dokumentu zrodlowego. Projekcje trzeba
zasilic dla danych istniejacych przed wdrozeniem tej kolekcji. Procedura
migracji i uzgodnienia przed produkcja musi utworzyc po jednym ruchu dla kazdej
historycznej sesji i operacji sprzedazy. Bez zakonczonego uzgodnienia stan
operatora nie moze byc uznany za kompletny.

## Online i offline

Online stan i liczniki sa pobierane przez agregaty Firestore. Listy sa
ograniczone do aktywnego sezonu: 100 otwartych sesji oraz 8 pozycji historii
operatora w wybranym okresie. Udany wynik jest zapisywany jako wersjonowany
snapshot przypisany do konta. Offline pulpit najpierw pokazuje ten ostatni stan
serwera i jego rzeczywisty czas. Gdy snapshotu nie ma, moze uzyc dokumentow z
cache Firestore, ale nie przedstawia czasu lokalnego odczytu jako czasu
synchronizacji z serwerem.

Oficjalny stan kilogramow i lokalna prognoza sa osobnymi kartami. Prognoza
dodaje zamkniete lub wyplacone sesje oczekujace w dzienniku biezacego
urzadzenia; nie uwzglednia nieznanych zmian innych urzadzen. Offline filtr
okresu i odswiezenie serwerowe sa zablokowane, natomiast `Nowy zbior` pozostaje
dostepny dla przygotowanej pracy offline. Oczekujace ruchy, nieprawidlowe
dokumenty oraz stan ujemny wywoluja jawne ostrzezenie.

Licznik zapisow i konflikty opieraja sie na lokalnym dzienniku synchronizacji,
wiec opisuja tylko biezace urzadzenie. Konflikty innych operatorow nie sa
ujawniane.

Budzet i kontrakt kazdej karty opisuje
`docs/domain/dashboard-read-strategy.md`.
Semantyke stanu offline opisuje `docs/domain/dashboard-offline-state.md`.

## Pokrycie testowe

- model i granica prywatnosci:
  `src/dashboard/operatorDashboard.test.ts`;
- projekcja i obliczenia:
  `src/stock/operationalStockMovement.test.ts`;
- komponent i szybka akcja:
  `src/dashboard/OperatorDashboardPanel.test.tsx`;
- kolejnosc listy i formularza:
  `src/harvest/OperatorHarvestSessionsPanel.test.tsx`;
- podpiecie widoku bez katalogu zbieraczy:
  `src/app/App.test.tsx`;
- role i zgodnosc ruchu ze zrodlem:
  `tests/rules/firestore-sales.test.ts` i
  `tests/rules/firestore-harvest.test.ts`;
- zapis online/offline i odczyt bez finansow:
  `tests/integration/sale-stock-preflight.test.ts`,
  `tests/integration/harvest-session-flow.test.ts` i
  `tests/integration/offline-harvest-runtime.test.ts`.
