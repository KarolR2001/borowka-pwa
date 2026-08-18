# AGENTS.MD - zasady pracy nad Borowka PWA

Ten plik jest instrukcja operacyjna dla agentow AI pracujacych nad implementacja aplikacji Borowka PWA. Stosuj go przed rozpoczeciem pracy i traktuj jako lokalne zasady repozytorium.

## Cel projektu

Glowny cel to dokonczenie implementacji aplikacji zgodnie z dokumentami:

- `../PRD_System_Ewidencji_Zbiorow_Borowek_Firebase.md`
- `../Plan_Implementacji.md`
- `../Plan_Implementacji_Borowka_PWA_Szczegolowy.md`

Docelowo aplikacja ma nadawac sie do realnego uzycia: ewidencja zbiorow, tryb offline-first, synchronizacja, wyplaty, sprzedaz, raporty, produkcja i stabilizacja. Import, inwentaryzacja i migracja danych z poprzednich sezonow sa poza zakresem.

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
  `8.19 - testy wydajnosci pulpitu`.

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

## Zasady UX powloki aplikacji

- Niezalogowany uzytkownik widzi na pelnym ekranie tylko logowanie, odzyskanie hasla i prerejestracje. Nie pokazuj mu nawigacji, pulpitow ani diagnostyki.
- Po zalogowaniu otwieraj domyslny ekran przypisany do roli `ADMIN`, `OPERATOR` albo `PICKER`.
- Kazda rola otrzymuje wlasna nawigacje i wlasne moduly. Elementow innych rol nie renderuj; nie zastepuj ich komunikatem o braku dostepu.
- Pokazuj stale tylko informacje potrzebne do wykonania zadania. Szczegoly techniczne i systemowe umieszczaj w komunikatach chwilowych albo zamknietych sekcjach diagnostycznych dostepnych administratorowi.
- Nie pokazuj stale komunikatow typu `Firebase gotowy`, wersji buildu ani stanu uslug technicznych.
- Projektuj przede wszystkim dla telefonu: prosta hierarchia, malo krokow, duze cele dotykowe, brak poziomego przelewania calej strony.
- Zachowuj wszystkie operacje biznesowe danej roli. Przy rozdzielaniu ekranow sprawdz, czy skroty akcji prowadza do nowej lokalizacji formularza.
- Nawigacje najwyzszego poziomu, np. `Zbiory`, `Pulpit`, `Moje dane` i `Konto`, pokazuj w menu wysuwanym od gory po uzyciu przycisku z trzema paskami w prawym gornym rogu. Zakladki wewnatrz aktualnego obszaru roboczego moga pozostac jako zakladki.
- W naglowku pokazuj jedynie nazwe uzytkownika i krotka nazwe aktualnego ekranu. Nie dodawaj duzych kart tytulowych ani recznych przyciskow odswiezania list; dane maja odswiezac sie automatycznie po operacji lub zmianie ekranu.
- Ekrany `Do wyplaty` i `Historia wyplat` sa osobnymi zakladkami administratora. Nie umieszczaj historii pod lista sesji oczekujacych na wyplate.

## Zasady tresci i formularzy

- Nie pokazuj stale informacji o trybie online lub offline. Po utracie polaczenia pokaz jedynie krotki, samoczynnie znikajacy popup, a po odzyskaniu polaczenia analogiczny popup o powrocie online.
- Komunikaty o zakonczonej kontroli, odswiezeniu lub aktualizacji pokazuj jako samoczynnie znikajace popupy, a nie stale sekcje strony.
- Filtry i drugorzedne ustawienia list umieszczaj w domyslnie zamknietej sekcji rozwijanej przyciskiem. Bez rozwijania pokazuj tylko informacje i akcje kluczowe dla danego ekranu.
- Formularze maja byc zrozumiale bez wiedzy technicznej. Przy polach wyboru i polach tekstowych dodawaj dostepna pod klawiatura ikone informacji z krotkim wyjasnieniem celu pola, gdy etykieta nie wyjasnia go jednoznacznie.
- Identyfikatory, kody i symbole techniczne generuj automatycznie. Nie wymagaj ich od uzytkownika, jezeli nie sa decyzja biznesowa; dotyczy to w szczegolnosci tworzenia planu rozliczen.
- Wszystkie teksty widoczne dla uzytkownika zapisuj poprawna polszczyzna z polskimi znakami.
- W interfejsie uzywaj slowa `data`, nigdy okreslenia `data biznesowa`.

## Zbieracz a konto uzytkownika

- Zgodnie z PRD zbieracz i konto sa oddzielnymi encjami. Zbieracz jest rekordem operacyjnym uzywanym w zbiorach, stawkach i wyplatach; moze pracowac bez konta aplikacji (`FR-WORKER-013`). Konto jest tozsamoscia Firebase i opcjonalnym dostepem tej osoby do jej danych.
- Tworzenie zbieracza ma tworzyc rekord zbieracza i pierwsza stawke. Nie tworz automatycznie konta Auth, hasla ani zaproszenia.
- Konto zbieracza zakladaj przez prerejestracje i powiazanie z istniejacym rekordem zbieracza. Administrator wybiera zbieracza po nazwie z listy aktywnych, niepowiazanych osob. `workerId` jest wartoscia techniczna przekazywana w tle i nie moze byc polem do recznego wpisania ani widoczna kolumna tabeli.
- Nie pozwalaj powiazac jednego aktywnego zbieracza z wieloma aktywnymi kontami. Przy reaktywacji lub zmianie roli zachowuj aktualne powiazanie jako dostepna opcje i pokazuj nazwe osoby zamiast identyfikatora.

## Zgoda i praca offline

- Kazdy profil bez `offlineConsent` po zalogowaniu musi podjac jawna decyzje dotyczaca zapisu danych na urzadzeniu. Pokaz modal z wyborami `Tak, wlacz prace offline` i `Nie, tylko ta sesja`.
- Odmowa obowiazuje tylko do konca biezacej sesji logowania. Przy kolejnym logowaniu ponownie popros o decyzje; nie wlaczaj trwalego cache bez zgody.
- Po zgodzie zapisz preferencje profilu i urzadzenia, popros przegladarke o trwala pamiec, a po kolejnym uruchomieniu z cache `PERSISTENT` automatycznie przygotuj lokalna konfiguracje dla administratora lub operatora.
- Nie uznawaj urzadzenia za gotowe offline tylko na podstawie flagi profilu. Wymagane sa rowniez: trwaly cache Firestore, gotowy service worker, lokalna konfiguracja i znacznik przygotowania urzadzenia.
- Uzytkownik moze wylaczyc dalsze przechowywanie w widoku `Konto`. Dane oczekujace czysc tylko przez istniejacy, jawnie potwierdzony przeplyw bezpiecznego wylogowania.

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
- Przed recznym wdrozeniem Hostingu DEV zawsze uruchom `npm run build:development`.
  Zwykle `npm run build` uzywa trybu produkcyjnego Vite i moze wczytac
  `.env.production.local`; nie wdrazaj tak zbudowanego katalogu `dist` do DEV.
- Zmiany rules, indeksow i konfiguracji waliduj celowanymi testami lub emulatorami, gdy jest to praktyczne.
- Dla DEV uzywaj `VITE_FIREBASE_AUTH_DOMAIN=borowka-pwa-dev.web.app`, a nie
  domeny `firebaseapp.com`. Domena Hostingu musi byc dodana w Firebase
  Authentication do `Authorized domains`; zapobiega to blokowaniu pamieci
  iframe Auth przez ochrone przed sledzeniem w przegladarkach.
- Sesja Firebase Auth ma uzywac jawnej trwalej persystencji `LOCAL`. Nie
  zmieniaj jej na pamiec sesyjna ani ulotna bez jawnej decyzji produktowej.

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

- Pakiet `8.19 - testy wydajnosci pulpitu` zostal scalony do `main` jako
  `e65889e`; nie implementuj go ponownie.
- Fizyczne przebiegi Android 6.24 i iOS 6.25 zostaly odroczone decyzja
  uzytkownika jako `SKIPPED`.
- Pakiet `9.1 - katalog raportow MVP` zostal scalony do `main` jako `12b1976`;
  nie implementuj go ponownie.
- Pakiet `9.2 - eksport CSV do polskiego Excela` zostal scalony do `main` jako
  `6a0a2e7`; nie implementuj go ponownie.
- Pakiet `9.3 - pelny eksport przenosny` zostal scalony do `main` jako
  `9d872a4`; nie implementuj go ponownie.
- Pakiet `9.4 - rozdzielenie eksportow` zostal scalony do `main` jako `56b2eb7`;
  nie implementuj go ponownie.
- Pakiet `9.5 - zabezpieczenie zrodel migracji` zostal scalony do `main` jako
  `fa43f0d`; nie implementuj go ponownie.
- Decyzja wlasciciela produktu z 2026-08-10: aplikacja rozpoczyna prace od
  nowego sezonu. Nie analizuj ani nie importuj danych z poprzednich sezonow.
  Pakiety `9.6-9.17` oraz produkcyjne `12.10-12.11` sa `POMINIETE` i nie sa
  bramkami wdrozenia.
- Techniczne migracje schematu, eksport przenosny i przyszle przeniesienie
  danych wytworzonych w Borowka PWA pozostaja w zakresie.
- Pakiet `9.18 - test przenosnosci eksportu` zostal scalony do `main` jako
  `6f7a7e2`; nie implementuj go ponownie.
- Pakiet `9.19 - testy uprawnien eksportu` zostal scalony do `main` jako
  `1c7b3b5`; nie implementuj go ponownie.
- Pakiet `10.1 - zamrozenie zakresu release candidate` zostal scalony do
  `main` jako `b263986`; nie implementuj go ponownie.
- Pakiet `10.2 - pelna macierz wymagan do testow` zostal scalony do `main` jako
  `88504b7`; nie implementuj go ponownie.
- Biezacy przyrost: korekta UX RC - spojne plany rozliczen, jawna zgoda
  offline, rozdzielone ekrany wyplat, kompaktowe naglowki, menu glowne oraz
  wybieranie zbieracza po nazwie podczas zakladania i edycji konta.
- `docs/testing/requirements-traceability.md` jest generowany; nie edytuj go
  recznie. Zmien przypisania w `scripts/requirement-traceability.mjs`, a potem
  uruchom `npm run requirements:write` i `npm run requirements:check`.
- Po zamrozeniu RC nowe funkcje wymagaja jawnej decyzji produktowej; dozwolone
  sa poprawki bledow, bezpieczenstwa, dostepnosci, niezbednego UX, testow,
  dokumentacji i wdrozenia.
- Manualne otwarcie CSV w aktualnym Excelu i alternatywnym arkuszu pozostaje
  `PENDING`; automatyczne testy struktury nie pozwalaja oznaczyc tej bramki jako
  `PASS`.
- Bramka urzadzeniowa etapu 6 pozostaje otwarta: testy fizyczne oraz rzeczywisty
  deploy A/B trzeba wykonac przed pilotazem lub produkcja.
- Etap 7 zostal wdrozony do Firebase DEV 2026-07-29. PROD nie zostal wdrozony.
- Bramka wejscia etapu 8 dotyczaca syntetycznych danych DEV pozostaje otwarta do
  czasu standardowego uwierzytelnienia aktywnego administratora i utworzenia
  zestawu testowego. Nie oznaczaj jej jako `PASS` bez sprawdzenia danych.
- Automatyczny pomiar 8.19 na Firestore Emulatorze jest `PASS`, ale przed PROD
  nadal wykonaj co najmniej 20 pomiarow p95 i Query Explain na realistycznych
  danych Firebase DEV. Emulator nie jest dowodem wydajnosci prawdziwej sieci.
