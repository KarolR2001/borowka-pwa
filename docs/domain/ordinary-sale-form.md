# Formularz zwyklej sprzedazy

## Zakres pakietu 8.3

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

Podglad przychodu korzysta z pelnych gramow i groszy oraz zaokragla polowe
grosza w gore. Pakiet 8.5 utrwali te regule jako wersjonowana regule oficjalnego
zapisu i rozszerzy jej testy brzegowe.

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
