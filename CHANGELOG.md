# Changelog

Format oparty o jawny opis zmian, modelu danych, Security Rules i migracji.

## Unreleased

### Dodano

- Dodano poczatkowy model domenowy tozsamosci: role, profile, statusy rejestracji i zaproszen.
- Rozszerzono Firestore Security Rules o odczyt wlasnego aktywnego profilu i listowanie profili przez administratora.
- Dodano testy Rules dla profili uzytkownikow.
- Skorygowano naglowki cache Firebase Hosting dla tras SPA, manifestu i plikow HTML, aby aktualizacje PWA nie byly blokowane przez domyslne cache.
- Dodano inicjalizacje Firebase App, Authentication i Firestore w aplikacji oraz status uslug w diagnostyce.
- Dodano warstwe sesji logowania Firebase Auth z odczytem profilu `users/{uid}`, walidacja roli/statusu i bezpiecznymi komunikatami bledow.
- Dodano formularz logowania, resetu hasla i wylogowania oraz widok stanu profilu aplikacyjnego.
- Dodano instrukcje recznego testu logowania na projekcie development.

### Zmieniono

- Wlasny profil `users/{uid}` jest czytelny dla zalogowanego wlasciciela takze przy statusie blokady lub braku akceptacji, aby aplikacja mogla pokazac kontrolowany stan konta bez udostepniania danych biznesowych.

### Znane ograniczenia

- Zapisy profili i zaproszen pozostaja zablokowane do czasu implementacji przeplywu prerejestracji administratora.
- Link "Zaloz konto" pokazuje informacyjny stan prerejestracji; wlasciwy przeplyw zaproszen administratora bedzie osobnym przyrostem.

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
