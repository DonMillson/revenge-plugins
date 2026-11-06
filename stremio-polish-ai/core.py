"""Small dependency-free helpers for Stremio Polish AI MVP."""
from __future__ import annotations
import re
from pathlib import Path

VIDEO_SUFFIXES = {'.mp4', '.mkv', '.webm', '.mov', '.avi', '.m4v'}
NAME_RE = re.compile(r'^(tt\d+)(?:_s(\d+)e(\d+))?__(.+)$', re.IGNORECASE)


def video_id_from_filename(filename: str) -> tuple[str, str] | None:
    p = Path(filename)
    if p.suffix.lower() not in VIDEO_SUFFIXES:
        return None
    match = NAME_RE.match(p.stem)
    if not match:
        return None
    imdb, season, episode, _ = match.groups()
    imdb = imdb.lower()
    if season is not None:
        return ('series', f'{imdb}:{int(season)}:{int(episode)}')
    return ('movie', imdb)


def cache_key(video_id: str) -> str:
    if not re.fullmatch(r'tt\d+(?::\d+:\d+)?', video_id):
        raise ValueError('Niepoprawny identyfikator wideo')
    return video_id.replace(':', '_')


def subtitle_timestamp(seconds: float) -> str:
    total_ms = max(0, round(seconds * 1000))
    hours, rem = divmod(total_ms, 3_600_000)
    minutes, rem = divmod(rem, 60_000)
    sec, ms = divmod(rem, 1_000)
    return f'{hours:02}:{minutes:02}:{sec:02},{ms:03}'


def write_srt(segments: list[dict], output: Path) -> None:
    lines = []
    for n, seg in enumerate(segments, start=1):
        if not seg.get('text', '').strip():
            continue
        lines += [str(n), f"{subtitle_timestamp(float(seg['start']))} --> {subtitle_timestamp(float(seg['end']))}", seg['text'].strip(), '']
    output.write_text('\n'.join(lines), encoding='utf-8-sig')
