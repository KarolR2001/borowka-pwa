# Etap 5 - raport testow jednostkowych

Data: 2026-07-18

Zakres raportu domyka checkliste 8.22 z planu szczegolowego. Raport nie
zastepuje testow integracyjnych i E2E z punktow 8.23 oraz 8.24.

## Obliczenia

| Wymaganie 8.22                     | Pokrycie                                                                                                                                                   | Status |
| ---------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| Pelne kg                           | `src/harvest/harvestSessionCalculation.test.ts` - CALC-001                                                                                                 | OK     |
| Gramy                              | `src/harvest/harvestSessionCalculation.test.ts` - CALC-002                                                                                                 | OK     |
| Pelna jednostka                    | `src/harvest/harvestSessionCalculation.test.ts` - CALC-004                                                                                                 | OK     |
| 0,5 jednostki                      | `src/harvest/harvestSessionCalculation.test.ts` - CALC-005                                                                                                 | OK     |
| Wpis zbiorczy                      | `src/harvest/harvestSessionCalculation.test.ts` - CALC-006 oraz `src/harvest/UbiankaEntryForm.test.tsx` dla blokady niedozwolonego batcha                  | OK     |
| Wiele wpisow                       | `src/harvest/harvestSessionCalculation.test.ts` - CALC-007                                                                                                 | OK     |
| Anulowany wpis                     | `src/harvest/harvestSessionCalculation.test.ts` - CALC-008                                                                                                 | OK     |
| Brak wagi                          | `src/harvest/harvestSessionCalculation.test.ts` - CALC-011 i CALC-012                                                                                      | OK     |
| Zaokraglenie graniczne             | `src/harvest/harvestSessionCalculation.test.ts` - pol grosza i jedno zaokraglenie na poziomie sesji                                                        | OK     |
| Stawka 0, jesli dopuszczona        | PRD dopuszcza 0 tylko dla specjalnego planu bezplatnego, ktorego MVP domyslnie nie udostepnia; testy jawnie odrzucaja zero w kalkulatorze i otwarciu sesji | OK     |
| Bardzo duza, ale dozwolona sesja   | `src/harvest/harvestSessionCalculation.test.ts` - 1000 wpisow po 9 000 000 000 milli/g bez przekroczenia `Number.MAX_SAFE_INTEGER`                         | OK     |
| Zmiana konfiguracji po snapshotcie | `src/harvest/openHarvestSession.test.ts` oraz `src/harvest/harvestSessionCalculation.test.ts` - snapshot stawki i planu pozostaje zrodlem prawdy           | OK     |

## Statusy

| Wymaganie 8.22                    | Pokrycie                                                                              | Status |
| --------------------------------- | ------------------------------------------------------------------------------------- | ------ |
| Poprawne przejscia                | `src/harvest/harvestSessionState.test.ts`                                             | OK     |
| Niedozwolone przejscia            | `src/harvest/harvestSessionState.test.ts`                                             | OK     |
| Zamkniecie bez wpisow             | `src/harvest/harvestSessionState.test.ts`, `src/harvest/closeHarvestSession.test.ts`  | OK     |
| Zamkniecie bez stawki             | `src/harvest/closeHarvestSession.test.ts`                                             | OK     |
| Zamkniecie po zamknieciu sezonu   | `src/harvest/closeHarvestSession.test.ts`                                             | OK     |
| Ponowne otwarcie wyplaconej sesji | `src/harvest/harvestSessionState.test.ts`, `src/harvest/reopenHarvestSession.test.ts` | OK     |
| Anulowanie z aktywna wyplata      | `src/harvest/harvestSessionState.test.ts`, `src/harvest/cancelHarvestSession.test.ts` | OK     |

## Notatki

- Warstwa jednostkowa pracuje na czystych funkcjach domenowych i kontraktach
  przygotowania zapisu.
- Testy Rules dla etapu 5 pozostaja w `tests/rules/firestore-harvest.test.ts`
  oraz `tests/rules/firestore-audit-events.test.ts`.
- Testy integracyjne z emulatorami runtime i test E2E online pozostaja osobnymi
  pakietami 8.23 i 8.24.
