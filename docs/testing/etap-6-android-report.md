# Etap 6 - raport testow Android

Raport realizuje pakiet 6.24 i scenariusz OFF-T01 z PRD. Wynik mozna oznaczyc
jako zakonczony tylko po wykonaniu calego przebiegu na co najmniej jednym
fizycznym telefonie z Androidem. Emulator nie spelnia tego kryterium.

## Status

- Wynik: `BLOCKED`
- Powod: Android SDK widzi tylko emulator, bez fizycznego telefonu.
- Ostatnie sprawdzenie: 2026-07-28, `adb devices -l` zwrocilo wylacznie
  `emulator-5554` (`sdk_gphone16k_x86_64`).

## Walidacja pomocnicza emulatora

Walidacja nie zalicza pakietu:

- urzadzenie: `Pixel_9_Pro_XL_2`, Android Emulator;
- build: `android-6.24-v1`;
- `VITE_BUILD_ID` potwierdzony w artefakcie;
- PWA otwiera sie w Chrome przez `adb reverse` i `http://localhost:4173`;
- interfejs renderuje uklad mobilny;
- aplikacja potwierdza gotowosc plikow do pracy offline;
- uslugi Firebase development inicjalizuja sie poprawnie;
- fizyczny restart, trwalosc danych i instalacja standalone pozostaja
  `NOT RUN`.

## Metryka przebiegu

Uzupelnic bez danych logowania i innych sekretow:

| Pole                           | Wartosc           |
| ------------------------------ | ----------------- |
| Data i czas                    | `DO UZUPELNIENIA` |
| Tester                         | `DO UZUPELNIENIA` |
| Model telefonu                 | `DO UZUPELNIENIA` |
| Wersja Androida                | `DO UZUPELNIENIA` |
| Wersja Chrome                  | `DO UZUPELNIENIA` |
| Commit aplikacji               | `DO UZUPELNIENIA` |
| Build poczatkowy               | `android-6.24-v1` |
| Build aktualizacyjny           | `android-6.24-v2` |
| Srodowisko Firebase            | `development`     |
| Typ konta                      | `OPERATOR`        |
| Identyfikator urzadzenia       | `DO UZUPELNIENIA` |
| Symulacja malej ilosci miejsca | `NIE WYKONANO`    |

## Warunki wstepne

- fizyczny telefon z aktualnym Chrome i wlaczonym debugowaniem USB;
- aktywne konto testowe `OPERATOR` w projekcie Firebase development;
- aktywny sezon, zbieracz, plan i stawka przeznaczone do testu;
- brak danych produkcyjnych i brak konfiguracji projektu production;
- telefon widoczny w `adb devices -l` jako `device`;
- poprzednia instalacja testowa i dane witryny usuniete przed przebiegiem.

## Przygotowanie lokalnego PWA

W WSL, z katalogu repozytorium:

```bash
export PATH="$PWD/.tools/node-v24.14.0-linux-x64/bin:$PATH"
VITE_BUILD_ID=android-6.24-v1 npm run build:pwa -- --mode development
npm run preview -- --port 4173
```

W drugim terminalu nalezy przekierowac port przez Android SDK:

```bash
adb devices -l
adb reverse tcp:4173 tcp:4173
```

Na telefonie nalezy otworzyc `http://localhost:4173`. Chrome traktuje
`localhost` jako bezpieczny kontekst, dlatego service worker i instalacja PWA
dzialaja bez deployu. Przed zalogowaniem diagnostyka musi pokazywac srodowisko
`development`, build `android-6.24-v1` i aktywny service worker.

## Scenariusz obowiazkowy

Kazdy krok wymaga wyniku `PASS` albo `FAIL` i krotkiego dowodu: nazwy
zrzutu ekranu, czasu zdarzenia, licznikow lub opisu obserwacji.

| ID     | Krok                                                                                     | Oczekiwany wynik                                                                                         | Wynik     | Dowod |
| ------ | ---------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- | --------- | ----- |
| AND-01 | Zainstaluj PWA z Chrome i uruchom z ekranu glownego.                                     | Aplikacja otwiera sie w trybie standalone.                                                               | `NOT RUN` |       |
| AND-02 | Zaloguj operatora online, wlacz zgode dla zaufanego urzadzenia i zamknij PWA.            | Profil jest aktywny, zgoda zapisana, a aplikacja wymaga ponownego uruchomienia dla trwalego cache.       | `NOT RUN` |       |
| AND-03 | Otworz PWA ponownie online i uzyj `Przygotuj offline`.                                   | Centrum synchronizacji pokazuje komplet konfiguracji i `Gotowe do pracy offline`.                        | `NOT RUN` |       |
| AND-04 | Wlacz tryb samolotowy i pozostaw Wi-Fi wylaczone.                                        | Aplikacja pokazuje `Offline`, zachowuje przygotowana konfiguracje i pozwala pracowac.                    | `NOT RUN` |       |
| AND-05 | Otworz sesje zbioru offline.                                                             | Sesja ma lokalny UUID, status otwarty i jest oznaczona jako oczekujaca.                                  | `NOT RUN` |       |
| AND-06 | Dodaj dokladnie 10 wpisow.                                                               | Kazdy wpis pojawia sie od razu, suma rosnie, licznik pending obejmuje 10 wpisow bez duplikatow.          | `NOT RUN` |       |
| AND-07 | Zamknij sesje offline.                                                                   | Sesja jest lokalnie zamknieta, wpisy sa zablokowane, dane nadal oczekuja na serwer.                      | `NOT RUN` |       |
| AND-08 | Zamknij PWA z listy ostatnich aplikacji i otworz ponownie.                               | Centrum synchronizacji pokazuje zamknieta sesje i 10 lokalnych wpisow.                                   | `NOT RUN` |       |
| AND-09 | Uruchom telefon ponownie i otworz PWA nadal offline; wykonaj eksport awaryjny.           | PWA startuje z cache, a eksport zachowuje UUID, zamknieta sesje, 10 wpisow i niezmienione sumy.          | `NOT RUN` |       |
| AND-10 | Wylacz tryb samolotowy i odzyskaj siec.                                                  | Aplikacja wykrywa online i automatycznie rozpoczyna synchronizacje.                                      | `NOT RUN` |       |
| AND-11 | Uzyj `Synchronizuj teraz` i odczekaj na potwierdzenie serwera.                           | Nie ma pending ani bledow; serwer potwierdza jedna sesje i 10 unikalnych wpisow.                         | `NOT RUN` |       |
| AND-12 | Przygotuj build v2 i ponownie aktywuj PWA.                                               | Pojawia sie `Nowa wersja gotowa`; aktualizacja nie jest wymuszona automatycznie.                         | `NOT RUN` |       |
| AND-13 | Wybierz `Zaktualizuj teraz`.                                                             | PWA uruchamia build `android-6.24-v2`, kontrola spojnosci przechodzi, a zsynchronizowane dane pozostaja. | `NOT RUN` |       |
| AND-14 | Wyloguj sie zwykla akcja.                                                                | Wylogowanie jest dozwolone, poniewaz licznik pending wynosi zero.                                        | `NOT RUN` |       |
| AND-15 | Zaloguj sie ponownie, wybierz `Wyloguj i wyczysc urzadzenie` i potwierdz wymagana fraza. | Dane lokalne, cache konfiguracji i zgoda urzadzenia sa usuniete; dane serwerowe pozostaja.               | `NOT RUN` |       |
| AND-16 | Otworz PWA offline po czyszczeniu.                                                       | Aplikacja nie deklaruje gotowosci offline i nie ujawnia danych poprzedniego konta.                       | `NOT RUN` |       |
| AND-17 | Jesli da sie bezpiecznie ograniczyc wolne miejsce, powtorz probe lokalnego zapisu.       | Aplikacja pokazuje blad pamieci, nie udaje sukcesu i zachowuje wartosc formularza.                       | `NOT RUN` |       |

## Przygotowanie aktualizacji v2

Po synchronizacji i potwierdzeniu braku aktywnej sesji oraz pending danych,
w drugim terminalu nalezy przebudowac ten sam katalog:

```bash
VITE_BUILD_ID=android-6.24-v2 npm run build:pwa -- --mode development
```

Po powrocie do PWA zdarzenie aktywacji sprawdza nowy service worker. Gdy prompt
nie pojawi sie od razu, nalezy zamknac i ponownie otworzyc PWA przy aktywnym
przekierowaniu portu. Aktualizacje wolno zastosowac dopiero w bezpiecznym
momencie.

## Kryterium zaliczenia

- AND-01 do AND-16 maja wynik `PASS`;
- AND-17 ma `PASS` albo `SKIPPED` z uzasadnieniem ryzyka;
- liczba dokumentow po synchronizacji odpowiada jednej sesji i 10 wpisom;
- nie powstal duplikat UUID;
- po restarcie i aktualizacji nie zniknely dane;
- po czyszczeniu nie pozostaly dane poprzedniego konta;
- raport zawiera metryke urzadzenia i dowody bez sekretow.

Jakikolwiek `FAIL` blokuje merge pakietu 6.24 i wymaga osobnej poprawki oraz
powtorzenia dotknietej czesci scenariusza.
