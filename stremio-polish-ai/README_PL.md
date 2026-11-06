# Polski Lektor AI + Napisy PL — Torrentio bez Debrid (0.3.0)

**Eksperymentalny dodatek do Stremio Desktop na Windows 10/11.** Kontynuacja poprzedniej wersji 0.2.1, teraz skonfigurowana pod **zwykłe Torrentio (bez Real-Debrid)**. Nie musisz wrzucać filmów do folderu `media`.

## Co jest możliwe

- Odczyt informacji o torrentach z udostępnionego manifestu Torrentio (`infoHash`, `fileIdx`), a następnie odczyt torrentowego wideo przez **lokalny silnik Stremio Desktop na `127.0.0.1:11470`**.
- Tłumaczenie napisów EN na PL lub rozpoznawanie dialogów przez Whisper i tłumaczenie przez Argos. Oryginalne, dostępne napisy PL są używane przed generowaniem AI.
- Synteza polskiego lektora AI przez Edge TTS, jego synchronizacja do znaczników czasowych i miks z oryginalnym dźwiękiem przez FFmpeg.
- Gotowa wersja po ukończeniu przetwarzania pojawia się jako **osobny strumień „Polski Lektor AI • gotowy”** w Stremio; napisy jako **„Napisy PL • AI”**.
- Pamięć wygenerowanych wyników w `processed/`; serwer używa źródła wideo automatycznie i usuwa tymczasową kopię po zakończeniu.
- Test połączenia ze Stremio, podgląd kilku wersji źródła z Torrentio i opcjonalny wybór konkretnego źródła. Domyślna automatyka preferuje rozdzielczość **720p**, później 1080p.

## Instalacja (Windows)

1. Zainstaluj **Stremio Desktop** z [stremio.com](https://www.stremio.com/), następnie zaloguj się i upewnij się, że **Torrentio działa bez Debrid**. Stremio Desktop musi być otwarte na tym samym PC, na którym działa nasz dodatek.
2. Zainstaluj **Python 3.11 x64** oraz **FFmpeg i FFprobe** i dodaj je do `PATH`. Jeśli masz `winget`, możesz użyć `winget install --id Gyan.FFmpeg --exact`. Uruchom ponownie terminal po instalacji.
3. Rozpakuj ZIP i uruchom **`start_windows.bat`**. Za pierwszym razem program przygotuje wirtualne środowisko i zainstaluje biblioteki; modele rozpoznawania i tłumaczenia mogą zostać pobrane przy pierwszym zadaniu.
4. Otwórz panel `http://127.0.0.1:8765` i kliknij **Sprawdź połączenie**. Status Stremio Desktop powinien pokazać `POŁĄCZONE`; oba narzędzia FFmpeg powinny pokazać `OK`.
5. Domyślnie źródłem jest `https://torrentio.strem.fun/manifest.json`. Jeśli używasz niestandardowej konfiguracji Torrentio, otwórz konfigurator Torrentio i skopiuj **swój link instalacyjny kończący się na `/manifest.json`**, wpisz go do pola „Adres manifestu Torrentio” i kliknij **Zapisz ustawienia**. Nie wklejaj adresu konkretnego filmu ani linku magnet.
6. W Stremio → **Dodatki** dodaj manifest naszego dodatku: **`http://127.0.0.1:8765/manifest.json`** (ten adres znajdziesz też w panelu). Pozostaw program i Stremio Desktop uruchomione.
7. W Stremio rozpocznij odtwarzanie obsługiwanego filmu z Torrentio. Jeśli Twój klient Stremio wysyła zdarzenie `player?action=start`, dodatek może rozpocząć przygotowanie automatycznie na podstawie IMDb ID. Postęp zobaczysz w panelu. **To nie będzie od razu dźwięk w filmie, który już oglądasz.**
8. Po ukończeniu zamknij i otwórz film/odcinek ponownie w Stremio, aby wybrać źródło **„Polski Lektor AI • gotowy”**. Napisy możesz wybrać oddzielnie.

## Dokładny wybór wersji filmu

Stremio wysyła do naszego dodatku informację o rozpoczęciu odtwarzania i **IMDb ID**, ale **nie przekazuje informacji, który konkretnie torrent użytkownik wybrał z Torrentio**. Dlatego automatyczne tłumaczenie może dotyczyć innego wydania filmu niż aktualnie odtwarzane (np. innych scen / czasu trwania). Gdy zależy Ci na zgodności:

1. W panelu `http://127.0.0.1:8765` wpisz IMDb ID, np. `tt0133093` (film) albo `tt0944947:1:1` (serial — przykład formatu; dostępność nie jest gwarantowana).
2. Kliknij **Sprawdź źródła Torrentio**.
3. W rozwijanym polu wskaż **ten sam plik / wydanie**, które widzisz w Torrentio.
4. Kliknij **Generuj**. Przygotowana polska wersja pojawi się po zakończeniu.

Jeśli nie wybierzesz źródła, automatycznie wybierana jest preferowana, zazwyczaj lekka wersja 720p. W przypadku małej liczby seedów lub błędnego pliku przetwarzanie może się nie powieść. Wtedy spróbuj innego źródła.

## Uwaga: ograniczenia techniczne

- **Nie jest to uniwersalny lektor w czasie rzeczywistym.** Standardowy dodatek Stremio nie potrafi podmienić audio w już grającym strumieniu z Torrentio. Program musi odczytać materiał, przetworzyć go i wygenerować osobną wersję.
- **Bez Debrid** potrzebni są aktywni peerzy torrentowi; ilość seedów, rozmiar filmu i szybkość łącza wpływają na działanie. Przygotowanie może wymagać kilku–kilkudziesięciu GB wolnego dysku, w zależności od źródła.
- Serwer Stremio Desktop na `127.0.0.1:11470` jest wymagany do `infoHash` i może zachowywać się inaczej w zależności od wersji systemu / Stremio. W tej wersji sprawdzamy dostępność portu, a nie gotowość całego silnika torrentowego.
- Zewnętrzne napisy mogą pochodzić z innego wydania i nie być idealnie zsynchronizowane. Wybór wydania w panelu **nie wymusza** dopasowania napisów z zewnętrznej bazy.
- Tłumaczenie i TTS mogą popełniać błędy; zachowanie tła jest realizowane przez miks/kompresję, a nie pełne oddzielanie dialogów i muzyki.
- Edge TTS wysyła tekst do zewnętrznej usługi; rozpoznawanie Whisper i Argos można uruchomić lokalnie (modele mogą wymagać pobrania).
- Lokalne `127.0.0.1` działa tylko na **tym komputerze**, nie na TV/telefonie. Publikowanie tej aplikacji w Internecie bez autoryzacji jest niebezpieczne. Nie uruchamiaj jako administrator.
- Projekt obsługuje jedynie źródła, do których masz prawo dostępu i przetwarzania. Nie obchodzi DRM i nie zapewnia dostępności dowolnego tytułu z Torrentio.
- Zawartość `processed` jest zapisywana według identyfikatora filmu/odcinka. Jeśli zmienisz wydanie wideo i wymusisz nowe zadanie, wcześniejsze pliki wynikowe dla tego ID zostaną zastąpione.
- **Nie testowano na żywym torrencie w instalacji użytkownika ani pełnego dubbingu długiego filmu**. To prototyp wymagający testu praktycznego.

## Testy wykonane

- `python -m pytest -q` → **15 testów zaliczonych** (parsowanie Torrentio, indeksy, preview, diagnostyka, API, SRT, event player).
- Test lokalny FFmpeg: **krótkie testowe wideo** + osobny WAV → wynik MKV z zachowanym obrazem i ścieżką audio AAC oznaczoną jako `pol`.
- Pełnej syntezy Edge TTS, pobierania torrentów i odtwarzania filmu w prawdziwym Stremio nie przetestowano.

## Uruchomienie ręczne

```
python -m pip install -r requirements.txt
python -m uvicorn app:app --host 127.0.0.1 --port 8765
```

W panelu można sprawdzić `/api/diagnostics` i `/api/sources/movie/tt...` (diagnostyka / lista źródeł). Aplikacja nie odczytuje zdalnie listy dodatków Twojego konta ani aktualnie wybranego przez Ciebie torrenta.