"""Local video -> Polish subtitles -> Polish AI narration -> dubbed MKV."""
from __future__ import annotations
import asyncio
import json
import os
import subprocess
import tempfile
import wave
from pathlib import Path
from typing import Callable
from core import write_srt

RATE = 24000
VOICE = os.getenv('AI_VOICE', 'pl-PL-MarekNeural')
MODEL_NAME = os.getenv('WHISPER_MODEL', 'base')


def execute(command: list[str]) -> subprocess.CompletedProcess:
    try:
        return subprocess.run(command, check=True, capture_output=True, text=True, encoding='utf-8', errors='replace')
    except FileNotFoundError as error:
        raise RuntimeError(f'Brak programu: {command[0]} (dodaj FFmpeg/FFprobe do PATH)') from error
    except subprocess.CalledProcessError as error:
        raise RuntimeError(f'{command[0]} nie wykonał operacji:\n{error.stderr[-1800:]}') from error


def probe_media(path: Path) -> dict:
    result = execute(['ffprobe', '-v', 'error', '-show_streams', '-show_format', '-of', 'json', str(path)])
    return json.loads(result.stdout)


def has_polish_track(probe: dict, codec_type: str) -> bool:
    for stream in probe.get('streams', []):
        if stream.get('codec_type') != codec_type:
            continue
        tags = {k.lower(): str(v).lower() for k, v in stream.get('tags', {}).items()}
        if tags.get('language', '') in {'pl', 'pol', 'polish'} or 'polski' in tags.get('title', '') or 'polish' in tags.get('title', ''):
            return True
    return False


def get_duration(probe: dict) -> float:
    return float(probe.get('format', {}).get('duration') or 0)


def translate_to_polish(texts: list[str]) -> list[str]:
    from argostranslate import package, translate
    try:
        available = [(p.from_code, p.to_code) for p in package.get_installed_packages()]
        if ('en', 'pl') not in available:
            package.update_package_index()
            models = [p for p in package.get_available_packages() if p.from_code == 'en' and p.to_code == 'pl']
            if not models:
                raise RuntimeError('Nie znaleziono pakietu Argos Translate en -> pl. Sprawdź Internet.')
            package.install_from_path(models[0].download())
        return [translate.translate(t, 'en', 'pl') if t.strip() else '' for t in texts]
    except Exception as error:
        raise RuntimeError('Nie udało się zainstalować lub uruchomić tłumaczenia en -> pl: ' + str(error)) from error


def transcribe_and_translate(video: Path, stage: Callable[[str], None]) -> list[dict]:
    from faster_whisper import WhisperModel
    stage('Rozpoznawanie języka i dialogów (Whisper)')
    model = WhisperModel(MODEL_NAME, device='cpu', compute_type='int8')
    segments, info = model.transcribe(str(video), task='transcribe', beam_size=3, vad_filter=True)
    if info.language == 'pl':
        return [dict(start=float(s.start), end=float(s.end), text=s.text.strip()) for s in segments]
    if info.language != 'en':
        stage(f'Przekład {info.language} -> angielski (Whisper)')
        segments, _ = model.transcribe(str(video), task='translate', beam_size=3, vad_filter=True)
    transcript = [dict(start=float(s.start), end=float(s.end), text=s.text.strip()) for s in segments]
    stage('Tłumaczenie dialogów na polski (Argos)')
    translated = translate_to_polish([s['text'] for s in transcript])
    for segment, value in zip(transcript, translated):
        segment['text'] = value
    return transcript


def compress_voice(mp3: Path, wav: Path, allowed_duration: float) -> bytes:
    pcm = execute(['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'default=nokey=1:noprint_wrappers=1', str(mp3)])
    original_duration = float(pcm.stdout.strip())
    tempo = max(1.0, original_duration / max(0.40, allowed_duration))
    filters = []
    while tempo > 2.0:
        filters.append('atempo=2.0')
        tempo /= 2.0
    if tempo > 1.001:
        filters.append(f'atempo={tempo:.5f}')
    command = ['ffmpeg', '-hide_banner', '-loglevel', 'error', '-y', '-i', str(mp3)]
    if filters:
        command += ['-af', ','.join(filters)]
    command += ['-ar', str(RATE), '-ac', '1', '-c:a', 'pcm_s16le', str(wav)]
    execute(command)
    with wave.open(str(wav), 'rb') as src:
        return src.readframes(src.getnframes())


def write_silence(writer, frames: int):
    while frames > 0:
        n = min(frames, RATE)
        writer.writeframesraw(b'\0\0' * n)
        frames -= n


def create_voice_track(segments: list[dict], voice_wav: Path, duration: float, stage: Callable[[str], None]):
    import edge_tts
    with tempfile.TemporaryDirectory(prefix='stremio_voice_') as tmp:
        tmp_path = Path(tmp)
        with wave.open(str(voice_wav), 'wb') as w:
            w.setnchannels(1)
            w.setsampwidth(2)
            w.setframerate(RATE)
            cursor = 0
            total = len(segments)
            for i, segment in enumerate(segments):
                content = segment['text'].strip()
                if not content:
                    continue
                start = max(cursor, round(segment['start'] * RATE))
                if start > cursor:
                    write_silence(w, start - cursor)
                    cursor = start
                following = segments[i+1]['start'] if i+1 < len(segments) else duration
                allowance = max(0.4, min(float(segment['end']) + 0.15, float(following) - 0.05, duration) - (cursor / RATE))
                if allowance <= 0:
                    continue
                mp3, wav = tmp_path / 'phrase.mp3', tmp_path / 'phrase.wav'
                asyncio.run(edge_tts.Communicate(content, VOICE).save(str(mp3)))
                frames = compress_voice(mp3, wav, allowance)
                maximum = max(0, round(allowance * RATE)) * 2
                frames = frames[:maximum]
                w.writeframesraw(frames)
                cursor += len(frames) // 2
                if i % 12 == 0 or i == total - 1:
                    stage(f'Lektor AI: {i+1}/{total} fragmentów')
            remaining = max(0, round(duration * RATE) - cursor)
            write_silence(w, remaining)


def mux_dub(video: Path, voice: Path, out: Path):
    tmp = out.with_suffix('.partial.mkv')
    graph = ('[1:a:0]asplit=2[side][narr];'
             '[0:a:0][side]sidechaincompress=threshold=0.018:ratio=7:attack=20:release=500[bg];'
             '[bg][narr]amix=inputs=2:duration=first:weights=1 1.25:normalize=0[mix]')
    cmd = ['ffmpeg', '-hide_banner', '-loglevel', 'error', '-y', '-i', str(video), '-i', str(voice),
           '-filter_complex', graph, '-map', '0:v:0', '-map', '[mix]', '-c:v', 'copy',
           '-c:a', 'aac', '-b:a', '192k', '-metadata:s:a:0', 'language=pol',
           '-metadata:s:a:0', 'title=Polski lektor AI', '-f', 'matroska', str(tmp)]
    execute(cmd)
    tmp.replace(out)


def generate(video: Path, output_dir: Path, stage: Callable[[str], None]) -> dict:
    output_dir.mkdir(parents=True, exist_ok=True)
    info = probe_media(video)
    duration = get_duration(info)
    if duration <= 0:
        raise RuntimeError('Nie można odczytać długości filmu')
    if not any(s.get('codec_type') == 'audio' for s in info.get('streams', [])):
        raise RuntimeError('Plik nie ma ścieżki dźwiękowej')
    srt = output_dir / 'napisy_pl.srt'
    dubbed = output_dir / 'lektor_pl.mkv'
    if not srt.exists():
        items = transcribe_and_translate(video, stage)
        if not items:
            raise RuntimeError('Nie wykryto dialogów do przetłumaczenia')
        write_srt(items, srt)
        (output_dir / 'dialogi.json').write_text(json.dumps(items, ensure_ascii=False, indent=2), encoding='utf-8')
        stage('Napisy PL gotowe; przygotowywanie lektora')
    else:
        items = json.loads((output_dir / 'dialogi.json').read_text(encoding='utf-8'))
        stage('Wczytano zapisane napisy PL')
    if not dubbed.exists():
        if has_polish_track(info, 'audio'):
            stage('Oryginalny materiał ma oznaczoną polską ścieżkę audio — pomijam AI')
        else:
            track = output_dir / 'narration.wav'
            if not track.exists():
                create_voice_track(items, track, duration, stage)
            stage('Łączenie lektora z filmem (FFmpeg)')
            mux_dub(video, track, dubbed)
            track.unlink(missing_ok=True)
    return {'srt': srt.exists(), 'dub': dubbed.exists(), 'pl_audio_in_source': has_polish_track(info, 'audio')}


def generate_subtitles_only(video: Path, output_dir: Path, stage: Callable[[str], None]) -> dict:
    output_dir.mkdir(parents=True, exist_ok=True)
    srt = output_dir / 'napisy_pl.srt'
    if srt.is_file() and (output_dir / 'dialogi.json').is_file():
        return {'srt': True, 'dub': False}
    items = transcribe_and_translate(video, stage)
    if not items:
        raise RuntimeError('Nie wykryto dialogów do przetłumaczenia')
    write_srt(items, srt)
    (output_dir / 'dialogi.json').write_text(json.dumps(items, ensure_ascii=False, indent=2), encoding='utf-8')
    return {'srt': True, 'dub': False}
