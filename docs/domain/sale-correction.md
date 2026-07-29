# Korekta sprzedazy

## Osobny typ operacji

Korekta jest nowym dokumentem `sales/{correctionId}` z
`entryType = "CORRECTION"`. Nie jest zwykla sprzedaza z ujemna masa lub cena i
nie zmienia istniejacego dokumentu.

Korekta:

- jest dostepna tylko aktywnemu administratorowi online;
- wymaga otwartego sezonu i daty w jego zakresie;
- wymaga dodatniej masy w gramach;
- wymaga nieujemnej ceny w groszach za kilogram;
- wymaga powodu od 3 do 200 znakow;
- zapisuje autora w `createdBy` i czas serwera w `createdAtServer`;
- powstaje atomowo z audytem `SALE_CORRECTION_CREATED`.

Powod jest przechowywany w polu `note` dokumentu korekty oraz w `reason`
audytu. Dzieki temu pozostaje zgodny z modelem `sales` z PRD i jest
obowiazkowy dla `CORRECTION`, mimo ze `note` zwyklej sprzedazy jest opcjonalna.

## Kierunek i znaki

Masa, cena oraz `totalGrosz` sa zawsze nieujemnymi wartosciami bez ukrytego
znaku. Kierunek dokumentu wyznacza oba skutki:

| `correctionDirection` | Wplyw na stan | Wplyw na przychod |
| --------------------- | ------------: | ----------------: |
| `INCREASE_STOCK`      |    `+weightG` |     `-totalGrosz` |
| `DECREASE_STOCK`      |    `-weightG` |     `+totalGrosz` |

`totalGrosz` jest wielkoscia korekty obliczona wedlug wersji 1 reguly
przychodu opisanej w `docs/domain/sale-revenue-calculation.md`. Podpisany wplyw
na przychod jest wartoscia pochodna i jest zapisywany w podsumowaniu audytu.

## Potwierdzenie i swiezosc

Formularz pokazuje przed zapisem:

- wybrany kierunek opisany biznesowo;
- stan przed korekta;
- podpisany wplyw na stan;
- przewidywany stan po korekcie;
- podpisany wplyw na przychod;
- powod.

Przejscie do zapisu wymaga osobnego checkboxa potwierdzajacego wszystkie
skutki. Aplikacja pobiera zrodla stanu z serwera przed pokazaniem
potwierdzenia oraz ponownie bezposrednio przed batchem. Zmiana stanu zeruje
checkbox i wymaga kolejnego potwierdzenia.

Korekta moze jawnie doprowadzic do ujemnego stanu, poniewaz jest operacja
administracyjna sluzaca rowniez ujawnieniu i opisaniu rozbieznosci. Interfejs
pokazuje wtedy ostrzezenie; alarm i obsluga niespojnosci sa zakresem pakietu
8.14. Nieprawidlowe dokumenty zrodlowe blokuja zapis, bo nie da sie pokazac
wiarygodnego skutku.

## Zapis i audyt

Batch tworzy:

- `sales/{correctionId}`;
- `auditEvents/sale-correction-created-{correctionId}`.

Security Rules niezaleznie sprawdzaja typ, kierunek, powod, autora, czas,
wersje i kwote oraz zgodnosc podpisanych skutkow w audycie. Sukces jest
pokazywany dopiero po serwerowym odczycie obu dokumentow i ponownym
przeliczeniu stanu.

## Dane historyczne

Ujemny historyczny wiersz z arkusza nie jest automatycznie przepuszczany przez
ten formularz ani mapowany jako zwykla sprzedaz. Podczas migracji musi zostac
recznie sklasyfikowany, otrzymac jawny kierunek i uzasadnienie albo pozostac
rekordem wymagajacym decyzji. Rozstrzygniecie konkretnego wiersza pozostaje
otwarte w DEC-0008 do Etapu 9.
