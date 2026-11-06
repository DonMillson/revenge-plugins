# Polski Lektor AI — projekt Stremio (wersja rozwojowa)

To osobny projekt Stremio umieszczony tymczasowo w katalogu `stremio-polish-ai/` repozytorium DonMillson/revenge-plugins. **Nie jest pluginem Revenge.** Nie zmienia istniejących wtyczek.

**Status:** prototyp lokalny v0.3.0, bez hostingu i publicznego linku instalacyjnego Stremio. Sam kod na GitHubie nie uruchamia AI ani torrentów. `manifest.json` musi być generowany przez działającą usługę HTTP(S), a nie przez GitHub Pages.

Wersja lokalna wykorzystuje Stremio Desktop Windows + Torrentio bez Debrid, Whisper, Argos Translate, Edge TTS i FFmpeg. Posiada ograniczenia dokładnie opisane w [README_PL.md](README_PL.md). W repozytorium nie publikujemy przetworzonych filmów ani cudzych treści.

**Do uruchomienia publicznego HTTPS** potrzebne są: odrębny proces serwera API, silnik odczytu legalnych źródeł torrentowych na tym serwerze, kolejka zadań, storage, konta/autoryzacja, limity kosztów i zabezpieczenia dostępu; hosting statyczny (GitHub Pages/Netlify) nie wystarczy.

Nie wpisuj `raw.githubusercontent.com/.../manifest.json` jako gotowego dodatku, ponieważ sam statyczny manifest nie wystarczy do lektora. Używaj tylko treści, do których masz prawo dostępu i przetwarzania.
