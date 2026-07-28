# Etap 6 - raport aktualizacji PWA

Raport realizuje pakiet 6.28: aktualizacja wersji A do B bez utraty i
duplikacji danych oczekujacych.

## Status

- Scenariusz automatyczny A -> B: `PASS`.
- Test interfejsu komunikatu aktualizacji: `PASS`.
- Synchronizacja z Firestore Emulator: `PASS`.
- Rzeczywisty deploy wersji A i B na Hosting DEV: `SKIPPED`.
- Fizyczny Android: `SKIPPED`.
- Fizyczny iOS: `SKIPPED`.

Statusy `SKIPPED` wynikaja z decyzji wlasciciela o braku deployu przed wieksza
bramka oraz braku fizycznego telefonu. Nie sa zaliczeniem bramki produkcyjnej.

## Przebieg automatyczny

1. Logiczna wersja A tworzy offline zamknieta sesje, trzy wpisy i piec audytow.
2. Baseline zapisuje dziewiec unikalnych dokumentow journal.
3. Oczekujaca wersja B jest widoczna, ale pending blokuje jej aktywacje.
4. Przywrocenie sieci uruchamia synchronizacje.
5. Firestore potwierdza jedna sesje, trzy unikalne wpisy i piec audytow.
6. Journal jest pusty, a bramka PWA ma status `READY`.
7. Interfejs zapisuje update intent i aktywuje oczekujacy service worker.
8. Po uruchomieniu logicznej wersji B kontrola integralnosci ma status `READY`,
   a kontrola zakonczenia ma status `PASS`.

## Pokrycie

- `src/pwa/pwaUpdateRecovery.test.ts` sprawdza gotowosc oraz braki, duplikaty,
  pending i nieudana synchronizacje.
- `src/pwa/PwaUpdateNotice.test.tsx` sprawdza blokade przy pending, odblokowanie
  po synchronizacji, aktywacje i start wersji B.
- `tests/integration/offline-harvest-runtime.test.ts` sprawdza rzeczywisty
  journal, Rules i dokumenty Firestore.

## Ryzyko rezydualne

Automatyka nie sprawdza cyklu instalacji i aktualizacji standalone PWA w
mobilnym systemie operacyjnym, ubicia procesu przez system ani propagacji
dwóch rzeczywistych deployow przez CDN i service worker. Przed pilotazem lub
produkcja trzeba wykonac odroczone przebiegi Android, iOS oraz Hosting DEV A/B.
