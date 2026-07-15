# Zasady pracy

## Galezie

- `main` jest zawsze w stanie mozliwym do wdrozenia na development.
- Funkcje i pakiety prac powstaja na krotkotrwalych galeziach.
- Nazwy galezi: `type/etap-n-opis`, np. `feat/etap-3-role`.
- Eksperymenty nie trafiaja do `main`, dopoki nie przejda minimalnych testow.

## Pull request

Opis PR musi zawierac:

- cel zmiany;
- powiazane wymagania PRD lub planu;
- wplyw na dane;
- wplyw na offline;
- wplyw na Security Rules;
- wykonane testy;
- kroki wdrozeniowe lub migracyjne;
- zrzuty ekranu dla zmian interfejsu.

## Minimalne testy

Przed commitem i PR uruchom:

```bash
npm run verify
```

Zmiany w obliczeniach, prywatnosci, offline, service workerze albo Security Rules wymagaja dodatkowych testow opisanych w `docs/testing/matrix.md`.

## Dane i prywatnosc

- Testy automatyczne uzywaja danych syntetycznych.
- Dane realne z arkuszy nie trafiaja do repo bez jawnej decyzji.
- Eksporty produkcyjne, klucze, tokeny i hasla sa zabronione w repo.

## Decyzje architektoniczne

Wazne decyzje zapisujemy w `docs/rejestr-decyzji.md` albo jako ADR w `docs/adr/`.

Zmiana wplywajaca na kwoty, role, offline, model sesji albo migracje nie moze byc tylko commitem technicznym. Najpierw musi miec decyzje.
