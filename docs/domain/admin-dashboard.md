# Pulpit administratora

## Dostep i swiezosc

Pulpit jest dostepny wylacznie aktywnemu, zatwierdzonemu administratorowi.
Kazde odswiezenie pobiera z serwera liste sezonow i agregaty Firestore tylko
dla wybranego sezonu oraz okresu. Dokumenty sesji, sprzedazy, wyplat i
zbieraczy nie sa przesylane do klienta administratora. Dane finansowe nie sa
udostepniane operatorowi ani pickerowi.

Pulpit pokazuje czas ostatniego poprawnego odczytu z chmury. Odczyt offline
jest blokowany, poniewaz cache nie moze byc podstawa aktualnego podsumowania
finansowego. Licznik lokalnych zapisow dotyczy tylko biezacego urzadzenia.
Osobne ostrzezenie przypomina, ze inne urzadzenia pracujace calkowicie offline
moga miec sesje, ktorych chmura jeszcze nie zna.

## Zakres sezonu

Administrator wybiera sezon z listy. Domyslnie wybierany jest sezon oznaczony
`isDefault`, nastepnie otwarty, a w pozostalych przypadkach pierwszy wedlug
daty rozpoczecia. Zmiana sezonu lub okresu wykonuje nowe agregaty ograniczone
do tego wyboru. Statystyki biznesowe uzywaja daty biznesowej.

Liczba aktywnych zbieraczy opisuje aktualnie aktywne dokumenty w kartotece
`workers`. Pozostale metryki sa ograniczone przez `seasonId`.

## Reguly obliczen

| Metryka                 | Regula                                                        |
| ----------------------- | ------------------------------------------------------------- |
| Zebrano potwierdzone    | suma `totalWeightG` sesji `CLOSED` i `PAID`                   |
| Zbiory w toku           | suma `totalWeightG` sesji `OPEN`                              |
| Sprzedano               | podpisany ubytek aktywnych sprzedazy i korekt                 |
| Dostepne                | potwierdzone zbiory minus podpisany wplyw aktywnych sprzedazy |
| Otwarte sesje           | liczba sesji `OPEN`                                           |
| Wymagaja sprawdzenia    | liczba sesji `REVIEW_REQUIRED`                                |
| Naliczone zbieraczom    | suma `amountDueGrosz` sesji `CLOSED` i `PAID`                 |
| Wyplacone               | suma wyplat `ACTIVE`                                          |
| Do wyplaty              | naliczone minus wyplacone, bez obcinania wartosci ujemnej     |
| Przychod                | podpisany wplyw aktywnych sprzedazy i korekt                  |
| Wynik po koszcie zbioru | przychod minus naliczenia zbieraczy                           |

Anulowane sesje, sprzedaze i wyplaty nie wplywaja na aktywne sumy.
Pelne przeliczenie kontrolne pomija nieprawidlowe dokumenty zrodlowe i raportuje
ostrzezenie. Biezace agregaty opieraja sie na indeksowanych polach i nie
zastepuja okresowego uzgodnienia ze zrodlami.
Wszystkie masy pozostaja w gramach, a kwoty w groszach do momentu prezentacji.

Nazwa `Wynik po koszcie zbioru` jest celowa. Wartosc nie jest pelnym zyskiem,
poniewaz nie uwzglednia innych kosztow gospodarstwa. Interfejs pokazuje
wyjasnienie: `Przychod minus naliczenia zbieraczy; bez innych kosztow.`

## Ostrzezenia

Pulpit wymaga kontroli administratora, gdy:

- biezace urzadzenie ma zapisy lokalne albo oczekujace na synchronizacje;
- synchronizacja ma odrzucone lub zdalnie zmienione dokumenty;
- dostepny stan kilogramow jest ujemny;
- wyplacona kwota przekracza naliczenia;
- co najmniej jeden dokument zrodlowy jest nieprawidlowy.

Budzet odczytow, szczegoly zapytan i procedura uzgodnienia sa opisane w
`docs/domain/dashboard-read-strategy.md`.

Ostrzezenia nie zmieniaja danych i nie ukrywaja wartosci ujemnych. Pokazuja
rzeczywisty wynik obliczenia, aby administrator mogl znalezc i skorygowac
zrodlo niespojnosci.
