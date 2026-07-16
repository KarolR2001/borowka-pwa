# Changelog

Format oparty o jawny opis zmian, modelu danych, Security Rules i migracji.

## Unreleased

### Dodano

- Dodano poczatkowy model domenowy tozsamosci: role, profile, statusy rejestracji i zaproszen.
- Rozszerzono Firestore Security Rules o odczyt wlasnego aktywnego profilu i listowanie profili przez administratora.
- Dodano testy Rules dla profili uzytkownikow.
- Skorygowano naglowki cache Firebase Hosting dla tras SPA, manifestu i plikow HTML, aby aktualizacje PWA nie byly blokowane przez domyslne cache.

### Znane ograniczenia

- Zapisy profili i zaproszen pozostaja zablokowane do czasu implementacji przeplywu prerejestracji administratora.

## 0.1.0 - 2026-07-15

### Dodano

- Utworzono repozytorium projektu w osobnym folderze.
- Dodano dokumentacje procesu pracy, bezpieczenstwa i decyzji.
- Dodano szkielet React/Vite/PWA.
- Dodano poczatkowe Firestore Security Rules: deny by default.
- Dodano wspolny modul formatowania dat, mas i kwot z testami.

### Znane ograniczenia

- Brak polaczonych projektow Firebase development/production.
- Brak realnego logowania i modeli biznesowych.
- Testy emulatora Firebase wymagaja dopiecia Javy/Firebase CLI w Etapie 2.

### Migracje

- Brak.
