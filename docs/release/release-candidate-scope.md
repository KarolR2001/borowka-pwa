# Zakres release candidate Borowka PWA

## Identyfikacja

- wersja: `1.0.0-rc.1`;
- data zamrozenia: 2026-08-10;
- schemat danych: `schema-0001`;
- wersja obliczen: `calc-0001`;
- status: zakres funkcjonalny zamrozony, wydanie niezatwierdzone do PROD.

Numer RC identyfikuje zestaw funkcji przeznaczony do utwardzenia, UAT i
pilotazu. Nie oznacza przejscia otwartych bramek urzadzeniowych, biznesowych ani
produkcyjnych.

## Funkcje wchodzace do RC

- logowanie pelnoekranowe dla niezalogowanego uzytkownika;
- prerejestracja, role `ADMIN`, `OPERATOR`, `PICKER` i izolacja interfejsu;
- konfiguracja sezonow, planow, zbieraczy i wersji stawek;
- sesje zbioru i wpisy online oraz offline-first z synchronizacja;
- zamykanie, ponowne otwieranie, anulowanie i obsluga konfliktow sesji;
- wyplaty, prywatny pulpit i wlasny eksport CSV pickera;
- sprzedaz, korekty, stan operacyjny i pulpity;
- raporty MVP oraz CSV dla polskiego Excela;
- awaryjny eksport lokalny i pelny eksport przenosny Firestore;
- niezalezny walidator przenosnosci i macierz uprawnien eksportu;
- PWA, kontrola aktualizacji, diagnostyka, audyt i procedury awaryjne;
- osobne konfiguracje Firebase DEV i PROD oraz domyslnie odmawiajace Rules.

## Funkcje niewchodzace do RC

- inwentaryzacja, analiza i migracja danych z poprzednich sezonow;
- importer HTML/XLSX i wszystkie raporty uzgodnienia danych legacy;
- nowe role, nowe moduly biznesowe i nowe kolekcje poza zatwierdzonym MVP;
- 2FA, App Check, wlasny backend i automatyczne przywracanie backupu jednym
  kliknieciem;
- funkcje pomyslane po zamrozeniu, o ile nie usuwaja bledu blokujacego RC.

Dane zabezpieczone w pakiecie 9.5 nie beda analizowane ani importowane.
Techniczne migracje schematu biezacej aplikacji oraz przyszle przeniesienie
danych wytworzonych przez Borowka PWA pozostaja dozwolonymi procesami
utrzymaniowymi.

## Dozwolone zmiany podczas freeze

- poprawki bledow i niespojnosci zachowania;
- poprawki bezpieczenstwa, Rules i izolacji danych;
- poprawki dostepnosci oraz niezbedne korekty UX;
- testy, raporty, instrukcje i konfiguracja wdrozeniowa;
- optymalizacje bez zmiany reguly biznesowej;
- zmiana modelu danych tylko dla bledu blokujacego, z ponowieniem testow
  kompatybilnosci, offline, Rules, eksportu i odpowiedniej migracji schematu.

Kazda nowa funkcja wymaga jawnego odmrozenia zakresu i nowej decyzji produktowej.
Nie moze zostac dolaczona pod nazwa poprawki technicznej.

## Otwarte bramki RC i PROD

| Bramka                                             | Status     | Warunek zamkniecia                                       |
| -------------------------------------------------- | ---------- | -------------------------------------------------------- |
| CSV w aktualnym Excelu i alternatywnym arkuszu     | `PENDING`  | Reczne otwarcie i porownanie                             |
| Pelny eksport DEV o realistycznej objetosci        | `PENDING`  | Brak pominiec, dwie niezalezne kopie i raport walidatora |
| Wydajnosc na realistycznym Firebase DEV            | `PENDING`  | Co najmniej 20 pomiarow p95 i Query Explain              |
| Android PWA i tryb offline na fizycznym urzadzeniu | `DEFERRED` | Test na dostepnym telefonie                              |
| iOS Safari/PWA i tryb offline                      | `DEFERRED` | Test na dostepnym iPhonie                                |
| Uzytkownicy i urzadzenia pilotazowe                | `PENDING`  | Jawna lista wlascicieli i rol                            |
| Macierz 392 wymagan PRD                            | `PARTIAL`  | Zamkniecie statusow innych niz automatyczne/wykluczone   |
| UAT i pilotaz                                      | `PENDING`  | Raporty i decyzje pakietow 10.13-10.20                   |
| Konfiguracja, checklista i decyzja PROD            | `PENDING`  | Etapy 11-12 i jawne Go                                   |

Brak telefonu pozwala kontynuowac implementacje i automatyczne testy, ale nie
pozwala oznaczyc bramki urzadzeniowej jako `PASS`. Deploy DEV i PROD sa osobnymi
decyzjami; numer RC nie uruchamia wdrozenia automatycznie.

## Kontrola zmian

Kazdy PR po zamrozeniu musi wskazac jedna kategorie: blad, bezpieczenstwo,
dostepnosc, niezbedny UX, test, dokumentacja albo wdrozenie. PR rozszerzajacy
zakres jest blokowany do czasu aktualizacji tego dokumentu i decyzji wlasciciela
produktu.
