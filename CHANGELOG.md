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
- Dodano odczytowa liste profili uzytkownikow dla administratora z filtrowaniem po roli, statusie, aktywnosci i tekście.
- Dodano model prerejestracji `registrationInvitations` oraz Firestore Rules dla tworzenia, listowania i anulowania zaproszen przez administratora.
- Dodano panel administratora do prerejestracji kont: tworzenie zaproszen, lista z filtrami, podglad blednych dokumentow i anulowanie zaproszen oczekujacych.

### Zmieniono

- Wlasny profil `users/{uid}` jest czytelny dla zalogowanego wlasciciela takze przy statusie blokady lub braku akceptacji, aby aplikacja mogla pokazac kontrolowany stan konta bez udostepniania danych biznesowych.

### Znane ograniczenia

- Zapisy profili pozostaja zablokowane do czasu implementacji wykorzystania zaproszenia przez uzytkownika.
- Link "Zaloz konto" pokazuje informacyjny stan prerejestracji; samodzielne wykorzystanie zaproszenia bedzie osobnym przyrostem.
- Lista administratora pokazuje profile z kolekcji `users`; nie wykrywa jeszcze kont Authentication bez profilu.
- Zaproszenia maja interfejs administratora, ale nie maja jeszcze przeplywu samodzielnego wykorzystania przez uzytkownika.

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
