# Implementacja i zgodność

## Punkt odniesienia

API odczytano 10 października 2026 z repozytorium Revenge Classic, commit `1b1d297416594087769987908e5fc09af36b7e6e`:

- [Loader pluginów kompatybilnych z Vendetta](https://github.com/revenge-mod/revenge-bundle/blob/1b1d297416594087769987908e5fc09af36b7e6e/src/core/vendetta/plugins.ts)
- [API udostępniane pluginom](https://github.com/revenge-mod/revenge-bundle/blob/1b1d297416594087769987908e5fc09af36b7e6e/src/core/vendetta/api.tsx)
- [Mechanizm tła w Revenge Classic](https://github.com/revenge-mod/revenge-bundle/blob/1b1d297416594087769987908e5fc09af36b7e6e/src/lib/addons/themes/colors/patches/background.tsx)
- [Revenge Manager](https://github.com/revenge-mod/revenge-manager)

Publiczny projekt [bleelblep/revengeplugins](https://github.com/bleelblep/revengeplugins/blob/d9a17057a2fe98a8b0fd001ca504248e3641af76/plugins/purge-my-messages/src/lib/api.ts) potwierdza obecne wyszukiwanie natywnego modułu HTTP przez `getAPIBaseURL` i zwracanie danych w `response.body`. Wykorzystano informacje o API, bez kopiowania tamtejszego kodu.

## Warstwa grafiki

Patching obejmuje funkcję `render` komponentu `MessagesConnected` (alternatywnie `Messages`). Obraz znajduje się w warstwie React Native pod drzewem wiadomości. Inline style kontenera korzenia i kontenera `HACK_fixModalInteraction` są kopiowane z przezroczystym tłem. Nie są modyfikowane globalne tokeny koloru, pliki Revenge, obiekty Store ani oryginalne elementy Reacta. Komponenty mogą jednak różnić się między wersjami Discorda — test Node z atrapami nie potwierdza faktycznego rysowania przez natywną listę Androida.

Bezpieczna granica błędów przywraca pierwotną listę wiadomości, jeśli komponent dodatku rzuci wyjątek. Brak obsługi aktualnego widoku powoduje komunikat w ustawieniach, zamiast błędu przy inicjalizacji aplikacji.

## Konfiguracja wspólna

Tapeta jest odczytywana z ostatnich 100 wiadomości zwykłego kanału tekstowego o jednej, jednoznacznej nazwie. Przyjmowane są wyłącznie wiadomości bieżącego właściciela wskazanego przez `GuildStore`, niezwiązane z botem lub webhookiem. Grafika musi być załącznikiem PNG/JPG/WEBP z domeny CDN Discorda. Plugin nie przyjmuje zdalnego JavaScriptu ani JSON-a do wykonania z tego kanału.

Do HTTP używany jest moduł już obecny w kliencie Discorda. W kodzie nie ma pozyskiwania tokenu, serwera zbierającego dane ani operacji wysyłania, edycji czy usuwania wiadomości. Właściciel publikuje obraz ręcznie, za pomocą zwykłego interfejsu Discorda.

Wersja 0.1.0-beta.3 scala dostępne listy kanałów serwera, obsługuje kolekcje Map i sięga do globalnej listy, gdy lista serwera nie zawiera kanału konfiguracji. Pierwsza pusta odpowiedź nie zatrzymuje szukania. Dowolny podpis obrazu właściciela jest przyjmowany; parametry są interpretowane wyłącznie w poleceniu TLO. Inicjalizacja brakujących modułów jest ponawiana przez ograniczony czas oraz po ręcznym odświeżeniu.

## Diagnostyka

Ustawienia pokazują wersję pluginu, wersje klienta udostępnione przez API getDebugInfo, wykrycie widoku czatu, liczbę znalezionych kanałów, wynik odczytu grafiki oraz zdarzenia onLoad/onError obrazu. Nie raportujemy sukcesu rysowania na podstawie samego odczytu wiadomości. Zdarzenie onLoad oznacza wczytanie obrazu, ale nie dowodzi, że inne natywne warstwy go nie zasłaniają. Ustawienia zachowują ostatni otwarty serwer, gdy przejście do ekranu ustawień usuwa aktywny kanał. Renderer nadal ustala serwer z kanału konkretnego widoku; prywatne rozmowy pozostają bez tła.

Przycisk Kopiuj diagnostykę zapisuje raport lokalnie w schowku. Nie wysyła go do zewnętrznej usługi i nie kopiuje tokenu, hasła ani adresu załącznika.

## Synchronizacja i wygaszanie

- Odczyt przy wejściu na serwer, przy powrocie aplikacji i co 5 minut, gdy aplikacja jest aktywna.
- Nowe, edytowane i usunięte wiadomości aktualizują lub ponownie sprawdzają stan.
- Ponowny odczyt odświeża podpisany URL załącznika; nie jest używany własny proxy.
- Limit minimum 30 sekund dla automatycznych odczytów, współdzielenie trwającego żądania i backoff 429.
- Starsza odpowiedź REST nie może nadpisać nowego zdarzenia wiadomości.
- Zmiana właściciela lub kanału unieważnia stary wpis, a 403/404 usuwa zapamiętaną grafikę.
- Wyłączenie dodatku usuwa patche, subskrypcje i timery oraz ignoruje późne odpowiedzi.

Nie potwierdzono jeszcze działania na rzeczywistym Androidzie. Revenge Next wymaga osobnego portu. Dla PC lub iOS potrzebny byłby oddzielny dodatek klienta; ta paczka go nie zawiera.
