# Zabezpieczenie zrodel migracji

## Zasada

Pliki zrodlowe migracji sa danymi prywatnymi. Nie wolno dodawac ich, ich kopii,
manifestow z sumami ani wynikow analizy do publicznego repozytorium, PR, logow CI
lub zalacznikow issue. Repozytorium zawiera tylko narzedzie i procedure.

Domyslny sejf znajduje sie w linuksowym systemie plikow WSL:

`$HOME/.local/share/borowka-pwa/migration-private`

Nie nalezy wskazywac sejfu pod `/mnt/c`. Skrypt sprawdza rzeczywiste prawa POSIX
i przerywa prace, jesli system plikow nie wymusza wymaganych ograniczen.

## Rejestracja zestawu

Kazdy plik zestawu podaje sie osobnym `--input`. Pochodzenie musi opisywac, od
kogo, kiedy i w jaki sposob pozyskano caly zestaw. Przyklad dla potwierdzonego
HTML i dostarczonego XLSX:

```bash
npm run migration:secure-source -- \
  --input /linux/path/Arkusz1.html \
  --input /linux/path/Arkusz2.html \
  --xlsx /linux/path/Zrodlo.xlsx \
  --source "Eksport otrzymany od wlasciciela 2026-08-05" \
  --html-version-status SINGLE_VERSION_CONFIRMED \
  --xlsx-status OBTAINED
```

Dozwolone statusy HTML:

- `SINGLE_VERSION_CONFIRMED` - wszystkie HTML pochodza z jednej wersji;
- `MULTIPLE_VERSIONS` - potwierdzono wiecej niz jedna wersje;
- `UNCONFIRMED` - brak wiarygodnego potwierdzenia;
- `NOT_APPLICABLE` - zestaw nie zawiera HTML.

Dozwolone statusy XLSX:

- `OBTAINED` - XLSX przekazano do narzedzia;
- `REQUESTED` - poproszono o XLSX, ale jeszcze go nie otrzymano;
- `NOT_AVAILABLE` - wlasciciel potwierdzil, ze XLSX nie istnieje lub nie moze
  zostac pozyskany;
- `UNKNOWN` - dostepnosc nie zostala ustalona.

Nie wolno uzywac `NOT_AVAILABLE` tylko dlatego, ze pliku nie znaleziono lokalnie.

## Artefakty prywatne

Jedno uruchomienie tworzy:

- `originals/` - deduplikowane po SHA-256 kopie oryginalne, prawa `0400`;
- `working/` - datowane kopie robocze, prawa `0600`;
- `manifests/` - manifest pochodzenia zestawu, prawa `0400`;
- katalogi prywatne `0700`, a katalog oryginalow `0500` po zapisie.

Manifest `BOROWKA_MIGRATION_SOURCE_CUSTODY` zapisuje dla kazdego pliku nazwe,
rozmiar, SHA-256, czas modyfikacji, pochodzenie i sciezki obu kopii. Nie zapisuje
zewnetrznej bezwzglednej sciezki ani tresci pliku.

Kopia robocza nigdy nie nadpisuje oryginalu. Powtorna rejestracja tego samego
pliku sprawdza istniejaca kopie oryginalna zamiast ja zmieniac.

## Weryfikacja

Przed analiza i po kazdym przeniesieniu zestawu uruchom:

```bash
npm run migration:verify-source -- /linux/path/manifests/<custody-id>.json
```

Wynik musi miec `valid: true`. Weryfikator sprawdza prawa dostepu, rozmiary,
SHA-256, granice sciezek i format manifestu. Zmiana dowolnej kopii powoduje blad.

Analize wolno rozpoczac tylko przy jednoczesnym:

- `sourceCopiesSecured = true`;
- `htmlAssessmentComplete = true`;
- `xlsxAssessmentComplete = true`;
- `analysisAllowed = true`.

## Stan lokalnego zestawu

W etapie 9.5 zabezpieczono i zweryfikowano piec lokalnych plikow HTML z katalogu
`szablon_arkusza`. Sumy i manifest pozostaja w prywatnym sejfie poza repozytorium.

Aktualna bramka ma status `PENDING`:

- `sourceCopiesSecured = true`;
- `htmlVersionStatus = UNCONFIRMED`;
- `xlsxStatus = UNKNOWN`;
- `analysisAllowed = false`.

Same zblizone czasy modyfikacji i identyczna deklaracja kodowania HTML nie
potwierdzaja jednej wersji arkusza. Przed pakietem 9.6 uzytkownik musi potwierdzic
pochodzenie HTML oraz przekazac XLSX albo wiarygodnie potwierdzic jego brak.
