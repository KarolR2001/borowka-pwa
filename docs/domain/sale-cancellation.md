# Anulowanie operacji sprzedazy

## Kontrakt

Anulowanie jest dostepne tylko aktywnemu administratorowi online. Dotyczy
aktywnej zwyklej sprzedazy albo aktywnej korekty. Nie usuwa dokumentu i nie
tworzy kompensujacej sprzedazy.

Transakcja zmienia w `sales/{saleId}` wylacznie:

- `status` na `CANCELLED`;
- `cancelledAt` na czas serwera;
- `cancelledBy` na UID administratora;
- `cancellationReason` na wymagany powod od 3 do 200 znakow.

Masa, cena, kwota, typ, kierunek korekty, data, autor i pozostale dane
zrodlowe pozostaja niezmienne. Anulowanie nie wymaga otwartego sezonu, bo
porzadkowanie historii musi byc mozliwe rowniez po jego zamknieciu.

## Odwrocenie skutkow

Anulowany dokument przestaje uczestniczyc w biezacym stanie i przychodzie.
Skutek anulowania jest dokladnym przeciwienstwem aktywnego dokumentu:

| Dokument aktywny              | Wplyw anulowania na stan | Wplyw anulowania na przychod |
| ----------------------------- | -----------------------: | ---------------------------: |
| `SALE`                        |               `+weightG` |                `-totalGrosz` |
| `CORRECTION / INCREASE_STOCK` |               `-weightG` |                `+totalGrosz` |
| `CORRECTION / DECREASE_STOCK` |               `+weightG` |                `-totalGrosz` |

Interfejs pokazuje typ, mase oraz oba podpisane skutki przed zapisem. Powod
i osobny checkbox potwierdzenia sa obowiazkowe. Zalecany sposob poprawienia
blednego dokumentu to anulowanie, a nastepnie dodanie nowej poprawnej
operacji.

## Transakcja i audyt

Transakcja atomowo aktualizuje dokument oraz tworzy
`auditEvents/sale-cancelled-{saleId}` z akcja `SALE_CANCELLED`. Audyt zawiera
stan przed i po, typ, kierunek, mase, kwote oraz podpisany wplyw na stan i
przychod.

Security Rules:

- dopuszczaja tylko przejscie `ACTIVE -> CANCELLED`;
- chronia wszystkie pola historyczne;
- wymagaja czasu serwera, UID administratora i niepustego powodu;
- niezaleznie sprawdzaja znaki odwrocenia w pasujacym audycie;
- zabraniaja twardego usuniecia dokumentu.

Sukces jest pokazywany po odczycie serwerowym dokumentu i audytu oraz po
ponownym przeliczeniu stanu sezonu. Lista aktywnych operacji jest wtedy
odswiezana.
