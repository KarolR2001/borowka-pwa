# Pulpit administratora

## Dostep i swiezosc

Pulpit jest dostepny wylacznie aktywnemu, zatwierdzonemu administratorowi.
Kazde odswiezenie pobiera z serwera liste sezonow i agregaty Firestore tylko
dla wybranego sezonu oraz okresu. Dokumenty sesji, sprzedazy, wyplat i
zbieraczy nie sa przesylane do klienta administratora. Dane finansowe nie sa
udostepniane operatorowi ani pickerowi.

Pulpit pokazuje czas ostatniego poprawnego odczytu z chmury. Po udanym odczycie
zapisuje wersjonowany snapshot wyniku dla zalogowanego konta. Offline nie
wykonuje nowych agregatow: pokazuje ostatni stan serwera z jego pierwotnym
czasem i oznacza go jako nieaktualny. Filtry sezonu i okresu sa wtedy
zablokowane.

Oficjalny stan jest oddzielony od lokalnej prognozy. Prognoza dodaje tylko
zamkniete lub wyplacone sesje oczekujace w dzienniku biezacego urzadzenia,
zgodne z sezonem i okresem snapshotu. Licznik obejmuje takze lokalne sesje
otwarte. Dane innych urzadzen moga nie byc jeszcze znane. Snapshot jest
usuwany przez jawne czyszczenie danych lokalnych konta.

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
Semantyke stanu offline opisuje `docs/domain/dashboard-offline-state.md`.

Ostrzezenia nie zmieniaja danych i nie ukrywaja wartosci ujemnych. Pokazuja
rzeczywisty wynik obliczenia, aby administrator mogl znalezc i skorygowac
zrodlo niespojnosci.
