# Rozdzielenie mechanizmow eksportu

Pakiet 9.4 utrwala dwa niezalezne mechanizmy. Nazwy, formaty i zastosowania nie
sa zamienne.

| Wlasciwosc           | Eksport awaryjny urzadzenia                                     | Pelny eksport chmury                      |
| -------------------- | --------------------------------------------------------------- | ----------------------------------------- |
| Cel                  | Ratowanie lokalnych danych przy problemie synchronizacji        | Archiwizacja i kontrola danych systemu    |
| Zrodlo               | `LOCAL_DEVICE_STORAGE`                                          | `FIRESTORE_SERVER`                        |
| Zakres               | `CURRENT_DEVICE_LOCAL_PENDING_DATA`                             | `ALL_FIRESTORE_COLLECTIONS`               |
| Polaczenie           | Dziala offline                                                  | Wymaga serwera                            |
| Wykonawca            | Zalogowany uzytkownik urzadzenia, takze przy blokadzie z danymi | Aktywny administrator                     |
| Zawartosc            | Lokalne sesje, wpisy i dokumenty powiazane                      | Wszystkie 15 kolekcji Firestore           |
| Format               | Pojedynczy JSON odzyskiwania                                    | ZIP z manifestem, JSON i SHA-256          |
| Import PROD          | Tylko kontrolowany przeglad, nigdy automatycznie                | Nie jest przywracaniem jednym kliknieciem |
| Miejsce przechowania | Bezpieczne przekazanie administratorowi                         | Zabezpieczona lokalizacja poza Firebase   |

## Identyfikacja maszynowa

Eksport awaryjny urzadzenia ma:

- `format.name = BOROWKA_EMERGENCY_LOCAL_EXPORT`;
- `format.version = 2`;
- `format.purpose = EMERGENCY_RECOVERY`;
- `format.source = LOCAL_DEVICE_STORAGE`;
- `format.dataScope = CURRENT_DEVICE_LOCAL_PENDING_DATA`.

Pelny eksport chmury ma:

- `format.name = BOROWKA_FULL_CLOUD_EXPORT`;
- `format.version = 2`;
- `format.purpose = PORTABLE_ARCHIVE`;
- `format.source = FIRESTORE_SERVER`;
- `format.dataScope = ALL_FIRESTORE_COLLECTIONS`.

Proces odzyskiwania nie moze zmienic eksportu urzadzenia w dane produkcyjne bez
kontrolowanego przegladu administratora. Pelny eksport chmury nie odczytuje
lokalnych oczekujacych zapisow, dlatego przy awarii synchronizacji trzeba najpierw
zabezpieczyc eksport urzadzenia.

Interfejs uzywa pelnych nazw `Eksport awaryjny urzadzenia` i `Pelny eksport
chmury`. Sama nazwa `Eksport` nie identyfikuje zadnego z tych procesow.
