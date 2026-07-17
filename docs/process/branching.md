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
Zmiany w Security Rules wymagaja dodatkowo `npm run verify:rules`.

PR-y sa tworzone przez GitHub CLI `gh` z WSL. Jesli checki CI przejda
prawidlowo, a PR jest mergeable, PR moze zostac zmergowany bez dodatkowego
pytania. Po merge nalezy zsynchronizowac lokalny `main` i uruchomic wymagana
weryfikacje przed kolejnym pakietem.

Deploy na development nie jest wymagany po kazdym PR. Wykonujemy go po spojnym
bloku prac, zamknieciu etapu albo gdy srodowisko dev wymaga recznej walidacji
nowej funkcjonalnosci.
