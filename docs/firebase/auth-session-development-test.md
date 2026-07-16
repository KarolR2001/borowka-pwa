# Test logowania na development

Ten dokument opisuje reczny test aktualnego przyrostu Etapu 3: logowanie, reset hasla i odczyt profilu `users/{uid}`.

## Zakres

- Dotyczy projektu Firebase `borowka-pwa-dev`.
- Nie dotyczy produkcji.
- Nie tworzy jeszcze przeplywu prerejestracji administratora. Ten przeplyw powstanie w osobnym przyroscie.

## Przygotowanie konta testowego

1. Wejdz w Firebase Console dla projektu `borowka-pwa-dev`.
2. W Authentication wlacz provider `Email/Password`, jesli nie jest aktywny.
3. W Authentication utworz testowego uzytkownika e-mail/haslo.
4. Skopiuj jego `uid`.
5. W Firestore utworz dokument `users/{uid}` z polami:

```json
{
  "uid": "WKLEJ_UID_Z_AUTHENTICATION",
  "email": "adres-testowy@example.com",
  "displayName": "Administrator Testowy",
  "role": "ADMIN",
  "workerId": null,
  "active": true,
  "registrationStatus": "APPROVED",
  "offlineConsent": false,
  "createdBy": "MANUAL_DEV_BOOTSTRAP"
}
```

## Test pozytywny

1. Uruchom aplikacje development.
2. Otworz zakladke `Logowanie`.
3. Zaloguj sie e-mailem i haslem konta testowego.
4. Oczekiwany wynik:
   - pasek statusu pokazuje `Konto: Administrator`;
   - panel logowania pokazuje nazwe z `displayName`;
   - rola ma wartosc `Administrator`;
   - przycisk `Wyloguj` konczy sesje.

## Testy stanow profilu

Po kazdej zmianie dokumentu `users/{uid}` odswiez aplikacje albo wyloguj i zaloguj ponownie.

- `active = false` albo `registrationStatus = "BLOCKED"` powinno pokazac stan blokady.
- `role = "PICKER"` oraz `workerId = null` powinno pokazac blad profilu pickera.
- Usuniecie dokumentu `users/{uid}` powinno pokazac brak profilu.

## Reset hasla

1. W zakladce `Logowanie` kliknij `Nie pamietam hasla`.
2. Podaj e-mail konta testowego.
3. Aplikacja zawsze pokazuje neutralny komunikat.
4. Link resetujacy przychodzi standardowym mechanizmem Firebase Authentication.

## Uwagi bezpieczenstwa

- Nie uzywaj rzeczywistych danych osobowych w projekcie development, jesli nie jest to konieczne.
- Nie zapisuj hasel w repozytorium ani w dokumentacji.
- Produkcyjny bootstrap administratora bedzie osobna, kontrolowana procedura.
