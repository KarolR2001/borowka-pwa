# Etap 7.17 - raport rownoleglej wyplaty

## Scenariusz

Dwie niezalezne instancje administratora rozpoczynaja jednoczesnie wyplate tej
samej sesji `CLOSED` na podstawie tej samej rewizji. Kazda instancja ma osobny
profil, urzadzenie i wywolanie transakcji Firestore.

## Oczekiwany wynik

1. Dokladnie jedna proba zwraca `CONFIRMED`.
2. Druga proba zwraca `ALREADY_PAID` z autorem i czasem zaakceptowanej wyplaty.
3. Istnieje dokladnie jeden aktywny dokument wyplaty.
4. Sesja ma status `PAID` i jeden aktywny `paymentId`.
5. Istnieje dokladnie jeden audyt `HARVEST_SESSION_PAID`.
6. Pulpit pickera pokazuje jedno naliczenie, jedna wyplate i saldo zero.

## Dowod automatyczny

`tests/integration/payment-write.test.ts` uruchamia obie proby przez produkcyjny
runtime `createPayment` i rzeczywiste Security Rules w lokalnym Firestore
Emulator. Po zakonczeniu test odczytuje kolekcje z emulatora i sprawdza:

- jeden dokument `payments/session-1--payment-r3` ze statusem `ACTIVE`;
- jedna sesje z tym samym `paymentId`, rewizja 3 i statusem `PAID`;
- jeden dokument `auditEvents/payment-created-session-1--payment-r3`;
- wynik produkcyjnego `buildPickerDashboard`: naliczone 1000 gr, wyplacone
  1000 gr, pozostale 0 gr.

Scenariusz dwoch kart tego samego administratora i powrot starego klienta
korzystaja z tego samego sprawdzenia dowodow. Testy przez ADB i na fizycznych
telefonach pozostaja `SKIPPED` zgodnie z decyzja wlasciciela.
