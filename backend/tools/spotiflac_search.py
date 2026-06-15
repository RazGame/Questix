#!/usr/bin/env python3
"""
Поиск треков через SpotifyMetadataClient из модуля SpotiFLAC.

Использование:
    python spotiflac_search.py "<query>" [limit]

Печатает в stdout JSON: {"ok": true, "results": [ {...}, ... ]}
Каждый результат содержит spotify-ссылку (external_url), которую понимает
загрузчик SpotiFLAC.
"""
import json
import sys


def emit(obj):
    # ensure_ascii=True — безопасно для любой консольной кодировки Windows;
    # Node разбирает \uXXXX корректно.
    sys.stdout.write(json.dumps(obj, ensure_ascii=True))
    sys.stdout.flush()


def preview_for(client, track_id, fallback=''):
    if fallback:
        return fallback
    if not track_id:
        return ''
    try:
        return client.get_track_preview(track_id) or ''
    except Exception:  # noqa: BLE001
        return ''


def to_dict(t, client=None):
    g = lambda *names, default='': next(  # noqa: E731
        (getattr(t, n) for n in names if getattr(t, n, None)), default
    )
    dur_ms = getattr(t, 'duration_ms', 0) or 0
    spotify_id = g('id')
    preview = g('preview_url')
    if client:
        preview = preview_for(client, spotify_id, preview)
    return {
        'title': g('title'),
        'artist': g('artists', 'album_artist'),
        'album': g('album'),
        'cover': g('cover_url', 'avatar_url'),
        'duration': int(dur_ms / 1000),
        'sourceUrl': g('external_url'),
        'preview': preview,
        'spotifyId': spotify_id,
    }


def main():
    if len(sys.argv) < 2:
        emit({'ok': False, 'error': 'usage: spotiflac_search.py <query> [limit]'})
        return 1
    query = sys.argv[1]
    limit = int(sys.argv[2]) if len(sys.argv) > 2 else 12
    try:
        import SpotiFLAC
        client = SpotiFLAC.SpotifyMetadataClient()
        tracks = client.search_tracks(query, limit=limit)
    except Exception as e:  # noqa: BLE001
        emit({'ok': False, 'error': f'search failed: {e}'})
        return 1
    results = [to_dict(t, client) for t in (tracks or [])]
    results = [r for r in results if r['sourceUrl']]
    emit({'ok': True, 'results': results})
    return 0


if __name__ == '__main__':
    sys.exit(main())
