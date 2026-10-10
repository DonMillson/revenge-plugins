# SG Server Backgrounds

**By DonMillson**

Wspólna grafika za wiadomościami na serwerze Discorda. Plugin dla **Revenge Classic na Androidzie**, wersja **0.1.0-beta.2**.

## Instalacja

W Revenge otwórz **Ustawienia → Revenge → Plugins / Wtyczki → +**, wklej adres katalogu i włącz plugin:

```text
https://raw.githubusercontent.com/DonMillson/revenge-plugins/main/sg-server-backgrounds/
```

Revenge pobiera z tego katalogu `manifest.json` i `index.js`. Nie dopisuj nazwy pliku. Każdy członek, który chce widzieć tło, potrzebuje Revenge Classic oraz tego pluginu.

## Ustawienie tła na serwerze

1. Właściciel serwera tworzy jeden zwykły kanał tekstowy `#tlo-serwera`.
2. Członkowie mogą wyświetlać kanał i czytać historię. Wysyłanie wiadomości i załączników pozostaje dla właściciela.
3. Właściciel wysyła grafikę jako załącznik PNG, JPG lub WEBP. Limit: 10 MB, maksymalnie 4096 px na bok. Podpis może być pusty lub `TLO dim=0.45 blur=0`.
4. Nowa grafika właściciela zastępuje poprzednią. Wiadomość `TLO OFF` wyłącza tło.

Plugin rozpoznaje serwer po kanale `#tlo-serwera`. W ustawieniach można ograniczyć go do konkretnego ID serwera oraz zmienić przyciemnienie. Prywatne wiadomości nie dostają tła. Boty, webhooki i grafiki innych członków są ignorowane.

## Status wersji beta

23 testy automatyczne przeszły, w tym zgodność bundle'a z loaderem Classic i zgodność hasha manifestu. Wyświetlanie grafiki wymaga jeszcze testu w rzeczywistej aplikacji na telefonie; nie deklarujemy zgodności z konkretną wersją Discorda. Revenge Next nie jest obsługiwane.

Jeżeli tła nie widać, wybierz w ustawieniach pluginu **Odśwież tło**. Przy zgłaszaniu problemu podaj wersję Discorda i Revenge oraz komunikat diagnostyczny z ustawień pluginu.

Plugin odczytuje kanał przez klienta Discorda i nie wysyła ani nie usuwa wiadomości. Licencja MIT.
