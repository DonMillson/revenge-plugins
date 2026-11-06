"""Read stream/subtitle responses from user-configured Stremio add-on manifests.

Does not access the installed add-on list or active selected stream. Optional
BitTorrent playback is resolved only via the local Stremio Desktop server.
"""
from __future__ import annotations
import hashlib
import ipaddress
import json
import re
import urllib.parse
import urllib.request

DEFAULT_TORRENTIO_ADDON = 'https://torrentio.strem.fun/manifest.json'
DEFAULT_SUBTITLE_ADDON = 'https://opensubtitles-v3.strem.io/manifest.json'
SUPPORTED_TYPES = {'movie', 'series'}
VIDEO_ID = re.compile(r'^tt\d+(?::\d+:\d+)?$')


def valid_video(kind: str, video_id: str) -> bool:
    return kind in SUPPORTED_TYPES and VIDEO_ID.fullmatch(video_id) is not None


def valid_manifest(value: str) -> str:
    value = value.strip()
    p = urllib.parse.urlsplit(value)
    if p.scheme not in ('http', 'https') or not p.hostname or p.username or p.password:
        raise ValueError('Wymagany prawidłowy adres HTTP(S) dodatku Stremio')
    if not p.path.endswith('/manifest.json'):
        raise ValueError('Adres dodatku musi kończyć się na /manifest.json')
    if p.fragment or p.query:
        raise ValueError('Adres manifestu nie może zawierać parametrów ani fragmentu')
    return value


def addon_resource(manifest: str, resource: str, kind: str, video_id: str) -> str:
    if not valid_video(kind, video_id):
        raise ValueError('Nieprawidłowy identyfikator filmu')
    return valid_manifest(manifest)[:-len('manifest.json')] + f'{resource}/{kind}/{urllib.parse.quote(video_id, safe=":")}.json'


def is_external_http(url: str) -> bool:
    """Reject local/metadata endpoints and non-HTTP streams by default."""
    try:
        p = urllib.parse.urlsplit(url)
        if p.scheme not in ('http', 'https') or not p.hostname or p.username or p.password:
            return False
        host = p.hostname.lower().rstrip('.')
        if host == 'localhost' or host.endswith('.local') or host.endswith('.internal'):
            return False
        if host in ('metadata.google.internal',):
            return False
        try:
            addresses = [ipaddress.ip_address(host)]
        except ValueError:
            # A domain's IP can change after validation; do not expose the server publicly.
            addresses = []
        return all(a.is_global for a in addresses)
    except (ValueError, AttributeError):
        return False


def get_bytes(url: str, maximum: int = 6 * 1024 * 1024) -> bytes:
    if not is_external_http(url):
        raise ValueError('Adres spoza dozwolonych źródeł HTTP(S)')
    req = urllib.request.Request(url, headers={'User-Agent': 'StremioPolskiAI/0.3'})
    with urllib.request.urlopen(req, timeout=18) as response:
        if not is_external_http(response.geturl()):
            raise ValueError('Przekierowanie do niebezpiecznego adresu')
        content = response.read(maximum + 1)
        if len(content) > maximum:
            raise ValueError('Odpowiedź jest zbyt duża')
        return content


def get_json(url: str) -> dict:
    obj = json.loads(get_bytes(url))
    if not isinstance(obj, dict):
        raise ValueError('Niepoprawna odpowiedź dodatku')
    return obj


def fetch_streams(kind: str, video_id: str, manifests: list[str], *, enable_local_torrents: bool = False) -> list[dict]:
    results = []
    for manifest in manifests[:8]:
        try:
            data = get_json(addon_resource(manifest, 'stream', kind, video_id))
            for raw in data.get('streams', [])[:20]:
                if not isinstance(raw, dict):
                    continue
                source = raw.get('url', '')
                hints = raw.get('behaviorHints') or {}
                if not isinstance(hints, dict):
                    hints = {}
                if isinstance(source, str) and is_external_http(source) and not hints.get('proxyHeaders') and not raw.get('drm'):
                    results.append({'url': source, 'name': str(raw.get('name', 'Film'))[:120],
                                    'filename': str(hints.get('filename', ''))[:180],
                                    'description': str(raw.get('title') or raw.get('description') or '')[:350],
                                    'addon': manifest, 'transport': 'https'})
                    continue
                if enable_local_torrents and isinstance(raw.get('infoHash'), str):
                    infohash = raw['infoHash'].strip()
                    idx = raw.get('fileIdx', -1)
                    if not re.fullmatch(r'[0-9a-fA-F]{40}', infohash) or not isinstance(idx, int) or not (-1 <= idx <= 50000):
                        continue
                    address = f'http://127.0.0.1:11470/{infohash.lower()}/{idx}'
                    trackers = [s[8:] for s in (raw.get('sources') or [])
                                if isinstance(s, str) and s.startswith('tracker:') and
                                urllib.parse.urlsplit(s[8:]).scheme in ('udp', 'http', 'https')]
                    if trackers:
                        address += '?' + urllib.parse.urlencode([('tr', t) for t in trackers[:12]])
                    results.append({'url': address, 'name': str(raw.get('name', 'Torrentio'))[:120],
                                    'filename': str(hints.get('filename', ''))[:180],
                                    'description': str(raw.get('title') or raw.get('description') or '')[:350],
                                    'infohash': infohash.lower(), 'file_idx': idx,
                                    'addon': manifest, 'transport': 'stremio-local-torrent'})
        except (OSError, ValueError, KeyError, TypeError, TimeoutError):
            continue
    return results


def fetch_subtitles(kind: str, video_id: str, manifests: list[str]) -> list[dict]:
    matches = []
    for manifest in manifests[:8]:
        try:
            data = get_json(addon_resource(manifest, 'subtitles', kind, video_id))
            for sub in data.get('subtitles', [])[:60]:
                if not isinstance(sub, dict) or not is_external_http(sub.get('url', '')):
                    continue
                lang = str(sub.get('lang', '')).lower()
                if lang not in ('en', 'eng', 'pl', 'pol'):
                    continue
                matches.append({'url': sub['url'], 'lang': lang, 'label': str(sub.get('label', ''))[:120]})
        except (OSError, ValueError, KeyError, TypeError, TimeoutError):
            continue
    return matches


def subtitles_from_text(payload: bytes) -> list[dict]:
    """Simple SRT/VTT cue parser; supports ordinary timed dialogue, not ASS styles."""
    data = payload.decode('utf-8-sig', errors='replace')
    if '\ufffd' in data[:1000]:
        data = payload.decode('cp1250', errors='replace')
    data = data.replace('\r\n', '\n').replace('\r', '\n')
    data = re.sub(r'^WEBVTT[^\n]*\n', '', data)
    data = re.sub(r'^NOTE[^\n]*\n(?:[^\n]*\n)*?\n', '', data, flags=re.MULTILINE)
    def seconds(value):
        p = value.replace(',', '.').split(':')
        if len(p) == 2:
            p.insert(0, '0')
        return float(p[0]) * 3600 + float(p[1]) * 60 + float(p[2])
    cues = []
    for block in re.split(r'\n\s*\n', data):
        rows = [v.strip() for v in block.split('\n') if v.strip()]
        ix = next((i for i, r in enumerate(rows) if '-->' in r), None)
        if ix is None or ix + 1 >= len(rows):
            continue
        times = rows[ix].split('-->')
        try:
            a = seconds(times[0].strip().split()[0])
            b = seconds(times[1].strip().split()[0])
            if b <= a:
                continue
        except (ValueError, IndexError):
            continue
        content = '\n'.join(rows[ix+1:]).strip()
        if content:
            cues.append({'start': a, 'end': b, 'text': content})
    return cues


def source_key(url: str) -> str:
    return hashlib.sha256(url.encode()).hexdigest()[:12]


def source_label(item: dict) -> str:
    """Short human-readable title without revealing torrent URL/trackers."""
    title = (item.get('description') or item.get('filename') or item.get('name') or 'Strumień').replace('\n', ' • ')
    return title[:180]


def preferred_source_index(items: list[dict]) -> int:
    """Prefer manageable 720p/1080p source rather than arbitrarily first 4K torrent."""
    def score(idx):
        item = items[idx]
        title = source_label(item).lower()
        if '720p' in title or '720 ' in title: priority = 0
        elif '1080p' in title or '1080 ' in title: priority = 1
        elif '480p' in title or '480 ' in title: priority = 2
        elif '2160p' in title or '4k' in title: priority = 5
        else: priority = 3
        return (priority, idx)
    if not items:
        raise ValueError('Brak źródeł wideo')
    return min(range(len(items)), key=score)
