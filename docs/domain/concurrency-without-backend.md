# Ograniczenia konkurencyjnych zmian bez backendu

MVP uzywa Firebase Authentication, Firestore, Security Rules i SDK w
przegladarce. Nie ma zaufanego backendu ani Cloud Functions. Upraszcza to
system, ale czesc gwarancji spojnosci musi wynikac z transakcji klienta,
batchy, ksztaltu dokumentow i Rules.

## Zasada ogolna

Dokumenty biznesowe sa projektowane tak, aby niezalezni uzytkownicy pisali do
roznych dokumentow wszedzie tam, gdzie to mozliwe. Gdy jedna operacja musi
zmienic powiazane dokumenty, klient uzywa batcha albo transakcji, a Rules
waliduja stan koncowy przez `getAfter`.

## Co jest zabezpieczone w Etapie 4

| Obszar                               | Zabezpieczenie                                                                                                                                                  |
| ------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Utworzenie zbieracza                 | Zbieracz i pierwsza stawka sa zapisywane w jednym batchu; Rules wymagaja zgodnych ID i aktywnego planu.                                                         |
| Zmiana stawki                        | Transakcja klienta czyta aktualnego zbieracza i aktualna stawke; Rules wymagaja jednoczesnego zamkniecia poprzedniej stawki i ustawienia nowej biezacej stawki. |
| Nieaktualna rownolegla zmiana stawki | Rules odrzucaja update, jesli zbieracz nie wskazuje juz oczekiwanej poprzedniej stawki.                                                                         |
| Powiazanie konta                     | Zbieracz i profil uzytkownika musza byc zmienione razem; Rules odrzucaja czesciowy zapis.                                                                       |
| Archiwizacja zbieracza               | Update archiwizacji jest waski i nie moze zmienic pol historycznych.                                                                                            |
| Archiwizacja planu                   | Plan jest miekko archiwizowany; twarde usuwanie jest zawsze zablokowane.                                                                                        |
| Status sezonu                        | Pisze tylko administrator; przejscia statusow sa ograniczone Rules.                                                                                             |
| Indeksy                              | Wymagane indeksy zapytan sa wdrazane z `firestore.indexes.json`, nie recznie z konsoli.                                                                         |

## Pozostale limity

Bez backendu aplikacja nie moze wykonac uprzywilejowanej koordynacji
serwerowej po dowolnej zmianie offline. Dla Etapu 4 oznacza to:

- operacje administracyjne konfiguracji powinny byc wykonywane online;
- calkowicie offline rownolegle edycje administratorow moga wymagac ponowienia po reconnect;
- Firestore nadal stosuje model last-write-wins dla prostych update tego samego dokumentu, dlatego operacje wysokiego ryzyka unikaja szerokich update pol;
- globalne gwarancje unikalnosci wymagajace skanowania wielu dokumentow sa wspierane deterministycznymi ID, potwierdzeniami i Rules tam, gdzie to praktyczne, a nie blokada serwerowa;
- awaryjna naprawa kont moze nadal wymagac dostepu wlasciciela projektu Firebase Console.

## Decyzje operacyjne

- Nie prowadzic dwoch administratorow przez te sama zmiane stawki jednej osoby w tym samym czasie.
- Jesli zapis konfiguracji nie przejdzie po zmianie innego admina, odswiezyc katalog zbieraczy/planow i ponowic zapis ze swiezych danych.
- Nie wdrazac UI z nowym zapytaniem konfiguracji bez indeksu i testu Rules dla tego wzorca.
- Nie obchodzic aplikacji edycjami w konsoli poza udokumentowanymi procedurami awaryjnymi.

## Kolejne etapy

Operacje sesji, wpisow, wyplat i sprzedazy musza utrzymac ten sam standard:

- UUID generowany przed zapisem;
- batch albo transakcja dla zmian wielodokumentowych;
- niezmienne snapshoty historycznego planu i stawki;
- testy Rules dla stale writes i dostepu cross-worker;
- jawny UX ponowienia albo naprawy konfliktu po reconnect.
