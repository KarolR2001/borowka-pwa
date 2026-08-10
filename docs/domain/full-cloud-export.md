# Pelny eksport przenosny chmury

## Cel i dostep

Pakiet 9.3 udostepnia aktywnemu administratorowi kompletny eksport danych
potwierdzonych przez serwer Firestore. Eksport wymaga polaczenia online i jest
pobierany jako archiwum ZIP. Operator i picker nie widza panelu ani nie moga
uruchomic odczytow eksportowych.

Archiwum sluzy do niezaleznej archiwizacji, kontroli oraz przygotowania przyszlej
migracji. Nie jest automatycznym backupem Firebase i nie zapewnia przywracania
jednym kliknieciem.

Eksport zawiera dane osobowe i finansowe, zaproszenia, dane urzadzen i audyt.
Plik musi byc przechowywany poza Firebase w zabezpieczonej lokalizacji z
dostepem ograniczonym do uprawnionych osob.

## Zrodlo i kompletnosc

Kazda kolekcja jest czytana bezposrednio z serwera, w kolejnosci stabilnego ID
dokumentu i stronami po 500 dokumentow. Eksport nie korzysta z lokalnego cache.
Kanoniczny zestaw obejmuje wszystkie kolekcje najwyzszego poziomu z
`firestore.rules`:

1. `appSettings`
2. `auditEvents`
3. `devices`
4. `harvestEntries`
5. `harvestSessions`
6. `issueReports`
7. `operationalStockMovements`
8. `payments`
9. `registrationInvitations`
10. `sales`
11. `seasons`
12. `settlementPlans`
13. `users`
14. `workerRateVersions`
15. `workers`

Brak dowolnej kolekcji w zestawie zrodlowym uniemozliwia zbudowanie archiwum.
Blad przeniesienia pojedynczego dokumentu nie usuwa pozostalych danych: dokument
jest pominiety i opisany w `errors.json`.

## Struktura ZIP

Nazwa pliku ma postac
`borowka-full-cloud-export-<czas-UTC>.zip`. Archiwum zawiera:

- `manifest.json` - wersje, srodowisko, autor, lista kolekcji, plikow i sumy
  kontrolne;
- `collections/<nazwa>.json` - stabilne ID oraz dane dokumentow danej kolekcji;
- `errors.json` - liczba i lista pominietych dokumentow z przyczyna.

Kazdy plik kolekcji i `errors.json` ma w manifeście rozmiar oraz skrot SHA-256.
`manifest.json` nie ma wlasnego skrotu, poniewaz zawarcie go we wlasnej tresci
tworzyloby cykliczna zaleznosc.

## Manifest i interpretacja

Format ma nazwe `BOROWKA_FULL_CLOUD_EXPORT`, cel `PORTABLE_ARCHIVE`, zrodlo
`FIRESTORE_SERVER`, zakres `ALL_FIRESTORE_COLLECTIONS` i wersje formatu `2`.
Manifest zapisuje:

- wersje aplikacji, buildu, schematu danych i obliczen z `APP_META`;
- identyfikator projektu Firebase, srodowisko aplikacji i zrodlo
  `FIRESTORE_SERVER`;
- czas eksportu UTC oraz UID i e-mail administratora;
- liczbe dokumentow dla kazdej kolekcji i calego eksportu;
- liczbe dokumentow legacy dla kolekcji i calego eksportu;
- manifest plikow z rozmiarem i SHA-256;
- liczbe pominiec i sciezke raportu bledow;
- sumy kontrolne dla kazdego sezonu.

Dokumenty zachowuja wszystkie pola snapshotow i importu legacy. Manifest liczy
dokument jako legacy, gdy ma `legacyImport: true`, niepuste `legacySourceRow` lub
niepuste `legacySourceRows`.

Typy Firestore sa kodowane jawnie w JSON: timestamp, data, bajty, referencja i
GeoPoint otrzymuja pole `__type`. Liczby niefinitywne sa rowniez oznaczone, a
mapy maja deterministyczna kolejnosc kluczy.

## Sumy kontrolne sezonu

Dla kazdego sezonu manifest podaje liczbe sesji, wpisow, wyplat i sprzedazy oraz:

- potwierdzona mase zbiorow i naliczenie z sesji `CLOSED` i `PAID`;
- aktywne wyplaty;
- podpisana mase sprzedana i przychod z aktywnych sprzedazy oraz korekt;
- stan dostepny jako potwierdzone zbiory minus podpisana sprzedaz;
- liczbe dokumentow importowanych.

Sumy sa liczone tylko z dokumentow faktycznie zapisanych w archiwum. Pominiecie
jest zatem widoczne zarowno w `errors.json`, jak i przez mozliwa roznice sum
kontrolnych.

## Ograniczenia i bramka PROD

Pobieranie jest stronicowane, ale pliki JSON i ZIP sa budowane w pamieci
przegladarki. Przed PROD trzeba wykonac pelny eksport na realistycznej maksymalnej
objetosci danych w docelowej przegladarce, sprawdzic brak pominiec, zweryfikowac
SHA-256 oraz otworzyc pliki JSON poza aplikacja. Tego testu nie zastepuje maly
zestaw na emulatorze Firestore.

Eksport awaryjny urzadzenia jest osobnym mechanizmem: obejmuje lokalne oczekujace
zapisy potrzebne do ratowania synchronizacji. Nie stanowi pelnego eksportu chmury
i nie moze byc przechowywany ani opisywany jako jego zamiennik.

Pelne porownanie obu mechanizmow znajduje sie w
`docs/domain/export-mechanism-boundaries.md`.
Macierz uprawnien znajduje sie w `docs/domain/export-access-control.md`.

## Niezalezna walidacja przenosnosci

Pakiet 9.18 dostarcza walidator Node, ktory dziala bez uruchamiania aplikacji i
bez polaczenia z Firebase. Po pobraniu eksportu administrator zapisuje ten sam
plik w dwoch niezaleznych, zabezpieczonych lokalizacjach, a nastepnie uruchamia:

```bash
npm run export:verify-portability -- \
  --archive /bezpieczna-lokalizacja-a/borowka-full-cloud-export-....zip \
  --archive /bezpieczna-lokalizacja-b/borowka-full-cloud-export-....zip
```

Rozne sciezki sa warunkiem technicznym. Operator nadal odpowiada za to, aby byly
to rzeczywiscie niezalezne nosniki albo systemy skladowania, a nie dwa katalogi
na tym samym dysku.

Walidator:

- potwierdza identyczny SHA-256 obu kopii;
- otwiera ZIP i odrzuca niebezpieczne albo nadmiarowe sciezki;
- sprawdza nazwe i wersje formatu, srodowisko, autora i czas eksportu;
- porownuje rozmiar i SHA-256 kazdego pliku z manifestem;
- wymaga dokladnie 15 kanonicznych kolekcji oraz `errors.json`;
- odtwarza dokumenty w pamieci, sprawdza unikalnosc ID i liczby dokumentow;
- niezaleznie przelicza podsumowanie oraz sumy kontrolne sezonow;
- zwraca raport JSON z `valid: true` tylko po przejsciu wszystkich kontroli.

Raport jawnie wskazuje, ze konta Firebase Authentication nie sa czescia
Firestore i nie znajduja sie w archiwum. Odtworzenie kont wymaga osobnej
procedury administracyjnej; hasel nie da sie odtworzyc z tego eksportu.

Walidator jest kontrolnym narzedziem interpretacji i integralnosci. Nie zapisuje
danych do projektu Firebase i nie stanowi automatycznego przywracania produkcji.
Przed PROD trzeba dodatkowo wykonac te procedure na rzeczywistym eksporcie DEV
o realistycznej objetosci i umiescic kopie w dwoch faktycznie niezaleznych
lokalizacjach. Test syntetyczny w CI nie potwierdza niezaleznosci nosnikow.
