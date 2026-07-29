# AGENTS.MD - zasady pracy nad Borowka PWA

Ten plik jest instrukcja operacyjna dla agentow AI pracujacych nad implementacja aplikacji Borowka PWA. Stosuj go przed rozpoczeciem pracy i traktuj jako lokalne zasady repozytorium.

## Cel projektu

Glowny cel to dokonczenie implementacji aplikacji zgodnie z dokumentami:

- `../PRD_System_Ewidencji_Zbiorow_Borowek_Firebase.md`
- `../Plan_Implementacji.md`
- `../Plan_Implementacji_Borowka_PWA_Szczegolowy.md`

Docelowo aplikacja ma nadawac sie do realnego uzycia: ewidencja zbiorow, tryb offline-first, synchronizacja, wyplaty, sprzedaz, raporty, migracja danych, produkcja i stabilizacja.

## Srodowisko pracy

- Pracuj wylacznie w WSL/Linux.
- Nie mieszaj srodowisk Windows i Linux.
- Wlasciwe repozytorium projektu to katalog `borowka-pwa`.
- Uzywaj lokalnych narzedzi projektu:
  - Node: `.tools/node-v24.14.0-linux-x64/bin`
  - GitHub CLI: `.tools/gh_2.96.0_linux_amd64/bin/gh`
  - npm scripts z `package.json`
  - Firebase CLI przez `scripts/firebase-cli.mjs`
- Preferuj narzedzia i wzorce juz obecne w repozytorium.

## Git i GitHub

- Kazdy pakiet realizuj na osobnej galezi roboczej.
- Nazwy galezi trzymaj w schemacie `feat/etap-X-Y-opis`.
- Commity rob granularnie: jeden commit powinien opisywac konkretny przyrost.
- PR tworz po zakonczeniu pakietu.
- Po zielonym CI i `mergeStateStatus: CLEAN` mozesz scalic PR bez dodatkowego pytania.
- Uzytkownik zezwolil na push galezi, tworzenie PR i scalanie po zielonym CI
  dla pakietu 6.21 i wszystkich kolejnych pakietow.
- Po merge zaktualizuj lokalny `main`.
- Nie przepisuj historii.
- Nie revertuj cudzych zmian bez wyraznej zgody uzytkownika.
- Jesli zastaniesz cudze lokalne zmiany, pracuj z nimi i nie cofaj ich.

## Dokumentowanie postepu

- Prowadz lokalny plik `postep.md`.
- Dopisuj w nim:
  - aktualny etap lub pakiet;
  - zakres prac;
  - wykonane zmiany;
  - uruchomione testy;
  - commit;
  - PR;
  - wynik CI;
  - merge.
- `postep.md` jest lokalnym dziennikiem pracy, jest ignorowany przez git i nie trafia do PR.

## Czytanie dokumentacji

- PRD i plany implementacji sa zrodlem prawdy.
- Nie czytaj calych duzych plikow przy kazdym zadaniu.
- Czytaj aktualny fragment planu i najblizszy potrzebny kontekst.
- Preferuj `rg`, konkretne zakresy linii i krotkie fragmenty.
- Aktualny kierunek po scaleniu biezacego przyrostu: pakiet
  `8.11 - filtry okresow`.

## Testowanie i walidacja

- Nie uruchamiaj pelnych testow po kazdej malej zmianie.
- Dla pakietu uruchamiaj testy celowane dla zmienionego obszaru.
- Przed commitem zwykle sprawdz:
  - celowany `vitest`;
  - `npm run typecheck`;
  - celowany `eslint`;
  - celowany `prettier --check`;
  - `git diff --check`.
- Pelniejsza walidacje wykonuje CI na GitHubie.
- Deploy nie zastepuje testow.
- Jesli nie mozesz uruchomic istotnego testu, zapisz powod w odpowiedzi i w `postep.md`.
- Na obecnym etapie nie uruchamiaj testow Android przez emulator ani ADB.
- Testy na fizycznych telefonach sa odroczone z powodu braku urzadzenia.
  Oznaczaj je jako `SKIPPED`, nigdy jako `PASS`, zapisz ryzyko rezydualne
  i kontynuuj kolejne pakiety implementacyjne.
- Odroczone testy fizyczne pozostaja wymagane przed pilotazem terenowym lub
  wdrozeniem produkcyjnym.

## Deploy

- Nie rob deployu po kazdym malym pakiecie.
- Deploy wykonuj po sensownej bramce lub zakonczonym etapie.
- Srodowisko DEV sluzy do sprawdzenia wiekszego, spojnego przyrostu.
- PROD wdrazaj dopiero po checklistach produkcyjnych, testach, konfiguracji i decyzji wdrozeniowej.
- Firebase dev i prod traktuj jako oddzielne srodowiska.
- Nie wdrazaj produkcji przypadkowo.

## Firebase

Firebase jest uzywany do:

- Auth;
- Firestore;
- Hosting;
- Rules;
- indeksow;
- emulatorow i testow.

Zasady:

- Nie mieszaj danych dev i prod.
- Jesli brakuje dostepu, konfiguracji lub logowania, popros uzytkownika o reczny krok.
- Do CLI Firebase uzywaj `scripts/firebase-cli.mjs`.
- Zmiany rules, indeksow i konfiguracji waliduj celowanymi testami lub emulatorami, gdy jest to praktyczne.

## Tokeny i wydajnosc pracy

- Ogranicz czytanie duzych plikow do potrzebnych fragmentow.
- Preferuj `rg`, `sed`, `git diff`, `git show` i konkretne zakresy linii.
- Nie pobieraj dlugich logow, jesli nie ma bledu wymagajacego diagnostyki.
- Nie uruchamiaj dlugich testow bez potrzeby.
- Koncz prace malymi, zamknietymi PR-ami.

## Kiedy pytac uzytkownika

Pytaj tylko wtedy, gdy trzeba:

- zalogowac GitHub, Firebase lub gcloud;
- zatwierdzic device flow;
- podac albo uzupelnic sekrety;
- wykonac test manualny na realnym urzadzeniu;
- podjac decyzje biznesowa, produktowa albo produkcyjna.

W pozostalych przypadkach podejmuj rozsadne decyzje na podstawie dokumentacji, kodu i lokalnych wzorcow.

## Aktualny stan roboczy

- Pakiet `8.10 - pulpit operatora` jest zakonczonym zakresem biezacego
  przyrostu; po jego zielonym CI i scaleniu nie implementuj go ponownie.
- Fizyczne przebiegi Android 6.24 i iOS 6.25 zostaly odroczone decyzja
  uzytkownika jako `SKIPPED`.
- Nastepny pakiet implementacyjny to `8.11 - filtry okresow`.
- Bramka urzadzeniowa etapu 6 pozostaje otwarta: testy fizyczne oraz rzeczywisty
  deploy A/B trzeba wykonac przed pilotazem lub produkcja.
- Etap 7 zostal wdrozony do Firebase DEV 2026-07-29. PROD nie zostal wdrozony.
- Bramka wejscia etapu 8 dotyczaca syntetycznych danych DEV pozostaje otwarta do
  czasu standardowego uwierzytelnienia aktywnego administratora i utworzenia
  zestawu testowego. Nie oznaczaj jej jako `PASS` bez sprawdzenia danych.
