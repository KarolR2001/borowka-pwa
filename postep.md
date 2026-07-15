# Postep prac

## 2026-07-15 - start implementacji

### Zakres

- Przeczytano PRD, skrocony plan, szczegolowy plan, scenariusze UAT i liste kontrolna.
- Ustalono, ze implementacja zaczyna sie od Etapu 1 szczegolowego planu: repozytorium i warsztat inzynierski.
- Utworzono nowe repozytorium w podfolderze `borowka-pwa`, aby pliki z katalogu nadrzednego nie weszly do historii Git.
- Utworzono galaz robocza `chore/etap-1-repo-warsztat`.

### Wykonane

- Dodano dokumentacje repo: README, CONTRIBUTING, SECURITY, CHANGELOG.
- Dodano rejestr decyzji i podstawowe dokumenty procesu.
- Dodano poczatkowy szkielet React/TypeScript/Vite/PWA.
- Dodano poczatkowe Firestore Rules z zasada deny by default.
- Dodano wspolny modul formatowania kwot, mas i dat.
- Dodano testy jednostkowe i test komponentu aplikacji.

### Decyzje i blokery

- Node.js przypiety do wersji `24.14.0`, npm do `11.9.0`.
- Przenosny Node.js zapisano lokalnie w ignorowanym katalogu `.tools/node-v24.14.0-linux-x64`, aby testy i buildy mozna bylo uruchamiac bez instalacji systemowej.
- Przed implementacja sesji trzeba zatwierdzic decyzje biznesowe z Etapu 0: dlugosc sesji, prerejestracje, reset hasla, wpisy bez wagi, wpisy zbiorcze, ujemna sprzedaz i odzyskanie administratora.
- Testy emulatora Firebase wymagaja Javy oraz Firebase CLI; zostana dopiete w Etapie 2 razem z Emulator Suite.

### Testy

- `npm run verify` - zaliczone.
- `npm audit --audit-level=moderate` - zaliczone, `0 vulnerabilities`.

### Wynik weryfikacji

- Formatowanie: zaliczone.
- Lint: zaliczone.
- Typecheck: zaliczone.
- Testy automatyczne: 3 pliki testowe, 8 testow, wszystkie zaliczone.
- Build PWA: zaliczony, wygenerowano `dist/sw.js` i `dist/manifest.webmanifest`.

## 2026-07-15 - Etap 2, emulatory i srodowiska

### Zakres

- Rozpoczeto galaz `chore/etap-2-firebase-pwa`.
- Dodano wrapper Firebase CLI dla przypietego `firebase-tools@15.23.0`.
- Dodano lokalna JRE Temurin `21.0.11+10` w ignorowanym katalogu `.tools`.
- Dodano testy Firestore Security Rules dla poczatkowego `deny by default`.
- Rozdzielono testy aplikacji (`npm test`) od testow Rules (`npm run test:rules`).
- Dodano dokumentacje planowanych projektow Firebase, emulatorow, development deployment, production deployment i rollbacku Hostingu.
- Rozszerzono CI o Java 21 i testy Firestore Rules.
- Dodano diagnostyke PWA: status online/offline, status service workera, identyfikator urzadzenia i ostatnie uruchomienie.
- Dodano podstawowa strone `offline.html` do cache PWA.
- Dodano konfiguracje runtime Firebase: tryb local/development/production, flage emulatorow, porty emulatorow i ostrzezenia konfiguracji.

### Decyzje i blokery

- Firebase CLI nie jest `devDependency`, bo aktualne `firebase-tools@15.23.0` wnosi umiarkowane podatnosci w zaleznosciach posrednich. Wersja jest przypieta w `scripts/firebase-cli.mjs`.
- Rekomendowana lokalizacja Firestore do zatwierdzenia: `europe-central2` Warsaw.
- Do wykonania recznie: utworzenie projektow `borowka-pwa-dev` i `borowka-pwa-prod`, wlaczenie Authentication e-mail/haslo, Firestore i Hosting.

### Testy

- `npm run verify` - zaliczone.
- `npm run test:rules` - zaliczone, Firestore emulator, 1 plik testowy, 2 testy.
- `npm audit --audit-level=moderate` - zaliczone, `0 vulnerabilities`.
- Po diagnostyce PWA: `npm run verify` - zaliczone, 4 pliki testowe, 10 testow.
- Po konfiguracji runtime Firebase: `npm run verify` - zaliczone, 5 plikow testowych, 13 testow.
