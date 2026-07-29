# Etap 7.18 - raport prywatnosci pickera

## Zakres

Test obejmuje dwoch pickerow A i B z roznymi `workerId`. Granica prywatnosci
jest sprawdzana niezaleznie w Security Rules, produkcyjnych runtime'ach widokow
oraz modelu danych odczytanych z lokalnego cache.

## Macierz

| Wymaganie                                                | Dowod                                                                    | Wynik |
| -------------------------------------------------------- | ------------------------------------------------------------------------ | ----- |
| A widzi wlasne sesje i wyplaty                           | zapytania Rules zwracaja tylko `session-anna` i `payment-anna`           | PASS  |
| A nie widzi dokumentow B przez interfejs                 | runtime szczegolow odrzuca obca sesje                                    | PASS  |
| A nie odczytuje B przez bezposrednie zapytanie           | obce filtry i bezposrednie dokumenty sa odrzucane przez Rules            | PASS  |
| Zmiana ID w adresie nie daje dostepu                     | `loadPickerSessionDetails` z `session-bartek` zwraca `permission-denied` | PASS  |
| Zapytanie zbiorcze A nie zawiera B                       | sprawdzenie dokladnej listy identyfikatorow wynikowych                   | PASS  |
| Cache A nie jest widoczny B na wspoldzielonym urzadzeniu | model B odrzuca dokumenty A i liczy tylko dane B                         | PASS  |
| Zablokowany picker traci dostep po kontakcie z siecia    | ten sam kontekst po zmianie profilu na `BLOCKED` otrzymuje odmowe        | PASS  |

## Dowody automatyczne

- `tests/rules/firestore-picker-dashboard.test.ts` sprawdza izolacje zapytan,
  dokumentow i odebranie dostepu po blokadzie.
- `tests/integration/picker-session-details.test.ts` sprawdza produkcyjny
  runtime i Rules przy manipulacji identyfikatorem sesji.
- `src/picker/pickerDashboard.test.ts` przekazuje profilowi B wspolny snapshot
  cache zawierajacy dokumenty A i B; wynik zawiera tylko kwoty i osobe B.
- `src/picker/pickerSessionDetails.test.ts` dodatkowo odrzuca obca sesje
  bezposrednio na granicy modelu cache.

Testy przez ADB i na fizycznych telefonach pozostaja `SKIPPED` zgodnie z decyzja
wlasciciela. Przed produkcja nadal jest wymagany rzeczywisty test wspoldzielonego
urzadzenia.
