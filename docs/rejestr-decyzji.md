# Rejestr decyzji

## DEC-0001 - Lokalizacja repozytorium

- Status: zaakceptowana
- Data: 2026-07-15
- Decyzja: repozytorium powstaje w podfolderze `borowka-pwa`.
- Uzasadnienie: pliki PRD, plany i eksporty HTML z katalogu nadrzednego nie powinny przypadkowo wejsc do historii Git nowego projektu.
- Skutki: dokumenty zrodlowe pozostaja poza repo, ale README wskazuje je jako zrodla wymagan.

## DEC-0002 - Strategia galezi

- Status: zaakceptowana
- Data: 2026-07-15
- Decyzja: `main` jest stabilna galezia development, a prace ida na krotkich galeziach funkcjonalnych.
- Uzasadnienie: zgodne ze szczegolowym planem implementacji i pozwala wykonywac testowane commity.
- Skutki: kazdy etap lub pakiet prac ma oddzielna galaz.

## DEC-0003 - Toolchain

- Status: zaakceptowana technicznie
- Data: 2026-07-15
- Decyzja: Node.js `24.14.0`, npm `11.9.0`, React, TypeScript, Vite i Vitest.
- Uzasadnienie: Node 24 jest linia LTS, a Vite/React/TypeScript pasuja do rekomendowanej architektury PRD.
- Skutki: repo ma `.nvmrc`, `engines` i `packageManager`; zaleznosci sa blokowane przez `package-lock.json`.

## DEC-0004 - Poczatkowe Security Rules

- Status: zaakceptowana
- Data: 2026-07-15
- Decyzja: poczatkowe reguly Firestore odmawiaja kazdego odczytu i zapisu.
- Uzasadnienie: plan wymaga startu od deny by default.
- Skutki: aplikacja nie ma jeszcze dostepu do danych biznesowych; dostepy beda rozszerzane wraz z testami Rules.

## DEC-0005 - Dlugosc sesji zbioru

- Status: zaakceptowana na podstawie PRD
- Data: 2026-07-17
- Decyzja: jedna sesja dotyczy jednej osoby, jednego sezonu i jednej daty biznesowej.
- Uzasadnienie: PRD modeluje `businessDate` jako dzien zbioru, wymaga snapshotu planu/stawki na sesji i opisuje przypadek dwoch sesji tej samej osoby tego samego dnia jako osobny, jawnie potwierdzany przypadek.
- Skutki: etap 5 implementuje sesje jednodniowe; wariant wielodniowy wymagalby nowej decyzji, rozszerzenia modelu dat i osobnych regul raportowania.

## DEC-0006 - Reset hasla w MVP

- Status: do zatwierdzenia przed implementacja kont
- Rekomendacja: standardowy reset hasla Firebase przez e-mail.
- Powod: MVP nie ma backendu, a administrator aplikacji nie powinien poznawac hasla innej osoby.
- Wymagane od uzytkownika: akceptacja procesu.

## DEC-0007 - Prerejestracja bez backendu

- Status: do zatwierdzenia przed implementacja kont
- Rekomendacja: administrator tworzy zaproszenie, uzytkownik zaklada konto Firebase na ten sam e-mail, aplikacja laczy konto z zaproszeniem.
- Wymagane od uzytkownika: decyzja o weryfikacji e-mail, czasie waznosci i anulowaniu zaproszen.

## DEC-0008 - Historyczna ujemna sprzedaz

- Status: do recznego rozstrzygniecia przed migracja produkcyjna
- Problem: jeden wpis sprzedazy ma brakujaca date oraz ujemna cene i przychod.
- Wymagane od uzytkownika: potwierdzenie, czy to korekta, jaka ma date i jak wplywa na stan.

## DEC-0009 - Firebase CLI w projekcie

- Status: zaakceptowana technicznie
- Data: 2026-07-15
- Decyzja: Firebase CLI jest uruchamiany jako przypiete `firebase-tools@15.23.0` przez `npx`, a nie jako `devDependency`.
- Uzasadnienie: `firebase-tools@15.23.0` wnosi podatnosci umiarkowane w zaleznosciach posrednich, mimo ze sa poza kodem aplikacji. Trzymanie CLI poza `package-lock.json` pozwala utrzymac czysty audit aplikacji, a wersja nadal jest jawnie przypieta w `scripts/firebase-cli.mjs`.
- Skutki: pierwszy lokalny albo CI run moze pobrac CLI do cache npm; skrypty nie uzywaja niekontrolowanego `latest`.

## DEC-0010 - Rekomendowana lokalizacja Firestore

- Status: do zatwierdzenia przed utworzeniem baz
- Data: 2026-07-15
- Rekomendacja: `europe-central2` Warsaw dla development i production.
- Uzasadnienie: glowni uzytkownicy sa w Polsce, a MVP nie wymaga multi-region kosztem wiekszego dystansu sieciowego.
- Alternatywa: `eur3` Europe multi-region, jesli priorytetem bedzie regionalna redundancja.
- Wymagane od uzytkownika: zatwierdzenie lokalizacji przed utworzeniem Firestore.

## DEC-0011 - Rytm deployow development

- Status: zaakceptowana
- Data: 2026-07-16
- Decyzja: po kazdym pakiecie powstaje testowana galaz, commit i PR, ale deploy na development wykonujemy po spojnym bloku prac, zamknieciu etapu albo na jawna prosbe.
- Uzasadnienie: czestsze PR-y utrzymuja maly zakres zmian, a rzadszy deploy ogranicza koszt recznego smoke testu i ryzyko czastkowej walidacji srodowiska.
- Skutki: merge do `main` wymaga lokalnej weryfikacji `npm run verify` i, dla Rules, `npm run verify:rules`; sam deploy dev nie jest obowiazkowy po kazdym merge.

## DEC-0012 - Waga w planie za ubianke

- Status: zaakceptowana na podstawie PRD
- Data: 2026-07-16
- Decyzja: systemowy plan `QUANTITY_UBIANKA` ma `weightRequired=false`.
- Uzasadnienie: PRD rozstrzyga, ze plan "Za ubianke" nie zawsze wymaga wagi. Wpis bez masy moze sluzyc rozliczeniu ilosciowemu, ale nie zwieksza stanu kilogramowego.
- Skutki: walidacja sesji musi pozniej rozroznic naliczenie za jednostki od aktualizacji stanu kg; operator powinien widziec konsekwencje wpisu bez wagi.

## DEC-0013 - Automatyczny merge po zielonym CI

- Status: zaakceptowana
- Data: 2026-07-17
- Decyzja: PR-y sa tworzone i obslugiwane z WSL przez GitHub CLI `gh`. Jesli CI/checki PR przejda prawidlowo, a PR jest mergeable, agent moze zmergowac PR bez dodatkowego pytania.
- Uzasadnienie: utrzymujemy workflow PR i historie review na GitHubie, a jednoczesnie nie blokujemy pracy recznymi kliknieciami po kazdym zielonym przyroscie.
- Skutki: po merge agent synchronizuje lokalny `main`, uruchamia wymagana weryfikacje i dopiero wtedy przechodzi do kolejnego pakietu.

## DEC-0014 - Oficjalne zaokraglenie sesji

- Status: zaakceptowana na podstawie PRD
- Data: 2026-07-17
- Decyzja: oficjalna kwota sesji jest liczona z sumy aktywnych wpisow i zaokraglana raz na poziomie sesji do pelnego grosza; polowa grosza jest zaokraglana w gore.
- Uzasadnienie: PRD BR-CALC-001 i BR-CALC-002 rozstrzygaja poziom i regule zaokraglenia, a sekcja 46 potwierdza `zaokraglenie raz na sesje; TAK`.
- Skutki: podglad pojedynczego wpisu moze byc informacyjny, ale oficjalna naleznosc powstaje przy zamknieciu sesji i zapisuje `calculationVersion`.

## DEC-0015 - Wzorcowe scenariusze obliczen Etapu 5

- Status: zaakceptowana technicznie na start Etapu 5
- Data: 2026-07-17
- Decyzja: scenariusze obliczen sesji sa zapisane w `docs/domain/calculation-scenarios.md`; przypadki sprzedazy, korekt, wyplat i migracji sa oznaczone jako przyszle rozszerzenia, bo odpowiadaja pozniejszym etapom.
- Uzasadnienie: bramka wejscia Etapu 5 wymaga zatwierdzonych wzorcow obliczeniowych, a PRD dzieli sesje, wyplaty, sprzedaz i migracje na osobne etapy.
- Skutki: implementacja Etapu 5 musi pokryc automatycznymi testami scenariusze sesji z tego dokumentu przed zamknieciem etapu.

## DEC-0016 - Kierunek korekty sprzedazy i stan kontrolny

- Status: zaakceptowana technicznie na podstawie PRD
- Data: 2026-07-29
- Decyzja: masa dokumentu `CORRECTION` jest dodatnia, a wplyw na stan zapisuje jawny kierunek `INCREASE_STOCK` albo `DECREASE_STOCK`. Kontrolny stan sezonu jest liczony ze zrodel jako potwierdzone zbiory minus sprzedaz netto i moze byc ujemny.
- Uzasadnienie: PRD wymaga odroznienia obu kierunkow korekty, zabrania ukrywania jej jako zwyklej sprzedazy z ujemnym znakiem oraz wymaga alarmu dla ujemnego stanu.
- Skutki: ujemna masa nie jest prawidlowym sposobem zapisu korekty; kalkulator, formularze, migracja, Rules i raporty musza stosowac ten sam kierunek oraz nie moga automatycznie wyzerowac ujemnego wyniku.

## DEC-0017 - Granica serializacji zwyklej sprzedazy

- Status: zaakceptowana technicznie na podstawie PRD
- Data: 2026-07-29
- Decyzja: zwykla sprzedaz wymaga aktywnego administratora i polaczenia online, dwukrotnego swiezego odczytu zrodel przed zapisem, jawnego ponownego potwierdzenia po zmianie stanu oraz kontrolnego przeliczenia po zapisie. Bez zaufanej funkcji serwerowej system nie deklaruje absolutnej serializacji dwoch rownoleglych sprzedazy.
- Uzasadnienie: Firestore Rules nie moga sumowac wynikow zapytan, a transakcja klienta nie obejmuje atomowo zapytan po wszystkich sesjach i sprzedazach sezonu. Udawanie pelnej blokady pozostawiloby niejawne ryzyko utraty kontroli stanu.
- Skutki: UI ostrzega przed rownolegla praca, standardowy przeplyw blokuje przekroczenie swiezego stanu, wynik po zapisie jest ponownie sprawdzany, a test kolizji i alarm niespojnosci pozostaja obowiazkowymi pakietami 8.17 i 8.14.

## DEC-0018 - Oficjalne zaokraglenie przychodu sprzedazy

- Status: zaakceptowana technicznie na podstawie PRD
- Data: 2026-07-29
- Decyzja: przychod zwyklej sprzedazy jest liczony jako `weightG * priceGroszPerKg / 1000`, z wykorzystaniem wszystkich gramow i jednym matematycznym zaokragleniem do pelnego grosza; polowa grosza jest zaokraglana w gore. Regula ma `calculationVersion = "1"`.
- Uzasadnienie: PRD FR-SALE-014 wymaga pelnej precyzji masy i wyniku w groszach, a pakiet 8.5 wymaga jednej jawnej, testowanej i wersjonowanej reguly. Obliczenia calkowitoliczbowe usuwaja roznice wynikajace z reprezentacji zmiennoprzecinkowej.
- Skutki: formularz pokazuje metode, klient zapisuje wersje razem z kwota, Security Rules niezaleznie sprawdzaja zgodnosc, a przyszla zmiana algorytmu wymaga nowej wersji bez cichego przeliczania historii.

## DEC-0019 - Kierunek korekty sprzedazy i przychodu

- Status: zaakceptowana technicznie na podstawie PRD
- Data: 2026-07-29
- Decyzja: korekta zapisuje dodatnie `weightG`, nieujemne `priceGroszPerKg` i nieujemne `totalGrosz`. `INCREASE_STOCK` oznacza `+weightG` dla stanu i `-totalGrosz` dla przychodu, a `DECREASE_STOCK` oznacza `-weightG` dla stanu i `+totalGrosz` dla przychodu. Powod jest wymaganym `note` dokumentu i `reason` audytu.
- Uzasadnienie: PRD wymaga osobnego typu operacji, jawnego kierunku, wartosci i powodu. Jeden kierunek wyznaczajacy przeciwne skutki magazynowe i finansowe usuwa ukryte ujemne wartosci oraz pozwala jednoznacznie raportowac i anulowac dokument.
- Skutki: formularz i audyt zawsze pokazuja oba podpisane skutki, Rules odrzucaja niespojne znaki, a historyczny ujemny wiersz wymaga recznej klasyfikacji podczas migracji zamiast automatycznego mapowania.
