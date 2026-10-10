# SG Server Backgrounds

**By DonMillson** — Revenge Classic na Androidzie, **0.2.0-beta.1**.

Wybierz obraz z galerii lub plików w ustawieniach pluginu i zapisz go jako wspólne tło za wiadomościami na wszystkich kanałach wybranego serwera. Każdy członek potrzebuje Revenge Classic **oraz tego pluginu**. Wiadomości prywatne nie dostają tła.

## Instalacja i aktualizacja

Ustawienia → Revenge → Plugins / Wtyczki → +. Wklej adres katalogu:

```text
https://raw.githubusercontent.com/DonMillson/revenge-plugins/main/sg-server-backgrounds/
```

Nie dopisuj index.js ani manifest.json. Po aktualizacji uruchom aplikację ponownie. W ustawieniach pluginu sprawdź wersję 0.2.0-beta.1. Jeśli masz starszy ekran ustawień, usuń wpis pluginu i dodaj go z tego adresu.

## Właściciel: wybierz wspólne tło z pliku

1. Otwórz kanał na swoim serwerze, potem Ustawienia → Revenge → Plugins → SG Server Backgrounds → ustawienia (koło zębate).
2. Wybierz **Użyj obecnie otwartego serwera**, potem **Zapisz wybór serwera**.
3. W polu **Klucz właściciela** wklej prywatny klucz otrzymany osobno w pliku. Zapisz klucz na swoim telefonie. Nie przekazuj go członkom i nie wrzucaj na Discorda ani do publicznego repozytorium.
4. Wybierz **Wybierz grafikę z galerii** albo **Wybierz grafikę z plików**. Sprawdź podgląd i opcjonalnie zmień przyciemnienie lub rozmycie.
5. Wybierz **Zapisz dla wszystkich**. Dopiero komunikat o udanym zapisie oznacza opublikowanie wspólnego obrazu. Pluginy członków pobierają zmianę automatycznie przy otwartej aplikacji, zwykle w ciągu około 30 sekund.

Nie trzeba tworzyć kanału ani wysyłać na niego grafiki. PNG, JPG lub WEBP do 10 MB i 4096 px na bok. Galeria może zmniejszyć zbyt duży obraz do 4096 px. Plik trafia do wspólnej usługi HTTPS i jest dostępny pod publicznym adresem. Nie wybieraj poufnych obrazów.

**Wyłącz wspólne tło** wyłącza je dla członków po synchronizacji. Przełącznik **Pokaż tło na tym telefonie** zmienia tylko lokalne wyświetlanie.

## Członkowie

Zainstaluj i włącz plugin z tego samego linku. Otwórz kanał serwera. Klucz właściciela i wybór pliku nie są potrzebne. Plugin pobiera wspólną konfigurację dla serwera; w ustawieniach można ograniczyć wyświetlanie do jednego ID serwera.

## Diagnostyka i ograniczenia

20 testów pluginu i 7 testów wspólnej usługi przeszło. Obejmują wybór pliku, podgląd, zapis, odczyt przez członków bez klucza, wszystkie kanały tego samego serwera, wykluczenie DM, walidację, wyłączenie, konflikt zapisu, wyładowanie i hash bundle'a. To testy automatyczne z atrapami modułów; **nie potwierdzają wyświetlania na konkretnej wersji Discorda ani natywnego wyboru pliku na telefonie**. Revenge Next nie jest obsługiwane.

Jeśli obraz się nie wyświetla, otwórz kanał, potem wybierz **Odśwież tło → Kopiuj diagnostykę**. Diagnostyka pokazuje wersje aplikacji, synchronizację, wykrycie widoku wiadomości i stan obrazu. Nie zawiera klucza ani adresów obrazów.

Plugin nie odczytuje kanału konfiguracji, nie wysyła wiadomości i nie przekazuje usłudze tokena Discorda. Usługa akceptuje zapis z prywatnym kluczem. Sprawdzenie roli właściciela odbywa się w pluginie; usługa nie weryfikuje niezależnie własności serwera Discorda. Klucz chroni publikowanie w tej usłudze.

## Rozwój

```sh
npm run check
```

Node.js 18 lub nowszy, bez zewnętrznych zależności. Build aktualizuje index.js i manifest.json w katalogu oraz dist/. Publikuj oba pliki w jednym commicie. Adres instalacji zostaje ten sam. Licencja MIT.
