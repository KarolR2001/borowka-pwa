# Borowka PWA

Mobilna aplikacja PWA do ewidencji zbiorow, sprzedazy i rozliczen zbieraczy borowki amerykanskiej.

Repozytorium jest tworzone zgodnie z dokumentami z katalogu nadrzednego:

- `PRD_System_Ewidencji_Zbiorow_Borowek_Firebase.md`
- `Plan_Implementacji.md`
- `Plan_Implementacji_Borowka_PWA_Szczegolowy.md`
- `Scenariusze.md`
- `Lista_kontrolna_gotowosci_do_produkcji.md`

## Status

Aktualny zakres repozytorium: Etap 1, czyli warsztat inzynierski i pusty szkielet aplikacji. Model kont, sesji, stawek, wyplat i sprzedazy bedzie dodawany etapami po zatwierdzeniu decyzji z Etapu 0.

## Wymagane narzedzia

- Node.js `24.14.0`
- npm `11.9.0`
- Git

W tym srodowisku Node jest uruchamiany z przenosnej binarki zapisanej lokalnie w ignorowanym katalogu `.tools/`:

```bash
PATH=.tools/node-v24.14.0-linux-x64/bin:$PATH npm run verify
```

Na zwyklym komputerze po instalacji Node 24.14.0 wystarczy:

```bash
npm ci
npm run dev
```

## Podstawowe polecenia

```bash
npm run dev
npm run test
npm run typecheck
npm run lint
npm run format:check
npm run build
npm run verify
npm run test:rules
```

## Srodowiska

Projekt ma docelowo dwa osobne srodowiska Firebase:

- development
- production

Lokalna konfiguracja klienta Firebase jest publiczna, ale nie moze zawierac sekretow administracyjnych. Skopiuj `.env.example` do lokalnego pliku `.env.local` i wpisz wartosci dla projektu development. Pliki `.env*` poza przykladami sa ignorowane przez Git.

## Firebase

Repo zawiera poczatkowe pliki:

- `firebase.json`
- `.firebaserc.example`
- `firestore.rules`
- `firestore.indexes.json`

Poczatkowe reguly Firestore sa celowo restrykcyjne: deny by default.

## Proces pracy

`main` reprezentuje wersje mozliwa do wdrozenia na development. Prace ida na krotkich galeziach, np. `chore/etap-1-repo-warsztat`. Kazda zmiana przed polaczeniem ma przejsc co najmniej:

```bash
npm run verify
```

Szczegoly sa w [CONTRIBUTING.md](CONTRIBUTING.md) oraz [docs/process/branching.md](docs/process/branching.md).
