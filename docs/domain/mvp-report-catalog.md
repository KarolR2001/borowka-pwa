# Katalog raportow MVP

## Status decyzji

Pakiet 9.1 zatwierdza 12 raportow MVP. Kanoniczne identyfikatory, odbiorcy,
filtry, kolumny, zrodla i reguly sumowania sa zapisane w
`src/reports/reportCatalog.ts`. Katalog jest kontraktem dla eksportu CSV,
pelnego eksportu chmury i przyszlych widokow raportowych; ten pakiet nie dodaje
jeszcze nowej zakladki UI.

Jedenascie raportow administracyjnych jest dostepnych tylko dla aktywnego
administratora. Operator nie otrzymuje katalogu raportow. Picker ma dostep
wylacznie do wlasnego zestawienia, ograniczonego przez `workerId` profilu i
istniejaca flage `appSettings/domain.pickerOwnReportExportEnabled`.

## Wspolne zasady

- raporty administracyjne online uzywaja danych potwierdzonych przez Firestore;
- filtr zbiorow i sprzedazy opiera sie na `businessDate`, a filtr wyplat na
  `paidBusinessDate`;
- zakres dat jest wlaczny na obu koncach;
- wartosci zrodlowe pozostaja w gramach, groszach i milli jednostki; format
  prezentacyjny PLN/kg powstaje dopiero w eksporcie;
- stabilne identyfikatory dokumentow sa obowiazkowymi kolumnami raportow
  szczegolowych;
- dokumenty anulowane pozostaja widoczne, ale nie wchodza do aktywnych sum;
- historyczne snapshoty stawki, planu i kwoty nie sa przeliczane aktualna
  konfiguracja;
- `Wynik po koszcie zbioru` oznacza przychod minus naliczenia zbieraczy. Nie
  jest nazywany zyskiem i nie obejmuje innych kosztow gospodarstwa.

## 1. Podsumowanie sezonu

- Id: `SEASON_SUMMARY`.
- Odbiorca: administrator.
- Filtry: sezon i zakres dat biznesowych.
- Kolumny: identyfikator, nazwa i status sezonu, zakres, potwierdzona masa,
  sprzedana masa, stan, naliczenia, wyplaty, saldo, przychod i wynik po koszcie
  zbioru.
- Zrodla: `seasons`, `harvestSessions`, `payments`, `sales`, `workers`.
- Sumowanie: masa tylko z `CLOSED`/`PAID`; aktywne sprzedaze i korekty ze
  znakiem; aktywne wyplaty; stan jako zbior minus sprzedana masa; wynik jako
  przychod minus naliczenia.

## 2. Sesje wedlug osoby

- Id: `SESSIONS_BY_WORKER`.
- Odbiorca: administrator.
- Filtry: sezon, zbieracz, zakres `businessDate`, status sesji.
- Kolumny: sezon, zbieracz, sesja, data, status, plan, ilosc milli, masa g,
  naliczenie grosze, identyfikator wyplaty i oznaczenie importu.
- Zrodla: `seasons`, `workers`, `harvestSessions`.
- Sumowanie: masa i naliczenia sa rozdzielone wedlug statusu; `CANCELLED` ma
  zerowy wplyw; ilosci roznych planow lub jednostek nie sa laczone w jedna
  liczbe.

## 3. Wpisy konkretnej sesji

- Id: `SESSION_ENTRIES`.
- Odbiorca: administrator.
- Filtry: sezon, jedna sesja, status wpisu.
- Kolumny: sesja, wpis, numer sekwencji, data, status, ilosc milli, masa g,
  podglad kwoty, wpis zastepowany, powod anulowania, urzadzenie i czas lokalny.
- Zrodla: `harvestSessions`, `harvestEntries`.
- Sumowanie: tylko wpisy `ACTIVE`; anulowane wpisy i lancuch korekt pozostaja
  widoczne; suma wpisow jest kontrolnie porownywana z oficjalna suma sesji, a
  `amountPreviewGrosz` nie zastepuje finalnego `amountDueGrosz` sesji.

## 4. Naliczenia wedlug osoby

- Id: `ACCRUALS_BY_WORKER`.
- Odbiorca: administrator.
- Filtry: sezon, zbieracz, zakres `businessDate` sesji.
- Kolumny: sezon, zbieracz, liczba naliczonych sesji, potwierdzona masa,
  naliczono, wyplacono i pozostalo w groszach.
- Zrodla: `seasons`, `workers`, `harvestSessions`, `payments`.
- Sumowanie: naliczenia z `CLOSED` i `PAID`; wyplacono tylko z aktywnych wyplat;
  pozostalo jako naliczenia minus aktywne wyplaty; kwoty historyczne bez
  ponownego przeliczenia stawka.

## 5. Wyplaty wedlug osoby i daty

- Id: `PAYMENTS_BY_WORKER_AND_DATE`.
- Odbiorca: administrator.
- Filtry: sezon, zbieracz, zakres `paidBusinessDate`, status wyplaty.
- Kolumny: wyplata, sezon, zbieracz, sesja, data sesji, data wyplaty, metoda,
  status, kwota, powod anulowania i oznaczenie importu.
- Zrodla: `seasons`, `workers`, `harvestSessions`, `payments`.
- Sumowanie: suma aktywna obejmuje tylko `ACTIVE`; anulowane kwoty sa
  raportowane oddzielnie i nie zmniejszaja salda drugi raz.

## 6. Sprzedaz

- Id: `SALES`.
- Odbiorca: administrator.
- Filtry: sezon, zakres `businessDate`, typ dokumentu, status i autor.
- Kolumny: dokument, sezon, data, typ, kierunek korekty, status, masa g, cena
  grosze/kg, kwota grosze, autor, notatka, powod anulowania i import.
- Zrodla: `seasons`, `sales`, `users`.
- Sumowanie: zwykla sprzedaz zwieksza sprzedana mase i przychod; korekta ma znak
  wynikajacy z `correctionDirection`; anulowany dokument ma zerowy aktywny
  wplyw.

## 7. Stan kilogramow

- Id: `STOCK`.
- Odbiorca: administrator.
- Filtry: sezon i zakres `businessDate`.
- Kolumny: sezon, zakres, potwierdzony zbior, zwykla sprzedaz, korekty
  zwiekszajace i zmniejszajace, dostepny stan i liczba zrodel.
- Zrodla: `harvestSessions`, `sales`.
- Sumowanie: wykorzystuje zrodlowa kalkulacje stanu; wyplaty, otwarte,
  anulowane i bezwagowe sesje nie zmieniaja kilogramow.

## 8. Wynik po koszcie zbioru

- Id: `RESULT_AFTER_HARVEST_COST`.
- Odbiorca: administrator.
- Filtry: sezon i zakres `businessDate`.
- Kolumny: sezon, zakres, przychod grosze, koszt zbioru grosze i wynik grosze.
- Zrodla: `harvestSessions`, `sales`.
- Sumowanie: podpisany aktywny przychod minus `amountDueGrosz` sesji `CLOSED` i
  `PAID`; bez innych kosztow i bez etykiety `Zysk`.

## 9. Lista sesji do wyplaty

- Id: `PAYABLE_SESSIONS`.
- Odbiorca: administrator.
- Filtry: sezon, zbieracz i zakres `businessDate`.
- Kolumny: sezon, sesja, zbieracz, data, czas zamkniecia, masa, kwota do
  wyplaty i wersja obliczen.
- Zrodla: `seasons`, `workers`, `harvestSessions`, `payments`.
- Sumowanie: tylko `CLOSED` z dodatnia oficjalna kwota i bez aktywnej wyplaty;
  `PAID`, `CANCELLED`, `OPEN` i `REVIEW_REQUIRED` sa wykluczone z gotowej listy.

## 10. Konflikty i sesje wymagajace przegladu

- Id: `CONFLICTS_AND_REVIEW`.
- Odbiorca: administrator.
- Filtry: sezon, zbieracz, status sesji, status zgloszenia i konfliktu.
- Kolumny: typ i identyfikator zrodla, sezon, zbieracz, sesja, status, powod,
  czas wykrycia i urzadzenie.
- Zrodla: `harvestSessions`, `issueReports`, lokalny `localSyncJournal`.
- Sumowanie: problem jest liczony raz wedlug typu i stabilnego ID;
  `REVIEW_REQUIRED` pozostaje otwarty do jawnego rozstrzygniecia. Konflikt
  istniejacy tylko w lokalnym dzienniku jest widoczny jedynie na urzadzeniu,
  ktore go posiada; nie wolno przedstawic go jako kompletnego raportu chmury.

## 11. Dane importowane

- Id: `IMPORTED_DATA`.
- Odbiorca: administrator.
- Filtry: sezon, zrodlo importu, typ dokumentu i zakres daty biznesowej.
- Kolumny: kolekcja, dokument, sezon, data, zrodlo i wiersze legacy, status,
  masa, kwota i stan walidacji.
- Zrodla: `harvestSessions`, `harvestEntries`, `payments`, `sales`.
- Sumowanie: tylko rekordy jawnie oznaczone jako legacy; sumy osobno wedlug
  kolekcji i statusu; bledne lub pominiete wiersze sa raportowane oddzielnie i
  nie wchodza do zaakceptowanych sum.

## 12. Wlasne zestawienie zbieracza

- Id: `PICKER_OWN_SUMMARY`.
- Odbiorca: picker, tylko gdy wlaczona jest flaga
  `pickerOwnReportExportEnabled`.
- Filtry: sezon i zakres `businessDate`, zawsze z wymuszonym `workerId` profilu.
- Kolumny: typ rekordu, sezon, sesja, data i status sesji, plan, ilosc, masa,
  naliczenie, wyplata, data i status wyplaty oraz kwota.
- Zrodla: `appSettings`, `seasons`, `harvestSessions`, `payments`.
- Sumowanie: naliczenia z `CLOSED`/`PAID`, wyplacono z `ACTIVE`, pozostalo jako
  roznica; anulowane wyplaty osobno. Cache jest jawnie oznaczony jako niepelny.

## Kolejnosc implementacji

Pakiet 9.2 implementuje wspolny bezpieczny format CSV dla raportow
administracyjnych. Istniejacy eksport pickera pozostaje zgodny z zasadami
prywatnosci i bedzie ponownie wykorzystany zamiast dublowania odczytow.
Pelny eksport przenosny z pakietu 9.3 jest osobnym mechanizmem i nie moze byc
utozsamiany z pojedynczym raportem ani eksportem awaryjnym urzadzenia.
