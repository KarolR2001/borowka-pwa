# Raport testow Etapu 4 - konfiguracja domenowa

Data: 2026-07-17

Zakres: sezony, plany rozliczen, zbieracze, wersje stawek, powiazania kont,
cache konfiguracji, Firestore Security Rules i indeksy Firestore.

## Dowody automatyczne

Ostatnia lokalna weryfikacja na `main` po PR #31:

- `npm run verify`: format, lint, typecheck, testy 170/170, build PWA;
- `npm run verify:rules`: testy Rules 67/67.

## Pokrycie bramki wyjscia

| Kryterium                                                      | Dowod                                                                                                                                                                |
| -------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Administrator tworzy osobe z planem i indywidualna stawka      | `src/workers/workerDirectory.test.ts`, `tests/rules/firestore-workers.test.ts`                                                                                       |
| Dwie osoby na tym samym planie maja rozne stawki               | `src/domain/domainConfiguration.test.ts`, `src/workers/workerDirectory.test.ts`, testy cache konfiguracji                                                            |
| Historyczne wersje stawek pozostaja czytelne                   | `src/workers/workerDirectory.test.ts`, `tests/rules/firestore-workers.test.ts`                                                                                       |
| Operator odczytuje tylko aktywna konfiguracje operacyjna       | `tests/rules/firestore-seasons.test.ts`, `tests/rules/firestore-settlement-plans.test.ts`, `tests/rules/firestore-workers.test.ts`                                   |
| Picker nie odczytuje cudzych stawek ani notatek administratora | `tests/rules/firestore-seasons.test.ts`, `tests/rules/firestore-settlement-plans.test.ts`, `tests/rules/firestore-workers.test.ts`, cache konfiguracji usuwa notatki |
| Archiwalny plan nie jest dostepny dla nowej stawki             | `src/workers/workerDirectory.test.ts`, `tests/rules/firestore-workers.test.ts`                                                                                       |
| Urzadzenie ma komplet konfiguracji do przyszlej pracy offline  | `src/offline/configurationCache.test.ts`, `src/offline/ConfigurationCachePanel.test.tsx`, `src/app/App.test.tsx`                                                     |
| Wszystkie testy regul domeny przechodza                        | `npm run verify:rules`                                                                                                                                               |
| Indeksy sa zadeklarowane w repozytorium                        | `firestore.indexes.json`, `tests/scripts/firestore-indexes.test.ts`                                                                                                  |

## Scenariusze okresow stawek

| Scenariusz                           | Oczekiwany wynik                                                                          | Dowod                                                                |
| ------------------------------------ | ----------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| Pierwsza stawka zbieracza            | Zbieracz i pierwsza aktywna stawka powstaja razem                                         | `prepareWorkerCreate`, test batch create w Rules                     |
| Przyszla zmiana stawki               | Poprzednia stawka konczy sie dzien przed nowym `validFrom`; nowa stawka staje sie biezaca | `prepareWorkerRateVersionCreate`, test batch rate w Rules            |
| Data wsteczna                        | Wymaga potwierdzenia i ostrzega, ze snapshoty historycznych sesji nie beda przeliczane    | `prepareWorkerRateVersionCreate`, testy UI zbieraczy                 |
| Nakladajace sie okresy               | Pokazuje ostrzezenie i wymaga potwierdzenia ryzykownego okresu                            | `analyzeWorkerRateHistory`, testy UI zbieraczy                       |
| Przerwa miedzy okresami              | Pokazuje ostrzezenie w kontroli spojnosci stawek                                          | `analyzeWorkerRateHistory`                                           |
| Rownolegla nieaktualna zmiana stawki | Rules odrzucaja zapis niezgodny z aktualnym worker/rate state                             | `tests/rules/firestore-workers.test.ts`                              |
| Archiwalny plan dla stawki           | Domena i Rules odrzucaja przypisanie archiwalnego planu                                   | `prepareWorkerCreate`, `prepareWorkerRateVersionCreate`, testy Rules |
| Ujemna stawka                        | Dekoder domenowy i Rules odrzucaja dokument z ujemna kwota                                | `src/plans/settlementPlans.test.ts`, testy Rules                     |

## Manualny smoke checklist na DEV

Do wykonania po kolejnym deploy DEV obejmujacym PR #31:

1. Zaloguj sie jako administrator.
2. Otworz Sezony i potwierdz, ze aktywny sezon jest widoczny.
3. Utworz aktywny plan niestandardowy, np. `Za skrzynke`, bez zmiany kodu.
4. Utworz dwie osoby na tym samym planie z roznymi stawkami.
5. Otworz profil jednej osoby i dodaj przyszla stawke.
6. Potwierdz, ze poprzednia stawka zostala zamknieta, a historia jest widoczna.
7. Sprobuj dodac stawke na archiwalnym planie i potwierdz blokade UI/Rules.
8. Zaloguj sie jako operator i potwierdz, ze widzi tylko aktywna konfiguracje.
9. Zaloguj sie jako picker i potwierdz, ze listy konfiguracji oraz notatki admina nie sa widoczne.
10. Wejdz w Ustawienia, przygotuj cache konfiguracji, odswiez aplikacje i potwierdz status cache.

## Zaleznosc manualna

Automatyczna suite potwierdza logike domeny, stany UI, Rules i manifest
indeksow. Smoke checklist na DEV pozostaje potrzebny, bo tylko realny projekt
development laczy Hosting, wdrozone Rules, wdrozone indeksy i persistence
przegladarki.
