# Filtry okresow pulpitow i raportow

## Kontrakt daty

- Wszystkie statystyki biznesowe sa filtrowane po dacie biznesowej.
- Strefa wyznaczania biezacego dnia to `Europe/Warsaw`.
- Znaczniki techniczne, takie jak `createdAtServer`, `updatedAtServer` i czas
  urzadzenia, nie decyduja o przypisaniu dokumentu do okresu.
- Sesje zbioru i sprzedaz uzywaja pola `businessDate`.
- Wyplaty uzywaja pola `paidBusinessDate`.
- Oba konce zakresu sa wlaczne.

## Dostepne okresy

- `TODAY` - biezacy dzien w `Europe/Warsaw`;
- `CURRENT_WEEK` - poniedzialek-niedziela tygodnia zawierajacego biezacy dzien;
- `CURRENT_MONTH` - pierwszy i ostatni dzien biezacego miesiaca;
- `SEASON` - granice wybranego sezonu;
- `CUSTOM` - poprawne daty `od` i `do`, gdzie `od <= do`.

Domyslnym okresem administratora, zbieracza i raportow jest caly sezon.
Operator rozpoczyna od dzisiejszego dnia, zgodnie z jego podstawowym zadaniem
kontroli dzisiejszych zamkniec. Wspolny model
`src/dashboard/dashboardPeriod.ts` jest kontraktem rowniez dla kolejnych
raportow, aby ich zakresy nie byly liczone inaczej niz pulpity.

Eksport CSV zbieracza uzywa tych samych presetow. Po wyborze okres jest
przekladany na istniejace pola `fromDate` i `toDate`, a filtr sezonu nadal
dziala niezaleznie. Sesje sa kwalifikowane po `businessDate`, a wyplaty po
`paidBusinessDate`, nawet jezeli data ich sesji zrodlowej jest inna. Eksport
zapisuje rozstrzygniete granice w metadanych CSV.

## Znaczenie metryk

### Administrator

Metryki zbiorow, sprzedazy, naliczen i wyplat obejmuja dokumenty, ktorych
odpowiednia data biznesowa nalezy do okresu. Liczba aktywnych zbieraczy oraz
lokalny stan synchronizacji sa biezacymi informacjami technicznymi i nie sa
historyzowane.

### Operator

Filtr dotyczy liczby zamknietych sesji operatora i jego listy sesji
historycznych. Biezacy stan operacyjny, wszystkie otwarte sesje, lokalne zapisy
i konflikty pozostaja widoczne niezaleznie od okresu, poniewaz moga wymagac
natychmiastowego dzialania. Filtr nie ujawnia informacji finansowych.

### Zbieracz

Masa, ilosci, naliczenia i statusy sesji sa filtrowane po `businessDate`.
Wyplacona kwota jest filtrowana niezaleznie po `paidBusinessDate`. Wynik nadal
obejmuje tylko `workerId` zalogowanego zbieracza.

## Odczyty

Pakiet 8.11 filtruje poprawne dokumenty po ich odczytaniu. Pomiar liczby
odczytow, zapytania ograniczone zakresem i ewentualne agregaty sa osobnym
zakresem pakietu 8.12. Do czasu jego zakonczenia nie nalezy interpretowac
filtra jako optymalizacji kosztu odczytow.
