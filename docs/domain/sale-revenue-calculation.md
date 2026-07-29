# Obliczanie przychodu sprzedazy

## Regula wersji 1

Przychod zwyklej sprzedazy jest liczony z calkowitej masy w gramach oraz ceny
w groszach za kilogram:

```text
licznik = weightG * priceGroszPerKg
totalGrosz = floor((licznik + 500) / 1000)
```

Oznacza to jedno matematyczne zaokraglenie do pelnego grosza po wykorzystaniu
wszystkich gramow. Reszta mniejsza niz polowa grosza jest odrzucana, a dokladnie
polowa grosza i wartosci wieksze sa zaokraglane w gore. Regula ma identyfikator
`calculationVersion = "1"` i nazwe techniczna `HALF_UP_TO_GROSZ`.

Przyklady:

|     Masa |       Cena | Wynik przed zaokragleniem | `totalGrosz` |
| -------: | ---------: | ------------------------: | -----------: |
|   3000 g | 1250 gr/kg |                   3750 gr |         3750 |
|      1 g |  499 gr/kg |                  0,499 gr |            0 |
|      1 g |  500 gr/kg |                  0,500 gr |            1 |
| 12 345 g | 1550 gr/kg |             19 134,750 gr |       19 135 |

## Granice i reprezentacja

- Masa musi byc dodatnia liczba calkowita gramow.
- Cena zwyklej sprzedazy musi byc nieujemna liczba calkowita groszy za
  kilogram.
- Cena zero jest dozwolona i daje przychod zero.
- Jeden dokument jest ograniczony do `1 000 000 000 g` oraz
  `100 000 000 gr/kg`.
- Implementacja kliencka mnozy wartosci przez `BigInt`, aby nie tracic
  precyzji przed dzieleniem.
- Firestore przechowuje tylko calkowite `weightG`, `priceGroszPerKg`,
  `totalGrosz` i tekstowe `calculationVersion`.

Limity utrzymuja wynik oraz iloczyny uzywane przez Security Rules w bezpiecznym
zakresie liczb calkowitych Firestore.

## Spojnosc zapisu

Klient przelicza przychod podczas przygotowania formularza, ponownie waliduje
go przed utworzeniem dokumentu oraz sprawdza po odczycie zapisanego dokumentu.
Security Rules niezaleznie wymagaja wersji `"1"` i potwierdzaja wynik bez
operacji zmiennoprzecinkowych:

```text
totalGrosz * 1000 <= licznik + 500
licznik + 500 < (totalGrosz + 1) * 1000
```

Audyt `SALE_CREATED` zapisuje te sama wersje i kwote co dokument sprzedazy.
Zmiana algorytmu w przyszlosci wymaga nowej wersji oraz zachowania obslugi
historycznych dokumentow; nie wolno przeliczac ich po cichu nowa regula.
