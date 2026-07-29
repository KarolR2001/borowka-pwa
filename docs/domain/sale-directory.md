# Lista i szczegoly sprzedazy

## Dostep i zrodlo

Lista finansowa jest dostepna wylacznie aktywnemu administratorowi. Dane
sprzedazy, sezonow i profili autorow sa pobierane bezposrednio z serwera.
Operator i picker nie otrzymuja tego widoku ani uprawnien Firestore do
kolekcji `sales`.

Lista zachowuje wszystkie prawidlowe dokumenty:

- aktywne zwykle sprzedaze;
- aktywne korekty obu kierunkow;
- anulowane operacje;
- dokumenty oznaczone jako import historyczny.

Nieprawidlowe dokumenty nie sa wlaczane do wynikow. Ich liczba jest pokazana
administratorowi jako dane wymagajace kontroli.

## Kolumny i filtry

Kazdy wiersz pokazuje date biznesowa, sezon, mase, cene za kilogram,
podpisany wplyw na przychod, typ i kierunek operacji, status, autora, skrocona
notatke oraz oznaczenie importu.

Filtry obejmuja:

- sezon;
- zakres dat biznesowych;
- typ `SALE` albo `CORRECTION`;
- status `ACTIVE` albo `CANCELLED`;
- autora dokumentu.

Domyslne sortowanie jest malejace po dacie biznesowej i czasie utworzenia,
a nastepnie stabilne po identyfikatorze.

## Przychod

Kwota `totalGrosz` pozostaje nieujemna i opisuje wartosc dokumentu.
Podpisany wplyw prezentowany na liscie wynosi:

| Dokument                      | Wplyw na przychod |
| ----------------------------- | ----------------: |
| `SALE`                        |     `+totalGrosz` |
| `CORRECTION / INCREASE_STOCK` |     `-totalGrosz` |
| `CORRECTION / DECREASE_STOCK` |     `+totalGrosz` |

Podsumowanie `Przychod aktywny` sumuje podpisane skutki tylko dokumentow
`ACTIVE`. Anulowane dokumenty pozostaja widoczne, ale ich wplyw na aktywna
sume wynosi zero.

## Szczegoly i anulowanie

Szczegoly pokazuja pelne identyfikatory, date, sezon, typ, kierunek, status,
mase, cene, kwote dokumentu, podpisany wplyw, wersje obliczenia, autora, czas
serwera, notatke oraz metadane importu. Dla anulowanego dokumentu widoczne sa
takze autor, czas i powod anulowania.

Aktywny dokument ma akcje `Przejdz do anulowania`. Akcja przekazuje jego
identyfikator do przeplywu opisanego w `docs/domain/sale-cancellation.md`;
nie duplikuje logiki zapisu ani nie zmienia danych bez ponownego potwierdzenia.
