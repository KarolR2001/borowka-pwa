# Etap 6 - raport dlugiego offline

Raport realizuje pakiet 6.27. Test korzysta z wirtualnego zegara, wstrzykiwanych
awarii transportu i Firestore Emulator.

## Status

- Wynik automatyczny: `PASS`.
- Czas offline: 360 minut czasu symulowanego.
- Sesje: 4.
- Wpisy: 100.
- Sesje zamkniete: 2.
- Sesje otwarte: 2.
- Restart dziennika: 1.
- Przerwane proby synchronizacji: 2.
- Udana proba synchronizacji: 3.
- Dokumenty journal przed synchronizacja: 210.
- Dokumenty Firestore po synchronizacji: 210.
- Suma ilosci: 100 000 milli.
- Suma wagi: 100 000 g.

## Przebieg

1. Utworzono cztery sesje offline po 25 wpisow.
2. Zamknieto dwie sesje, a dwie pozostawiono otwarte.
3. Odtworzono journal z 210 zapisanych rekordow, symulujac restart aplikacji.
4. Zwiekszono rewizje konfiguracji na logicznym `device-b`.
5. Dwie proby transportu zwrocily kontrolowany blad slabej sieci.
6. Po kazdej awarii wszystkie 104 syntetyczne dokumenty biznesowe pozostaly
   w dzienniku testu polityki retry.
7. Trzecia proba potwierdzila dokumenty.
8. Firestore Emulator potwierdzil 4 unikalne UUID sesji, 100 unikalnych UUID
   wpisow, 106 dokumentow audytu, dwie sesje `CLOSED`, dwie `OPEN` i pusta
   kolejke po restarcie.

## Porownanie

`verifyLongOfflineRun` porownuje lokalne i serwerowe snapshoty po UUID,
statusie, ilosci i wadze. Pozytywny fixture ma:

- identyczne 100 UUID wpisow;
- identyczne 4 UUID sesji;
- identyczne statusy sesji;
- identyczne sumy ilosci i wagi;
- rewizje konfiguracji `7 -> 8` z innego urzadzenia.

Negatywny fixture potwierdza, ze brak UUID, rozna suma, rozny status,
niewystarczajacy czas, brak restartu albo brak zdalnej zmiany konfiguracji
ustawia `FAIL`.

## Ryzyko rezydualne

Slaba siec jest symulowana kontrolowanym bledem transportu, a czas jest
wirtualny. Nie zweryfikowano charakterystyki realnej sieci komorkowej ani
zachowania procesu mobilnego po wielu godzinach. Te ryzyka pozostaja czescia
odroczonych testow fizycznych przed pilotazem lub produkcja.
