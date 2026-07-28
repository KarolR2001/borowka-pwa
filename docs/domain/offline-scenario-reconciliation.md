# Rekoncyliacja scenariuszy offline

Pakiet 6.26 laczy kontrakty konfliktow uzywane po odzyskaniu polaczenia.
`evaluateOfflineScenarioReconciliation` ocenia jednoczesnie konto, snapshot
stawki i zmiany z innych urzadzen.

## Kolejnosc decyzji

1. Zablokowane konto z lokalnymi dokumentami zatrzymuje automatyczne retry,
   zachowuje dane i wymaga eksportu awaryjnego.
2. Niezgodny snapshot stawki zachowuje lokalna kwote, blokuje wyplate i ustawia
   `REVIEW_REQUIRED`.
3. Oddzielna sesja tej samej osoby i daty z innego urzadzenia pozostaje osobnym
   dokumentem i wymaga przegladu duplikatu biznesowego.
4. Brak konfliktu pozostawia dotychczasowy status sesji.

Rekoncyliacja nigdy nie przelicza po cichu zamknietej sesji, nie usuwa
lokalnych danych i nie scala automatycznie sesji z dwoch urzadzen. Kody ustalen
sa deduplikowane i sortowane, aby raport i interfejs otrzymywaly stabilny
wynik.

## Idempotentny retry wpisu

Formularz rezerwuje UUID i numer sekwencyjny przed wywolaniem runtime. Jesli
odpowiedz sieci zniknie, ponowienie nie tworzy nowej tozsamosci. Runtime online
i offline zwracaja istniejacy wpis, gdy UUID, sesja, payload, autor i urzadzenie
sa zgodne.

Ten sam UUID z innym payloadem jest konfliktem wymagajacym przegladu. Retry
nadal respektuje aktywnosc konta, role, wlasciciela i status otwartej sesji.

## Dowody

- `src/offline/offlineScenarioReconciliation.test.ts`;
- `src/offline/offlineScenarioReport.test.ts`;
- `src/offline/offlineHarvestEntry.test.ts`;
- `src/harvest/OperatorHarvestSessionsPanel.test.tsx`;
- `tests/integration/offline-harvest-runtime.test.ts`.
