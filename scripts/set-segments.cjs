/**
 * Простановка отрезков новым песням: значение из playlist-spec.cjs,
 * уточнённое по звуку (scripts/refine.py внутри контейнера бэкенда).
 *
 * Запуск: node scripts/set-segments.cjs [--dry]
 */
const fs = require('fs');
const { execFileSync } = require('child_process');
const { TOPUP, NEW_BLOCKS } = require('./playlist-spec.cjs');
const { norm, scoreCandidate } = require('./match.cjs');

const BASE = process.env.MUSIC_BASE || 'http://localhost:5000';
const CODE = process.env.GAME_CODE || '83XC';
const CONTAINER = process.env.BACKEND_CONTAINER || 'quest-backend';
const DRY = process.argv.includes('--dry');

async function api(method, path, body, token) {
  const res = await fetch(BASE + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json; try { json = JSON.parse(text); } catch { json = text; }
  if (!res.ok) throw new Error(`${method} ${path} -> ${res.status} ${String(text).slice(0, 150)}`);
  return json;
}

async function main() {
  const { token } = await api('POST', '/auth/login', {
    username: process.env.MUSIC_USER || 'design_org@t.io',
    hashed_pwd: process.env.MUSIC_PWD || 'password1',
  });
  const games = await api('GET', '/music/games', null, token);
  const meta = (Array.isArray(games) ? games : games.games || []).find((g) => g.code === CODE);
  const gameId = meta._id;
  const full = await api('GET', `/music/games/${gameId}`, null, token);

  // Ожидаемые старты из спецификации, по ключу «исполнитель+название»…
  // но каталог отдаёт своё написание, поэтому ищем по названию.
  const wanted = [];
  for (const list of Object.values(TOPUP)) wanted.push(...list);
  for (const b of NEW_BLOCKS) wanted.push(...b.songs);

  // Каталог пишет названия по-своему («Про белые розы», «Sigma Boy - Сигма Бой»),
  // поэтому ищем по совпадению исполнителя И названия, а не по точной строке.
  const jobs = [];
  const unmatched = [];
  const taken = new Set();
  for (const w of wanted) {
    let best = null;
    for (const s of full.songs) {
      if (s.status !== 'ready' || !s.file || taken.has(String(s._id))) continue;
      const { s: sc } = scoreCandidate(w, s);
      if (!best || sc > best.sc) best = { song: s, sc };
    }
    if (!best || best.sc < 0.6) { unmatched.push(w); continue; }
    taken.add(String(best.song._id));
    jobs.push({
      id: String(best.song._id), file: best.song.file, start: w.start,
      artist: best.song.artist, title: best.song.title,
    });
  }

  console.log(`к простановке: ${jobs.length}, не сопоставлено: ${unmatched.length}`);
  if (unmatched.length) unmatched.forEach((u) => console.log(`  ? ${u.a} — ${u.t}`));
  if (!jobs.length) return;

  // Анализ звука идёт в контейнере: там ffmpeg, numpy и сами файлы
  fs.writeFileSync('scripts/segjob.json', JSON.stringify(jobs, null, 1));
  execFileSync('docker', ['cp', 'scripts/segjob.json', `${CONTAINER}:/tmp/segjob.json`]);
  execFileSync('docker', ['cp', 'scripts/refine.py', `${CONTAINER}:/tmp/refine.py`]);
  const raw = execFileSync('docker', ['exec', CONTAINER, 'python3', '/tmp/refine.py', '/tmp/segjob.json'], {
    encoding: 'utf8', maxBuffer: 64 * 1024 * 1024,
  });
  const refined = JSON.parse(raw.trim().split('\n').pop());

  const moved = refined.filter((r) => Math.abs(r.start - r.was) >= 2);
  const notes = refined.filter((r) => r.note);
  console.log(`\nуточнено по звуку: ${moved.length} из ${refined.length}`);
  if (notes.length) {
    console.log('\nСТОИТ ПОСЛУШАТЬ ВРУЧНУЮ:');
    notes.forEach((r) => console.log(`  · ${r.artist} — ${r.title} [${r.start}–${r.end}] ${r.note}`));
  }

  if (DRY) { console.log('\n(dry) ничего не сохранял'); return; }
  let saved = 0;
  for (const r of refined) {
    await api('PATCH', `/music/games/${gameId}/songs/${r.id}`, { startSec: r.start, endSec: r.end }, token);
    saved++;
  }
  console.log(`\nсохранено отрезков: ${saved}`);
}

main().catch((e) => { console.error('ОШИБКА:', e.message); process.exit(1); });
