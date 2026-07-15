# Bezpieczenstwo

## Zglaszanie problemow

Problemy bezpieczenstwa zglaszamy prywatnym kanalem do administratora projektu. Nie publikujemy publicznie szczegolow, dopoki problem nie zostanie oceniony i naprawiony.

## Sekrety

W repozytorium nie wolno umieszczac:

- kluczy kont uslugowych;
- tokenow CI lub Firebase CLI;
- hasel uzytkownikow;
- eksportow produkcyjnych;
- kopii lokalnego cache przegladarki;
- zrzutow z realnymi danymi finansowymi lub osobowymi.

## Firebase

- Poczatkowe Security Rules maja zasade deny by default.
- Dostep produkcyjny jest oddzielony od development.
- Dane wdrozeniowe CI trafiaja wylacznie do sekretow platformy CI.
- Wyciek sekretu oznacza natychmiastowa rotacje i wpis w rejestrze incydentow.

## Dane lokalne

Docelowa praca offline oznacza, ze dane moga pozostac na urzadzeniu. Tryb trwalego cache bedzie wlaczany tylko na zaufanym urzadzeniu i z jawnym komunikatem.
