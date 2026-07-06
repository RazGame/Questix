#!/usr/bin/env python3
"""
Быстрый поиск треков в Spotify Web API.

Использование:
    python spotiflac_search.py "<query>" [limit]

Печатает в stdout JSON: {"ok": true, "results": [ {...}, ... ]}

Важно: для поиска не импортируем SpotiFLAC. В 1.3.x импорт пакета запускает
cloud registry checks, которые при сетевых проблемах держат процесс до пары
минут. Для загрузки всё равно сохраняем sourceUrl как open.spotify.com/track.
"""
import base64
import hashlib
import hmac
import json
import os
import re
import struct
import sys
import time
import urllib.parse

import httpx

SEARCH_HASH = "fcad5a3e0d5af727fb76966f06971c19cfa2275e6ff7671196753e008611873c"
USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36"
)

TOTP_VERSION = 61
TOTP_SECRET = [
    44, 55, 47, 42, 70, 40, 34, 114, 76, 74, 50, 111, 120,
    97, 75, 76, 94, 102, 43, 69, 49, 120, 118, 80, 64, 78,
]
BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567"


def emit(obj):
    sys.stdout.write("\n" + json.dumps(obj, ensure_ascii=True))
    sys.stdout.flush()


def finish(obj, code=0):
    emit(obj)
    os._exit(code)


def base32_encode(data):
    result = []
    bits = 0
    value = 0
    for byte in data:
        value = (value << 8) | byte
        bits += 8
        while bits >= 5:
            result.append(BASE32_ALPHABET[(value >> (bits - 5)) & 31])
            bits -= 5
    if bits > 0:
        result.append(BASE32_ALPHABET[(value << (5 - bits)) & 31])
    return "".join(result)


def base32_decode(value):
    value = value.upper().rstrip("=")
    result = []
    bits = 0
    acc = 0
    for char in value:
        idx = BASE32_ALPHABET.find(char)
        if idx < 0:
            continue
        acc = (acc << 5) | idx
        bits += 5
        if bits >= 8:
            result.append((acc >> (bits - 8)) & 0xFF)
            bits -= 8
    return bytes(result)


def spotify_totp():
    transformed = [value ^ ((i % 33) + 9) for i, value in enumerate(TOTP_SECRET)]
    joined = "".join(str(n) for n in transformed)
    hex_str = "".join(format(ord(ch), "02x") for ch in joined)
    raw = bytes(int(hex_str[i:i + 2], 16) for i in range(0, len(hex_str), 2))
    key = base32_decode(base32_encode(raw))
    counter = int(time.time()) // 30
    digest = hmac.new(key, struct.pack(">Q", counter), hashlib.sha1).digest()
    offset = digest[-1] & 0x0F
    code = (
        ((digest[offset] & 0x7F) << 24)
        | ((digest[offset + 1] & 0xFF) << 16)
        | ((digest[offset + 2] & 0xFF) << 8)
        | (digest[offset + 3] & 0xFF)
    )
    return str(code % 1_000_000).zfill(6)


def image_url(node):
    if not isinstance(node, dict):
        return ""
    direct = node.get("url") or node.get("src") or node.get("href")
    if isinstance(direct, str) and direct:
        return direct
    sources = node.get("sources")
    if sources is None:
        square = node.get("squareCoverImage", {}).get("image", {}).get("data", {})
        if isinstance(square, dict):
            sources = square.get("sources")
    if not isinstance(sources, list):
        return ""
    fallback = ""
    preferred = ""
    for source in sources:
        if not isinstance(source, dict):
            continue
        url = source.get("url")
        if not isinstance(url, str) or not url:
            continue
        width = source.get("width") or source.get("maxWidth") or 0
        height = source.get("height") or source.get("maxHeight") or 0
        if width in (300, 640):
            return url
        if width >= 300 and height >= 300 and not preferred:
            preferred = url
        if not fallback:
            fallback = url
    return preferred or fallback


def join_artists(node):
    items = node.get("items", []) if isinstance(node, dict) else []
    names = []
    for item in items:
        data = item.get("profile") or item.get("data", {}).get("profile", {})
        name = data.get("name") if isinstance(data, dict) else ""
        if name:
            names.append(name)
    return ", ".join(names)


def duration_ms(value):
    if isinstance(value, dict):
        value = value.get("totalMilliseconds") or value.get("milliseconds") or value.get("isoString")
    try:
        return int(value or 0)
    except (TypeError, ValueError):
        return 0


def spotify_client():
    client = httpx.Client(timeout=12.0, follow_redirects=True, headers={"User-Agent": USER_AGENT})
    home = client.get("https://open.spotify.com")
    home.raise_for_status()

    client_version = ""
    match = re.search(r'<script[^>]+id=["\']appServerConfig["\'][^>]*>([^<]+)</script>', home.text, re.I)
    if match:
        try:
            config = json.loads(base64.b64decode(match.group(1)).decode("utf-8"))
            client_version = config.get("clientVersion", "")
        except Exception:
            client_version = ""
    if not client_version:
        fallback = re.search(r'"clientVersion"\s*:\s*"([^"]+)"', home.text)
        client_version = fallback.group(1) if fallback else ""

    device_id = client.cookies.get("sp_t", "")
    code = spotify_totp()
    token_resp = client.get(
        "https://open.spotify.com/api/token",
        params={
            "reason": "init",
            "productType": "web-player",
            "totp": code,
            "totpVer": str(TOTP_VERSION),
            "totpServer": code,
        },
        headers={"Content-Type": "application/json;charset=UTF-8"},
    )
    token_resp.raise_for_status()
    token_data = token_resp.json()
    access_token = token_data.get("accessToken", "")
    client_id = token_data.get("clientId", "")
    device_id = device_id or client.cookies.get("sp_t", "")

    client_token_resp = client.post(
        "https://clienttoken.spotify.com/v1/clienttoken",
        json={
            "client_data": {
                "client_version": client_version,
                "client_id": client_id,
                "js_sdk_data": {
                    "device_brand": "unknown",
                    "device_model": "unknown",
                    "os": "windows",
                    "os_version": "NT 10.0",
                    "device_id": device_id,
                    "device_type": "computer",
                },
            }
        },
        headers={"Content-Type": "application/json", "Accept": "application/json"},
    )
    client_token_resp.raise_for_status()
    granted = client_token_resp.json().get("granted_token", {}).get("token", "")
    return client, access_token, granted, client_version


def search_tracks(query, limit):
    client, access_token, client_token, client_version = spotify_client()
    payload = {
        "operationName": "searchDesktop",
        "variables": {
            "searchTerm": query,
            "offset": 0,
            "limit": limit,
            "numberOfTopResults": 5,
            "includeAudiobooks": True,
            "includeArtistHasConcertsField": False,
            "includePreReleases": True,
            "includeAuthors": False,
        },
        "extensions": {"persistedQuery": {"version": 1, "sha256Hash": SEARCH_HASH}},
    }
    response = client.post(
        "https://api-partner.spotify.com/pathfinder/v2/query",
        json=payload,
        headers={
            "Authorization": f"Bearer {access_token}",
            "Client-Token": client_token,
            "Spotify-App-Version": client_version,
            "Content-Type": "application/json",
        },
    )
    response.raise_for_status()
    data = response.json().get("data", {}).get("searchV2", {})
    tracks = data.get("tracksV2") or data.get("tracks") or {}
    results = []
    for item in tracks.get("items", []):
        track = item.get("item", {}).get("data", {})
        track_id = track.get("id")
        if not track_id:
            continue
        album = track.get("albumOfTrack", {})
        results.append({
            "title": track.get("name", ""),
            "artist": join_artists(track.get("artists", {})),
            "album": album.get("name", ""),
            "cover": image_url(album.get("coverArt", {})),
            "duration": int(duration_ms(track.get("duration")) / 1000),
            "sourceUrl": f"https://open.spotify.com/track/{track_id}",
            "preview": "",
            "spotifyId": track_id,
        })
    return results


def main():
    if len(sys.argv) < 2:
        finish({"ok": False, "error": "usage: spotiflac_search.py <query> [limit]"}, 1)
    query = sys.argv[1]
    limit = int(sys.argv[2]) if len(sys.argv) > 2 else 12
    try:
        finish({"ok": True, "results": search_tracks(query, limit)})
    except Exception as e:  # noqa: BLE001
        finish({"ok": False, "error": f"search failed: {e}"}, 1)


if __name__ == "__main__":
    main()
