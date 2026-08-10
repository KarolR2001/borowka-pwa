# Kontrola dostepu do eksportow

## Macierz

| Mechanizm                    | ADMIN                           | OPERATOR                        | PICKER                              | Zakres                                        |
| ---------------------------- | ------------------------------- | ------------------------------- | ----------------------------------- | --------------------------------------------- |
| Pelny eksport chmury         | Tak, online                     | Nie                             | Nie                                 | Wszystkie 15 kolekcji Firestore               |
| Prywatny eksport CSV pickera | Nie jako picker                 | Nie                             | Tak, gdy administrator wlaczy flage | Wlasne sesje i wyplaty powiazanego `workerId` |
| Awaryjny eksport urzadzenia  | Dane lokalne zalogowanego konta | Dane lokalne zalogowanego konta | Dane lokalne zalogowanego konta     | Oczekujace dane tylko biezacego urzadzenia    |

Pelny eksport i eksport pickera nie sa wariantami tego samego uprawnienia. Nie
wolno rozszerzac prywatnego CSV tak, aby pobieral dane innych zbieraczy albo
finanse gospodarstwa.

## Pelny eksport chmury

Ochrona jest warstwowa:

1. powloka aplikacji montuje panel tylko w widoku administratora;
2. panel zwraca `null` dla kazdej roli innej niz `ADMIN`;
3. funkcja eksportu wymaga aktywnego, zatwierdzonego administratora online;
4. Firestore Rules wymagaja uprawnien administratora do listowania kolekcji,
   ktore nie sa dostepne operatorowi ani pickerowi;
5. pobieranie uzywa lokalnego adresu `blob:`, ktory jest natychmiast odwolany i
   nie tworzy stalego publicznego URL.

Operator nie moze listowac m.in. `users`, `registrationInvitations`,
`auditEvents`, `devices`, `appSettings`, `payments` ani `sales`. Nawet
bezposrednie wywolanie SDK poza interfejsem nie omija Rules.

## Prywatny eksport pickera

Picker widzi zakladke eksportu tylko we wlasnym obszarze roboczym. Dostepnosc
kontroluje flaga administratora. Zapytania do `harvestSessions` i `payments`
zawsze zawieraja filtr `workerId == profile.workerId`; Rules odrzucaja zapytanie
bez tego ograniczenia oraz probe pobrania innego `workerId`.

Eksport zawiera tylko dane widoczne dla tego pickera. Nie zawiera sprzedazy,
przychodu, wyniku gospodarstwa, listy kont ani danych innych zbieraczy.

## Ostrzezenia i przechowywanie

Przed pobraniem pelnego archiwum oraz prywatnego CSV interfejs ostrzega, ze plik
zawiera dane osobowe i finansowe. Pliki nie sa publikowane przez Hosting ani
zapisywane w Firestore. Uzytkownik odpowiada za zapisanie ich w zabezpieczonej
lokalizacji i ograniczenie dostepu.

## Dowody

- `tests/rules/firestore-export-permissions.test.ts` - macierz odczytow Rules;
- `src/reports/fullCloudExport.test.ts` - aktywny administrator jako warunek
  domenowy;
- `src/reports/AdminFullCloudExportPanel.test.tsx` - widocznosc, ostrzezenie i
  odwolanie adresu `blob:`;
- `src/picker/PickerDataExportPanel.test.tsx` - ostrzezenie prywatnego CSV;
- `src/app/App.test.tsx` - montowanie pelnego eksportu tylko w obszarze
  administratora.
