# Etap 5 - raport testow integracyjnych

Data: 2026-07-18

Ten raport sledzi postep punktu 8.23. Pierwszy pakiet dodaje harness
integracyjny na emulatorze Firestore i pokrywa poczatkowy przeplyw sesji.

## Pokrycie 8.23

| Wymaganie 8.23                              | Pokrycie                                                                                              | Status |
| ------------------------------------------- | ----------------------------------------------------------------------------------------------------- | ------ |
| Utworzenie sesji i dziesieciu wpisow        | `tests/integration/harvest-session-flow.test.ts`                                                      | OK     |
| Natychmiastowa aktualizacja sum             | Listener wpisow sesji przelicza sume przez `calculateHarvestSessionTotals`                            | OK     |
| Listener lokalny i serwerowy bez duplikatow | Finalny snapshot query `sessionId + sequenceNumber` musi miec 10 unikalnych wpisow                    | OK     |
| Zamkniecie                                  | Operator zamyka sesje update'em `harvestSessions`; audyt pozostaje pokryty w testach Rules/audit      | OK     |
| Odmowa dalszego wpisu operatora             | Po zamknieciu sesji zapis kolejnego wpisu przez operatora jest odrzucany przez Rules                  | OK     |
| Ponowne otwarcie administratora             | `tests/integration/harvest-session-flow.test.ts` - admin reopen zamknietej sesji                      | OK     |
| Anulowanie wpisu i ponowne zamkniecie       | `tests/integration/harvest-session-flow.test.ts` - admin cancel entry, replacement entry i reclose    | OK     |
| Anulowanie sesji                            | `tests/integration/harvest-session-flow.test.ts` - admin cancel sesji po ponownym zamknieciu          | OK     |
| Niezgodna rewizja                           | `tests/integration/harvest-session-flow.test.ts` - drugi stale close jest odrzucany                   | OK     |
| Rownolegle proby zamkniecia z dwoch kart    | `tests/integration/harvest-session-flow.test.ts` - ponowny update tym samym close payloadem jest fail | OK     |
| Proba recznej zmiany snapshotu              | `tests/integration/harvest-session-flow.test.ts` - klient nie moze zmienic snapshotu sesji            | OK     |
| Proba odczytu cudzej sesji przez pickera    | `tests/integration/harvest-session-flow.test.ts` - picker nie czyta sesji innego `workerId`           | OK     |

## Uruchamianie

- `npm run test:integration` uruchamia emulator Firestore i testy z
  `tests/integration`.
- `npm run verify:integration` jest podlaczone w CI po `verify:rules`.
