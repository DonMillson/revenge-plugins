# SG Server Backgrounds

**By DonMillson**

Wspólna grafika za wiadomościami na serwerze Discorda. Plugin dla **Revenge Classic na Androidzie**, wersja **0.1.0-beta.3**.

## Instalacja

W Revenge otwórz **Ustawienia → Revenge → Plugins / Wtyczki → +**, wklej adres katalogu i włącz plugin:

```text
https://raw.githubusercontent.com/DonMillson/revenge-plugins/main/sg-server-backgrounds/
```

Revenge pobiera z tego katalogu `manifest.json` i `index.js`. Nie dopisuj nazwy pliku. Każdy członek, który chce widzieć tło, potrzebuje Revenge Classic oraz tego pluginu.

## Ustawienie tła na serwerze

1. Właściciel serwera tworzy jeden zwykły kanał tekstowy `#tlo-serwera`.
2. Członkowie mogą wyświetlać kanał i czytać historię. Wysyłanie wiadomości i załączników pozostaje dla właściciela.
3. Właściciel wysyła grafikę jako załącznik PNG, JPG lub WEBP. Limit: 10 MB, maksymalnie 4096 px na bok. Podpis może być dowolny. Aby zmienić przyciemnienie lub rozmycie, użyj `TLO dim=0.45 blur=0`.
4. Nowa grafika właściciela zastępuje poprzednią. Wiadomość `TLO OFF` wyłącza tło.

Plugin rozpoznaje serwer po kanale `#tlo-serwera`. W ustawieniach można ograniczyć go do konkretnego ID serwera oraz zmienić przyciemnienie. Prywatne wiadomości nie dostają tła. Boty, webhooki i grafiki innych członków są ignorowane.

## Status wersji beta

30 testów automatycznych przeszły, w tym zgodność bundle'a z loaderem Classic i zgodność hasha manifestu. Wyświetlanie grafiki wymaga jeszcze testu w rzeczywistej aplikacji na telefonie; nie deklarujemy zgodności z konkretną wersją Discorda. Revenge Next nie jest obsługiwane.

Jeżeli tła nie widać:

1. Sprawdź, że w ustawieniach widnieje wersja **0.1.0-beta.3**. Po aktualizacji pluginu uruchom Revenge ponownie.
2. Otwórz zwykły kanał tekstowy serwera, potem ustawienia pluginu i wybierz **Odśwież tło**.
3. W sekcji **Diagnostyka** wybierz **Kopiuj diagnostykę**. Zgłoszenie powinno zawierać ten tekst albo zrzut ekranu sekcji. Status odróżnia brak kanału, brak grafiki właściciela, niewykryty widok wiadomości i błąd pobrania obrazu.

Przycisk kopiuje wersje i statusy. Nie kopiuje tokenów, haseł ani adresu załącznika.

Plugin odczytuje kanał przez klienta Discorda i nie wysyła ani nie usuwa wiadomości. Licencja MIT.

## Rozwój

Źródła i testy znajdują się w tym katalogu. W Node.js 18 lub nowszym uruchom:

```sh
npm run check
```

Projekt nie ma zewnętrznych zależności. Build aktualizuje `index.js` i `manifest.json` w tym katalogu oraz ich kopie w `dist/`. Opublikuj oba pliki z głównego katalogu pluginu w jednym commicie, aby hash manifestu odpowiadał bundle'owi. Adres instalacji pozostaje ten sam.

