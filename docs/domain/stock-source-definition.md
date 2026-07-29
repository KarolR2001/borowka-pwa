# Zrodla oficjalnego stanu kilogramow

## Zasada podstawowa

Oficjalny stan magazynowy dla wybranego sezonu wynika wylacznie z zapisanych w
chmurze dokumentow zrodlowych:

`stan dostepny = potwierdzone zbiory + korekty zwiekszajace - sprzedaz - korekty zmniejszajace`

Agregaty pulpitu i lokalny cache moga przyspieszac odczyt, ale nie sa osobnym
zrodlem prawdy.

## Potwierdzone zbiory

Do oficjalnego stanu dodawane jest pole `totalWeightG` sesji:

- `CLOSED`;
- `PAID`.

Status wyplaty nie zmienia kilogramow. Przejscie `CLOSED` do `PAID` zachowuje ten
sam wplyw na stan.

Sesje `OPEN`, `REVIEW_REQUIRED` i `CANCELLED` maja zerowy wplyw na oficjalny
stan. Niezsynchronizowana sesja zamknieta moze byc pokazana jako lokalny podglad,
ale nie wolno dolaczac jej do oficjalnego wyniku z chmury.

`totalWeightG` jest suma wag aktywnych wpisow sesji. Wpis bez wagi moze zwiekszyc
liczbe jednostek oraz naleznosc w planie ilosciowym, ale dodaje zero gramow do
magazynu. Nie wolno sumowac jednoczesnie wag wpisow i `totalWeightG`, bo
spowodowaloby to podwojne naliczenie tego samego zbioru.

## Sprzedaz i korekty

Aktywny dokument `SALE` zmniejsza stan o dodatnie `weightG`. Anulowany dokument
ma zerowy wplyw, dlatego anulowanie przywraca kilogramy bez usuwania historii.

Dokument `CORRECTION` przechowuje dodatnie `weightG` oraz obowiazkowy, jawny
kierunek:

- `INCREASE_STOCK` dodaje `weightG`;
- `DECREASE_STOCK` odejmuje `weightG`.

Ujemna masa nie koduje kierunku. Zwykla sprzedaz nie moze miec kierunku korekty,
a korekta bez kierunku jest nieprawidlowym dokumentem niezaleznie od statusu.
Historyczne dane, w tym ujemne ceny, wymagaja jawnej klasyfikacji podczas
migracji.

## Jednostki a kilogramy

Administrator powinien rozdzielac dwa niezalezne wyniki:

- jednostki pracy, na przyklad liczbe lub ulamki lubianek, sluza do rozliczenia
  planu ilosciowego;
- kilogramy magazynowe wynikaja tylko z faktycznie zapisanej wagi.

Sama liczba jednostek nie pozwala wyliczyc kilogramow. Brak wagi nie jest
automatycznie zastapiony srednia masa ani przelicznikiem.

## Kalkulacja kontrolna

`calculateSourceStockForSeason` liczy wynik dla jednego, jawnie wybranego sezonu
bez korzystania z agregatu pulpitu. Zwraca:

- `confirmedHarvestWeightG` - suma potwierdzonych zbiorow;
- `activeSaleWeightG` - masa aktywnych zwyklych sprzedazy;
- `correctionIncreaseWeightG` i `correctionDecreaseWeightG` - osobne kierunki
  aktywnych korekt;
- `soldWeightG` - sprzedaz netto po obu kierunkach korekt;
- `availableWeightG` - potwierdzone zbiory minus sprzedaz netto;
- liczniki dokumentow zrodlowych wykorzystane do diagnostyki.

Kalkulator nie ukrywa ujemnego wyniku. Ujemne `availableWeightG` jest sygnalem
niespojnosci dla alarmu i blokady zwyklej sprzedazy implementowanych w dalszych
pakietach. Zduplikowany dokument lub przekroczenie bezpiecznego zakresu liczb
przerywa kalkulacje zamiast zwracac wiarygodnie wygladajaca bledna sume.

## Regula techniczna

Kontrakt jest zaimplementowany w
`src/stock/stockSourceDefinition.ts`. Funkcje zwracaja podpisany wplyw w gramach:
wartosc dodatnia zwieksza stan, ujemna go zmniejsza, a zero oznacza dokument
wykluczony. Kalkulator kontrolny znajduje sie w
`src/stock/sourceStockCalculation.ts`.
