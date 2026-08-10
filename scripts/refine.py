"""
Уточнение отрезков по звуку.

ВАЖНО: припев здесь НЕ ищется — попытка искать его автоматически провалилась
(лучший вариант давал 11% попаданий в +-5 с, проверено на 94 песнях с ручными
отрезками). Начало отрезка берётся из scripts/playlist-spec.cjs, то есть по
знанию трека. Звук нужен только для двух вещей:

  1. поймать грубую ошибку — отрезок попал в тишину или в еле слышный проигрыш;
  2. подтянуть старт к ближайшему заметному вступлению в пределах +-4 с,
     чтобы не обрывать музыку на полуслове.

Выход: JSON со списком {id, start, end, note} — note заполняется, если было
что-то подозрительное и стоит послушать вручную.
"""
import json, subprocess, sys, numpy as np

SR = 11025
FPS = 8  # кадров огибающей в секунду


def envelope(path):
    p = subprocess.run(
        ['ffmpeg', '-v', 'quiet', '-i', path, '-ac', '1', '-ar', str(SR), '-f', 's16le', '-'],
        capture_output=True)
    x = np.frombuffer(p.stdout[:len(p.stdout) // 2 * 2], dtype=np.int16).astype(np.float32)
    if x.size < SR * 5:
        return None
    n = SR // FPS
    frames = x[:x.size // n * n].reshape(-1, n)
    return np.sqrt((frames ** 2).mean(1))


def refine(env, start, seg=20.0, look=4.0):
    """Подтягиваем старт к ближайшему подъёму громкости и проверяем на тишину."""
    dur = len(env) / FPS
    note = ''
    start = max(0.0, min(start, max(0.0, dur - seg)))

    med = float(np.median(env[env > 0])) if np.any(env > 0) else 0.0
    if med <= 0:
        return start, start + seg, 'файл тихий целиком — проверить'

    lo = max(0, int((start - look) * FPS))
    hi = min(len(env) - 1, int((start + look) * FPS))
    if hi > lo:
        window = env[lo:hi + 1]
        # самый резкий подъём громкости в окне поиска — обычно вход припева
        d = np.diff(window)
        if d.size:
            jump = int(np.argmax(d))
            cand = (lo + jump + 1) / FPS
            if abs(cand - start) <= look and window[jump + 1] > med * 0.9:
                start = cand

    a, b = int(start * FPS), int(min(dur, start + seg) * FPS)
    level = float(env[a:b].mean()) if b > a else 0.0
    if level < med * 0.45:
        note = 'отрезок заметно тише трека — возможно, попал в проигрыш'

    end = min(dur, start + seg)
    if end - start < seg - 1:
        start = max(0.0, end - seg)
        note = note or 'трек короче отрезка — сдвинул к концу'
    return round(start), round(end), note


def main():
    jobs = json.load(open(sys.argv[1], encoding='utf-8'))
    out = []
    for j in jobs:
        try:
            env = envelope('/app/media/' + j['file'])
            if env is None:
                out.append({**j, 'start': j['start'], 'end': j['start'] + 20, 'note': 'не читается'})
                continue
            s, e, note = refine(env, float(j['start']))
            out.append({'id': j['id'], 'start': s, 'end': e, 'note': note,
                        'was': j['start'], 'artist': j.get('artist', ''), 'title': j.get('title', '')})
        except Exception as ex:
            out.append({'id': j['id'], 'start': j['start'], 'end': j['start'] + 20,
                        'note': 'ошибка: ' + str(ex)[:60],
                        'was': j['start'], 'artist': j.get('artist', ''), 'title': j.get('title', '')})
    print(json.dumps(out, ensure_ascii=False))


if __name__ == '__main__':
    main()
