# Weryfikacja dlugiego offline

Pakiet 6.27 wprowadza deterministyczna weryfikacje wielogodzinnej pracy bez
sieci. Zegar testowy symuluje 6 godzin, a Firestore Emulator przechowuje
rzeczywiste dokumenty sesji, wpisow i audytu.

## Warunki zaliczenia

- co najmniej 180 minut offline;
- co najmniej 3 sesje i 100 wpisow;
- co najmniej jeden restart aplikacji;
- co najmniej dwie przerwane proby synchronizacji;
- wyzsza rewizja konfiguracji zmieniona na innym urzadzeniu;
- identyczne zbiory UUID lokalnie i na serwerze;
- identyczne sumy ilosci i wagi;
- identyczne statusy sesji.

Wstrzykiwany transport `createFirestoreSynchronizationApi` pozwala testowi
odrzucic dwie pierwsze proby bez usuwania dziennika. Trzecia proba potwierdza
wszystkie dokumenty i dopiero wtedy oproznia journal. Domyslny runtime nadal
uzywa `enableNetwork` i `waitForPendingWrites` z 30-sekundowym limitem.

`verifyLongOfflineRun` zwraca `PASS` tylko przy spelnieniu wszystkich warunkow.
Brak UUID, inna suma, inny status lub niewystarczajacy dowod konfiguracji
zwraca stabilny kod ustalenia.

## Dowody

- `src/offline/automaticSynchronization.test.ts`;
- `src/offline/longOfflineVerification.test.ts`;
- `tests/integration/offline-harvest-runtime.test.ts`.
