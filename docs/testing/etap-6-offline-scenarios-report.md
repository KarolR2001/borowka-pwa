# Etap 6 - raport OFF-T01-OFF-T06

Raport realizuje automatyczna warstwe pakietu 6.26. Pelne przebiegi na
fizycznych telefonach pozostaja odroczone zgodnie z decyzja wlasciciela
z 2026-07-28 i nie sa oznaczone jako `PASS`.

## Status

- Automatyczna walidacja kontraktow i runtime: `PASS`.
- Firestore Emulator: `PASS`.
- Pelny przebieg urzadzeniowy: `SKIPPED`.
- Wynik calosciowy: `PARTIAL`.
- Format raportu: `BOROWKA_OFFLINE_SCENARIO_REPORT`, wersja `1`.
- Wersja aplikacji: `0.1.0`.
- Srodowisko: WSL/Linux, Vitest, Firebase JS SDK, Firestore Emulator.
- Przegladarka fizyczna i model telefonu: `NOT RUN`.

## Wyniki

| ID      | Dowod automatyczny                                                    | Wpisy | Dokumenty Firestore | Wynik konfliktu                | Automatyka | Pelny przebieg |
| ------- | --------------------------------------------------------------------- | ----: | ------------------: | ------------------------------ | ---------- | -------------- |
| OFF-T01 | restart dziennika, zamknieta sesja i synchronizacja                   |    10 |                  23 | `NONE`                         | `PASS`     | `SKIPPED`      |
| OFF-T02 | ponowienie tego samego UUID po utracie odpowiedzi                     |     1 |                   4 | `RETRY_EXISTING`               | `PASS`     | `SKIPPED`      |
| OFF-T03 | zmiana stawki zachowuje kwote i wymusza review                        |     1 |                   0 | `RATE_REVIEW_REQUIRED`         | `PASS`     | `SKIPPED`      |
| OFF-T04 | blokada konta zatrzymuje retry i wymaga eksportu                      |     1 |                   0 | `BLOCKED_ACCOUNT_PENDING_DATA` | `PASS`     | `SKIPPED`      |
| OFF-T05 | trzy sesje, 24 unikalne wpisy i oproznienie 57 dokumentow             |    24 |                  57 | `NONE`                         | `PASS`     | `SKIPPED`      |
| OFF-T06 | dwie oddzielne sesje zachowane z ostrzezeniem o duplikacie biznesowym |     1 |                   0 | `POSSIBLE_BUSINESS_DUPLICATE`  | `PASS`     | `SKIPPED`      |

Liczba dokumentow obejmuje sesje, wpisy i audyt. W OFF-T03, OFF-T04 i OFF-T06
rekoncyliacja jest testem domenowym in-memory, dlatego liczba dokumentow
Firestore wynosi 0.

## Stan przed i po

| ID      | Stan przed                                   | Stan po                                                              | Zrzuty statusow                                        |
| ------- | -------------------------------------------- | -------------------------------------------------------------------- | ------------------------------------------------------ |
| OFF-T01 | otwarta kolejka lokalna, sesja i 10 wpisow   | jedna zamknieta sesja, 10 wpisow, pusty dziennik                     | cache, journal po restarcie, serwer                    |
| OFF-T02 | wpis przy utraconej odpowiedzi               | jeden UUID lokalnie i na serwerze                                    | pierwsza proba, retry, liczba dokumentow               |
| OFF-T03 | zamknieta sesja z lokalnym snapshotem stawki | kwota zachowana, wyplata zablokowana, `REVIEW_REQUIRED`              | snapshot lokalny, aktualna stawka, wynik rekoncyliacji |
| OFF-T04 | pending dane aktywnego wczesniej konta       | retry zatrzymane, dane zachowane, eksport wymagany                   | sync center, status konta, admin handoff               |
| OFF-T05 | trzy lokalne sesje i 24 wpisy                | 3 sesje i 24 unikalne wpisy na serwerze, pusty dziennik              | licznik pending, UUID lokalne, UUID serwera            |
| OFF-T06 | dwie sesje tej samej osoby i daty            | obie sesje zachowane, brak auto-merge, ostrzezenie i blokada wyplaty | business key, lista sesji, finding konfliktu           |

## Czas offline

Testy automatyczne steruja stanem sieci SDK i nie czekaja w czasie
rzeczywistym. Wielogodzinny przebieg, co najmniej 100 wpisow, slaba siec
i wielokrotne przerwanie synchronizacji sa zakresem pakietu 6.27.

## Ryzyko odchylenia

Nie potwierdzono zachowania przegladarki mobilnej, procesu systemowego po
dluzszym zamknieciu ani ograniczen pamieci fizycznego telefonu. Raporty Android
i iOS zachowuja te bramki jako `SKIPPED`. Wszystkie odroczone przebiegi musza
zostac wykonane przed pilotazem terenowym lub produkcja.
