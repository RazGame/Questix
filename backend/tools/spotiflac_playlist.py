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
import asyncio
import os


def emit(obj):
    sys.stdout.write("\n" + json.dumps(obj, ensure_ascii=True))
    sys.stdout.flush()


def finish(obj, code=0):
    emit(obj)
    # SpotiFLAC 1.3.x может оставлять фоновые cloud-check потоки после того,
    # как результат уже готов. Node ждёт close, поэтому завершаемся жёстко.
    os._exit(code)


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


def field(t, *names, default=""):
    if hasattr(t, "model_dump"):
        data = t.model_dump()
    elif hasattr(t, "dict"):
        data = t.dict()
    elif isinstance(t, dict):
        data = t
    else:
        data = None

    for name in names:
        if data is not None:
            value = data.get(name)
        else:
            value = getattr(t, name, None)
        if value:
            return value
    return default


def to_dict(t):
    dur_ms = field(t, "duration_ms", default=0) or 0
    spotify_id = field(t, "id")
    return {
        "title": field(t, "title"),
        "artist": field(t, "artists", "album_artist"),
        "album": field(t, "album"),
        "cover": field(t, "cover_url", "avatar_url"),
        "duration": int(dur_ms / 1000),
        "sourceUrl": field(t, "external_url"),
        "preview": field(t, "preview_url"),
        "spotifyId": spotify_id,
    }


async def playlist_tracks(client, pid):
    if hasattr(client, "get_playlist_tracks_async"):
        return await client.get_playlist_tracks_async(pid)
    return client.get_playlist_tracks(pid)


async def main_async():
    if len(sys.argv) < 2:
        finish({"ok": False, "error": "usage: spotiflac_playlist.py <playlist_url_or_id> [limit]"}, 1)

    pid = playlist_id(sys.argv[1])
    if not pid:
        finish({"ok": False, "error": "Не удалось распознать ссылку на Spotify-плейлист"}, 1)

    limit = int(sys.argv[2]) if len(sys.argv) > 2 else 100

    try:
        import SpotiFLAC

        client = SpotiFLAC.SpotifyMetadataClient()
        info, tracks, _cover = await playlist_tracks(client, pid)
    except Exception as e:  # noqa: BLE001
        finish({"ok": False, "error": f"playlist import failed: {e}"}, 1)

    results = [to_dict(t) for t in (tracks or [])]
    results = [r for r in results if r["sourceUrl"]][:limit]
    finish({"ok": True, "playlist": info or {}, "results": results})


if __name__ == "__main__":
    sys.exit(asyncio.run(main_async()))
