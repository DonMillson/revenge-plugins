# Test na telefonie

Wersja beta nie ma jeszcze potwierdzonego testu w prawdziwym kliencie Discorda. Najpierw sprawdź ją na jednym telefonie z Revenge Classic.

Zainstaluj aktualną wersję 0.1.0-beta.3. Otwórz zwykły kanał tekstowy serwera, przejdź do ustawień pluginu i wybierz Odśwież tło. Sekcja Diagnostyka pokaże wersję, wynik odczytu konfiguracji i wynik wczytywania obrazu. Użyj Kopiuj diagnostykę, aby przekazać te informacje przy zgłoszeniu problemu. Jeśli przycisk jest niedostępny, zrób zrzut ekranu tej sekcji.

| Próba | Oczekiwany wynik |
| --- | --- |
| Włącz plugin i otwórz ustawienia | Widoczny opis zgodności i wynik sprawdzania kanału |
| Wyślij PNG jako właściciel w `#tlo-serwera` | Obraz za wiadomościami po odczycie kanału |
| Przewijaj historię i wyślij zwykłą wiadomość | Przewijanie, klawiatura i wysyłanie pozostają sprawne |
| Przejdź do innego kanału tego serwera | To samo tło |
| Otwórz prywatną rozmowę | Brak tapety serwera |
| Otwórz serwer bez kanału konfiguracji | Brak tej tapety |
| Wyślij drugą grafikę jako właściciel | Drugi obraz zastępuje pierwszy |
| Wyślij grafikę z innego konta członka | Tło pozostaje ustawione przez właściciela |
| Wyślij `TLO OFF` jako właściciel | Powrót oryginalnego tła |
| Włącz nową grafikę, a następnie usuń tę wiadomość | Ponowny odczyt; wcześniejsza poprawna wiadomość określa tło |
| Wyłącz plugin | Powrót oryginalnego widoku |
| Zrestartuj aplikację | Ponowny odczyt konfiguracji bez ponownej instalacji |
| Wyłącz sieć i ponownie ją włącz | Czytelny komunikat; Odśwież ponawia pobranie |
| Utracisz dostęp do `#tlo-serwera` | Po odczycie 403 tapeta jest usunięta |

Jeżeli odczyt pokazuje nazwę grafiki, ale grafika nie jest widoczna, to problem warstwy wyświetlania w tej wersji Discorda. Jeśli nie wykryto `MessagesConnected` albo `Messages`, potrzebny jest port do tego klienta. Podaj dokładne wersje Discorda i Revenge oraz tekst statusu w ustawieniach pluginu. Nie wysyłaj tokenu konta.
