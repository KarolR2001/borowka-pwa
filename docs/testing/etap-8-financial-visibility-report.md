# Etap 8.18 - raport widocznosci finansow

## Zakres danych

Finanse gospodarstwa obejmuja sprzedaz, przychod, naliczenia wszystkich
zbieraczy, wyplaty gospodarstwa, saldo i wynik po koszcie zbioru. Prywatne
rozliczenie pickera (`Naliczono`, `Wyplacono`, `Pozostalo`) jest dozwolonym
dostepem do jego wlasnych danych i nie ujawnia finansow gospodarstwa.

## Macierz ról

| Rola          | Stan operacyjny             | Sprzedaz i przychod | Wyplaty gospodarstwa | Prywatne rozliczenie pickera | Wynik |
| ------------- | --------------------------- | ------------------- | -------------------- | ---------------------------- | ----- |
| Administrator | pelny                       | pelny               | pelny                | przez widoki administracyjne | PASS  |
| Operator      | kilogramy, sesje, konflikty | brak                | brak                 | brak                         | PASS  |
| Picker        | tylko wlasne zbiory         | brak                | brak                 | tylko wlasne                 | PASS  |

## Dowody UI i modeli

- pulpit administratora renderuje wszystkie karty operacyjne i finansowe,
  lacznie z `Przychod` oraz `Wynik po koszcie zbioru`;
- model i panel operatora zawieraja stan operacyjny, ale nie zawieraja przychodu,
  wyniku, naliczen ani wyplat;
- panel pickera pokazuje wlasna mase i prywatne rozliczenie, ale nie pokazuje
  stanu magazynu gospodarstwa, sprzedazy, przychodu ani wyniku;
- panel administratora nie uruchamia finansowego API dla innej roli.

Testy UI i modeli zakonczyly sie wynikiem 30/30 w szesciu plikach.

## Security Rules

Firestore Emulator potwierdzil, ze:

- operator nie moze odczytac kolekcji `sales`;
- picker nie moze odczytac kolekcji `sales`;
- uzytkownik anonimowy nie moze odczytac kolekcji `sales`;
- operator otrzymuje tylko sanitowana projekcje
  `operationalStockMovements`, bez ceny i przychodu.

Celowany zestaw `tests/rules/firestore-sales.test.ts` zakonczyl sie wynikiem
14/14. Odrzucenia nieprawidlowych zapisow moga generowac diagnostyke limitu
wyrazen emulatora, ale wszystkie takie operacje koncza sie `PERMISSION_DENIED`.

## Wspoldzielone urzadzenie

- snapshot pulpitu ma klucz zlozony z roli i UID;
- zmiana UID zeruje wynik komponentu i referencje do finansowego dashboardu;
- przejscie z administratora do innej roli zeruje stan panelu administratora;
- drugi picker nie otrzymuje danych pierwszego pickera z cache;
- jawne czyszczenie snapshotow dziala per UID i nie laczy kont.

Po zmianie konta aplikacja nie renderuje ani nie wykorzystuje poprzednich danych
finansowych. JavaScript w przegladarce nie daje aplikacji gwarancji fizycznego
wyzerowania zwolnionej pamieci sterty; gwarancja dotyczy braku osiagalnej
referencji w stanie aplikacji i braku ponownego uzycia snapshotu przez inne
konto.

## Automatyzacja

Glowny zakres jest pokryty przez:

- `src/dashboard/AdminDashboardPanel.test.tsx`;
- `src/dashboard/OperatorDashboardPanel.test.tsx`;
- `src/dashboard/operatorDashboard.test.ts`;
- `src/picker/PickerDashboardPanel.test.tsx`;
- `src/picker/pickerDashboard.test.ts`;
- `src/dashboard/dashboardOfflineState.test.ts`;
- `tests/rules/firestore-sales.test.ts`.

Android Emulator/ADB i fizyczne telefony nie sa czescia tej weryfikacji.
