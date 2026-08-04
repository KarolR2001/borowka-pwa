# Etap 8.16 - raport poprawnosci stanu

## Cel

Pakiet potwierdza 12 scenariuszy wymaganych przez plan implementacji. Testy
uruchamiaja produkcyjne funkcje `calculateSourceStockForSeason` oraz
`buildAggregatedSeasonDashboard`. Nie tworza alternatywnego kalkulatora
testowego.

## Wyniki

| ID    | Scenariusz           | Dane kontrolne                            | Oczekiwany wynik            | Status |
| ----- | -------------------- | ----------------------------------------- | --------------------------- | ------ |
| ST-01 | Zamkniecie sesji     | `OPEN -> CLOSED`, `12500 g`               | stan rosnie o `12500 g`     | PASS   |
| ST-02 | Otwarta sesja        | `OPEN`, `18000 g`                         | `0 g` oficjalnego wplywu    | PASS   |
| ST-03 | Wyplata              | `CLOSED -> PAID`, `9700 g`                | kilogramy bez zmian         | PASS   |
| ST-04 | Anulowanie sesji     | `CLOSED -> CANCELLED`, `6500 g`           | stan maleje o `6500 g`      | PASS   |
| ST-05 | Sesja bez wagi       | `CLOSED`, `0 g`                           | stan nie rosnie             | PASS   |
| ST-06 | Sprzedaz             | aktywna sprzedaz `7500 g`                 | stan maleje o `7500 g`      | PASS   |
| ST-07 | Anulowanie sprzedazy | `ACTIVE -> CANCELLED`, `7500 g`           | stan wraca o `7500 g`       | PASS   |
| ST-08 | Korekty              | `+2000 g`, `-3500 g`                      | jawny wplyw netto `-1500 g` | PASS   |
| ST-09 | Izolacja sezonu      | zrodla sezonow 2026 i 2025                | liczy sie tylko sezon 2026  | PASS   |
| ST-10 | Anulowane dokumenty  | sesja, sprzedaz i korekta anulowane       | brak wplywu na sumy         | PASS   |
| ST-11 | Import historyczny   | `legacyImport`, sesja `PAID`, `7315 g`    | zachowane `7315 g`          | PASS   |
| ST-12 | Zgodnosc pulpitu     | zbiory `25000 g`, sprzedaz netto `9000 g` | zrodlo i pulpit: `16000 g`  | PASS   |

## Zgodnosc pulpitu

ST-12 przekazuje skladowe obliczone przez kalkulator zrodlowy do produkcyjnego
modelu agregowanego pulpitu i porownuje `confirmedHarvestWeightG`, `soldWeightG`
oraz `availableWeightG`. Istniejaca regresja w
`src/dashboard/adminDashboard.test.ts` niezaleznie potwierdza, ze model
agregowany daje taki sam wynik jak model budowany z odkodowanych dokumentow
zrodlowych.

## Import i wyplaty

- wyplata nie jest zrodlem kilogramow; przejscie sesji z `CLOSED` do `PAID`
  zachowuje `totalWeightG`;
- znacznik `legacyImport` nie zmienia matematyki stanu; historyczna, zapisana
  masa sesji pozostaje jedynym wplywem importu na kilogramy;
- anulowanie nie usuwa dokumentu, tylko zeruje jego wplyw zgodnie ze statusem.

## Automatyzacja

Glowna macierz znajduje sie w
`src/stock/stockCorrectnessVerification.test.ts`. Celowana walidacja obejmuje
rowniez kontrakty zrodel, kalkulatora, rekoncyliacji i pulpitu administratora.

Test nie wymaga Firebase Emulatora, ADB ani fizycznego telefonu. Odroczone testy
urzadzeniowe pozostaja osobna bramka przed pilotazem i produkcja.
