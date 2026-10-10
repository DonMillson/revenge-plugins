# Wynik sprawdzenia

Data: 10 października 2026. Wersja: 0.1.0-beta.3. Środowisko: Node.js 24.19.0.

`npm run check`: build poprawny, **30/30 testów przeszło**.

Sprawdzone zachowania:

- Autor wiadomości musi być bieżącym właścicielem; członek, bot i webhook nie mogą ustawić tła.
- Akceptowane są wyłącznie wspierane załączniki z CDN Discorda; obce URL-e, SVG, zbyt duże pliki i obrazy są odrzucane.
- Najnowsza konfiguracja i `TLO OFF` wygrywają bez utraty dokładności ID wiadomości.
- Powtarzające się nazwy kanałów nie prowadzą do przypadkowego wyboru konfiguracji.
- Prywatna rozmowa nie dziedziczy grafiki serwera.
- Zmiana właściciela, nazwy kanału, ustawień lub uprawnień wygasza poprzedni stan.
- Ręczne odświeżanie respektuje 429, a równoczesne odczyty współdzielą żądanie.
- Usunięcie lub edycja wiadomości nie przywraca grafiki ze starego lokalnego cache.
- Starsza odpowiedź HTTP nie nadpisuje nowszej wiadomości otrzymanej ze zdarzenia klienta.
- Odpowiedź, która przyszła po wyłączeniu pluginu, nie zmienia stanu.
- Bundle jest uruchamiany przez dokładny format wyrażenia używany przez loader Revenge Classic; hash zgadza się z bajtami pliku.
- Test renderowania z atrapami React/React Native tworzy warstwę obrazu i kopiuje style bez zmieniania zamrożonych elementów Discorda.
- Błąd obrazu przywraca pierwotną listę wiadomości; wyłączenie usuwa patche, timery i subskrypcje.
- Przeniesiony moduł lub rzucający getter lokalizacji nie wywołuje błędu startu.
- Pusta lista kanałów nie blokuje dalszego wyszukiwania; zagnieżdżone kolekcje Map są obsługiwane.
- Ta sama tapeta trafia do widoku wiadomości drugiego kanału serwera.
- Obraz właściciela ze zwykłym podpisem jest przyjmowany; opcje dim/blur są odczytywane tylko z polecenia TLO.
- Brak kanału, wyłączone tło i inny wybrany serwer mają odrębne komunikaty.
- Moduł HTTP wczytany później pozwala uruchomić plugin bez ponownego startu aplikacji.
- Ustawienia zachowują ostatni wykryty serwer, a diagnostyka rozróżnia odczyt konfiguracji i zdarzenie wczytania obrazu. Kopia nie zawiera adresów załączników ani tokenów.
- Wyłączenie i ponowne włączenie tej samej instancji odtwarza kontroler i usuwa stare timery/subskrypcje.

**Granica tych testów:** React Native, Store i komponent czatu są atrapami. Nie przetestowano telefonu, rzeczywistego rysowania przez natywną listę wiadomości, logowania, publikacji GitHub Pages ani instalacji przez sieć na Androidzie. Test sieciowy serwera lokalnego został zablokowany przez środowisko wykonania (ECONNRESET, EPERM); nie potwierdzono lokalnego połączenia TCP. Instrukcja testu rzeczywistego klienta jest w `TEST_NA_TELEFONIE.md`. Jest to paczka beta do pierwszego testu i dostosowania, a nie potwierdzona wersja produkcyjna.

Aktualny plugin jest publikowany bezpośrednio z publicznego repozytorium DonMillson/revenge-plugins. Instalator otrzymuje manifest.json i index.js z katalogu https://raw.githubusercontent.com/DonMillson/revenge-plugins/main/sg-server-backgrounds/. Po publikacji pliki są pobierane ponownie i porównywane z przetestowanym bundle'em. Udana publikacja nie potwierdza natywnego rysowania grafiki na telefonie.
