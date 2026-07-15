# Strategia galezi

## Galezie

- `main` - wersja gotowa do wdrozenia na development.
- `feat/...` - funkcje produktowe.
- `fix/...` - poprawki bledow.
- `chore/...` - konfiguracja, dokumentacja, narzedzia.
- `docs/...` - zmiany dokumentacji bez kodu aplikacji.

## Minimalny opis zmiany

Kazda zmiana opisuje:

- cel;
- powiazane wymagania;
- wplyw na dane;
- wplyw na offline;
- wplyw na Security Rules;
- wykonane testy;
- kroki wdrozeniowe.

## Laczenie do main

Przed polaczeniem:

```bash
npm run verify
```

Zmiany w Security Rules, offline i obliczeniach wymagaja dodatkowych testow z macierzy.
