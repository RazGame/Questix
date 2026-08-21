#!/usr/bin/env python3
"""
Загрузка трека через модуль SpotiFLAC.

Использование:
    python spotiflac_download.py <track_url> <output_dir> [quality]

Печатает в stdout одну строку JSON с результатом:
    {"ok": true,  "file": "/.../media/<file>.<ext>"}
    {"ok": false, "error": "..."}

Провайдеры берутся из env MUSIC_SERVICES (через запятую). По умолчанию
используем только youtube: он отдаёт браузерный m4a, а lossless-мосты
часто тянут внешний cloud registry и подвешивают загрузку. Файл остаётся
ровно в том формате, который вернул провайдер.

Поиск аудиофайла происходит по содержимому output_dir после работы модуля —
SpotiFLAC сам именует файл по тегам, поэтому мы просто берём свежесозданный
аудиофайл из папки.
"""
import json
import os
import sys
import time
import glob
import subprocess

AUDIO_EXT = (".flac", ".mp3", ".m4a", ".ogg", ".opus", ".wav", ".webm")

DEFAULT_SERVICES = "youtube"


def wanted_services():
    raw = os.environ.get("MUSIC_SERVICES", DEFAULT_SERVICES)
    return [s.strip().lower() for s in raw.split(",") if s.strip()]


def emit(obj):
    # ensure_ascii=True — безопасно для любой консольной кодировки Windows.
    # Ведущий \n отделяет JSON от возможного вывода SpotiFLAC без переноса строки.
    sys.stdout.write("\n" + json.dumps(obj, ensure_ascii=True))
    sys.stdout.flush()


def finish(obj, code=0):
    emit(obj)
    # SpotiFLAC 1.3.x может оставлять фоновые cloud-check потоки уже после
    # успешной загрузки. Node ждёт close, поэтому завершаемся сразу после JSON.
    os._exit(code)


def import_spotiflac():
    """Пытаемся импортировать класс SpotiFLAC из разных возможных мест."""
    errors = []
    for modname in ("spotiflac", "SpotiFLAC", "backend"):
        try:
            mod = __import__(modname)
            cls = getattr(mod, "SpotiFLAC", None)
            if cls is not None:
                return cls
        except Exception as e:  # noqa: BLE001
            errors.append(f"{modname}: {e}")
    raise ImportError(
        "Не удалось импортировать SpotiFLAC. Установите: pip install SpotiFLAC. "
        + " | ".join(errors)
    )


def find_audio_files(out_dir, before, started):
    after = set(glob.glob(os.path.join(out_dir, "**", "*"), recursive=True))
    new_files = [
        f for f in (after - before)
        if os.path.isfile(f) and f.lower().endswith(AUDIO_EXT)
    ]
    if not new_files:
        new_files = [
            f for f in after
            if os.path.isfile(f)
            and f.lower().endswith(AUDIO_EXT)
            and os.path.getmtime(f) >= started - 1
        ]
    new_files.sort(key=os.path.getmtime, reverse=True)
    return new_files


def parse_duration(value):
    try:
        seconds = float(value)
        return seconds if seconds > 0 else None
    except Exception:  # noqa: BLE001
        return None


def yt_dlp_fallback(title, artist, duration, out_dir, started):
    """Direct YouTube fallback for cases where SpotiFLAC matches a wrong-length video.

    SpotiFLAC removes files that fail duration validation. For popular/new tracks its
    internal YouTube query can occasionally choose a remix or long video. A targeted
    yt-dlp search with a duration check is good enough for game snippets and keeps
    the admin workflow alive.
    """
    query = " ".join(part for part in [artist, title, "audio"] if part).strip()
    if not query:
        return None

    expected = parse_duration(duration)
    dump = subprocess.run(
        ["yt-dlp", "--dump-json", f"ytsearch10:{query}"],
        cwd=out_dir,
        text=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.DEVNULL,
        timeout=90,
        check=False,
    )
    if dump.returncode != 0 or not dump.stdout.strip():
        return None

    candidates = []
    for line in dump.stdout.splitlines():
        try:
            item = json.loads(line)
        except Exception:  # noqa: BLE001
            continue
        url = item.get("webpage_url")
        got_duration = parse_duration(item.get("duration"))
        if not url or not got_duration:
            continue
        delta = abs(got_duration - expected) if expected else 0
        if expected and delta > max(8, expected * 0.08):
            continue
        candidates.append((delta, url))

    if not candidates:
        return None

    candidates.sort(key=lambda x: x[0])
    dest = os.path.join(out_dir, "yt-dlp-fallback.%(ext)s")
    download = subprocess.run(
        [
            "yt-dlp",
            "-f",
            "bestaudio[ext=m4a]/bestaudio",
            "--no-playlist",
            "-o",
            dest,
            candidates[0][1],
        ],
        cwd=out_dir,
        text=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        timeout=180,
        check=False,
    )
    if download.returncode != 0:
        return None

    files = find_audio_files(out_dir, set(), started)
    return files[0] if files else None


def main():
    if len(sys.argv) < 3:
        finish({"ok": False, "error": "usage: spotiflac_download.py <url> <output_dir>"}, 1)

    url = sys.argv[1]
    out_dir = sys.argv[2]
    # Качество: по умолчанию HIGH — без lossless-тяжести, но достаточно хорошо для игры.
    quality = sys.argv[3] if len(sys.argv) > 3 else "HIGH"
    os.makedirs(out_dir, exist_ok=True)

    before = set(glob.glob(os.path.join(out_dir, "**", "*"), recursive=True))
    started = time.time()
    services = wanted_services()

    try:
        SpotiFLAC = import_spotiflac()
        # Запускаем загрузку. Сигнатура по README модульной версии.
        SpotiFLAC(
            url=url,
            output_dir=out_dir,
            services=services,
            quality=quality,
            embed_lyrics=False,
            enrich_metadata=False,
            post_download_action="none",
            track_max_retries=0,
        )
    except TypeError:
        # Иная сигнатура — пробуем без quality, затем минимальный вариант.
        try:
            SpotiFLAC(url=url, output_dir=out_dir, quality=quality)  # noqa: F821
        except Exception:  # noqa: BLE001
            try:
                SpotiFLAC(url=url, output_dir=out_dir)  # noqa: F821
            except Exception as e:  # noqa: BLE001
                finish({"ok": False, "error": f"download failed: {e}"}, 1)
    except Exception as e:  # noqa: BLE001
        finish({"ok": False, "error": f"download failed: {e}"}, 1)

    # Ищем новый аудиофайл.
    new_files = find_audio_files(out_dir, before, started)
    if not new_files:
        fallback = yt_dlp_fallback(
            title=sys.argv[4] if len(sys.argv) > 4 else "",
            artist=sys.argv[5] if len(sys.argv) > 5 else "",
            duration=sys.argv[6] if len(sys.argv) > 6 else os.environ.get("MUSIC_EXPECTED_DURATION", ""),
            out_dir=out_dir,
            started=started,
        )
        if fallback:
            finish({"ok": True, "file": os.path.abspath(fallback)})
        finish({"ok": False, "error": "файл не найден после загрузки"}, 1)

    finish({"ok": True, "file": os.path.abspath(new_files[0])})


if __name__ == "__main__":
    sys.exit(main())
