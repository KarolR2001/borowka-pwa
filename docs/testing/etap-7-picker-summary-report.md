# Etap 7.16 - raport podsumowan pickera

## Zakres

Pakiet potwierdza obliczenia pulpitu pickera na zdekodowanych dokumentach sesji
i wyplat. Zrodlem oficjalnego naliczenia jest zapisane `amountDueGrosz`, a
zrodlem kwoty wyplaconej sa wylacznie aktywne dokumenty wyplat.

## Macierz

| Scenariusz                        | Oczekiwany wynik                                           | Wynik |
| --------------------------------- | ---------------------------------------------------------- | ----- |
| Sesja `OPEN`                      | nie zwieksza oficjalnego naliczenia                        | PASS  |
| Sesja `CLOSED`                    | zwieksza naliczone i pozostale do wyplaty                  | PASS  |
| Aktywna wyplata                   | zwieksza wyplacone i zmniejsza pozostale                   | PASS  |
| Anulowana wyplata                 | nie wchodzi do wyplaconych, kwota wraca do pozostalych     | PASS  |
| Sesja `CANCELLED`                 | nie wchodzi do naliczenia ani licznikow aktywnych statusow | PASS  |
| Dwa sezony                        | wybrany sezon nie zawiera kwot drugiego sezonu             | PASS  |
| Rozne jednostki tego samego planu | pozostaja w oddzielnych podsumowaniach                     | PASS  |
| Sesja importowana                 | uzywa zapisanej historycznej kwoty `amountDueGrosz`        | PASS  |
| `PICKER` bez `workerId`           | otrzymuje blad konfiguracji przed inicjalizacja Firebase   | PASS  |

## Dowod automatyczny

`src/picker/pickerDashboard.test.ts` wykonuje dziewiec testow jednostkowych,
w tym jawne regresje kazdego scenariusza powyzej. Test profilu bez `workerId`
wywoluje publiczny runtime `loadPickerDashboard`, aby potwierdzic blad przed
odczytem Firestore zamiast pustego albo obcego wyniku.

Testy przez ADB i na fizycznych telefonach pozostaja `SKIPPED` zgodnie z decyzja
wlasciciela. Pakiet nie wykonuje deployu.
