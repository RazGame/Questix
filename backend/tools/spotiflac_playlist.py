#!/usr/bin/env python3
"""
Импорт треков Spotify-плейлиста через SpotifyMetadataClient из SpotiFLAC.

Использование:
    python spotiflac_playlist.py <playlist_url_or_id> [limit]

Печатает JSON:
    {"ok": true, "playlist": {...}, "results": [{...}, ...]}
"""
import json
import re
import sys


def emit(obj):
    sys.stdout.write(json.dumps(obj, ensure_ascii=True))
    sys.stdout.flush()


def playlist_id(value):
    value = (value or "").strip()
    if not value:
        return ""
    match = re.search(r"playlist/([A-Za-z0-9]+)", value)
    if match:
        return match.group(1)
    match = re.search(r"spotify:playlist:([A-Za-z0-9]+)", value)
    if match:
        return match.group(1)
    if re.fullmatch(r"[A-Za-z0-9]+", value):
        return value
    return ""


def preview_for(client, track_id, fallback=""):
    if fallback:
        return fallback
    if not track_id:
        return ""
    try:
        return client.get_track_preview(track_id) or ""
    except Exception:  # noqa: BLE001
        return ""


def to_dict(t, client=None):
    g = lambda *names, default="": next(  # noqa: E731
        (getattr(t, n) for n in names if getattr(t, n, None)), default
    )
    dur_ms = getattr(t, "duration_ms", 0) or 0
    spotify_id = g("id")
    preview = g("preview_url")
    if client:
        preview = preview_for(client, spotify_id, preview)
    return {
        "title": g("title"),
        "artist": g("artists", "album_artist"),
        "album": g("album"),
        "cover": g("cover_url", "avatar_url"),
        "duration": int(dur_ms / 1000),
        "sourceUrl": g("external_url"),
        "preview": preview,
        "spotifyId": spotify_id,
    }


def main():
    if len(sys.argv) < 2:
        emit({"ok": False, "error": "usage: spotiflac_playlist.py <playlist_url_or_id> [limit]"})
        return 1

    pid = playlist_id(sys.argv[1])
    if not pid:
        emit({"ok": False, "error": "Не удалось распознать ссылку на Spotify-плейлист"})
        return 1

    limit = int(sys.argv[2]) if len(sys.argv) > 2 else 100

    try:
        import SpotiFLAC

        client = SpotiFLAC.SpotifyMetadataClient()
        info, tracks, _cover = client.get_playlist_tracks(pid)
    except Exception as e:  # noqa: BLE001
        emit({"ok": False, "error": f"playlist import failed: {e}"})
        return 1

    results = [to_dict(t, client) for t in (tracks or [])]
    results = [r for r in results if r["sourceUrl"]][:limit]
    emit({"ok": True, "playlist": info or {}, "results": results})
    return 0


if __name__ == "__main__":
    sys.exit(main())
