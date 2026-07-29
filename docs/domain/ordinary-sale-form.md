# Formularz zwyklej sprzedazy

## Zakres pakietow 8.3-8.5

Formularz przygotowuje zwykla sprzedaz do obowiazkowego, swiezego sprawdzenia
stanu. Samo nacisniecie `Sprawdz i przejdz dalej` nie zapisuje dokumentu
Firestore i nie zmniejsza oficjalnego stanu.

Administrator wprowadza:

- sezon;
- date biznesowa;
- mase w kilogramach z dokladnoscia do 1 grama;
- cene w zlotych z dokladnoscia do 1 grosza za kilogram;
- opcjonalna notatke do 200 znakow.

Model zamienia wartosci dziesietne na calkowite `weightG` i
`priceGroszPerKg`. Zwykla sprzedaz wymaga dodatniej masy. Cena nie moze byc
ujemna; cena zero pozostaje jawna, prawidlowa wartoscia biznesowa.

## Podglad przed sprawdzeniem

Dla wybranego sezonu interfejs pokazuje:

- dostepny stan z przekazanego kontekstu zrodlowego;
- sprzedawana mase;
- cene za kilogram;
- podglad przychodu;
- przewidywany stan po sprzedazy;
- czas odswiezenia stanu.

Podglad przychodu korzysta z pelnych gramow i groszy oraz wykonuje jedno
zaokraglenie matematyczne do pelnego grosza, z polowa grosza w gore. Formularz
jawnie pokazuje mase, cene, wynik i wersje reguly. Ten sam wynik oraz
`calculationVersion = "1"` sa zapisywane w dokumencie sprzedazy i audycie.
Pelny kontrakt obliczen opisuje
`docs/domain/sale-revenue-calculation.md`.

Ujemny przewidywany stan nie jest ukrywany. Formularz pokazuje wartosc i
ostrzezenie, a swiezy preflight pakietu 8.4 ma odrzucic zwykla sprzedaz
przekraczajaca aktualny stan.

## Siec i swiezosc

Przejscie dalej jest zablokowane offline. Stan jest oznaczony jako potencjalnie
nieaktualny, gdy pochodzi z cache albo biezace urzadzenie ma oczekujace
dokumenty, lub gdy warstwa pobierajaca oznaczy go jawnie jako nieswiezy.
Informacja nie zastapi ponownego odczytu serwera bezposrednio przed zapisem.

## Kontrakt techniczny

- `src/sales/ordinarySalePreparation.ts` odpowiada za parsowanie, walidacje,
  podglad i przygotowany payload.
- `src/sales/OrdinarySaleForm.tsx` odpowiada za pola, podsumowanie, ostrzezenia i
  blokade podwojnego przejscia dalej.
- callback `onPrepare` przekazuje `PreparedOrdinarySale` do przeplywu preflight,
  zaimplementowanego w `src/sales/saleStockPreflight.ts`. Pelny kontrakt
  ponownego odczytu i zapisu opisuje `docs/domain/sale-stock-preflight.md`.
- `src/sales/saleRevenueCalculation.ts` jest jedynym klientowym zrodlem reguly
  przychodu zwyklej sprzedazy.
- `firestore.rules` niezaleznie wymuszaja zgodnosc masy, ceny, kwoty i wersji
  dla kazdego nowego dokumentu `SALE`.
