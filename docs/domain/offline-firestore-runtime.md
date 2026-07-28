# Runtime offline Firestore

## Cel

Runtime obsluguje rzeczywisty przebieg OFF-T01: otwarcie sesji, wpisy i
zamkniecie bez sieci, przetrwanie restartu oraz bezpieczna synchronizacje po
odzyskaniu polaczenia. Przygotowanie obiektow domenowych pozostaje w modulach
`offlineHarvestSession`, `offlineHarvestEntry` i `offlineHarvestSessionClose`.

## Aktywacja trwalego cache

- Firestore startuje domyslnie z cache w pamieci.
- Zgoda zaufanego urzadzenia zapisuje tylko preferencje aktywacji persistence.
- Po udzieleniu zgody trzeba uruchomic PWA ponownie.
- Nowa instancja Firestore uzywa `persistentLocalCache` z obsluga wielu kart.
- Nieudana inicjalizacja persistence blokuje gotowosc offline. Aplikacja nie
  moze deklarowac trwalego cache na podstawie samej preferencji.
- `Przygotuj offline` wymaga aktywnej zgody, trwalego cache Firestore, service
  workera i kompletnego snapshotu konfiguracji.

## Zapis offline

Kazda operacja zapisuje jedna atomowa paczke Firestore:

- otwarcie: sesja i zdarzenie audytowe;
- wpis: wpis zbioru i zdarzenie audytowe;
- zamkniecie: aktualizacja sesji i zdarzenie audytowe.

Przed wywolaniem `batch.commit()` snapshoty trafiaja do osobnego dziennika
IndexedDB. Runtime zwraca sukces lokalny dopiero po potwierdzeniu widocznosci
dokumentu w cache Firestore. Nie czeka na serwer, gdy siec jest niedostepna.

Serwerowy dokument wpisu ma `pendingSync: false`. Stan oczekiwania klient
wyznacza z `hasPendingWrites` i dziennika, dlatego payload pozostaje zgodny z
Rules, a UI nadal pokazuje dokument jako lokalny.

## Dziennik odzyskiwania

Dziennik `borowka-pwa-sync-journal`:

- jest izolowany przez UID konta i `deviceId`;
- przechowuje lokalny snapshot do eksportu awaryjnego;
- zachowuje najnowszy zapis danego dokumentu wedlug `writeId`;
- nie pozwala, aby potwierdzenie starszego otwarcia usunelo nowsze zamkniecie;
- zachowuje odrzucony dokument z powodem bledu.

Po kazdej operacji panel operatora odswieza globalny stan dziennika. Blokady
wylogowania i aktualizacji PWA widza zmiany bez dodatkowego wejscia do ustawien.

## Synchronizacja po restarcie

Po starcie, odzyskaniu sieci, aktywacji PWA albo recznym ponowieniu aplikacja:

1. odczytuje dokumenty konta z dziennika;
2. wlacza siec Firestore;
3. czeka na oproznienie lokalnej kolejki;
4. odczytuje sesje i wpisy bezposrednio z serwera;
5. usuwa z dziennika tylko potwierdzone dokumenty;
6. pozostawia niepotwierdzone snapshoty jako odrzucone.

Zdarzenia audytowe sa zapisane atomowo z dokumentem biznesowym. Operator nie
ma uprawnienia do ich bezposredniego odczytu, dlatego sa usuwane z dziennika
tylko wtedy, gdy wszystkie dokumenty biznesowe zostaly potwierdzone.

## Czyszczenie

Akcja czyszczenia urzadzenia konczy instancje Firestore, usuwa persistence,
czysci dziennik konta, snapshot konfiguracji i preferencje trwalego cache.
Po tej operacji PWA trzeba otworzyc ponownie przed dalsza praca.

## Walidacja

- testy jednostkowe preferencji, dziennika i kolejki;
- testy komponentow panelu operatora, centrum synchronizacji i `App`;
- test integracyjny z Rules Emulator: sesja offline, 10 unikalnych wpisow,
  zamkniecie, odtworzenie dziennika jak po restarcie, synchronizacja i
  potwierdzenie dokumentow serwerowych;
- obowiazkowy przebieg na fizycznym Androidzie opisany w
  `docs/testing/etap-6-android-report.md`.
