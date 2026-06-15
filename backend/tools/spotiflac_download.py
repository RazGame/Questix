#!/usr/bin/env python3
"""
Загрузка трека в FLAC через модуль SpotiFLAC.

Использование:
    python spotiflac_download.py <track_url> <output_dir>

Печатает в stdout одну строку JSON с результатом:
    {"ok": true,  "file": "C:\\...\\media\\<file>.flac"}
    {"ok": false, "error": "..."}

Поиск аудиофайла происходит по содержимому output_dir после работы модуля —
SpotiFLAC сам именует файл по тегам, поэтому мы просто берём свежесозданный
аудиофайл из папки.
"""
import json
import os
import sys
import time
import glob

AUDIO_EXT = (".flac", ".mp3", ".m4a", ".ogg", ".opus", ".wav")


def emit(obj):
    # ensure_ascii=True — безопасно для любой консольной кодировки Windows.
    sys.stdout.write(json.dumps(obj, ensure_ascii=True))
    sys.stdout.flush()


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


def main():
    if len(sys.argv) < 3:
        emit({"ok": False, "error": "usage: spotiflac_download.py <url> <output_dir>"})
        return 1

    url = sys.argv[1]
    out_dir = sys.argv[2]
    # Качество: по умолчанию HIGH (легче FLAC). Можно передать LOSSLESS/HIGH/LOW.
    quality = sys.argv[3] if len(sys.argv) > 3 else "HIGH"
    os.makedirs(out_dir, exist_ok=True)

    before = set(glob.glob(os.path.join(out_dir, "**", "*"), recursive=True))
    started = time.time()

    try:
        SpotiFLAC = import_spotiflac()
        # Запускаем загрузку. Сигнатура по README модульной версии.
        SpotiFLAC(
            url=url,
            output_dir=out_dir,
            services=["tidal", "qobuz", "deezer", "amazon"],
            quality=quality,
        )
    except TypeError:
        # Иная сигнатура — пробуем без quality, затем минимальный вариант.
        try:
            SpotiFLAC(url=url, output_dir=out_dir, quality=quality)  # noqa: F821
        except Exception:  # noqa: BLE001
            try:
                SpotiFLAC(url=url, output_dir=out_dir)  # noqa: F821
            except Exception as e:  # noqa: BLE001
                emit({"ok": False, "error": f"download failed: {e}"})
                return 1
    except Exception as e:  # noqa: BLE001
        emit({"ok": False, "error": f"download failed: {e}"})
        return 1

    # Ищем новый аудиофайл.
    after = set(glob.glob(os.path.join(out_dir, "**", "*"), recursive=True))
    new_files = [
        f for f in (after - before)
        if os.path.isfile(f) and f.lower().endswith(AUDIO_EXT)
    ]
    if not new_files:
        # fallback: самый свежий аудиофайл, созданный после старта
        candidates = [
            f for f in after
            if os.path.isfile(f)
            and f.lower().endswith(AUDIO_EXT)
            and os.path.getmtime(f) >= started - 1
        ]
        new_files = candidates

    if not new_files:
        emit({"ok": False, "error": "файл не найден после загрузки"})
        return 1

    new_files.sort(key=os.path.getmtime, reverse=True)
    emit({"ok": True, "file": os.path.abspath(new_files[0])})
    return 0


if __name__ == "__main__":
    sys.exit(main())
